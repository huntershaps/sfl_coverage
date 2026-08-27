import "server-only";
import { getDb, audit, parseJson } from "./db";
import type { SessionUser } from "./auth";
import { HttpError } from "./rbac";
import { parseEventContent } from "./parse";
import type { ParsedEvent, ParseIssue } from "./parse/coverage-doc";
import type { EnrichedEvent } from "./parse";
import { refreshEventStatus } from "./events";
import { upsertVenues, linkEventsToVenues } from "./venues";
import {
  applyDetectedCoverage,
  getNameMap,
  getStarredUserId,
} from "./import-coverage";
import type { DetectedAssignee } from "./parse/assignees";
import type { EventCategory } from "./constants";

/* ------------------------------ google docs ------------------------------- */

const GDOC_ID_RE = /\/document\/d\/([a-zA-Z0-9_-]{20,})/;

export function googleDocId(url: string): string | null {
  return url.match(GDOC_ID_RE)?.[1] ?? null;
}

/**
 * Pulls a Google Doc's plain-text export. Works whenever the document is
 * shared as "anyone with the link" — which is how the coverage doc is set up.
 * A permission failure returns a typed result so the UI can fall back to paste
 * rather than surfacing a raw fetch error.
 */
export async function fetchGoogleDoc(
  url: string,
): Promise<
  | { ok: true; text: string; docId: string }
  | { ok: false; reason: "bad_url" | "no_access" | "network"; detail?: string }
> {
  const docId = googleDocId(url);
  if (!docId) return { ok: false, reason: "bad_url" };

  const exportUrl = `https://docs.google.com/document/d/${docId}/export?format=txt`;
  try {
    const res = await fetch(exportUrl, {
      redirect: "follow",
      headers: { accept: "text/plain" },
      cache: "no-store",
    });

    if (res.status === 401 || res.status === 403)
      return { ok: false, reason: "no_access" };
    if (!res.ok)
      return { ok: false, reason: "network", detail: `HTTP ${res.status}` };

    const text = await res.text();
    // A private doc redirects to an HTML sign-in page rather than erroring.
    if (/^\s*<!DOCTYPE html|<html/i.test(text))
      return { ok: false, reason: "no_access" };

    return { ok: true, text, docId };
  } catch (e) {
    return {
      ok: false,
      reason: "network",
      detail: e instanceof Error ? e.message : undefined,
    };
  }
}

/* --------------------------- duplicate detection -------------------------- */

const stopWords = new Set(["the", "a", "an", "at", "of", "and", "&", "presents", "tour"]);

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t && !stopWords.has(t));
}

/** Jaccard overlap of significant title words. */
function titleSimilarity(a: string, b: string): number {
  const A = new Set(tokenize(a));
  const B = new Set(tokenize(b));
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter / (A.size + B.size - inter);
}

export type DuplicateMatch = {
  eventId: number;
  score: number;
  reasons: string[];
  existing: {
    id: number;
    title: string;
    start_datetime: string;
    venue: string | null;
    city: string | null;
    status: string;
  };
};

/**
 * Scores a parsed row against existing events on title, date, venue and city.
 * Same date + same venue is treated as near-certain even when the titles are
 * written differently, since that is how the source doc drifts between updates.
 */
