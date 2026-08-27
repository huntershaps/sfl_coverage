"use server";

import { revalidatePath } from "next/cache";
import { createBackup } from "@/lib/backup";
import {
  setNameMap,
  setStarredUser,
  backfillCoverageForImport,
} from "@/lib/import-coverage";
import { redirect } from "next/navigation";
import {
  requireUser,
  requireAdmin,
  requireSuperAdmin,
  assertCanChangeRole,
  HttpError,
} from "@/lib/rbac";
import { getDb, audit, setSetting, notify, DEFAULT_SETTINGS } from "@/lib/db";
import { SUPER_ADMIN_EMAIL } from "@/lib/auth";
import { ROLES, SPECIALTIES } from "@/lib/constants";
import {
  createImport,
  commitImport,
  updateImportItem,
  setImportSelection,
  discardImport,
  fetchGoogleDoc,
} from "@/lib/import";

export type AdminResult = { ok?: string; error?: string; importId?: number };

function fail(e: unknown): AdminResult {
  if (e instanceof HttpError) return { error: e.message };
  console.error(e);
  return { error: "Something went wrong." };
}

/* -------------------------------- profile -------------------------------- */

export async function updateProfileAction(
  _prev: AdminResult,
  formData: FormData,
): Promise<AdminResult> {
  try {
    const user = await requireUser();
    const s = (k: string) => String(formData.get(k) ?? "").trim();

    const name = s("name");
    if (!name) return { error: "Your name can't be blank." };

    const specialties = formData
      .getAll("specialties")
      .map(String)
      .filter((v) => (SPECIALTIES as readonly string[]).includes(v));

    const social = {
      instagram: s("instagram"),
      website: s("website"),
      x: s("x"),
      linkedin: s("linkedin"),
    };
    for (const [k, v] of Object.entries(social)) {
      if (v && k === "website" && !/^https?:\/\//i.test(v))
        return { error: "Your website link needs to start with http:// or https://" };
    }

    const photo = s("profilePhoto");
    if (photo && !/^https?:\/\//i.test(photo))
      return { error: "The photo link needs to start with http:// or https://" };

    getDb()
      .prepare(
        `UPDATE users SET name=?, phone=?, bio=?, coverage_area=?, specialties=?,
                social_links=?, profile_photo=?, email_notifications=?,
                updated_at=datetime('now')
          WHERE id = ?`,
      )
      .run(
        name,
        s("phone") || null,
        s("bio") || null,
        s("coverageArea") || null,
        JSON.stringify(specialties),
        JSON.stringify(social),
        photo || null,
        formData.get("emailNotifications") === "on" ? 1 : 0,
        user.id,
      );

    audit({
      actorId: user.id,
      action: "profile.updated",
      entityType: "user",
      entityId: user.id,
      summary: `${name} updated their profile`,
    });

    revalidatePath("/profile");
    revalidatePath("/dashboard");
    return { ok: "Profile saved." };
  } catch (e) {
    return fail(e);
  }
}

/* ------------------------------ user management --------------------------- */

export async function changeRoleAction(
  _prev: AdminResult,
  formData: FormData,
): Promise<AdminResult> {
  try {
    const actor = await requireSuperAdmin();
    const userId = Number(formData.get("userId"));
    const nextRole = String(formData.get("role") ?? "");

    if (!(ROLES as readonly string[]).includes(nextRole))
      return { error: "That isn't a valid role." };

    const db = getDb();
    const target = db
      .prepare("SELECT id, name, email, role FROM users WHERE id = ?")
      .get(userId) as
      | { id: number; name: string; email: string; role: string }
      | undefined;
    if (!target) return { error: "That account no longer exists." };

    assertCanChangeRole(actor, target, nextRole);
    if (target.role === nextRole) return { ok: "No change — already that role." };

    db.prepare("UPDATE users SET role = ?, updated_at = datetime('now') WHERE id = ?").run(
      nextRole,
      userId,
    );

    audit({
      actorId: actor.id,
      action: "user.role_changed",
      entityType: "user",
      entityId: userId,
      summary: `${actor.name} changed ${target.name}'s role from ${target.role} to ${nextRole}`,
      meta: { from: target.role, to: nextRole },
    });

    notify({
      userId,
      type: "role.changed",
      title: "Your access level changed",
      body: `You're now set up as ${nextRole.replace("_", " ")}.`,
      href: "/dashboard",
    });

    revalidatePath("/admin/contributors");
    revalidatePath(`/admin/contributors/${userId}`);
    return { ok: `Role updated to ${nextRole.replace("_", " ")}.` };
  } catch (e) {
    return fail(e);
  }
}

export async function setUserStatusAction(
  _prev: AdminResult,
  formData: FormData,
): Promise<AdminResult> {
  try {
    const actor = await requireSuperAdmin();
    const userId = Number(formData.get("userId"));
    const status = String(formData.get("status") ?? "");
    if (!["active", "disabled", "provisional"].includes(status))
      return { error: "That isn't a valid status." };

    const db = getDb();
    const target = db
      .prepare("SELECT id, name, email FROM users WHERE id = ?")
      .get(userId) as { id: number; name: string; email: string } | undefined;
    if (!target) return { error: "That account no longer exists." };

    if (target.email.toLowerCase() === SUPER_ADMIN_EMAIL && status === "disabled")
      return { error: "The primary Super Admin account can't be disabled." };
    if (actor.id === userId && status === "disabled")
      return { error: "You can't disable your own account." };

    db.prepare("UPDATE users SET status = ?, updated_at = datetime('now') WHERE id = ?").run(
      status,
      userId,
    );
    // Disabling should also cut any live session immediately.
    if (status === "disabled")
      db.prepare("DELETE FROM sessions WHERE user_id = ?").run(userId);

    audit({
      actorId: actor.id,
      action: "user.status_changed",
      entityType: "user",
      entityId: userId,
      summary: `${actor.name} set ${target.name}'s account to ${status}`,
    });

    revalidatePath("/admin/contributors");
    revalidatePath(`/admin/contributors/${userId}`);
    return { ok: `Account set to ${status}.` };
  } catch (e) {
    return fail(e);
  }
}

export async function updateContributorEmailAction(
  _prev: AdminResult,
  formData: FormData,
): Promise<AdminResult> {
  try {
    const actor = await requireSuperAdmin();
    const userId = Number(formData.get("userId"));
    const email = String(formData.get("email") ?? "").trim().toLowerCase();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email))
      return { error: "That doesn't look like a valid email address." };

    const db = getDb();
    const target = db
      .prepare("SELECT id, name, email FROM users WHERE id = ?")
      .get(userId) as { id: number; name: string; email: string } | undefined;
    if (!target) return { error: "That account no longer exists." };

    if (target.email.toLowerCase() === SUPER_ADMIN_EMAIL)
      return { error: "The primary Super Admin email can't be changed here." };

    const clash = db
      .prepare("SELECT id FROM users WHERE email = ? AND id != ?")
      .get(email, userId);
    if (clash) return { error: "Another account already uses that email." };

    db.prepare("UPDATE users SET email = ?, updated_at = datetime('now') WHERE id = ?").run(
      email,
      userId,
    );

    audit({
      actorId: actor.id,
      action: "user.email_changed",
      entityType: "user",
      entityId: userId,
      summary: `${actor.name} set ${target.name}'s email to ${email}`,
      meta: { from: target.email },
    });

    revalidatePath(`/admin/contributors/${userId}`);
    revalidatePath("/admin/contributors");
    return { ok: "Email updated. They can now claim the account at sign-up." };
  } catch (e) {
    return fail(e);
  }
}

