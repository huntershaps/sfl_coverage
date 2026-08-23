import "server-only";
import { getDb, audit, notify, parseJson, boolSetting } from "./db";
import type { SessionUser } from "./auth";
import {
  HttpError,
  isAdmin,
  isSuperAdmin,
  canFinalizeDecision,
  canOverrideCapacity,
} from "./rbac";
import {
  capacityFor,
  getEvent,
  refreshEventStatus,
  type EventRow,
} from "./events";
import {
  COVERAGE_TYPE_LABEL,
  REQUEST_STATUS_LABEL,
  type CoverageType,
  type RequestStatus,
} from "./constants";

/* ------------------------------- helpers --------------------------------- */

function superAdminIds(): number[] {
  return (
    getDb().prepare("SELECT id FROM users WHERE role = 'super_admin'").all() as {
      id: number;
    }[]
  ).map((r) => r.id);
}

function eventOr404(eventId: number): EventRow {
  const ev = getEvent(eventId);
  if (!ev) throw new HttpError(404, "That event no longer exists.");
  return ev;
}

function eventLabel(ev: EventRow) {
  return ev.venue ? `${ev.title} at ${ev.venue}` : ev.title;
}

/** Reads the per-contributor guest ("+1") allowance for an event. */
export function guestLimitFor(ev: { guest_limit?: number | null }) {
  return Math.max(0, ev.guest_limit ?? 0);
}

/**
 * Guests are capped by the event's policy. Only someone who can override
 * capacity may go past it, which keeps "+1" decisions with the Super Admin.
 */
function resolveGuests(
  requested: number | undefined,
  ev: EventRow,
  actorCanOverride: boolean,
  override: boolean,
): number {
  const want = Math.max(0, Math.floor(requested ?? 0));
  const limit = guestLimitFor(ev);
  if (want <= limit) return want;
  if (override && actorCanOverride) return want;
  throw new HttpError(
    400,
    limit === 0
      ? "Guests aren't allowed on this event."
      : `Only ${limit} guest${limit === 1 ? "" : "s"} allowed per person on this event.`,
  );
}

export function guestSuffix(n: number) {
  return n > 0 ? ` +${n}` : "";
}

/* --------------------------- submitting a request ------------------------- */

export function submitRequest(
  user: SessionUser,
  input: {
    eventId: number;
    coverageTypes: CoverageType[];
    message?: string;
    reason?: string;
    guestsRequested?: number;
  },
) {
  const db = getDb();
  const ev = eventOr404(input.eventId);

  if (ev.status === "cancelled")
    throw new HttpError(400, "This event has been cancelled.");
  if (ev.status === "archived" || ev.status === "draft")
    throw new HttpError(400, "This event is not open for requests.");
  if (ev.requests_closed)
    throw new HttpError(400, "Coverage requests are closed for this event.");
  if (!input.coverageTypes?.length)
    throw new HttpError(400, "Pick at least one type of coverage you can provide.");

  const existing = db
    .prepare(
      `SELECT id, status FROM coverage_requests
        WHERE event_id = ? AND user_id = ?
          AND status IN ('pending','under_review','approved','waitlisted')`,
    )
    .get(ev.id, user.id) as { id: number; status: string } | undefined;
  if (existing)
    throw new HttpError(
      409,
      existing.status === "approved"
        ? "You are already approved to cover this event."
        : "You already have a request in for this event.",
    );

  const already = db
    .prepare(
      `SELECT id FROM assignments WHERE event_id = ? AND user_id = ? AND status = 'active'`,
    )
    .get(ev.id, user.id);
  if (already)
    throw new HttpError(409, "You are already assigned to this event.");

  const cap = capacityFor(ev);
  // A full event still accepts requests when waitlisting is on — the Super
  // Admin can always override capacity later.
  if (cap.isFull && !ev.allow_waitlist)
    throw new HttpError(400, "Coverage for this event is already full.");

  // Asking for more guests than the event allows is rejected up front rather
  // than quietly trimmed, so nobody turns up with an uninvited guest.
  const guestsRequested = resolveGuests(input.guestsRequested, ev, false, false);

  const status: RequestStatus = "pending";
  const info = db
    .prepare(
      `INSERT INTO coverage_requests (event_id, user_id, coverage_types, message, reason, status, guests_requested)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      ev.id,
      user.id,
      JSON.stringify(input.coverageTypes),
      input.message?.trim() || null,
      input.reason?.trim() || null,
      status,
      guestsRequested,
    );
  const requestId = Number(info.lastInsertRowid);

  audit({
    actorId: user.id,
    action: "request.submitted",
    entityType: "coverage_request",
    entityId: requestId,
    eventId: ev.id,
    summary: `${user.name} requested to cover ${eventLabel(ev)}`,
    meta: { coverageTypes: input.coverageTypes, waitlistLikely: cap.isFull, guestsRequested },
  });

  notify({
    userId: user.id,
    type: "request.received",
    title: "Coverage request submitted",
    body: `We received your request to cover ${ev.title}. It's pending Super Admin approval.`,
    href: `/events/${ev.id}`,
    eventId: ev.id,
  });

  for (const adminId of superAdminIds()) {
    if (adminId === user.id) continue;
    notify({
      userId: adminId,
      type: "request.new",
      title: `New coverage request — ${ev.title}`,
      body: `${user.name} wants to cover this (${input.coverageTypes
        .map((t) => COVERAGE_TYPE_LABEL[t])
        .join(", ")}).`,
      href: `/admin/approvals/${ev.id}`,
      eventId: ev.id,
    });
  }

  refreshEventStatus(ev.id);
  return requestId;
}