export function findDuplicate(p: {
  title: string;
  start_datetime: string;
  venue: string | null;
  city: string | null;
}): DuplicateMatch | null {
  const db = getDb();
  const day = p.start_datetime.slice(0, 10);

  // Only events within a day either side are plausible duplicates.
  const candidates = db
    .prepare(
      `SELECT id, title, start_datetime, venue, city, status FROM events
        WHERE date(start_datetime) BETWEEN date(?, '-1 day') AND date(?, '+1 day')`,
    )
    .all(day, day) as DuplicateMatch["existing"][];

  let best: DuplicateMatch | null = null;

  for (const c of candidates) {
    const reasons: string[] = [];
    let score = 0;

    const tSim = titleSimilarity(p.title, c.title);
    if (tSim >= 0.99) {
      score += 0.55;
      reasons.push("Identical title");
    } else if (tSim >= 0.5) {
      score += 0.35 * tSim + 0.1;
      reasons.push("Similar title");
    }

    const sameDay = c.start_datetime.slice(0, 10) === day;
    if (sameDay) {
      score += 0.25;
      reasons.push("Same date");
    }

    const sameVenue =
      !!p.venue && !!c.venue && p.venue.toLowerCase() === c.venue.toLowerCase();
    if (sameVenue) {
      score += 0.2;
      reasons.push("Same venue");
    }

    if (p.city && c.city && p.city.toLowerCase() === c.city.toLowerCase()) {
      score += 0.05;
      reasons.push("Same city");
    }

    // Same room, same night — treat as a duplicate regardless of title wording.
    if (sameDay && sameVenue) score = Math.max(score, 0.85);

    if (score > (best?.score ?? 0.44)) {
      best = { eventId: c.id, score: Math.min(1, score), reasons, existing: c };
    }
  }

  return best;
}

/* ------------------------------ staging import ---------------------------- */

export type StagedItem = {
  id: number;
  line_no: number | null;
  raw_line: string | null;
  parsed: EnrichedEvent & { category: EventCategory };
  issues: ParseIssue[];
  duplicate_of: number | null;
  duplicate_score: number;
  duplicate_reasons: string[];
  duplicate_existing: DuplicateMatch["existing"] | null;
  decision: string;
  selected: number;
  result_event_id: number | null;
};