/* -------------------------------- settings -------------------------------- */

export async function updateSettingsAction(
  _prev: AdminResult,
  formData: FormData,
): Promise<AdminResult> {
  try {
    const actor = await requireSuperAdmin();
    const changed: string[] = [];

    for (const key of Object.keys(DEFAULT_SETTINGS)) {
      const isBool = ["true", "false"].includes(DEFAULT_SETTINGS[key]);
      const raw = formData.get(key);
      const value = isBool ? (raw === "on" ? "true" : "false") : String(raw ?? "").trim();
      if (isBool || value) {
        setSetting(key, value);
        changed.push(key);
      }
    }

    audit({
      actorId: actor.id,
      action: "settings.updated",
      entityType: "settings",
      summary: `${actor.name} updated application settings`,
      meta: { changed },
    });

    revalidatePath("/admin/settings");
    revalidatePath("/admin/approvals");
    return { ok: "Settings saved." };
  } catch (e) {
    return fail(e);
  }
}

/* --------------------------------- import --------------------------------- */

export async function fetchDocAction(
  _prev: AdminResult & { text?: string },
  formData: FormData,
): Promise<AdminResult & { text?: string }> {
  try {
    await requireAdmin();
    const url = String(formData.get("url") ?? "").trim();
    if (!url) return { error: "Paste the Google Doc link first." };

    const res = await fetchGoogleDoc(url);
    if (!res.ok) {
      if (res.reason === "bad_url")
        return {
          error:
            "That doesn't look like a Google Docs link. It should look like docs.google.com/document/d/…",
        };
      if (res.reason === "no_access")
        return {
          error:
            "Couldn't read that document — it isn't shared publicly. Either set link sharing to \"Anyone with the link can view\", or paste the document text below instead.",
        };
      return {
        error: `Couldn't reach Google Docs${res.detail ? ` (${res.detail})` : ""}. Paste the text below instead.`,
      };
    }

    return { ok: "Document fetched.", text: res.text };
  } catch (e) {
    return fail(e);
  }
}

