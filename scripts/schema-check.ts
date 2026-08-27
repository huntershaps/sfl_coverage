import { getDb } from "../src/lib/db";
const db = getDb();
const cols = (t: string) =>
  (db.prepare(`PRAGMA table_info(${t})`).all() as { name: string }[]).map((c) => c.name);
const want: Record<string, string[]> = {
  events: ["doors_time","end_time","event_url","festival_url","press_url","is_festival","needs_reporter","venue_id"],
  venues: ["slug","website","events_url","press_url","maps_url","image_url","updated_at"],
  assignments: ["source"],
  import_items: ["detected_assignees"],
};
let ok = true;
for (const [t, need] of Object.entries(want)) {
  const have = cols(t);
  const missing = need.filter((c) => !have.includes(c));
  console.log(`${missing.length ? "MISSING" : "ok     "}  ${t}: ${missing.length ? missing.join(", ") : need.length + " columns present"}`);
  if (missing.length) ok = false;
}
console.log(`\nrows preserved — events ${(db.prepare("SELECT COUNT(*) n FROM events").get() as any).n}, users ${(db.prepare("SELECT COUNT(*) n FROM users").get() as any).n}, assignments ${(db.prepare("SELECT COUNT(*) n FROM assignments").get() as any).n}`);
process.exit(ok ? 0 : 1);
