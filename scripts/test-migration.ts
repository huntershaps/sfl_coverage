/**
 * Migrating the real coverage doc into a scratch database.
 *
 *   npx tsx --conditions=react-server scripts/test-migration.ts
 *
 * Runs the whole path — HTML export, links, venue directory, the doc's star
 * convention and its "(Reporter: …)" coverage — against a throwaway copy of the
 * schema, so it never touches the working database.
 */

process.env.DATABASE_PATH = "./data/test-migration.db";

import fs from "node:fs";
import path from "node:path";

// Start from a clean file so counts are meaningful.
for (const suffix of ["", "-wal", "-shm"]) {
  const f = path.resolve(`./data/test-migration.db${suffix}`);
  if (fs.existsSync(f)) fs.unlinkSync(f);
}

// Imported after DATABASE_PATH is set so the scratch file is what gets opened.
/* eslint-disable @typescript-eslint/no-require-imports */
const { getDb } = require("../src/lib/db") as typeof import("../src/lib/db");
const { hashPassword } = require("../src/lib/password") as typeof import("../src/lib/password");
const { createImport, commitImport } = require("../src/lib/import") as typeof import("../src/lib/import");
const { setNameMap, setStarredUser, nameCandidates } =
  require("../src/lib/import-coverage") as typeof import("../src/lib/import-coverage");
const { listVenues } = require("../src/lib/venues") as typeof import("../src/lib/venues");

let pass = 0;
let fail = 0;
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;

function check(label: string, ok: boolean, detail?: unknown) {
  const d = detail === undefined ? "" : typeof detail === "string" ? detail : JSON.stringify(detail);
  if (ok) { pass++; console.log(`  ${green("✓")} ${label}${d ? dim(`  ${d}`) : ""}`); }
  else { fail++; console.log(`  ${red("✗")} ${label}${d ? red(`  ${d}`) : ""}`); }
}

const db = getDb();

function mkUser(email: string, name: string, role = "contributor") {
  return Number(
    db
      .prepare(
        `INSERT INTO users (email, name, password_hash, role, status, source)
         VALUES (?, ?, ?, ?, 'active', 'migration-test')`,
      )
      .run(email, name, hashPassword("scratch"), role).lastInsertRowid,
  );
}

const superAdminId = mkUser("scott@test.local", "Scott Shapiro", "super_admin");
const charityId = mkUser("charity@test.local", "Charity");
const glebId = mkUser("gleb@test.local", "Gleb");

const actor = db
  .prepare("SELECT id, name, email, role, status FROM users WHERE id = ?")
  .get(superAdminId) as never;

console.log("\nMigrating the coverage doc\n");

/* ------------------------------ stage the doc ----------------------------- */

const html = fs.readFileSync("data/source-doc.html", "utf8");
const staged = createImport(actor, {
  sourceType: "gdoc",
  sourceReference: "https://docs.google.com/document/d/1LU3kAQ663vOztHUdA5yQV6PVxsvkCIi7Kg6hAlG4gHg/edit",
  rawContent: html,
  defaultYear: 2026,
});
const importId = staged.importId;

const imp = db.prepare("SELECT stats FROM imports WHERE id = ?").get(importId) as { stats: string };
const stats = JSON.parse(imp.stats);
check("read as the Google Doc HTML export", stats.format === "gdoc-html", stats.format);
check("events detected", stats.parsed > 200, `${stats.parsed} events`);

const venues = listVenues();
check("venue directory imported", venues.length >= 37, `${venues.length} venues`);
check(
  "venues carry their website",
  venues.filter((v) => v.website).length >= 30,
  `${venues.filter((v) => v.website).length} with a site`,
);
check(
  "abbreviations kept as aliases",
  venues.some((v) => (v.aka ?? "").includes("HR")),
  venues.find((v) => (v.aka ?? "").includes("HR"))?.name,
);
check("every venue has a slug", venues.every((v) => !!v.slug));

/* --------------------------- map names to accounts ------------------------ */

const candidates = nameCandidates(importId);
check("contributor names detected", candidates.length > 10, `${candidates.length} names`);
const charity = candidates.find((c) => c.name === "Charity");
check("Charity found in the doc", !!charity, `${charity?.occurrences} events`);
check(
  "an existing account is suggested but not applied",
  charity?.suggestedUserId === charityId && charity?.mappedUserId === null,
);

console.log(dim(`\n  names: ${candidates.slice(0, 8).map((c) => `${c.name}(${c.occurrences})`).join(", ")}…\n`));

setNameMap(actor, importId, { Charity: charityId, Gleb: glebId });
setStarredUser(actor, importId, superAdminId);

/* --------------------------------- commit --------------------------------- */

const result = commitImport(actor, importId, { publish: true });
check("events created", result.created > 200, `${result.created} created`);
check("existing coverage became assignments", result.migrated.assigned > 50, `${result.migrated.assigned} assigned`);
check("starred events assigned to Scott", result.migrated.starred > 30, `${result.migrated.starred} starred`);
check("events linked to venue records", result.linkedVenues > 200, `${result.linkedVenues} linked`);
const unlinked = db
  .prepare("SELECT COUNT(*) n FROM events WHERE venue IS NOT NULL AND venue != '' AND venue_id IS NULL")
  .get() as { n: number };
