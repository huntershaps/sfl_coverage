import "server-only";
import { getDb, audit, parseJson, notify } from "./db";
import type { SessionUser } from "./auth";
import { HttpError, isAdmin, isSuperAdmin } from "./rbac";
import { refreshEventStatus } from "./events";
import type { DetectedAssignee } from "./parse/assignees";
import { COVERAGE_TYPE_LABEL, type CoverageType } from "./constants";

/**
 * Migrating existing coverage out of the Google Doc.
 *
 * The doc records coverage as names in parentheses — "(Reporter: Charity +1)" —
 * and marks events Scott is attending with a trailing "*". Those are *existing
 * confirmed coverage*, not requests waiting on a decision, so they become
 * assignments directly and never generate a request.
 *
 * Names are only ever turned into assignments through a mapping the Super Admin
 * confirms. Nothing is guessed: an unmapped name stays as text on the event so
 * the information survives without inventing an account or assigning the wrong
 * person to someone else's credential.
 */

export type NameMap = Record<string, number>;

export function getNameMap(importId: number): NameMap {
  const db = getDb();
  const row = db.prepare("SELECT name_map FROM imports WHERE id = ?").get(importId) as
    | { name_map: string }
    | undefined;
  return parseJson<NameMap>(row?.name_map, {});
}

export function getStarredUserId(importId: number): number | null {
  const db = getDb();
  const row = db
    .prepare("SELECT starred_user_id FROM imports WHERE id = ?")
    .get(importId) as { starred_user_id: number | null } | undefined;
  return row?.starred_user_id ?? null;
}

/** Every distinct name the parser found across an import, with a suggestion. */
export type NameCandidate = {
  name: string;
  occurrences: number;
  mappedUserId: number | null;
  /** Best-guess account, offered but never applied automatically. */
  suggestedUserId: number | null;
  suggestedLabel: string | null;
};

/**
 * Suggests an account for a doc name by first name, then by a contained match.
 * A suggestion is only ever a default in the picker — the Super Admin confirms.
 */
function suggestAccount(
  name: string,
  users: { id: number; name: string; email: string }[],
): { id: number; label: string } | null {
  const n = name.trim().toLowerCase();
  if (!n) return null;

  const exact = users.find((u) => u.name.trim().toLowerCase() === n);
  if (exact) return { id: exact.id, label: exact.name };

  const firstName = users.find((u) => u.name.trim().toLowerCase().split(/\s+/)[0] === n);
  if (firstName) return { id: firstName.id, label: firstName.name };

  const contained = users.filter((u) => u.name.toLowerCase().includes(n));
  if (contained.length === 1) return { id: contained[0].id, label: contained[0].name };

  return null;
}

export function nameCandidates(importId: number): NameCandidate[] {
  const db = getDb();
  const rows = db
    .prepare("SELECT detected_assignees FROM import_items WHERE import_id = ?")
    .all(importId) as { detected_assignees: string }[];

  const counts = new Map<string, number>();
  for (const r of rows) {
    for (const a of parseJson<DetectedAssignee[]>(r.detected_assignees, [])) {
      counts.set(a.name, (counts.get(a.name) ?? 0) + 1);
    }
  }

  const users = db
    .prepare("SELECT id, name, email FROM users WHERE status != 'disabled' ORDER BY name")
    .all() as { id: number; name: string; email: string }[];

  const map = getNameMap(importId);

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([name, occurrences]) => {
      const s = suggestAccount(name, users);
      return {
        name,
        occurrences,
        mappedUserId: map[name] ?? null,
        suggestedUserId: s?.id ?? null,
        suggestedLabel: s?.label ?? null,
      };
    });
}

