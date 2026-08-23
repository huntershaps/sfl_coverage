import "server-only";
import { getDb, parseJson } from "./db";
import type { SessionUser } from "./auth";
import { isAdmin } from "./rbac";
import {
  type EventStatus,
  type CoverageType,
  COVERAGE_TYPE_LABEL,
} from "./constants";

export type EventRow = {
  id: number;
  title: string;
  subtitle: string | null;
  description: string | null;
  category: string;
  start_datetime: string;
  end_datetime: string | null;
  time_tbd: number;
  multi_day_end: string | null;
  venue: string | null;
  address: string | null;
  city: string | null;
  organizer: string | null;
  ticket_url: string | null;
  image_url: string | null;
  extra_images: string;
  status: EventStatus;
  coverage_limit: number | null;
  allow_waitlist: number;
  requests_closed: number;
  /** Guests ("+1s") each approved contributor may bring. 0 = none allowed. */
  guest_limit: number;
  guest_note: string | null;
  legacy_assignees: string | null;
  source_note: string | null;
  import_id: number | null;
  created_by: number | null;
  created_at: string;
  updated_at: string;
};

export type ViewerState = {
  myRequestId: number | null;
  myRequestStatus: string | null;
  myAssignmentId: number | null;
  myCoverageType: string | null;
};

export type EventWithCoverage = EventRow &
  ViewerState & {
    approved_count: number;
    pending_count: number;
    slots: { coverage_type: string; capacity: number; filled: number }[];
  };

/* ------------------------------- capacity -------------------------------- */

export type Capacity = {
  limit: number | null; // null = unlimited
  approved: number;
  spotsLeft: number | null;
  isFull: boolean;
  byType: { type: CoverageType; label: string; capacity: number; filled: number }[];
  /** True when per-type limits are configured rather than a single total. */
  typed: boolean;
};

export function capacityFor(
  ev: Pick<EventRow, "id" | "coverage_limit">,
): Capacity {
  const db = getDb();
  const approved = (
    db
      .prepare(
        `SELECT COUNT(*) n FROM assignments
          WHERE event_id = ? AND status IN ('active','completed')`,
      )
      .get(ev.id) as { n: number }
  ).n;

  const slotRows = db
    .prepare(`SELECT coverage_type, capacity FROM event_slots WHERE event_id = ?`)
    .all(ev.id) as { coverage_type: CoverageType; capacity: number }[];

  const filledRows = db
    .prepare(
      `SELECT coverage_type, COUNT(*) n FROM assignments
        WHERE event_id = ? AND status IN ('active','completed')
        GROUP BY coverage_type`,
    )
    .all(ev.id) as { coverage_type: string; n: number }[];
  const filledBy = new Map(filledRows.map((r) => [r.coverage_type, r.n]));

  const byType = slotRows.map((s) => ({
    type: s.coverage_type,
    label: COVERAGE_TYPE_LABEL[s.coverage_type] ?? s.coverage_type,
    capacity: s.capacity,
    filled: filledBy.get(s.coverage_type) ?? 0,
  }));

  const typed = byType.length > 0;
  // With per-type limits the effective total is the sum of those slots unless a
  // stricter overall limit is also set.
  const typedTotal = byType.reduce((a, b) => a + b.capacity, 0);
  const limit = typed
    ? ev.coverage_limit != null
      ? Math.min(ev.coverage_limit, typedTotal)
      : typedTotal
    : ev.coverage_limit;

  const spotsLeft = limit == null ? null : Math.max(0, limit - approved);
  const isFull =
    limit != null
      ? approved >= limit
      : typed
        ? byType.every((t) => t.filled >= t.capacity)
        : false;

  return { limit, approved, spotsLeft, isFull, byType, typed };
}

/** Which coverage types still have room. Empty array = no per-type limits set. */
export function openTypes(cap: Capacity): CoverageType[] {
  return cap.byType.filter((t) => t.filled < t.capacity).map((t) => t.type);
}

/* --------------------------- derived event status ------------------------- */

const MANUAL_STATUSES: EventStatus[] = [
  "cancelled",
  "postponed",
  "archived",
  "draft",
];

