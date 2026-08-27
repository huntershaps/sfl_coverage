import "server-only";
import { getDb, audit } from "./db";
import type { VenueEntry } from "./parse/gdoc-html";
import type { SessionUser } from "./auth";
import { HttpError, isAdmin } from "./rbac";

/**
 * The venue directory.
 *
 * The Google Doc opens with a table of every room the desk works with, most
 * linked to that venue's own listings page, several with the abbreviation used
 * throughout the event list ("HR = Hard Rock"). That table is the reference the
 * team actually uses, so it becomes a first-class part of the app rather than
 * something buried in an imported blob.
 */

export type VenueRow = {
  id: number;
  name: string;
  slug: string | null;
  aka: string | null;
  address: string | null;
  city: string | null;
  website: string | null;
  events_url: string | null;
  press_url: string | null;
  maps_url: string | null;
  image_url: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string | null;
};

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/** A Google Maps search link — better than nothing when there is no address. */
export function mapsUrlFor(v: { name: string; address?: string | null; city?: string | null }) {
  const q = [v.name, v.address, v.city, "FL"].filter(Boolean).join(", ");
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}

/** Ensures every venue has a unique slug, appending a counter on collision. */
function uniqueSlug(name: string, ignoreId?: number): string {
  const db = getDb();
  const base = slugify(name) || "venue";
  let slug = base;
  let n = 2;
  for (;;) {
    const clash = db
      .prepare("SELECT id FROM venues WHERE slug = ? AND id IS NOT ?")
      .get(slug, ignoreId ?? null) as { id: number } | undefined;
    if (!clash) return slug;
    slug = `${base}-${n++}`;
  }
}

/**
 * Folds the directory parsed out of the doc into the venues table. Existing
 * rows are enriched, never replaced — a website typed in by hand outranks one
 * scraped from the doc only if the scraped one is missing.
 */
export function upsertVenues(entries: VenueEntry[]): { created: number; updated: number } {
  const db = getDb();
  let created = 0;
  let updated = 0;

  const tx = db.transaction(() => {
    for (const e of entries) {
      const name = e.name.trim();
      if (!name) continue;

      const existing = db
        .prepare("SELECT id, aka, website, notes FROM venues WHERE name = ? COLLATE NOCASE")
        .get(name) as
        | { id: number; aka: string | null; website: string | null; notes: string | null }
        | undefined;

      if (existing) {
        // Merge the abbreviation into the alias list without losing what is there.
        let aka: string[] = [];
        try {
          aka = JSON.parse(existing.aka ?? "[]");
        } catch {
          aka = [];
        }
        if (e.abbreviation && !aka.some((a) => a.toLowerCase() === e.abbreviation!.toLowerCase())) {
          aka.push(e.abbreviation);
        }

        db.prepare(
          `UPDATE venues
              SET aka = ?,
                  website = coalesce(website, ?),
                  notes = coalesce(notes, ?),
                  slug = coalesce(slug, ?),
                  updated_at = datetime('now')
            WHERE id = ?`,
        ).run(JSON.stringify(aka), e.website, e.note, uniqueSlug(name, existing.id), existing.id);
        updated++;
        continue;
      }

      db.prepare(
        `INSERT INTO venues (name, slug, aka, website, notes, updated_at)
         VALUES (?, ?, ?, ?, ?, datetime('now'))`,
      ).run(
        name,
        uniqueSlug(name),
        JSON.stringify(e.abbreviation ? [e.abbreviation] : []),
        e.website,
        e.note,
      );
      created++;
    }
  });
  tx();

  backfillSlugs();
  return { created, updated };
}

/** Venues that predate the slug column still need one to be linkable. */
export function backfillSlugs() {
  const db = getDb();
  const rows = db
    .prepare("SELECT id, name FROM venues WHERE slug IS NULL OR slug = ''")
    .all() as { id: number; name: string }[];
  for (const r of rows) {
    db.prepare("UPDATE venues SET slug = ? WHERE id = ?").run(uniqueSlug(r.name, r.id), r.id);
  }
  return rows.length;
}

/**
 * Links events to venue records by name, so a venue page can list what is on.
 * Matching is by exact name first, then by any alias the directory recorded.
 *
 * The doc's header table only lists the rooms the desk works with regularly,
 * but events happen at plenty of others. Anything unmatched gets a venue record
 * created for it, so every event has somewhere to link to — the directory ends
 * up covering the whole board, with the doc's entries carrying the extra detail.
 */
