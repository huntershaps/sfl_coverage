import "server-only";
import crypto from "node:crypto";
import { cookies } from "next/headers";
import { getDb, audit } from "./db";
import type { Role } from "./constants";

const SESSION_COOKIE = "sfi_session";
const SESSION_DAYS = 30;

export const SUPER_ADMIN_EMAIL = (
  process.env.SUPER_ADMIN_EMAIL || "shaps@sflinsider.com"
).toLowerCase();

export { hashPassword, verifyPassword, passwordProblem } from "./password";

/* -------------------------------- sessions -------------------------------- */

function tokenId(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export async function createSession(userId: number, userAgent?: string) {
  const token = crypto.randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + SESSION_DAYS * 864e5);
  getDb()
    .prepare(
      "INSERT INTO sessions (id, user_id, expires_at, user_agent) VALUES (?, ?, ?, ?)",
    )
    .run(tokenId(token), userId, expires.toISOString(), userAgent ?? null);

  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires,
  });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    getDb().prepare("DELETE FROM sessions WHERE id = ?").run(tokenId(token));
  }
  jar.delete(SESSION_COOKIE);
}

export type SessionUser = {
  id: number;
  email: string;
  name: string;
  role: Role;
  profile_photo: string | null;
  phone: string | null;
  bio: string | null;
  coverage_area: string | null;
  specialties: string;
  social_links: string;
  status: string;
};

/** Reads the signed-in user from the session cookie. Never trusts client input. */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const row = getDb()
    .prepare(
      `SELECT u.id, u.email, u.name, u.role, u.profile_photo, u.phone, u.bio,
              u.coverage_area, u.specialties, u.social_links, u.status
         FROM sessions s JOIN users u ON u.id = s.user_id
        WHERE s.id = ? AND s.expires_at > datetime('now')`,
    )
    .get(tokenId(token)) as SessionUser | undefined;

  if (!row) return null;
  if (row.status === "disabled") return null;
  return row;
}

/* ------------------------------ password reset ----------------------------- */

export function createPasswordReset(userId: number) {
  const token = crypto.randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
  getDb()
    .prepare(
      "INSERT INTO password_resets (id, user_id, expires_at) VALUES (?, ?, ?)",
    )
    .run(tokenId(token), userId, expires.toISOString());
  return token;
}

export function consumePasswordReset(token: string): number | null {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT user_id FROM password_resets
        WHERE id = ? AND used_at IS NULL AND expires_at > datetime('now')`,
    )
    .get(tokenId(token)) as { user_id: number } | undefined;
  if (!row) return null;
  db.prepare("UPDATE password_resets SET used_at = datetime('now') WHERE id = ?").run(
    tokenId(token),
  );
  // Reset invalidates every existing session for that account.
  db.prepare("DELETE FROM sessions WHERE user_id = ?").run(row.user_id);
  return row.user_id;
}

/* --------------------------- super admin bootstrap -------------------------- */

/**
 * The configured Super Admin email is always Super Admin. Runs on sign-up and
 * sign-in so the role is correct no matter which path created the account.
 */
export function enforceSuperAdmin(userId: number, email: string) {
  if (email.toLowerCase() !== SUPER_ADMIN_EMAIL) return;
  const db = getDb();
  const cur = db.prepare("SELECT role FROM users WHERE id = ?").get(userId) as
    | { role: string }
    | undefined;
  if (cur && cur.role !== "super_admin") {
    db.prepare("UPDATE users SET role = 'super_admin' WHERE id = ?").run(userId);
    audit({
      actorId: null,
      action: "role.bootstrap",
      entityType: "user",
      entityId: userId,
      summary: `${email} initialized as Super Admin`,
    });
  }
}