export function withdrawRequest(user: SessionUser, requestId: number) {
  const db = getDb();
  const req = db
    .prepare("SELECT * FROM coverage_requests WHERE id = ?")
    .get(requestId) as { id: number; user_id: number; status: string; event_id: number } | undefined;
  if (!req) throw new HttpError(404, "Request not found.");
  if (req.user_id !== user.id)
    throw new HttpError(403, "You can only withdraw your own requests.");
  if (!["pending", "under_review", "waitlisted"].includes(req.status))
    throw new HttpError(
      400,
      "Only a request that is still open can be withdrawn.",
    );

  db.prepare(
    "UPDATE coverage_requests SET status = 'withdrawn', reviewed_at = datetime('now') WHERE id = ?",
  ).run(requestId);

  const ev = eventOr404(req.event_id);
  audit({
    actorId: user.id,
    action: "request.withdrawn",
    entityType: "coverage_request",
    entityId: requestId,
    eventId: ev.id,
    summary: `${user.name} withdrew their request for ${eventLabel(ev)}`,
  });
  refreshEventStatus(ev.id);
}

/* ---------------------------- deciding a request -------------------------- */

export type Decision = "approve" | "reject" | "waitlist" | "review";

const DECISION_STATUS: Record<Decision, RequestStatus> = {
  approve: "approved",
  reject: "rejected",
  waitlist: "waitlisted",
  review: "under_review",
};

/**
 * The single gate every approval flows through.
 *
 * A Super Admin always renders a final decision. An Admin/Editor renders one
 * only when the org has turned off "require Super Admin approval"; otherwise
 * their call is recorded as a recommendation, the request moves to Under
 * Review, and the Super Admins are notified that it is waiting on them.
 */