export function linkEventsToVenues(): number {
  const db = getDb();
  const venues = db.prepare("SELECT id, name, aka FROM venues").all() as {
    id: number;
    name: string;
    aka: string | null;
  }[];

  const byName = new Map<string, number>();
  for (const v of venues) {
    byName.set(v.name.toLowerCase(), v.id);
    try {
      for (const a of JSON.parse(v.aka ?? "[]") as string[]) {
        const k = a.toLowerCase();
        if (!byName.has(k)) byName.set(k, v.id);
      }
    } catch {
      /* aka is not valid JSON on legacy rows — the name match still applies */
    }
  }

  const events = db
    .prepare("SELECT id, venue FROM events WHERE venue IS NOT NULL AND venue != '' AND venue_id IS NULL")
    .all() as { id: number; venue: string }[];

  const update = db.prepare("UPDATE events SET venue_id = ? WHERE id = ?");
  const createVenue = db.prepare(
    `INSERT INTO venues (name, slug, aka, city, updated_at)
     VALUES (?, ?, '[]', ?, datetime('now'))`,
  );
  let linked = 0;

  const tx = db.transaction(() => {
    for (const e of events) {
      const name = e.venue.trim();
      const key = name.toLowerCase();

      let id = byName.get(key);
      if (!id) {
        // A room the doc's header table never listed — give it a record so the
        // event still has a venue page.
        const city = db
          .prepare(
            "SELECT city FROM events WHERE venue = ? AND city IS NOT NULL LIMIT 1",
          )
          .get(name) as { city: string } | undefined;
        id = Number(createVenue.run(name, uniqueSlug(name), city?.city ?? null).lastInsertRowid);
        byName.set(key, id);
      }

      update.run(id, e.id);
      linked++;
    }
  });
  tx();

  return linked;
}

/* --------------------------------- queries -------------------------------- */

export type VenueSummary = VenueRow & {
  upcoming_count: number;
  past_count: number;
};

export function listVenues(filters?: { q?: string; withEventsOnly?: boolean }): VenueSummary[] {
  const db = getDb();
  const where: string[] = [];
  const args: unknown[] = [];

  if (filters?.q?.trim()) {
    where.push("(v.name LIKE ? OR v.city LIKE ? OR v.aka LIKE ?)");
    const like = `%${filters.q.trim()}%`;
    args.push(like, like, like);
  }

  const rows = db
    .prepare(
      `SELECT v.*,
              (SELECT COUNT(*) FROM events e
                WHERE e.venue_id = v.id AND date(e.start_datetime) >= date('now')
                  AND e.status NOT IN ('archived','draft')) upcoming_count,
              (SELECT COUNT(*) FROM events e
                WHERE e.venue_id = v.id AND date(e.start_datetime) < date('now')) past_count
         FROM venues v
        ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
        ORDER BY upcoming_count DESC, v.name COLLATE NOCASE ASC`,
    )
    .all(...args) as VenueSummary[];

  return filters?.withEventsOnly
    ? rows.filter((r) => r.upcoming_count + r.past_count > 0)
    : rows;
}

export function getVenueBySlug(slug: string): VenueSummary | null {
  const db = getDb();
  return (
    (db
      .prepare(
        `SELECT v.*,
                (SELECT COUNT(*) FROM events e
                  WHERE e.venue_id = v.id AND date(e.start_datetime) >= date('now')
                    AND e.status NOT IN ('archived','draft')) upcoming_count,
                (SELECT COUNT(*) FROM events e
                  WHERE e.venue_id = v.id AND date(e.start_datetime) < date('now')) past_count
           FROM venues v WHERE v.slug = ?`,
      )
      .get(slug) as VenueSummary | undefined) ?? null
  );
}

export function updateVenue(
  actor: SessionUser,
  id: number,
  patch: Partial<Pick<VenueRow, "name" | "address" | "city" | "website" | "events_url" | "press_url" | "image_url" | "notes">>,
) {
  if (!isAdmin(actor))
    throw new HttpError(403, "Only an administrator can edit venues.");

  const db = getDb();
  const existing = db.prepare("SELECT * FROM venues WHERE id = ?").get(id) as VenueRow | undefined;
  if (!existing) throw new HttpError(404, "Venue not found.");

  const name = patch.name?.trim() || existing.name;

  db.prepare(
    `UPDATE venues
        SET name = ?, address = ?, city = ?, website = ?, events_url = ?,
            press_url = ?, image_url = ?, notes = ?, slug = ?,
            updated_at = datetime('now')
      WHERE id = ?`,
  ).run(
    name,
    patch.address ?? existing.address,
    patch.city ?? existing.city,
    patch.website ?? existing.website,
    patch.events_url ?? existing.events_url,
    patch.press_url ?? existing.press_url,
    patch.image_url ?? existing.image_url,
    patch.notes ?? existing.notes,
    name === existing.name ? existing.slug : uniqueSlug(name, id),
    id,
  );

  audit({
    actorId: actor.id,
    action: "venue.updated",
    entityType: "venue",
    entityId: id,
    summary: `${actor.name} updated the venue ${name}`,
  });
}
