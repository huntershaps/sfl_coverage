/**
 * Seeds the coverage database.
 *
 *   npx tsx scripts/seed.ts              — events + Super Admin + provisional roster
 *   npx tsx scripts/seed.ts --demo       — also adds sample coverage requests
 *   npx tsx scripts/seed.ts --reset      — drops existing data first
 *   npx tsx scripts/seed.ts --clear-demo — removes only the sample requests
 *
 * Event data comes from the real South Florida Insider coverage doc, fetched
 * live from Google Docs (falling back to the copy in data/source-doc.txt).
 * Nothing here invents an event.
 */

import fs from "node:fs";
import { getDb, audit } from "../src/lib/db";
import { parseCoverageDoc, type ParsedEvent } from "../src/lib/parse/coverage-doc";
import { VENUES } from "../src/lib/parse/venues";

const DOC_URL =
  "https://docs.google.com/document/d/1LU3kAQ663vOztHUdA5yQV6PVxsvkCIi7Kg6hAlG4gHg/edit";
const DOC_ID = "1LU3kAQ663vOztHUdA5yQV6PVxsvkCIi7Kg6hAlG4gHg";
const SUPER_ADMIN_EMAIL = (process.env.SUPER_ADMIN_EMAIL || "shaps@sflinsider.com").toLowerCase();

const args = new Set(process.argv.slice(2));
const DEMO = args.has("--demo");
const RESET = args.has("--reset");
const CLEAR_DEMO = args.has("--clear-demo");

const db = getDb();

/* ------------------------------ demo cleanup ------------------------------ */

if (CLEAR_DEMO) {
  const ids = (
    db
      .prepare("SELECT id FROM users WHERE source = 'seed:demo'")
      .all() as { id: number }[]
  ).map((r) => r.id);
  if (ids.length) {
    const list = ids.join(",");
    db.exec(`DELETE FROM assignments WHERE user_id IN (${list})`);
    db.exec(`DELETE FROM coverage_requests WHERE user_id IN (${list})`);
    db.exec(`DELETE FROM notifications WHERE user_id IN (${list})`);
    db.exec(`DELETE FROM users WHERE id IN (${list})`);
  }
  db.exec(
    `UPDATE events SET status = CASE WHEN status IN ('requests_pending','assigned','full') THEN 'open' ELSE status END`,
  );
  console.log(`Removed ${ids.length} demo accounts and their requests.`);
  process.exit(0);
}

if (RESET) {
  db.exec(`
    DELETE FROM assignments; DELETE FROM coverage_requests; DELETE FROM internal_notes;
    DELETE FROM notifications; DELETE FROM audit_log; DELETE FROM event_slots;
    DELETE FROM import_items; DELETE FROM events; DELETE FROM imports;
    DELETE FROM sessions; DELETE FROM password_resets; DELETE FROM users;
    DELETE FROM venues;
  `);
  console.log("Cleared existing data.");
}

/* ------------------------------ source content ---------------------------- */

async function loadDoc(): Promise<{ text: string; source: string }> {
  try {
    const res = await fetch(
      `https://docs.google.com/document/d/${DOC_ID}/export?format=txt`,
      { redirect: "follow", cache: "no-store" },
    );
    if (res.ok) {
      const text = await res.text();
      if (!/^\s*<!DOCTYPE html|<html/i.test(text) && text.length > 500) {
        fs.mkdirSync("data", { recursive: true });
        fs.writeFileSync("data/source-doc.txt", text, "utf8");
        return { text, source: "Google Docs (live)" };
      }
    }
  } catch {
    /* fall through to the cached copy */
  }
  const text = fs.readFileSync("data/source-doc.txt", "utf8");
  return { text, source: "data/source-doc.txt (cached)" };
}

/* -------------------------------- roster ---------------------------------- */

/**
 * Contributor names as they appear in the coverage doc's assignment notes.
 * These become provisional accounts: real people the desk already works with,
 * with no password and a placeholder email the Super Admin must correct before
 * inviting them. No login is possible until the account is claimed.
 */