export function setNameMap(actor: SessionUser, importId: number, map: NameMap) {
  if (!isAdmin(actor))
    throw new HttpError(403, "Only an administrator can map contributors.");

  const db = getDb();
  // Drop anything pointing at an account that no longer exists.
  const clean: NameMap = {};
  for (const [name, userId] of Object.entries(map)) {
    if (!userId) continue;
    const exists = db.prepare("SELECT 1 FROM users WHERE id = ?").get(userId);
    if (exists) clean[name] = userId;
  }

  db.prepare("UPDATE imports SET name_map = ? WHERE id = ?").run(
    JSON.stringify(clean),
    importId,
  );

  audit({
    actorId: actor.id,
    action: "import.names_mapped",
    entityType: "import",
    entityId: importId,
    summary: `${actor.name} mapped ${Object.keys(clean).length} contributor name${
      Object.keys(clean).length === 1 ? "" : "s"
    } for import #${importId}`,
    meta: { map: clean },
  });
}

/**
 * Sets which account the doc's starred events belong to. Only a Super Admin may
 * do this: a star means that person is attending, so pointing it at the wrong
 * account hands out someone else's coverage.
 */
export function setStarredUser(
  actor: SessionUser,
  importId: number,
  userId: number | null,
) {
  if (!isSuperAdmin(actor))
    throw new HttpError(403, "Only the Super Admin can set who starred events belong to.");

  const db = getDb();
  if (userId) {
    const u = db.prepare("SELECT name FROM users WHERE id = ?").get(userId) as
      | { name: string }
      | undefined;
    if (!u) throw new HttpError(404, "That account no longer exists.");
  }

  db.prepare("UPDATE imports SET starred_user_id = ? WHERE id = ?").run(userId, importId);
  audit({
    actorId: actor.id,
    action: "import.starred_user_set",
    entityType: "import",
    entityId: importId,
    summary: `${actor.name} set who the starred events belong to on import #${importId}`,
  });
}

/* --------------------------- applying the coverage ------------------------- */

export type CoverageMigrationResult = {
  assigned: number;
  starred: number;
  unmapped: string[];
  backupsRecorded: number;
};

/** Assignment without notification — this is migration, not a new decision. */
function assignQuietly(
  eventId: number,
  userId: number,
  coverageType: CoverageType,
  guests: number,
  assignedBy: number,
): boolean {
  const db = getDb();
  const existing = db
    .prepare(
      "SELECT id FROM assignments WHERE event_id = ? AND user_id = ? AND status = 'active'",
    )
    .get(eventId, userId);
  if (existing) return false;

  db.prepare(
    `INSERT INTO assignments (event_id, user_id, coverage_type, assigned_by, status, guests, source)
     VALUES (?, ?, ?, ?, 'active', ?, 'import')`,
  ).run(eventId, userId, coverageType, assignedBy, guests);
  return true;
}

/**
 * Turns the coverage recorded on one imported row into real assignments.
 *
 * Returns which names could not be resolved so the importer can report them
 * rather than silently dropping coverage.
 */
export function applyDetectedCoverage(
  actor: SessionUser,
  input: {
    eventId: number;
    detected: DetectedAssignee[];
    needsReporter: boolean;
    nameMap: NameMap;
    starredUserId: number | null;
  },
): CoverageMigrationResult {
  const db = getDb();
  const out: CoverageMigrationResult = {
    assigned: 0,
    starred: 0,
    unmapped: [],
    backupsRecorded: 0,
  };

  for (const person of input.detected) {
    const userId = input.nameMap[person.name];
    if (!userId) {
      out.unmapped.push(person.name);
      continue;
    }

    // Backups are the fallback list, not coverage — recorded on the event as a
    // note rather than as an assignment that would consume a spot.
    if (person.isBackup) {
      out.backupsRecorded++;
      continue;
    }

    const type = (person.coverageTypes[0] ?? "other") as CoverageType;
    if (assignQuietly(input.eventId, userId, type, person.guests, actor.id)) out.assigned++;
  }

  // A starred event means that person is attending. It stays open for requests
  // because the doc's own legend says a reporter is still wanted.
  if (input.needsReporter && input.starredUserId) {
    if (assignQuietly(input.eventId, input.starredUserId, "other", 0, actor.id)) {
      out.starred++;
    }
  }

  refreshEventStatus(input.eventId);
  return out;
}

/**
 * Re-runs coverage migration for an import after the Super Admin has filled in
 * more of the name mapping. Safe to run repeatedly: assignments that already
 * exist are left alone.
 */