export function decideRequest(
  actor: SessionUser,
  input: {
    requestId: number;
    decision: Decision;
    coverageType?: CoverageType;
    decisionNote?: string;
    overrideCapacity?: boolean;
    /** Guests approved for this person. Defaults to what they asked for. */
    guests?: number;
  },
) {
  if (!isAdmin(actor))
    throw new HttpError(403, "Only an administrator can act on requests.");

  const db = getDb();
  const req = db
    .prepare("SELECT * FROM coverage_requests WHERE id = ?")
    .get(input.requestId) as
    | {
        id: number;
        event_id: number;
        user_id: number;
        status: string;
        coverage_types: string;
        guests_requested: number;
      }
    | undefined;
  if (!req) throw new HttpError(404, "Request not found.");
  if (["withdrawn", "cancelled"].includes(req.status))
    throw new HttpError(400, "This request is no longer active.");

  const ev = eventOr404(req.event_id);
  const requester = db
    .prepare("SELECT id, name FROM users WHERE id = ?")
    .get(req.user_id) as { id: number; name: string };

  const final = canFinalizeDecision(actor);

  // --- Admin/Editor without final authority: record a recommendation. ---
  if (!final) {
    db.prepare(
      `UPDATE coverage_requests
          SET status = 'under_review', recommendation = ?, recommended_by = ?,
              decision_note = coalesce(?, decision_note)
        WHERE id = ?`,
    ).run(
      input.decision,
      actor.id,
      input.decisionNote?.trim() || null,
      req.id,
    );

    audit({
      actorId: actor.id,
      action: "request.recommended",
      entityType: "coverage_request",
      entityId: req.id,
      eventId: ev.id,
      summary: `${actor.name} recommended "${input.decision}" for ${requester.name} on ${eventLabel(ev)} — awaiting Super Admin`,
      meta: { decision: input.decision },
    });

    for (const sid of superAdminIds()) {
      notify({
        userId: sid,
        type: "request.awaiting_super_admin",
        title: `Awaiting your decision — ${ev.title}`,
        body: `${actor.name} recommends ${input.decision} for ${requester.name}.`,
        href: `/admin/approvals/${ev.id}`,
        eventId: ev.id,
      });
    }
    notify({
      userId: requester.id,
      type: "request.under_review",
      title: `Your request is under review — ${ev.title}`,
      body: "An editor has reviewed it. It's now with the Super Admin for a final decision.",
      href: `/events/${ev.id}`,
      eventId: ev.id,
    });

    refreshEventStatus(ev.id);
    return { final: false as const, status: "under_review" as RequestStatus };
  }

  // --- Final decision path ---
  const nextStatus = DECISION_STATUS[input.decision];

  if (input.decision === "approve") {
    const cap = capacityFor(ev);
    const wantType =
      input.coverageType ??
      (parseJson<CoverageType[]>(req.coverage_types, [])[0] || "other");

    if (cap.isFull) {
      if (!input.overrideCapacity)
        throw new HttpError(
          409,
          "Coverage is already full for this event. Approving anyway requires a capacity override.",
        );
      if (!canOverrideCapacity(actor))
        throw new HttpError(
          403,
          "Only the Super Admin can approve past an event's coverage limit.",
        );
    }

    // Per-type capacity, when configured.
    const slot = cap.byType.find((t) => t.type === wantType);
    if (slot && slot.filled >= slot.capacity) {
      if (!input.overrideCapacity)
        throw new HttpError(
          409,
          `${slot.label} slots are full for this event (${slot.filled}/${slot.capacity}).`,
        );
      if (!canOverrideCapacity(actor))
        throw new HttpError(
          403,
          "Only the Super Admin can approve past a coverage-type limit.",
        );
    }

    // Default to whatever they asked for; the decider can raise or lower it.
    const guests = resolveGuests(
      input.guests ?? req.guests_requested ?? 0,
      ev,
      canOverrideCapacity(actor),
      !!input.overrideCapacity,
    );

    const existing = db
      .prepare(
        `SELECT id FROM assignments WHERE event_id = ? AND user_id = ? AND status = 'active'`,
      )
      .get(ev.id, requester.id) as { id: number } | undefined;

    if (existing) {
      db.prepare("UPDATE assignments SET coverage_type = ?, guests = ? WHERE id = ?").run(
        wantType,
        guests,
        existing.id,
      );
    } else {
      db.prepare(
        `INSERT INTO assignments (event_id, user_id, coverage_type, request_id, assigned_by, status, guests)
         VALUES (?, ?, ?, ?, ?, 'active', ?)`,
      ).run(ev.id, requester.id, wantType, req.id, actor.id, guests);
    }

    notify({
      userId: requester.id,
      type: "request.approved",
      title: `You're approved to cover ${ev.title}`,
      body: `${COVERAGE_TYPE_LABEL[wantType] ?? wantType}${
        guests > 0 ? `, plus ${guests} guest${guests === 1 ? "" : "s"}` : ""
      } — it's on your schedule now.${
        input.decisionNote ? ` Note: ${input.decisionNote}` : ""
      }`,
      href: `/schedule`,
      eventId: ev.id,
    });
  } else {
    // Reject / waitlist / review clears any assignment created by an earlier
    // approval of the same request, so a changed decision fully takes effect.
    const prior = db
      .prepare(
        `SELECT id FROM assignments WHERE request_id = ? AND status = 'active'`,
      )
      .get(req.id) as { id: number } | undefined;
    if (prior) {
      db.prepare(
        `UPDATE assignments SET status = 'removed', removed_reason = ? WHERE id = ?`,
      ).run(`Decision changed to ${REQUEST_STATUS_LABEL[nextStatus]}`, prior.id);
    }

    if (input.decision !== "review") {
      notify({
        userId: requester.id,
        type: `request.${nextStatus}`,
        title:
          input.decision === "waitlist"
            ? `You're on the waitlist for ${ev.title}`
            : `Update on your request — ${ev.title}`,
        body:
          input.decisionNote?.trim() ||
          (input.decision === "waitlist"
            ? "We'll reach out if a spot opens up."
            : "This one went another direction. Thanks for putting your name in."),
        href: `/requests`,
        eventId: ev.id,
      });
    }
  }

  db.prepare(
    `UPDATE coverage_requests
        SET status = ?, reviewed_at = datetime('now'), reviewed_by = ?,
            decision_note = coalesce(?, decision_note), recommendation = NULL
      WHERE id = ?`,
  ).run(nextStatus, actor.id, input.decisionNote?.trim() || null, req.id);

  audit({
    actorId: actor.id,
    action: `request.${nextStatus}`,
    entityType: "coverage_request",
    entityId: req.id,
    eventId: ev.id,
    summary: `${actor.name} set ${requester.name}'s request for ${eventLabel(ev)} to ${REQUEST_STATUS_LABEL[nextStatus]}`,
    meta: {
      decision: input.decision,
      override: !!input.overrideCapacity,
      byRole: actor.role,
    },
  });

  refreshEventStatus(ev.id);
  return { final: true as const, status: nextStatus };
}

