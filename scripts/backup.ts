/**
 * Consistent database backup.
 *
 *   npx tsx scripts/backup.ts [outputDir]
 *
 * Uses SQLite's own online backup API rather than copying the file. With WAL
 * enabled a plain `cp` can capture a torn database — the .db and the -wal can
 * disagree — so a file copy of a live database is not a safe backup.
 *
 * Keeps the 14 most recent and deletes older ones.
 */

import fs from "node:fs";
import path from "node:path";
import { getDb } from "../src/lib/db";

const KEEP = 14;

async function main() {
  const outDir = path.resolve(process.argv[2] || process.env.BACKUP_DIR || "./backups");
  fs.mkdirSync(outDir, { recursive: true });

  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const dest = path.join(outDir, `sfi-${stamp}.db`);

  const db = getDb();
  await db.backup(dest);

  const size = (fs.statSync(dest).size / 1024 / 1024).toFixed(2);

  // Verify the copy opens and has the tables we expect before trusting it.
  const Database = (await import("better-sqlite3")).default;
  const check = new Database(dest, { readonly: true });
  const counts = {
    users: (check.prepare("SELECT COUNT(*) n FROM users").get() as { n: number }).n,
    events: (check.prepare("SELECT COUNT(*) n FROM events").get() as { n: number }).n,
    assignments: (check.prepare("SELECT COUNT(*) n FROM assignments").get() as { n: number }).n,
  };
  const integrity = check.pragma("integrity_check", { simple: true });
  check.close();

  if (integrity !== "ok") {
    console.error(`Backup failed its integrity check: ${integrity}`);
    process.exit(1);
  }

  console.log(
    `Backed up to ${dest} (${size} MB) — ${counts.users} users, ${counts.events} events, ${counts.assignments} assignments, integrity ok.`,
  );

  // Prune old copies.
  const old = fs
    .readdirSync(outDir)
    .filter((f) => /^sfi-.*\.db$/.test(f))
    .sort()
    .reverse()
    .slice(KEEP);

  for (const f of old) fs.unlinkSync(path.join(outDir, f));
  if (old.length) console.log(`Removed ${old.length} backup(s) older than the last ${KEEP}.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