check("no event with a venue is left unlinked", unlinked.n === 0, `${unlinked.n} unlinked`);
check(
  "unmapped names reported rather than dropped",
  result.migrated.unmapped.length > 0,
  `${result.migrated.unmapped.length} unmapped: ${result.migrated.unmapped.slice(0, 4).join(", ")}…`,
);

/* ------------------------------ the acceptance ---------------------------- */

console.log("\nScenario A — a starred event\n");

const fleetwood = db
  .prepare("SELECT * FROM events WHERE title LIKE '%Fleetwood Mac%' ORDER BY id LIMIT 1")
  .get() as Record<string, unknown>;
check("event imported", !!fleetwood, String(fleetwood?.title));
check("flagged as still needing a reporter", fleetwood.needs_reporter === 1);
check("date read correctly", String(fleetwood.start_datetime).startsWith("2026-08-22"), String(fleetwood.start_datetime));
check("venue resolved from its abbreviation", fleetwood.venue === "Boca Black Box", String(fleetwood.venue));
check("linked to a venue record", !!fleetwood.venue_id);
check("ticket link preserved", !!fleetwood.event_url || !!fleetwood.ticket_url, String(fleetwood.event_url ?? fleetwood.ticket_url).slice(0, 46));

const crew = db
  .prepare(
    `SELECT u.name, a.coverage_type, a.source FROM assignments a
       JOIN users u ON u.id = a.user_id
      WHERE a.event_id = ? AND a.status = 'active' ORDER BY u.name`,
  )
  .all(fleetwood.id) as { name: string; coverage_type: string; source: string }[];

check("Scott is covering it", crew.some((c) => c.name === "Scott Shapiro"), crew.map((c) => c.name).join(", "));
check("Charity's existing coverage carried over", crew.some((c) => c.name === "Charity"));
check("assignments recorded as migrated, not requested", crew.every((c) => c.source === "import"));

const reqs = db
  .prepare("SELECT COUNT(*) n FROM coverage_requests WHERE event_id = ?")
  .get(fleetwood.id) as { n: number };
check("no coverage request was invented", reqs.n === 0, `${reqs.n} requests`);

check(
  "still open for a reporter, as the doc's legend says",
  fleetwood.requests_closed === 0,
);

console.log("\nScenario F — importing the same doc again\n");

const secondStaged = createImport(actor, {
  sourceType: "gdoc",
  sourceReference: "same doc, second run",
  rawContent: html,
  defaultYear: 2026,
});
const secondId = secondStaged.importId;
const dupes = db
  .prepare("SELECT COUNT(*) n FROM import_items WHERE import_id = ? AND duplicate_of IS NOT NULL")
  .get(secondId) as { n: number };
const autoSelected = db
  .prepare("SELECT COUNT(*) n FROM import_items WHERE import_id = ? AND decision = 'import'")
  .get(secondId) as { n: number };

check("duplicates detected on re-import", dupes.n > 200, `${dupes.n} flagged`);
check("nothing defaults to being imported again", autoSelected.n === 0, `${autoSelected.n} set to import`);

const before = (db.prepare("SELECT COUNT(*) n FROM events").get() as { n: number }).n;
const second = commitImport(actor, secondId, { publish: true });
const after = (db.prepare("SELECT COUNT(*) n FROM events").get() as { n: number }).n;
check("committing the re-import creates no duplicates", after === before, `${before} → ${after}`);
check("assignments survived the re-import", second.migrated.assigned === 0, `${second.migrated.assigned} new`);

const crewAfter = db
  .prepare("SELECT COUNT(*) n FROM assignments WHERE event_id = ? AND status = 'active'")
  .get(fleetwood.id) as { n: number };
check("existing coverage untouched by the re-import", crewAfter.n === crew.length, `${crewAfter.n} assigned`);

/* --------------------------------- summary -------------------------------- */

const totals = {
  events: (db.prepare("SELECT COUNT(*) n FROM events").get() as { n: number }).n,
  venues: (db.prepare("SELECT COUNT(*) n FROM venues").get() as { n: number }).n,
  assignments: (db.prepare("SELECT COUNT(*) n FROM assignments WHERE status='active'").get() as { n: number }).n,
  withLinks: (db.prepare("SELECT COUNT(*) n FROM events WHERE event_url IS NOT NULL OR ticket_url IS NOT NULL OR festival_url IS NOT NULL").get() as { n: number }).n,
  starred: (db.prepare("SELECT COUNT(*) n FROM events WHERE needs_reporter = 1").get() as { n: number }).n,
};
console.log(`\n${dim("migrated:")} ${totals.events} events, ${totals.venues} venues, ${totals.assignments} assignments, ${totals.withLinks} with links, ${totals.starred} needing a reporter`);

console.log(
  `\n${fail === 0 ? green(`All ${pass} checks passed.`) : red(`${pass} passed, ${fail} failed.`)}\n`,
);
process.exit(fail > 0 ? 1 : 0);