/* ---------------------------- direct assignment --------------------------- */

export function assignDirectly(
  actor: SessionUser,
  input: {
    eventId: number;
    userId: number;
    coverageType: CoverageType;
    overrideCapacity?: boolean;
    guests?: number;
  },
) {
  if (!isAdmin(actor))
    throw new HttpError(403, "Only an administrator can assign contributors.");
  if (!isSuperAdmin(actor) && boolSetting("require_super_admin_approval"))
    throw new HttpError(
      403,
      "Direct assignment is reserved for the Super Admin while final-approval mode is on.",
    );

  const db = getDb();
  const ev = eventOr404(input.eventId);
  const target = db
    .prepare("SELECT id, name, status FROM users WHERE id = ?")
    .get(input.userId) as { id: number; name: string; status: string } | undefined;
  if (!target) throw new HttpError(404, "That contributor no longer exists.");

  const dupe = db
    .prepare(
      "SELECT id FROM assignments WHERE event_id = ? AND user_id = ? AND status = 'active'",
    )
    .get(ev.id, target.id);
  if (dupe) throw new HttpError(409, `${target.name} is already on this event.`);

  const cap = capacityFor(ev);
  if (cap.isFull && !input.overrideCapacity)
    throw new HttpError(
      409,
      "Coverage is full. Assigning anyway requires a capacity override.",
    );
  if (cap.isFull && !canOverrideCapacity(actor))
    throw new HttpError(403, "Only the Super Admin can assign past the limit.");

  const guests = resolveGuests(
    input.guests,
    ev,
    canOverrideCapacity(actor),
    !!input.overrideCapacity,
  );

  const info = db
    .prepare(
      `INSERT INTO assignments (event_id, user_id, coverage_type, assigned_by, status, guests)
       VALUES (?, ?, ?, ?, 'active', ?)`,
    )
    .run(ev.id, target.id, input.coverageType, actor.id, guests);

  // A pending request from the same person is resolved by the direct assignment.
  db.prepare(
    `UPDATE coverage_requests
        SET status = 'approved', reviewed_at = datetime('now'), reviewed_by = ?
      WHERE event_id = ? AND user_id = ? AND status IN ('pending','under_review','waitlisted')`,
  ).run(actor.id, ev.id, target.id);

  audit({
    actorId: actor.id,
    action: "assignment.created",
    entityType: "assignment",
    entityId: Number(info.lastInsertRowid),
    eventId: ev.id,
    summary:
      actor.id === target.id
        ? `${actor.name} put themselves on ${eventLabel(ev)} (${COVERAGE_TYPE_LABEL[input.coverageType]}${guestSuffix(guests)})`
        : `${actor.name} assigned ${target.name} to ${eventLabel(ev)} (${COVERAGE_TYPE_LABEL[input.coverageType]}${guestSuffix(guests)})`,
    meta: { direct: true, override: !!input.overrideCapacity, guests, self: actor.id === target.id },
  });

  if (actor.id !== target.id) {
    notify({
      userId: target.id,
      type: "assignment.created",
      title: `You've been assigned to ${ev.title}`,
      body: `${COVERAGE_TYPE_LABEL[input.coverageType]}${
        guests > 0 ? `, plus ${guests} guest${guests === 1 ? "" : "s"}` : ""
      } — added to your schedule by ${actor.name}.`,
      href: "/schedule",
      eventId: ev.id,
    });
  }

  refreshEventStatus(ev.id);
  return Number(info.lastInsertRowid);
}