export function backfillCoverageForImport(
  actor: SessionUser,
  importId: number,
): CoverageMigrationResult {
  if (!isAdmin(actor))
    throw new HttpError(403, "Only an administrator can migrate coverage.");

  const db = getDb();
  const nameMap = getNameMap(importId);
  const starredUserId = getStarredUserId(importId);

  const rows = db
    .prepare(
      `SELECT detected_assignees,
              coalesce(result_event_id, duplicate_of) AS target_event_id,
              parsed
         FROM import_items
        WHERE import_id = ?
          AND coalesce(result_event_id, duplicate_of) IS NOT NULL`,
    )
    .all(importId) as {
    detected_assignees: string;
    target_event_id: number;
    parsed: string;
  }[];

  const total: CoverageMigrationResult = {
    assigned: 0,
    starred: 0,
    unmapped: [],
    backupsRecorded: 0,
  };

  // Fields the doc knows that an event imported before Phase 2 will be missing.
  const enrich = db.prepare(
    `UPDATE events SET
        needs_reporter = CASE WHEN ? = 1 THEN 1 ELSE needs_reporter END,
        event_url    = coalesce(event_url, ?),
        ticket_url   = coalesce(ticket_url, ?),
        festival_url = coalesce(festival_url, ?),
        press_url    = coalesce(press_url, ?),
        is_festival  = CASE WHEN ? = 1 THEN 1 ELSE is_festival END,
        doors_time   = coalesce(doors_time, ?),
        end_time     = coalesce(end_time, ?),
        updated_at   = datetime('now')
      WHERE id = ?`,
  );

  const tx = db.transaction(() => {
    for (const r of rows) {
      const parsed = parseJson<{
        needs_reporter?: boolean;
        event_url?: string | null;
        ticket_url?: string | null;
        festival_url?: string | null;
        press_url?: string | null;
        is_festival?: boolean;
        doors_time?: string | null;
        end_time?: string | null;
      }>(r.parsed, {});

      enrich.run(
        parsed.needs_reporter ? 1 : 0,
        parsed.event_url ?? null,
        parsed.ticket_url ?? null,
        parsed.festival_url ?? null,
        parsed.press_url ?? null,
        parsed.is_festival ? 1 : 0,
        parsed.doors_time ?? null,
        parsed.end_time ?? null,
        r.target_event_id,
      );
      const res = applyDetectedCoverage(actor, {
        eventId: r.target_event_id,
        detected: parseJson<DetectedAssignee[]>(r.detected_assignees, []),
        needsReporter: !!parsed.needs_reporter,
        nameMap,
        starredUserId,
      });
      total.assigned += res.assigned;
      total.starred += res.starred;
      total.backupsRecorded += res.backupsRecorded;
      for (const n of res.unmapped) if (!total.unmapped.includes(n)) total.unmapped.push(n);
    }
  });
  tx();

  audit({
    actorId: actor.id,
    action: "import.coverage_migrated",
    entityType: "import",
    entityId: importId,
    summary: `${actor.name} migrated existing coverage from import #${importId} — ${total.assigned} assignment${
      total.assigned === 1 ? "" : "s"
    }, ${total.starred} starred`,
    meta: total,
  });

  // Tell people they now have coverage on the board, once per person rather
  // than once per event.
  const affected = new Set(Object.values(nameMap));
  if (starredUserId) affected.add(starredUserId);
  for (const userId of affected) {
    const n = db
      .prepare(
        "SELECT COUNT(*) n FROM assignments WHERE user_id = ? AND source = 'import' AND status = 'active'",
      )
      .get(userId) as { n: number };
    if (!n.n) continue;
    notify({
      userId,
      type: "assignment.migrated",
      title: "Your existing coverage is on the board",
      body: `${n.n} event${n.n === 1 ? "" : "s"} you were already down for in the coverage doc ${
        n.n === 1 ? "is" : "are"
      } now on your schedule.`,
      href: "/schedule",
    });
  }

  return total;
}

export const coverageTypeLabel = COVERAGE_TYPE_LABEL;
