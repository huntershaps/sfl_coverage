"use server";

import { redirect } from "next/navigation";
import { sendMail, canRevealResetLink, passwordResetMail } from "@/lib/mail";
import { getDb, audit, notify } from "@/lib/db";
import {
  hashPassword,
  verifyPassword,
  passwordProblem,
  createSession,
  destroySession,
  enforceSuperAdmin,
  createPasswordReset,
  consumePasswordReset,
  getCurrentUser,
  SUPER_ADMIN_EMAIL,
} from "@/lib/auth";

export type FormState = { error?: string; ok?: string; token?: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export async function signUpAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (!name) return { error: "Please enter your name." };
  if (!EMAIL_RE.test(email)) return { error: "Please enter a valid email address." };
  const pwProblem = passwordProblem(password);
  if (pwProblem) return { error: pwProblem };
  if (password !== confirm) return { error: "Those passwords don't match." };

  const db = getDb();
  const existing = db
    .prepare("SELECT id, password_hash FROM users WHERE email = ?")
    .get(email) as { id: number; password_hash: string | null } | undefined;

  let userId: number;

  if (existing && existing.password_hash) {
    return { error: "An account with that email already exists. Try signing in." };
  } else if (existing) {
    // Provisional account created by an import — this claims it.
    db.prepare(
      `UPDATE users SET password_hash = ?, name = ?, status = 'active', updated_at = datetime('now')
        WHERE id = ?`,
    ).run(hashPassword(password), name, existing.id);
    userId = existing.id;
    audit({
      actorId: userId,
      action: "user.claimed",
      entityType: "user",
      entityId: userId,
      summary: `${name} claimed the provisional account for ${email}`,
    });
  } else {
    // Role is never taken from the form; new accounts are always contributors
    // and only the configured bootstrap email is elevated.
    const info = db
      .prepare(
        `INSERT INTO users (email, name, password_hash, role, status)
         VALUES (?, ?, ?, 'contributor', 'active')`,
      )
      .run(email, name, hashPassword(password));
    userId = Number(info.lastInsertRowid);
    audit({
      actorId: userId,
      action: "user.created",
      entityType: "user",
      entityId: userId,
      summary: `${name} created an account`,
    });
  }

  enforceSuperAdmin(userId, email);

  notify({
    userId,
    type: "welcome",
    title: "Welcome to the Coverage Desk",
    body:
      email === SUPER_ADMIN_EMAIL
        ? "You're signed in as Super Admin. Approvals route to you."
        : "Browse upcoming events and request the ones you want to cover.",
    href: "/events",
  });

  await createSession(userId);
  redirect("/dashboard");
}

export async function signInAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "Enter your email and password." };

  const db = getDb();
  const user = db
    .prepare("SELECT id, email, password_hash, status FROM users WHERE email = ?")
    .get(email) as
    | { id: number; email: string; password_hash: string | null; status: string }
    | undefined;

  // Same message for unknown email and wrong password, so the form cannot be
  // used to enumerate who has an account.
  if (!user || !verifyPassword(password, user.password_hash))
    return { error: "That email and password don't match." };

  if (user.status === "disabled")
    return { error: "This account has been disabled. Contact an administrator." };

  enforceSuperAdmin(user.id, user.email);
  await createSession(user.id);
  redirect("/dashboard");
}

export async function signOutAction() {
  await destroySession();
  redirect("/login");
}

export async function forgotPasswordAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!EMAIL_RE.test(email))
    return { error: "Please enter a valid email address." };

  const user = getDb()
    .prepare("SELECT id FROM users WHERE email = ?")
    .get(email) as { id: number } | undefined;

  // Always report success; never reveal whether the address is registered.
  if (!user)
    return {
      ok: "If that email has an account, a reset link is on its way.",
    };

  const token = createPasswordReset(user.id);
  audit({
    actorId: user.id,
    action: "password.reset_requested",
    entityType: "user",
    entityId: user.id,
    summary: `Password reset requested for ${email}`,
  });

  await sendMail(passwordResetMail(email, token));

  // The link is only ever surfaced in the browser on a developer machine with
  // no mail transport. Doing this in production would let anyone who knows an
  // address reset that account's password, so it is gated on both conditions.
  const showTokenInApp = canRevealResetLink();

  return {
    ok: "If that email has an account, a reset link is on its way.",
    ...(showTokenInApp ? { token } : {}),
  };
}

export async function resetPasswordAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const token = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  const pwProblem = passwordProblem(password);
  if (pwProblem) return { error: pwProblem };
  if (password !== confirm) return { error: "Those passwords don't match." };

  const userId = consumePasswordReset(token);
  if (!userId)
    return { error: "That reset link has expired or already been used." };

  getDb()
    .prepare("UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?")
    .run(hashPassword(password), userId);

  audit({
    actorId: userId,
    action: "password.reset",
    entityType: "user",
    entityId: userId,
    summary: "Password was reset",
  });

  await createSession(userId);
  redirect("/dashboard");
}

export async function changePasswordAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) return { error: "You need to sign in." };

  const current = String(formData.get("current") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  const row = getDb()
    .prepare("SELECT password_hash FROM users WHERE id = ?")
    .get(user.id) as { password_hash: string | null };
  if (!verifyPassword(current, row.password_hash))
    return { error: "Your current password is incorrect." };

  const pwProblem = passwordProblem(password);
  if (pwProblem) return { error: pwProblem };
  if (password !== confirm) return { error: "Those passwords don't match." };

  getDb()
    .prepare("UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?")
    .run(hashPassword(password), user.id);

  audit({
    actorId: user.id,
    action: "password.changed",
    entityType: "user",
    entityId: user.id,
    summary: `${user.name} changed their password`,
  });

  return { ok: "Password updated." };
}
