import "server-only";
import { getCurrentUser, type SessionUser, SUPER_ADMIN_EMAIL } from "./auth";
import { boolSetting } from "./db";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export const isSuperAdmin = (u: SessionUser | null | undefined) =>
  u?.role === "super_admin";
export const isAdmin = (u: SessionUser | null | undefined) =>
  u?.role === "super_admin" || u?.role === "admin";

/** Throws 401 if signed out. Every server route/page guard starts here. */
export async function requireUser(): Promise<SessionUser> {
  const u = await getCurrentUser();
  if (!u) throw new HttpError(401, "You need to sign in.");
  return u;
}

export async function requireAdmin(): Promise<SessionUser> {
  const u = await requireUser();
  if (!isAdmin(u)) throw new HttpError(403, "Admin access required.");
  return u;
}

export async function requireSuperAdmin(): Promise<SessionUser> {
  const u = await requireUser();
  if (!isSuperAdmin(u)) throw new HttpError(403, "Super Admin access required.");
  return u;
}

/**
 * Can this user hand down a FINAL decision on a coverage request?
 *
 * Super Admin: always. Admin/Editor: only when the org has not switched on
 * "require Super Admin approval" — otherwise their action is a recommendation
 * that the Super Admin still has to sign off on.
 */
export function canFinalizeDecision(u: SessionUser): boolean {
  if (isSuperAdmin(u)) return true;
  if (u.role !== "admin") return false;
  if (boolSetting("require_super_admin_approval")) return false;
  return boolSetting("admins_can_approve");
}

/** Admin/Editor can log a recommendation even when they cannot finalize. */
export function canRecommend(u: SessionUser): boolean {
  return isAdmin(u);
}

export function canManageEvents(u: SessionUser): boolean {
  return isAdmin(u);
}

export function canDeleteEvents(u: SessionUser): boolean {
  return isSuperAdmin(u);
}

export function canManageUsers(u: SessionUser): boolean {
  return isSuperAdmin(u);
}

export function canImport(u: SessionUser): boolean {
  return isAdmin(u);
}

export function canViewInternalNotes(u: SessionUser): boolean {
  return isAdmin(u);
}

export function canViewNote(u: SessionUser, visibility: string): boolean {
  if (visibility === "super_admin_only") return isSuperAdmin(u);
  return isAdmin(u);
}

export function canOverrideCapacity(u: SessionUser): boolean {
  return isSuperAdmin(u);
}

export function canViewAudit(u: SessionUser): boolean {
  return isAdmin(u);
}

export function canManageSettings(u: SessionUser): boolean {
  return isSuperAdmin(u);
}

/**
 * Role changes are Super-Admin-only, and nobody can mint a Super Admin except
 * an existing Super Admin. The configured bootstrap account can never be
 * demoted, so the org can't lock itself out of final approval authority.
 */
export function assertCanChangeRole(
  actor: SessionUser,
  target: { id: number; email: string; role: string },
  nextRole: string,
): void {
  if (!isSuperAdmin(actor))
    throw new HttpError(403, "Only the Super Admin can change roles.");
  if (target.email.toLowerCase() === SUPER_ADMIN_EMAIL && nextRole !== "super_admin")
    throw new HttpError(
      400,
      "The primary Super Admin account cannot be demoted.",
    );
  if (actor.id === target.id && nextRole !== "super_admin")
    throw new HttpError(400, "You cannot demote your own Super Admin account.");
}

export function jsonError(e: unknown) {
  if (e instanceof HttpError)
    return Response.json({ error: e.message }, { status: e.status });
  console.error(e);
  return Response.json({ error: "Something went wrong." }, { status: 500 });
}