export async function stageImportAction(
  _prev: AdminResult,
  formData: FormData,
): Promise<AdminResult> {
  let importId: number;
  try {
    const user = await requireAdmin();
    const sourceType = (String(formData.get("sourceType") ?? "paste") as
      | "gdoc"
      | "paste"
      | "csv"
      | "file");
    const content = String(formData.get("content") ?? "");
    const url = String(formData.get("url") ?? "").trim();
    const yearRaw = String(formData.get("defaultYear") ?? "").trim();

    if (!content.trim())
      return { error: "There's nothing to import — paste the event list first." };

    const res = createImport(user, {
      sourceType: url ? "gdoc" : sourceType,
      sourceReference: url || null,
      rawContent: content,
      defaultYear: yearRaw ? Number(yearRaw) : undefined,
    });

    if (res.events.length === 0)
      return {
        error:
          "No events were found in that content. Each event needs a date at minimum — either the coverage doc layout (a 9/13 date line followed by “* Title @ Venue” bullets) or a written-out sentence like “The Foxtide show is on August 29, 2026 at the Heartwood Soundstage.”",
      };

    importId = res.importId;
  } catch (e) {
    return fail(e);
  }

  redirect(`/admin/import/${importId}`);
}

export async function updateImportItemAction(
  _prev: AdminResult,
  formData: FormData,
): Promise<AdminResult> {
  try {
    const user = await requireAdmin();
    const itemId = Number(formData.get("itemId"));
    const importId = Number(formData.get("importId"));

    const s = (k: string) => {
      const v = formData.get(k);
      return v === null ? undefined : String(v).trim();
    };

    const date = s("date");
    const time = s("time");
    const parsed: Record<string, unknown> = {};
    if (s("title") !== undefined) parsed.title = s("title");
    if (s("venue") !== undefined) parsed.venue = s("venue");
    if (s("city") !== undefined) parsed.city = s("city");
    if (s("category") !== undefined) parsed.category = s("category");
    if (date) {
      parsed.start_datetime = `${date}T${time || "19:00"}`;
      parsed.time_tbd = time ? 0 : 1;
    }

    updateImportItem(user, itemId, {
      parsed,
      decision: s("decision") || undefined,
      selected: formData.has("selected")
        ? formData.get("selected") === "true"
        : undefined,
    });

    revalidatePath(`/admin/import/${importId}`);
    return { ok: "Row updated." };
  } catch (e) {
    return fail(e);
  }
}