/**
 * Coverage status is derived from live request/assignment counts so it can
 * never drift from reality. Statuses a human sets deliberately (cancelled,
 * postponed, archived, draft) always win.
 */
export function deriveStatus(ev: EventRow): EventStatus {
  if (MANUAL_STATUSES.includes(ev.status)) return ev.status;

  const db = getDb();
  const approved = (
    db
      .prepare(
        `SELECT COUNT(*) n FROM assignments WHERE event_id = ? AND status IN ('active','completed')`,
      )
      .get(ev.id) as { n: number }
  ).n;
  const pending = (
    db
      .prepare(
        `SELECT COUNT(*) n FROM coverage_requests WHERE event_id = ? AND status IN ('pending','under_review')`,
      )
      .get(ev.id) as { n: number }
  ).n;

  const cap = capacityFor(ev);
  if (cap.isFull && approved > 0) return "full";
  if (approved > 0) return "assigned";
  if (pending > 0) return "requests_pending";
  if (ev.requests_closed) return "upcoming";
  return "open";
}

export function refreshEventStatus(eventId: number) {
  const db = getDb();
  const ev = db.prepare("SELECT * FROM events WHERE id = ?").get(eventId) as
    | EventRow
    | undefined;
  if (!ev) return;
  const next = deriveStatus(ev);
  if (next !== ev.status) {
    db.prepare("UPDATE events SET status = ?, updated_at = datetime('now') WHERE id = ?").run(
      next,
      eventId,
    );
  }
}

/* -------------------------------- queries -------------------------------- */

export type EventFilters = {
  q?: string;
  category?: string;
  city?: string;
  status?: string;
  from?: string;
  to?: string;
  availability?: "open" | "full" | "needs" | "";
  scope?: "all" | "mine" | "requested" | "past";
  quick?: string;
  sort?: "soonest" | "latest" | "recent";
  limit?: number;
  offset?: number;
};

/**
 * Resolves a quick-filter chip to a date window. `now` is injectable so the
 * day-of-week edge cases can be tested rather than only being right today.
 */
export function quickRange(
  quick?: string,
  now: Date = new Date(),
): { from?: string; to?: string } {
  if (!quick) return {};
  const d0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const plus = (n: number) => {
    const d = new Date(d0);
    d.setDate(d.getDate() + n);
    return d;
  };
  const dow = d0.getDay();

  switch (quick) {
    case "today":
      return { from: iso(d0), to: iso(d0) };
    // Weeks run Monday–Sunday, so on a Sunday "this week" ends today rather
    // than running on for another seven days.
    case "week":
      return { from: iso(d0), to: iso(plus(dow === 0 ? 0 : 7 - dow)) };
    case "weekend": {
      // If it is already Friday, Saturday or Sunday then "this weekend" is the
      // one happening now, starting today — not the one a week away.
      const inWeekend = dow === 5 || dow === 6 || dow === 0;
      const start = inWeekend ? d0 : plus((5 - dow + 7) % 7);
      const end = new Date(start);
      end.setDate(end.getDate() + (start.getDay() === 0 ? 0 : 7 - start.getDay()));
      return { from: iso(start), to: iso(end) };
    }
    case "nextweek": {
      // The Monday after this week closes. On a Sunday that is tomorrow.
      const start = plus(dow === 0 ? 1 : 8 - dow);
      const end = new Date(start);
      end.setDate(end.getDate() + 6);
      return { from: iso(start), to: iso(end) };
    }
    case "month": {
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      return { from: iso(d0), to: iso(end) };
    }
    default:
      return {};
  }
}

