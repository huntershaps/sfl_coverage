import fs from "node:fs";
import { parseCoverageDoc } from "../src/lib/parse/coverage-doc";

const raw = fs.readFileSync("data/source-doc.txt", "utf8");
const res = parseCoverageDoc(raw, { defaultYear: 2026 });

console.log("parsed events :", res.events.length);
console.log("skipped lines :", res.skipped);
console.log("year span     :", res.detectedYearSpan);

const byCat: Record<string, number> = {};
let noCity = 0,
  noVenue = 0,
  errors = 0,
  withLegacy = 0,
  needsReporter = 0,
  timed = 0;
for (const e of res.events) {
  byCat[e.category] = (byCat[e.category] ?? 0) + 1;
  if (!e.city) noCity++;
  if (!e.venue) noVenue++;
  if (e.issues.some((i) => i.level === "error")) errors++;
  if (e.legacy_assignees) withLegacy++;
  if (e.needs_reporter) needsReporter++;
  if (!e.time_tbd) timed++;
}

console.log("\ncategories:");
for (const [k, v] of Object.entries(byCat).sort((a, b) => b[1] - a[1]))
  console.log(`  ${k.padEnd(20)} ${v}`);

console.log("\nno city      :", noCity);
console.log("no venue     :", noVenue);
console.log("hard errors  :", errors);
console.log("w/ assignees :", withLegacy);
console.log("needs reporter:", needsReporter);
console.log("with time    :", timed);

console.log("\n--- first 12 ---");
for (const e of res.events.slice(0, 12))
  console.log(
    `${e.start_datetime}  ${e.multi_day_end ? "->" + e.multi_day_end : "          "}  ${e.category.padEnd(15)} ${e.title.slice(0, 44).padEnd(46)} @ ${e.venue} [${e.city ?? "?"}]${e.legacy_assignees ? ` {${e.legacy_assignees}}` : ""}`,
  );

console.log("\n--- sample from Oct/Nov ---");
for (const e of res.events.filter((x) => x.start_datetime.startsWith("2026-11")).slice(0, 12))
  console.log(
    `${e.start_datetime}  ${e.category.padEnd(15)} ${e.title.slice(0, 40).padEnd(42)} @ ${e.venue} [${e.city ?? "?"}]${e.legacy_assignees ? ` {${e.legacy_assignees}}` : ""}`,
  );

console.log("\n--- 2027 sample ---");
for (const e of res.events.filter((x) => x.start_datetime.startsWith("2027")).slice(0, 10))
  console.log(
    `${e.start_datetime}  ${e.category.padEnd(15)} ${e.title.slice(0, 40).padEnd(42)} @ ${e.venue} [${e.city ?? "?"}]`,
  );

console.log("\n--- entries with unresolved venue (first 12) ---");
for (const e of res.events.filter((x) => x.issues.some((i) => i.field === "venue")).slice(0, 12))
  console.log(`  ${e.title.slice(0, 40).padEnd(42)} | venue="${e.venue}"`);