function extractRoster(events: ParsedEvent[]) {
  const counts = new Map<string, { photo: number; write: number; total: number }>();

  for (const ev of events) {
    if (!ev.legacy_assignees) continue;
    for (const seg of ev.legacy_assignees.split(";")) {
      const [rawRole, rawNames] = seg.includes(":")
        ? seg.split(":")
        : seg.includes(" - ")
          ? seg.split(" - ")
          : ["", seg];
      const role = rawRole.toLowerCase();
      for (const raw of (rawNames ?? "").split(",")) {
        const name = raw
          .replace(/\+\s*\d+/g, "")
          .replace(/\?+/g, "")
          .replace(/[()]/g, "")
          .trim();
        if (!name || name.length < 2 || name.length > 28) continue;
        if (!/^[A-Z]/.test(name)) continue;
        // Relationship placeholders in the doc, not contributor accounts.
        if (/^(mom|dad|uncle|aunt|backup|tbd|various)\b/i.test(name)) continue;

        const e = counts.get(name) ?? { photo: 0, write: 0, total: 0 };
        if (/photo/.test(role)) e.photo++;
        if (/report|review|writer/.test(role)) e.write++;
        e.total++;
        counts.set(name, e);
      }
    }
  }

  return [...counts.entries()]
    .filter(([, c]) => c.total >= 2) // one-off mentions are usually typos
    .sort((a, b) => b[1].total - a[1].total)
    .map(([name, c]) => {
      const specialties: string[] = [];
      if (c.photo) specialties.push("photography");
      if (c.write) specialties.push("writing");
      if (!specialties.length) specialties.push("writing");
      return { name, specialties, mentions: c.total };
    });
}

function slugEmail(name: string) {
  const slug = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.|\.$/g, "");
  // Deliberately not a real address — flagged in the UI as needing correction.
  return `${slug}@pending.sflinsider.local`;
}

/* --------------------------------- main ----------------------------------- */

async function main() {
  const { text, source } = await loadDoc();
  console.log(`Source: ${source}`);

  const parsed = parseCoverageDoc(text, { defaultYear: 2026 });
  console.log(
    `Parsed ${parsed.events.length} events (${parsed.detectedYearSpan}), ${parsed.skipped} lines skipped.`,
  );

  // --- venue directory ---
  const insVenue = db.prepare(
    `INSERT INTO venues (name, aka, city) VALUES (?, ?, ?)
     ON CONFLICT(name) DO UPDATE SET city = excluded.city, aka = excluded.aka`,
  );
  db.transaction(() => {
    for (const v of VENUES) insVenue.run(v.name, JSON.stringify(v.aka ?? []), v.city);
  })();
  console.log(`Venue directory: ${VENUES.length} venues.`);

  // --- super admin ---
  let superAdmin = db
    .prepare("SELECT id, role FROM users WHERE email = ?")
    .get(SUPER_ADMIN_EMAIL) as { id: number; role: string } | undefined;

  if (!superAdmin) {
    const info = db
      .prepare(
        `INSERT INTO users (email, name, password_hash, role, status, source, specialties, coverage_area, bio)
         VALUES (?, ?, NULL, 'super_admin', 'provisional', 'seed', ?, ?, ?)`,
      )
      .run(
        SUPER_ADMIN_EMAIL,
        "Scott Shapiro",
        JSON.stringify(["photography", "writing", "interviews"]),
        "South Florida",
        "Final approval authority for South Florida Insider coverage assignments.",
      );
    superAdmin = { id: Number(info.lastInsertRowid), role: "super_admin" };
    console.log(
      `Super Admin reserved for ${SUPER_ADMIN_EMAIL} — sign up with that email to claim it.`,
    );
  } else if (superAdmin.role !== "super_admin") {
    db.prepare("UPDATE users SET role = 'super_admin' WHERE id = ?").run(superAdmin.id);
  }
  const adminId = superAdmin.id;

  // --- provisional roster from the doc ---
  const roster = extractRoster(parsed.events);
  const insUser = db.prepare(
    `INSERT INTO users (email, name, password_hash, role, status, source, specialties, coverage_area)
     VALUES (?, ?, NULL, 'contributor', 'provisional', 'import:coverage-doc', ?, 'South Florida')
     ON CONFLICT(email) DO NOTHING`,
  );
  db.transaction(() => {
    for (const r of roster)
      insUser.run(slugEmail(r.name), r.name, JSON.stringify(r.specialties));
  })();
  console.log(
    `Roster: ${roster.length} provisional contributors (${roster
      .slice(0, 6)
      .map((r) => r.name)
      .join(", ")}…).`,
  );

  // --- import run ---
  const impInfo = db
    .prepare(
      `INSERT INTO imports (source_type, source_reference, raw_content, imported_by, import_status, stats)
       VALUES ('gdoc', ?, ?, ?, 'completed', ?)`,
    )
    .run(
      DOC_URL,
      text,
      adminId,
      JSON.stringify({
        parsed: parsed.events.length,
        skipped: parsed.skipped,
        yearSpan: parsed.detectedYearSpan,
        seeded: true,
      }),
    );
  const importId = Number(impInfo.lastInsertRowid);

  const existing = new Set(
    (
      db
        .prepare("SELECT lower(title) t, date(start_datetime) d FROM events")
        .all() as { t: string; d: string }[]
    ).map((r) => `${r.t}|${r.d}`),
  );

  const insEvent = db.prepare(
    `INSERT INTO events
       (title, subtitle, category, start_datetime, time_tbd, multi_day_end, venue, city,
        status, legacy_assignees, source_note, import_id, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, ?, ?)`,
  );

  let created = 0;
  let dupes = 0;
  db.transaction(() => {
    for (const ev of parsed.events) {
      const key = `${ev.title.toLowerCase()}|${ev.start_datetime.slice(0, 10)}`;
      if (existing.has(key)) {
        dupes++;
        continue;
      }
      existing.add(key);
      insEvent.run(
        ev.title,
        ev.subtitle,
        ev.category,
        ev.start_datetime,
        ev.time_tbd,
        ev.multi_day_end,
        ev.venue || null,
        ev.city,
        ev.legacy_assignees,
        `Imported from the coverage doc (line ${ev.line_no})${
          ev.needs_reporter ? " — flagged in source as needing a reporter" : ""
        }`,
        importId,
        adminId,
      );
      created++;
    }
  })();
  console.log(`Events: ${created} created, ${dupes} already present.`);

  audit({
    actorId: adminId,
    action: "import.committed",
    entityType: "import",
    entityId: importId,
    summary: `Seeded ${created} events from the South Florida Insider coverage doc`,
    meta: { source: DOC_URL, created },
  });

  // --- optional demo layer ---
  if (DEMO) seedDemo(adminId);

  const total = (db.prepare("SELECT COUNT(*) n FROM events").get() as { n: number }).n;
  console.log(`\nDone. ${total} events in the database.`);
  console.log(
    `Sign up at /signup with ${SUPER_ADMIN_EMAIL} to claim the Super Admin account.`,
  );
}