export function listEvents(
  filters: EventFilters,
  viewer: SessionUser | null,
): { rows: EventWithCoverage[]; total: number } {
  const db = getDb();
  const where: string[] = [];
  const params: Record<string, unknown> = {};
  const viewerId = viewer?.id ?? -1;

  // Contributors never see drafts; admins do.
  if (!isAdmin(viewer)) where.push("e.status != 'draft'");

  const range = { ...quickRange(filters.quick) };
  const from = filters.from || range.from;
  const to = filters.to || range.to;

  if (filters.scope === "past") {
    where.push("date(e.start_datetime) < date('now')");
  } else if (!from && !to && filters.scope !== "all") {
    // Default view is forward-looking; multi-day runs stay visible until they end.
    where.push(
      "(date(coalesce(e.multi_day_end, e.start_datetime)) >= date('now'))",
    );
  }
  if (from) {
    where.push("date(coalesce(e.multi_day_end, e.start_datetime)) >= date(:from)");
    params.from = from;
  }
  if (to) {
    where.push("date(e.start_datetime) <= date(:to)");
    params.to = to;
  }

  if (filters.q) {
    where.push(
      `(e.title LIKE :q OR e.subtitle LIKE :q OR e.venue LIKE :q OR e.city LIKE :q
        OR e.description LIKE :q OR e.organizer LIKE :q)`,
    );
    params.q = `%${filters.q}%`;
  }
  if (filters.category) {
    where.push("e.category = :category");
    params.category = filters.category;
  }
  if (filters.city) {
    where.push("e.city = :city");
    params.city = filters.city;
  }
  if (filters.status) {
    where.push("e.status = :status");
    params.status = filters.status;
  }
  if (filters.scope === "mine") {
    where.push(
      "EXISTS (SELECT 1 FROM assignments a WHERE a.event_id = e.id AND a.user_id = :viewer AND a.status = 'active')",
    );
  }
  if (filters.scope === "requested") {
    where.push(
      "EXISTS (SELECT 1 FROM coverage_requests r WHERE r.event_id = e.id AND r.user_id = :viewer AND r.status IN ('pending','under_review','waitlisted'))",
    );
  }
  params.viewer = viewerId;

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const base = `
    FROM events e
    ${whereSql}
  `;

  const total = (
    db.prepare(`SELECT COUNT(*) n ${base}`).get(params) as { n: number }
  ).n;

  const order =
    filters.sort === "latest"
      ? "e.start_datetime DESC"
      : filters.sort === "recent"
        ? "e.created_at DESC"
        : "e.start_datetime ASC, e.title ASC";

  const rows = db
    .prepare(
      `SELECT e.*,
        (SELECT COUNT(*) FROM assignments a WHERE a.event_id = e.id AND a.status IN ('active','completed')) approved_count,
        (SELECT COUNT(*) FROM coverage_requests r WHERE r.event_id = e.id AND r.status IN ('pending','under_review')) pending_count,
        (SELECT r.id FROM coverage_requests r WHERE r.event_id = e.id AND r.user_id = :viewer
           AND r.status IN ('pending','under_review','approved','waitlisted') LIMIT 1) myRequestId,
        (SELECT r.status FROM coverage_requests r WHERE r.event_id = e.id AND r.user_id = :viewer
           AND r.status IN ('pending','under_review','approved','waitlisted') LIMIT 1) myRequestStatus,
        (SELECT a.id FROM assignments a WHERE a.event_id = e.id AND a.user_id = :viewer AND a.status = 'active' LIMIT 1) myAssignmentId,
        (SELECT a.coverage_type FROM assignments a WHERE a.event_id = e.id AND a.user_id = :viewer AND a.status = 'active' LIMIT 1) myCoverageType
       ${base}
       ORDER BY ${order}
       LIMIT :limit OFFSET :offset`,
    )
    .all({
      ...params,
      limit: filters.limit ?? 60,
      offset: filters.offset ?? 0,
    }) as EventWithCoverage[];

  // Availability filtering needs computed capacity, so it is applied after the
  // SQL pass rather than duplicating the slot maths in SQL.
  let out = rows.map((r) => ({ ...r, slots: [] as EventWithCoverage["slots"] }));
  if (filters.availability) {
    out = out.filter((r) => {
      const cap = capacityFor(r);
      if (filters.availability === "open")
        return !cap.isFull && !r.requests_closed && r.status !== "cancelled";
      if (filters.availability === "full") return cap.isFull;
      if (filters.availability === "needs") return r.approved_count === 0;
      return true;
    });
  }

  return { rows: out, total };
}