export function createImport(
  user: SessionUser,
  input: {
    sourceType: "gdoc" | "paste" | "csv" | "file";
    sourceReference?: string | null;
    rawContent: string;
    defaultYear?: number;
  },
) {
  const db = getDb();
  if (!input.rawContent?.trim())
    throw new HttpError(400, "There was no content to import.");

  const result = parseEventContent(input.rawContent, {
    defaultYear: input.defaultYear,
  });

  const info = db
    .prepare(
      `INSERT INTO imports (source_type, source_reference, raw_content, imported_by, import_status, stats)
       VALUES (?, ?, ?, ?, 'staged', ?)`,
    )
    .run(
      input.sourceType,
      input.sourceReference ?? null,
      input.rawContent,
      user.id,
      JSON.stringify({
        parsed: result.events.length,
        skipped: result.skipped,
        yearSpan: result.detectedYearSpan,
        format: result.format,
        formatNote: result.formatNote,
      }),
    );
  const importId = Number(info.lastInsertRowid);

  const insert = db.prepare(
    `INSERT INTO import_items (import_id, line_no, raw_line, parsed, issues, duplicate_of, duplicate_score, decision, selected, detected_assignees)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  // The venue directory only exists in the HTML export; fold it in before the
  // events so imported events can be linked to real venue records.
  if (result.venues.length) upsertVenues(result.venues);

  let duplicates = 0;
  let incomplete = 0;

  const tx = db.transaction((events: EnrichedEvent[]) => {
    for (const ev of events) {
      const dup = findDuplicate({
        title: ev.title,
        start_datetime: ev.start_datetime,
        venue: ev.venue || null,
        city: ev.city,
      });
      if (dup) duplicates++;
      const hasError = ev.issues.some((i) => i.level === "error");
      if (hasError) incomplete++;

      const issues = dup
        ? [
            ...ev.issues,
            {
              field: "duplicate",
              level: "warning" as const,
              message: `Possible match with an existing event (${dup.reasons.join(", ").toLowerCase()}).`,
            },
          ]
        : ev.issues;

      insert.run(
        importId,
        ev.line_no,
        ev.raw_line,
        JSON.stringify({
          ...ev,
          duplicate_reasons: dup?.reasons ?? [],
          duplicate_existing: dup?.existing ?? null,
        }),
        JSON.stringify(issues),
        dup?.eventId ?? null,
        dup?.score ?? 0,
        // Likely duplicates and incomplete rows default to a safe decision so
        // nothing lands in the database without someone looking at it.
        dup ? "keep_existing" : "import",
        hasError ? 0 : 1,
        JSON.stringify(ev.detected_assignees ?? []),
      );
    }
  });
  tx(result.events);

  db.prepare("UPDATE imports SET stats = ? WHERE id = ?").run(
    JSON.stringify({
      parsed: result.events.length,
      skipped: result.skipped,
      duplicates,
      incomplete,
      yearSpan: result.detectedYearSpan,
      format: result.format,
      formatNote: result.formatNote,
    }),
    importId,
  );

  audit({
    actorId: user.id,
    action: "import.staged",
    entityType: "import",
    entityId: importId,
    summary: `${user.name} staged an import from ${input.sourceType} — ${result.events.length} events found, ${duplicates} possible duplicates`,
    meta: { sourceReference: input.sourceReference },
  });

  return { importId, ...result, duplicates, incomplete };
}

export function getImport(importId: number) {
  const db = getDb();
  const imp = db.prepare("SELECT * FROM imports WHERE id = ?").get(importId) as
    | {
        id: number;
        source_type: string;
        source_reference: string | null;
        imported_by: number;
        imported_at: string;
        import_status: string;
        stats: string;
      }
    | undefined;
  if (!imp) return null;

  const rows = db
    .prepare("SELECT * FROM import_items WHERE import_id = ? ORDER BY line_no ASC, id ASC")
    .all(importId) as Record<string, unknown>[];

  const items: StagedItem[] = rows.map((r) => {
    const parsed = parseJson<ParsedEvent & { duplicate_reasons?: string[]; duplicate_existing?: DuplicateMatch["existing"] }>(
      r.parsed as string,
      {} as never,
    );
    return {
      id: r.id as number,
      line_no: r.line_no as number | null,
      raw_line: r.raw_line as string | null,
      parsed: parsed as StagedItem["parsed"],
      issues: parseJson<ParseIssue[]>(r.issues as string, []),
      duplicate_of: r.duplicate_of as number | null,
      duplicate_score: (r.duplicate_score as number) ?? 0,
      duplicate_reasons: parsed.duplicate_reasons ?? [],
      duplicate_existing: parsed.duplicate_existing ?? null,
      decision: r.decision as string,
      selected: r.selected as number,
      result_event_id: r.result_event_id as number | null,
    };
  });

  return { ...imp, stats: parseJson<Record<string, number | string>>(imp.stats, {}), items };
}

export function updateImportItem(
  user: SessionUser,
  itemId: number,
  patch: {
    parsed?: Partial<ParsedEvent>;
    decision?: string;
    selected?: boolean;
  },
) {
  const db = getDb();
  const row = db.prepare("SELECT * FROM import_items WHERE id = ?").get(itemId) as
    | { id: number; parsed: string; import_id: number }
    | undefined;
  if (!row) throw new HttpError(404, "That import row no longer exists.");

  const current = parseJson<Record<string, unknown>>(row.parsed, {});
  const next = { ...current, ...(patch.parsed ?? {}) };

  // Re-run validation so edits clear the flags they resolve.
  const issues: ParseIssue[] = [];
  if (!String(next.title ?? "").trim())
    issues.push({ field: "title", level: "error", message: "Title is required." });
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(String(next.start_datetime ?? "")))
    issues.push({
      field: "start_datetime",
      level: "error",
      message: "A valid date is required.",
    });
  if (!String(next.venue ?? "").trim())
    issues.push({ field: "venue", level: "warning", message: "No venue set." });
  if (Number(next.time_tbd ?? 1) === 1)
    issues.push({
      field: "start_datetime",
      level: "info",
      message: "No start time — confirm the showtime with the venue.",
    });
  if (!String(next.city ?? "").trim())
    issues.push({ field: "city", level: "warning", message: "No city set." });
  if (next.category === "Other")
    issues.push({
      field: "category",
      level: "warning",
      message: "Category is still Other.",
    });

  db.prepare(
    `UPDATE import_items SET parsed = ?, issues = ?, decision = coalesce(?, decision), selected = coalesce(?, selected)
      WHERE id = ?`,
  ).run(
    JSON.stringify(next),
    JSON.stringify(issues),
    patch.decision ?? null,
    patch.selected === undefined ? null : patch.selected ? 1 : 0,
    itemId,
  );

  return { issues };
}

export function setImportSelection(importId: number, selected: boolean) {
  getDb()
    .prepare("UPDATE import_items SET selected = ? WHERE import_id = ? AND committed_at IS NULL")
    .run(selected ? 1 : 0, importId);
}

/* ------------------------------ committing -------------------------------- */

export function commitImport(
  user: SessionUser,
  importId: number,
  opts: { publish: boolean },
) {
  const db = getDb();
  const imp = db.prepare("SELECT * FROM imports WHERE id = ?").get(importId) as
    | { id: number; import_status: string; source_type: string; source_reference: string | null }
    | undefined;
  if (!imp) throw new HttpError(404, "Import not found.");

  const rows = db
    .prepare(
      "SELECT * FROM import_items WHERE import_id = ? AND selected = 1 AND committed_at IS NULL",
    )
    .all(importId) as Record<string, unknown>[];

  const status = opts.publish ? "open" : "draft";
  let created = 0;
  let updated = 0;
  let skipped = 0;

  const nameMap = getNameMap(importId);
  const starredUserId = getStarredUserId(importId);
  const migrated = {
    assigned: 0,
    starred: 0,
    backupsRecorded: 0,
    unmapped: [] as string[],
  };

  const insertEvent = db.prepare(
    `INSERT INTO events
       (title, subtitle, category, start_datetime, time_tbd, multi_day_end, venue, city,
        address, status, legacy_assignees, source_note, import_id, created_by, description,
        doors_time, end_time, event_url, ticket_url, festival_url, press_url,
        is_festival, needs_reporter)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  const tx = db.transaction(() => {
    for (const r of rows) {
      const p = parseJson<EnrichedEvent>(r.parsed as string, {} as never);
      const decision = r.decision as string;

      if (decision === "skip" || decision === "keep_existing") {
        skipped++;
        db.prepare("UPDATE import_items SET committed_at = datetime('now') WHERE id = ?").run(
          r.id as number,
        );
        continue;
      }

      if (!p.title?.trim() || !p.start_datetime) {
        skipped++;
        continue;
      }

      const sourceNote = `Imported from ${
        imp.source_type === "gdoc" ? "Google Doc" : imp.source_type
      }${p.line_no ? ` (line ${p.line_no})` : ""}${
        p.needs_reporter ? " — flagged in source as needing a reporter" : ""
      }`;

      if (
        (decision === "update_existing" || decision === "merge") &&
        r.duplicate_of
      ) {
        const existingId = r.duplicate_of as number;
        const existing = db
          .prepare("SELECT * FROM events WHERE id = ?")
          .get(existingId) as Record<string, unknown> | undefined;
        if (!existing) {
          skipped++;
          continue;
        }

        if (decision === "update_existing") {
          db.prepare(
            `UPDATE events SET title = ?, subtitle = ?, category = ?, start_datetime = ?,
                    time_tbd = ?, multi_day_end = ?, venue = ?, city = ?, address = ?,
                    legacy_assignees = ?, updated_at = datetime('now')
              WHERE id = ?`,
          ).run(
            p.title,
            p.subtitle ?? null,
            p.category,
            p.start_datetime,
            p.time_tbd ?? 1,
            p.multi_day_end ?? null,
            p.venue || null,
            p.city ?? null,
            p.address ?? null,
            p.legacy_assignees ?? null,
            existingId,
          );
        } else {
          // Merge only fills gaps — never overwrites information a human
          // already curated on the existing record.
          db.prepare(
            `UPDATE events SET
                subtitle = coalesce(nullif(subtitle,''), ?),
                venue = coalesce(nullif(venue,''), ?),
                city = coalesce(nullif(city,''), ?),
                address = coalesce(nullif(address,''), ?),
                multi_day_end = coalesce(multi_day_end, ?),
                legacy_assignees = coalesce(nullif(legacy_assignees,''), ?),
                category = CASE WHEN category = 'Other' THEN ? ELSE category END,
                time_tbd = CASE WHEN ? = 0 THEN 0 ELSE time_tbd END,
                start_datetime = CASE WHEN ? = 0 THEN ? ELSE start_datetime END,
                updated_at = datetime('now')
              WHERE id = ?`,
          ).run(
            p.subtitle ?? null,
            p.venue || null,
            p.city ?? null,
            p.address ?? null,
            p.multi_day_end ?? null,
            p.legacy_assignees ?? null,
            p.category,
            p.time_tbd ?? 1,
            p.time_tbd ?? 1,
            p.start_datetime,
            existingId,
          );
        }

        updated++;
        db.prepare(
          "UPDATE import_items SET committed_at = datetime('now'), result_event_id = ? WHERE id = ?",
        ).run(existingId, r.id as number);
        refreshEventStatus(existingId);
        continue;
      }

      // decision === 'import' (or 'import anyway' on a flagged duplicate)
      const info = insertEvent.run(
        p.title,
        p.subtitle ?? null,
        p.category,
        p.start_datetime,
        p.time_tbd ?? 1,
        p.multi_day_end ?? null,
        p.venue || null,
        p.city ?? null,
        p.address ?? null,
        status,
        p.legacy_assignees ?? null,
        sourceNote,
        importId,
        user.id,
        null,
        p.doors_time ?? null,
        p.end_time ?? null,
        p.event_url ?? null,
        p.ticket_url ?? null,
        p.festival_url ?? null,
        p.press_url ?? null,
        p.is_festival ? 1 : 0,
        // The doc's trailing "*": Scott is going, a reporter is still wanted.
        p.needs_reporter ? 1 : 0,
      );
      const newEventId = Number(info.lastInsertRowid);
      created++;
      db.prepare(
        "UPDATE import_items SET committed_at = datetime('now'), result_event_id = ? WHERE id = ?",
      ).run(newEventId, r.id as number);

      // Coverage already recorded in the doc becomes real assignments, but only
      // for names the Super Admin has mapped to accounts.
      const detected = parseJson<DetectedAssignee[]>(
        (r.detected_assignees as string) ?? "[]",
        [],
      );
      if (detected.length || p.needs_reporter) {
        const res = applyDetectedCoverage(user, {
          eventId: newEventId,
          detected,
          needsReporter: !!p.needs_reporter,
          nameMap,
          starredUserId,
        });
        migrated.assigned += res.assigned;
        migrated.starred += res.starred;
        migrated.backupsRecorded += res.backupsRecorded;
        for (const n of res.unmapped)
          if (!migrated.unmapped.includes(n)) migrated.unmapped.push(n);
      }
    }

    db.prepare("UPDATE imports SET import_status = 'completed' WHERE id = ?").run(
      importId,
    );
  });
  tx();

  audit({
    actorId: user.id,
    action: "import.committed",
    entityType: "import",
    entityId: importId,
    summary: `${user.name} imported ${created} event${created === 1 ? "" : "s"}${
      updated ? `, updated ${updated}` : ""
    }${skipped ? `, skipped ${skipped}` : ""} (${opts.publish ? "published" : "as drafts"})`,
    meta: { created, updated, skipped, publish: opts.publish, migrated },
  });

  // Newly imported events can now be attached to venue records, which is what
  // makes a venue page able to list what is on there.
  const linkedVenues = linkEventsToVenues();

  return { created, updated, skipped, migrated, linkedVenues };
}

export function discardImport(user: SessionUser, importId: number) {
  getDb()
    .prepare("UPDATE imports SET import_status = 'discarded' WHERE id = ?")
    .run(importId);
  audit({
    actorId: user.id,
    action: "import.discarded",
    entityType: "import",
    entityId: importId,
    summary: `${user.name} discarded a staged import`,
  });
}

export function listImports(limit = 20) {
  return getDb()
    .prepare(
      `SELECT i.*, u.name imported_by_name
         FROM imports i LEFT JOIN users u ON u.id = i.imported_by
        ORDER BY i.imported_at DESC LIMIT ?`,
    )
    .all(limit) as (Record<string, unknown> & {
    id: number;
    source_type: string;
    source_reference: string | null;
    imported_at: string;
    import_status: string;
    stats: string;
    imported_by_name: string | null;
  })[];
}