export function removeAssignment(
  actor: SessionUser,
  assignmentId: number,
  reason?: string,
) {
  if (!isAdmin(actor))
    throw new HttpError(403, "Only an administrator can remove an assignment.");

  const db = getDb();
  const asg = db
    .prepare("SELECT * FROM assignments WHERE id = ?")
    .get(assignmentId) as
    | { id: number; event_id: number; user_id: number; request_id: number | null; assigned_by: number | null }
    | undefined;
  if (!asg) throw new HttpError(404, "Assignment not found.");

  const ev = eventOr404(asg.event_id);
  const target = db
    .prepare("SELECT id, name FROM users WHERE id = ?")
    .get(asg.user_id) as { id: number; name: string };

  // An Admin/Editor cannot undo a Super Admin's assignment; the reverse is
  // always allowed, which is what "final say" means here.
  if (!isSuperAdmin(actor) && asg.assigned_by) {
    const assigner = db
      .prepare("SELECT role FROM users WHERE id = ?")
      .get(asg.assigned_by) as { role: string } | undefined;
    if (assigner?.role === "super_admin")
      throw new HttpError(
        403,
        "This assignment was made by the Super Admin and can only be changed by them.",
      );
  }

  db.prepare(
    "UPDATE assignments SET status = 'removed', removed_reason = ? WHERE id = ?",
  ).run(reason?.trim() || null, assignmentId);

  if (asg.request_id) {
    db.prepare(
      "UPDATE coverage_requests SET status = 'cancelled', reviewed_at = datetime('now'), reviewed_by = ? WHERE id = ?",
    ).run(actor.id, asg.request_id);
  }

  audit({
    actorId: actor.id,
    action: "assignment.removed",
    entityType: "assignment",
    entityId: assignmentId,
    eventId: ev.id,
    summary: `${actor.name} removed ${target.name} from ${eventLabel(ev)}`,
    meta: { reason: reason ?? null },
  });

  notify({
    userId: target.id,
    type: "assignment.removed",
    title: `Assignment removed — ${ev.title}`,
    body: reason?.trim() || "Your assignment for this event was removed.",
    href: `/events/${ev.id}`,
    eventId: ev.id,
  });

  refreshEventStatus(ev.id);
}

export function changeAssignmentType(
  actor: SessionUser,
  assignmentId: number,
  coverageType: CoverageType,
  guests?: number,
) {
  if (!isAdmin(actor)) throw new HttpError(403, "Admin access required.");
  const db = getDb();
  const asg = db
    .prepare("SELECT * FROM assignments WHERE id = ?")
    .get(assignmentId) as { id: number; event_id: number; user_id: number } | undefined;
  if (!asg) throw new HttpError(404, "Assignment not found.");
  const ev = eventOr404(asg.event_id);
  const target = db.prepare("SELECT name FROM users WHERE id = ?").get(asg.user_id) as {
    name: string;
  };

  const nextGuests =
    guests === undefined
      ? undefined
      : resolveGuests(guests, ev, canOverrideCapacity(actor), true);

  db.prepare(
    "UPDATE assignments SET coverage_type = ?, guests = coalesce(?, guests) WHERE id = ?",
  ).run(coverageType, nextGuests ?? null, assignmentId);

  audit({
    actorId: actor.id,
    action: "assignment.retyped",
    entityType: "assignment",
    entityId: assignmentId,
    eventId: ev.id,
    summary: `${actor.name} changed ${target.name}'s responsibility on ${eventLabel(ev)} to ${COVERAGE_TYPE_LABEL[coverageType]}${
      nextGuests === undefined ? "" : guestSuffix(nextGuests)
    }`,
  });

  if (actor.id !== asg.user_id) {
    notify({
      userId: asg.user_id,
      type: "assignment.updated",
      title: `Your role changed — ${ev.title}`,
      body: `You're now down for ${COVERAGE_TYPE_LABEL[coverageType]}${
        nextGuests ? `, plus ${nextGuests} guest${nextGuests === 1 ? "" : "s"}` : ""
      }.`,
      href: "/schedule",
      eventId: ev.id,
    });
  }
}

/* ------------------------- event-level admin actions ---------------------- */