export function getEvent(id: number): EventRow | null {
  return (
    (getDb().prepare("SELECT * FROM events WHERE id = ?").get(id) as EventRow) ??
    null
  );
}

export function viewerStateFor(eventId: number, userId: number): ViewerState {
  const db = getDb();
  const req = db
    .prepare(
      `SELECT id, status FROM coverage_requests
        WHERE event_id = ? AND user_id = ?
        ORDER BY submitted_at DESC LIMIT 1`,
    )
    .get(eventId, userId) as { id: number; status: string } | undefined;
  const asg = db
    .prepare(
      `SELECT id, coverage_type FROM assignments
        WHERE event_id = ? AND user_id = ? AND status = 'active' LIMIT 1`,
    )
    .get(eventId, userId) as { id: number; coverage_type: string } | undefined;
  return {
    myRequestId: req?.id ?? null,
    myRequestStatus: req?.status ?? null,
    myAssignmentId: asg?.id ?? null,
    myCoverageType: asg?.coverage_type ?? null,
  };
}

export function distinctCities(): string[] {
  return (
    getDb()
      .prepare(
        `SELECT DISTINCT city FROM events WHERE city IS NOT NULL AND city != '' ORDER BY city`,
      )
      .all() as { city: string }[]
  ).map((r) => r.city);
}

export function eventAssignments(eventId: number) {
  return getDb()
    .prepare(
      `SELECT a.*, u.name, u.email, u.profile_photo, u.specialties, u.role,
              b.name assigned_by_name
         FROM assignments a
         JOIN users u ON u.id = a.user_id
         LEFT JOIN users b ON b.id = a.assigned_by
        WHERE a.event_id = ? AND a.status != 'removed'
        ORDER BY a.assigned_at ASC`,
    )
    .all(eventId) as (Record<string, unknown> & {
    id: number;
    user_id: number;
    name: string;
    email: string;
    profile_photo: string | null;
    specialties: string;
    coverage_type: string;
    status: string;
    assigned_at: string;
    assigned_by_name: string | null;
  })[];
}

export function eventRequests(eventId: number, statuses?: string[]) {
  const st = statuses ?? [
    "pending",
    "under_review",
    "approved",
    "rejected",
    "waitlisted",
    "withdrawn",
  ];
  return getDb()
    .prepare(
      `SELECT r.*, u.name, u.email, u.profile_photo, u.specialties, u.coverage_area, u.bio,
              rv.name reviewed_by_name
         FROM coverage_requests r
         JOIN users u ON u.id = r.user_id
         LEFT JOIN users rv ON rv.id = r.reviewed_by
        WHERE r.event_id = ? AND r.status IN (${st.map(() => "?").join(",")})
        ORDER BY
          CASE r.status WHEN 'pending' THEN 0 WHEN 'under_review' THEN 1
                        WHEN 'waitlisted' THEN 2 WHEN 'approved' THEN 3 ELSE 4 END,
          r.submitted_at ASC`,
    )
    .all(eventId, ...st) as (Record<string, unknown> & {
    id: number;
    user_id: number;
    name: string;
    email: string;
    profile_photo: string | null;
    specialties: string;
    coverage_area: string | null;
    bio: string | null;
    coverage_types: string;
    message: string | null;
    reason: string | null;
    status: string;
    decision_note: string | null;
    recommendation: string | null;
    submitted_at: string;
    reviewed_by_name: string | null;
  })[];
}

/** Contributor's completed-coverage record, used on profiles and history. */
export function coverageHistory(userId: number) {
  return getDb()
    .prepare(
      `SELECT a.coverage_type, a.assigned_at, a.status,
              e.id, e.title, e.start_datetime, e.venue, e.city, e.category, e.image_url
         FROM assignments a JOIN events e ON e.id = a.event_id
        WHERE a.user_id = ? AND a.status IN ('active','completed')
          AND date(coalesce(e.multi_day_end, e.start_datetime)) < date('now')
        ORDER BY e.start_datetime DESC`,
    )
    .all(userId) as (EventRow & { coverage_type: string; assigned_at: string })[];
}

export { parseJson };