export async function selectAllImportAction(
  _prev: AdminResult,
  formData: FormData,
): Promise<AdminResult> {
  try {
    await requireAdmin();
    const importId = Number(formData.get("importId"));
    setImportSelection(importId, formData.get("selected") === "true");
    revalidatePath(`/admin/import/${importId}`);
    return { ok: "Selection updated." };
  } catch (e) {
    return fail(e);
  }
}

export async function commitImportAction(
  _prev: AdminResult,
  formData: FormData,
): Promise<AdminResult> {
  try {
    const user = await requireAdmin();
    const importId = Number(formData.get("importId"));
    const publish = formData.get("publish") === "true";

    const res = commitImport(user, importId, { publish });

    revalidatePath("/events");
    revalidatePath("/admin/events");
    revalidatePath("/admin/import");

    return {
      ok: `Imported ${res.created} event${res.created === 1 ? "" : "s"}${
        res.updated ? `, updated ${res.updated}` : ""
      }${res.skipped ? `, skipped ${res.skipped}` : ""}.`,
    };
  } catch (e) {
    return fail(e);
  }
}

export async function discardImportAction(
  _prev: AdminResult,
  formData: FormData,
): Promise<AdminResult> {
  try {
    const user = await requireAdmin();
    discardImport(user, Number(formData.get("importId")));
  } catch (e) {
    return fail(e);
  }
  redirect("/admin/import");
}

/* --------------------------------- backups -------------------------------- */

export async function createBackupAction(): Promise<AdminResult> {
  try {
    const actor = await requireSuperAdmin();
    const file = await createBackup(actor);
    revalidatePath("/admin/backups");
    return {
      ok: `Backup taken — ${file.name} (${(file.bytes / 1024 / 1024).toFixed(2)} MB).`,
    };
  } catch (e) {
    return fail(e);
  }
}

/* ------------------------- mapping doc names to accounts ------------------ */

/**
 * Records which account each name in the coverage doc refers to. Nothing is
 * assigned until this is saved — a first-name match alone is never enough to
 * hand someone a credential.
 */
export async function setNameMapAction(
  _prev: AdminResult,
  formData: FormData,
): Promise<AdminResult> {
  try {
    const actor = await requireAdmin();
    const importId = Number(formData.get("importId"));

    // Fields arrive as name:<doc name> = <userId or "">.
    const map: Record<string, number> = {};
    for (const [key, value] of formData.entries()) {
      if (!key.startsWith("name:")) continue;
      const userId = Number(value);
      if (!userId) continue;
      map[key.slice(5)] = userId;
    }

    setNameMap(actor, importId, map);

    const starredRaw = String(formData.get("starredUserId") ?? "");
    if (starredRaw !== "") {
      setStarredUser(actor, importId, Number(starredRaw) || null);
    }

    revalidatePath(`/admin/import/${importId}`);
    const n = Object.keys(map).length;
    return { ok: `Saved — ${n} name${n === 1 ? "" : "s"} mapped to accounts.` };
  } catch (e) {
    return fail(e);
  }
}

/**
 * Applies the mapping to events that have already been imported, for when the
 * mapping is filled in (or corrected) after the fact.
 */
export async function backfillCoverageAction(
  _prev: AdminResult,
  formData: FormData,
): Promise<AdminResult> {
  try {
    const actor = await requireAdmin();
    const importId = Number(formData.get("importId"));
    const res = backfillCoverageForImport(actor, importId);

    revalidatePath(`/admin/import/${importId}`);
    revalidatePath("/events");
    revalidatePath("/schedule");

    if (!res.assigned && !res.starred) {
      return {
        ok: "Nothing new to apply — everyone mapped is already on their events.",
      };
    }
    return {
      ok:
        `Applied — ${res.assigned} assignment${res.assigned === 1 ? "" : "s"}` +
        `${res.starred ? `, ${res.starred} starred event${res.starred === 1 ? "" : "s"}` : ""}.` +
        (res.unmapped.length
          ? ` ${res.unmapped.length} name${res.unmapped.length === 1 ? "" : "s"} still unmapped.`
          : ""),
    };
  } catch (e) {
    return fail(e);
  }
}