export function setRequestsClosed(
  actor: SessionUser,
  eventId: number,
  closed: boolean,
) {
  if (!isAdmin(actor)) throw new HttpError(403, "Admin access required.");
  const ev = eventOr404(eventId);
  getDb()
    .prepare(
      "UPDATE events SET requests_closed = ?, updated_at = datetime('now') WHERE id = ?",
    )
    .run(closed ? 1 : 0, eventId);
  audit({
    actorId: actor.id,
    action: closed ? "event.requests_closed" : "event.requests_reopened",
    entityType: "event",
    entityId: eventId,
    eventId,
    summary: `${actor.name} ${closed ? "closed" : "reopened"} coverage requests for ${eventLabel(ev)}`,
  });
  refreshEventStatus(eventId);
}

export function setCapacity(
  actor: SessionUser,
  eventId: number,
  input: {
    coverageLimit: number | null;
    slots?: { coverage_type: CoverageType; capacity: number }[];
    allowWaitlist?: boolean;
    guestLimit?: number;
    guestNote?: string | null;
  },
) {
  if (!isAdmin(actor)) throw new HttpError(403, "Admin access required.");
  const db = getDb();
  const ev = eventOr404(eventId);

  const guestLimit = Math.max(0, Math.floor(input.guestLimit ?? 0));

  db.prepare(
    `UPDATE events SET coverage_limit = ?, allow_waitlist = ?, guest_limit = ?, guest_note = ?,
            updated_at = datetime('now')
      WHERE id = ?`,
  ).run(
    input.coverageLimit,
    input.allowWaitlist === false ? 0 : 1,
    guestLimit,
    input.guestNote?.trim() || null,
    eventId,
  );

  // Trim anyone already approved for more guests than the new policy allows,
  // so the limit and the assignments can never disagree.
  db.prepare(
    "UPDATE assignments SET guests = ? WHERE event_id = ? AND guests > ?",
  ).run(guestLimit, eventId, guestLimit);

  db.prepare("DELETE FROM event_slots WHERE event_id = ?").run(eventId);
  for (const s of input.slots ?? []) {
    if (s.capacity > 0)
      db.prepare(
        "INSERT INTO event_slots (event_id, coverage_type, capacity) VALUES (?, ?, ?)",
      ).run(eventId, s.coverage_type, s.capacity);
  }

  audit({
    actorId: actor.id,
    action: "event.capacity_changed",
    entityType: "event",
    entityId: eventId,
    eventId,
    summary: `${actor.name} set coverage capacity on ${eventLabel(ev)} to ${
      input.coverageLimit == null ? "unlimited" : input.coverageLimit
    }${input.slots?.length ? ` (${input.slots.map((s) => `${COVERAGE_TYPE_LABEL[s.coverage_type]}: ${s.capacity}`).join(", ")})` : ""}, guests ${
      guestLimit === 0 ? "not allowed" : `up to +${guestLimit}`
    }`,
    meta: input,
  });
  refreshEventStatus(eventId);
}

/** Notifies everyone assigned when an event is cancelled or materially changed. */
export function notifyAssignees(
  ev: EventRow,
  type: string,
  title: string,
  body: string,
) {
  const rows = getDb()
    .prepare(
      "SELECT user_id FROM assignments WHERE event_id = ? AND status = 'active'",
    )
    .all(ev.id) as { user_id: number }[];
  for (const r of rows)
    notify({
      userId: r.user_id,
      type,
      title,
      body,
      href: `/events/${ev.id}`,
      eventId: ev.id,
    });
}

export function addInternalNote(
  actor: SessionUser,
  input: {
    eventId?: number | null;
    requestId?: number | null;
    subjectUserId?: number | null;
    note: string;
    visibility?: "admins" | "super_admin_only";
  },
) {
  if (!isAdmin(actor))
    throw new HttpError(403, "Only administrators can leave internal notes.");
  if (!input.note?.trim()) throw new HttpError(400, "The note is empty.");
  if (input.visibility === "super_admin_only" && !isSuperAdmin(actor))
    throw new HttpError(403, "Only the Super Admin can create Super-Admin-only notes.");

  const info = getDb()
    .prepare(
      `INSERT INTO internal_notes (event_id, request_id, subject_user_id, author_id, note, visibility)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.eventId ?? null,
      input.requestId ?? null,
      input.subjectUserId ?? null,
      actor.id,
      input.note.trim(),
      input.visibility ?? "admins",
    );

  audit({
    actorId: actor.id,
    action: "note.created",
    entityType: "internal_note",
    entityId: Number(info.lastInsertRowid),
    eventId: input.eventId ?? null,
    summary: `${actor.name} left an internal note`,
    meta: { visibility: input.visibility ?? "admins" },
  });
  return Number(info.lastInsertRowid);
}
