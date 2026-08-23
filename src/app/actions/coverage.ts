"use server";

import { revalidatePath } from "next/cache";
import { requireUser, requireAdmin, HttpError } from "@/lib/rbac";
import {
  submitRequest,
  withdrawRequest,
  decideRequest,
  assignDirectly,
  removeAssignment,
  changeAssignmentType,
  setRequestsClosed,
  setCapacity,
  addInternalNote,
  type Decision,
} from "@/lib/workflow";
import { COVERAGE_TYPES, type CoverageType } from "@/lib/constants";

export type ActionResult = { ok?: string; error?: string };

function fail(e: unknown): ActionResult {
  if (e instanceof HttpError) return { error: e.message };
  console.error(e);
  return { error: "Something went wrong. Please try again." };
}

function coverageTypesFrom(formData: FormData): CoverageType[] {
  return formData
    .getAll("coverageTypes")
    .map(String)
    .filter((t): t is CoverageType => (COVERAGE_TYPES as readonly string[]).includes(t));
}

function oneCoverageType(value: FormDataEntryValue | null): CoverageType {
  const v = String(value ?? "other");
  return (COVERAGE_TYPES as readonly string[]).includes(v)
    ? (v as CoverageType)
    : "other";
}

/* ----------------------------- contributor ------------------------------- */

export async function requestCoverageAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const eventId = Number(formData.get("eventId"));
    submitRequest(user, {
      eventId,
      coverageTypes: coverageTypesFrom(formData),
      message: String(formData.get("message") ?? ""),
      reason: String(formData.get("reason") ?? ""),
      guestsRequested: Number(formData.get("guests") ?? 0) || 0,
    });
    revalidatePath(`/events/${eventId}`);
    revalidatePath("/events");
    revalidatePath("/requests");
    revalidatePath("/dashboard");
    return { ok: "Your request has been submitted." };
  } catch (e) {
    return fail(e);
  }
}

export async function withdrawRequestAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const user = await requireUser();
    withdrawRequest(user, Number(formData.get("requestId")));
    revalidatePath("/requests");
    revalidatePath("/events");
    revalidatePath("/dashboard");
    return { ok: "Request withdrawn." };
  } catch (e) {
    return fail(e);
  }
}

/* -------------------------------- admin ---------------------------------- */

export async function decideRequestAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const actor = await requireAdmin();
    const decision = String(formData.get("decision")) as Decision;
    const result = decideRequest(actor, {
      requestId: Number(formData.get("requestId")),
      decision,
      coverageType: formData.get("coverageType")
        ? oneCoverageType(formData.get("coverageType"))
        : undefined,
      decisionNote: String(formData.get("decisionNote") ?? "") || undefined,
      overrideCapacity: formData.get("override") === "on",
      guests: formData.has("guests")
        ? Number(formData.get("guests") ?? 0) || 0
        : undefined,
    });

    revalidatePath("/admin/approvals");
    revalidatePath("/dashboard");
    revalidatePath("/requests");
    revalidatePath("/schedule");
    revalidatePath("/events");

    return {
      ok: result.final
        ? `Decision recorded — ${result.status.replace("_", " ")}.`
        : "Recommendation logged. This now needs Super Admin sign-off.",
    };
  } catch (e) {
    return fail(e);
  }
}

export async function assignDirectlyAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const actor = await requireAdmin();
    const eventId = Number(formData.get("eventId"));
    assignDirectly(actor, {
      eventId,
      userId: Number(formData.get("userId")),
      coverageType: oneCoverageType(formData.get("coverageType")),
      overrideCapacity: formData.get("override") === "on",
      guests: Number(formData.get("guests") ?? 0) || 0,
    });
    revalidatePath(`/events/${eventId}`);
    revalidatePath(`/admin/approvals/${eventId}`);
    revalidatePath("/schedule");
    return { ok: "Contributor assigned." };
  } catch (e) {
    return fail(e);
  }
}

/**
 * An admin covering an event themselves. This is the same code path as any
 * other direct assignment — it just targets the signed-in user, so the same
 * permission and capacity rules apply.
 */