/* ------------------------------- demo layer -------------------------------- */

function seedDemo(adminId: number) {
  const people = [
    { name: "Ava Delgado", specialties: ["photography", "social"], area: "Miami" },
    { name: "Marcus Ellery", specialties: ["writing", "interviews"], area: "Broward" },
    { name: "Priya Raman", specialties: ["photography", "videography"], area: "Palm Beach" },
    { name: "Theo Vance", specialties: ["writing"], area: "Fort Lauderdale" },
    { name: "Nina Cortez", specialties: ["videography", "social"], area: "Miami Beach" },
  ];

  const ins = db.prepare(
    `INSERT INTO users (email, name, password_hash, role, status, source, specialties, coverage_area, bio)
     VALUES (?, ?, NULL, 'contributor', 'provisional', 'seed:demo', ?, ?, ?)
     ON CONFLICT(email) DO NOTHING`,
  );
  db.transaction(() => {
    for (const p of people)
      ins.run(
        `${p.name.toLowerCase().replace(/\s+/g, ".")}@example.com`,
        p.name,
        JSON.stringify(p.specialties),
        p.area,
        "Sample account created by the demo seed.",
      );
  })();

  const ids = (
    db.prepare("SELECT id, name FROM users WHERE source = 'seed:demo'").all() as {
      id: number;
      name: string;
    }[]
  );

  // Cluster requests onto a handful of soon events so the Approval Center shows
  // the "several people want the same show" comparison it is built for.
  const events = db
    .prepare(
      `SELECT id, title FROM events
        WHERE date(start_datetime) >= date('now')
        ORDER BY start_datetime ASC LIMIT 8`,
    )
    .all() as { id: number; title: string }[];

  const types = ["photography", "article", "video", "interview", "social"];
  const insReq = db.prepare(
    `INSERT INTO coverage_requests (event_id, user_id, coverage_types, message, status, submitted_at)
     VALUES (?, ?, ?, ?, 'pending', datetime('now', ?))
     ON CONFLICT DO NOTHING`,
  );

  let n = 0;
  db.transaction(() => {
    events.forEach((ev, ei) => {
      const howMany = ei < 2 ? 4 : ei < 5 ? 2 : 1;
      for (let i = 0; i < howMany && i < ids.length; i++) {
        const person = ids[(ei + i) % ids.length];
        insReq.run(
          ev.id,
          person.id,
          JSON.stringify([types[(ei + i) % types.length]]),
          i === 0
            ? "I've shot this room before and can turn photos around same night."
            : null,
          `-${(ei + i) % 6} hours`,
        );
        n++;
      }
    });
  })();

  db.prepare(
    `UPDATE events SET status = 'requests_pending'
      WHERE id IN (SELECT DISTINCT event_id FROM coverage_requests WHERE status = 'pending')`,
  ).run();

  for (const ev of events.slice(0, 2)) {
    db.prepare(
      `INSERT INTO notifications (user_id, type, title, body, href, event_id)
       VALUES (?, 'request.new', ?, ?, ?, ?)`,
    ).run(
      adminId,
      `New coverage requests — ${ev.title}`,
      "Multiple contributors are asking for this one.",
      `/admin/approvals/${ev.id}`,
      ev.id,
    );
  }

  console.log(`Demo layer: ${people.length} sample contributors, ${n} pending requests.`);
  console.log("Remove them later with: npx tsx scripts/seed.ts --clear-demo");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