export async function coverItMyselfAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const actor = await requireAdmin();
    const eventId = Number(formData.get("eventId"));
    assignDirectly(actor, {
      eventId,
      userId: actor.id,
      coverageType: oneCoverageType(formData.get("coverageType")),
      overrideCapacity: formData.get("override") === "on",
      guests: Number(formData.get("guests") ?? 0) || 0,
    });
    revalidatePath(`/events/${eventId}`);
    revalidatePath(`/admin/approvals/${eventId}`);
    revalidatePath("/schedule");
    revalidatePath("/dashboard");
    return { ok: "You're on this event." };
  } catch (e) {
    return fail(e);
  }
}

export async function removeAssignmentAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const actor = await requireAdmin();
    removeAssignment(
      actor,
      Number(formData.get("assignmentId")),
      String(formData.get("reason") ?? "") || undefined,
    );
    revalidatePath("/admin/approvals");
    revalidatePath("/events");
    revalidatePath("/schedule");
    return { ok: "Assignment removed." };
  } catch (e) {
    return fail(e);
  }
}

export async function changeAssignmentTypeAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const actor = await requireAdmin();
    changeAssignmentType(
      actor,
      Number(formData.get("assignmentId")),
      oneCoverageType(formData.get("coverageType")),
      formData.has("guests") ? Number(formData.get("guests") ?? 0) || 0 : undefined,
    );
    revalidatePath("/admin/approvals");
    revalidatePath("/events");
    revalidatePath("/schedule");
    return { ok: "Coverage responsibility updated." };
  } catch (e) {
    return fail(e);
  }
}

export async function toggleRequestsAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const actor = await requireAdmin();
    const eventId = Number(formData.get("eventId"));
    const closed = formData.get("closed") === "true";
    setRequestsClosed(actor, eventId, closed);
    revalidatePath(`/events/${eventId}`);
    revalidatePath(`/admin/approvals/${eventId}`);
    return { ok: closed ? "Requests closed." : "Requests reopened." };
  } catch (e) {
    return fail(e);
  }
}

export async function setCapacityAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const actor = await requireAdmin();
    const eventId = Number(formData.get("eventId"));

    const rawLimit = String(formData.get("coverageLimit") ?? "").trim();
    const coverageLimit = rawLimit === "" ? null : Math.max(0, Number(rawLimit));
    if (coverageLimit !== null && !Number.isFinite(coverageLimit))
      return { error: "Coverage limit must be a number, or blank for unlimited." };

    const slots = COVERAGE_TYPES.map((t) => ({
      coverage_type: t,
      capacity: Number(formData.get(`slot_${t}`) ?? 0) || 0,
    })).filter((s) => s.capacity > 0);

    const guestLimit = Math.max(0, Number(formData.get("guestLimit") ?? 0) || 0);

    setCapacity(actor, eventId, {
      coverageLimit,
      slots,
      allowWaitlist: formData.get("allowWaitlist") === "on",
      guestLimit,
      guestNote: String(formData.get("guestNote") ?? "") || null,
    });

    revalidatePath(`/events/${eventId}`);
    revalidatePath(`/admin/approvals/${eventId}`);
    return { ok: "Coverage capacity saved." };
  } catch (e) {
    return fail(e);
  }
}

export async function addNoteAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const actor = await requireAdmin();
    const eventId = formData.get("eventId") ? Number(formData.get("eventId")) : null;
    addInternalNote(actor, {
      eventId,
      requestId: formData.get("requestId") ? Number(formData.get("requestId")) : null,
      subjectUserId: formData.get("subjectUserId")
        ? Number(formData.get("subjectUserId"))
        : null,
      note: String(formData.get("note") ?? ""),
      visibility:
        formData.get("visibility") === "super_admin_only"
          ? "super_admin_only"
          : "admins",
    });
    if (eventId) {
      revalidatePath(`/events/${eventId}`);
      revalidatePath(`/admin/approvals/${eventId}`);
    }
    return { ok: "Note added." };
  } catch (e) {
    return fail(e);
  }
}
