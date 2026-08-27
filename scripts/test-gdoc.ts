import fs from "node:fs";
import { parseGoogleDocHtml, docPlainText, classifyLinks } from "../src/lib/parse/gdoc-html";
import { parseAssignees, uniqueNames } from "../src/lib/parse/assignees";
import { parseCoverageDoc } from "../src/lib/parse/coverage-doc";

const html = fs.readFileSync("data/source-doc.html", "utf8");
const { lines, venues } = parseGoogleDocHtml(html);

console.log(`lines: ${lines.length}   linked lines: ${lines.filter((l) => l.links.length).length}`);
console.log(`venues detected: ${venues.length}   with a website: ${venues.filter((v) => v.website).length}\n`);

console.log("--- sample venues ---");
for (const v of venues.slice(0, 8)) {
  console.log(`  ${(v.abbreviation ? v.abbreviation + " = " : "").padStart(8)}${v.name.padEnd(42)} ${v.website ?? "(no link)"}${v.note ? "  [" + v.note + "]" : ""}`);
}

const text = docPlainText(lines);
const parsed = parseCoverageDoc(text, { defaultYear: 2026 });
console.log(`\n--- events parsed from HTML text: ${parsed.events.length} ---`);

const starred = parsed.events.filter((e) => e.needs_reporter);
console.log(`starred (Scott attending, reporter needed): ${starred.length}`);
for (const e of starred.slice(0, 5)) console.log(`   * ${e.title} @ ${e.venue}`);

const withAssignees = parsed.events.filter((e) => e.legacy_assignees);
console.log(`\nlines with confirmed coverage: ${withAssignees.length}`);

const all = withAssignees.map((e) => parseAssignees(e.legacy_assignees));
console.log(`distinct contributors named: ${uniqueNames(all).join(", ")}`);

console.log("\n--- sample assignee parses ---");
for (const e of withAssignees.slice(0, 8)) {
  const people = parseAssignees(e.legacy_assignees);
  console.log(`  "${e.legacy_assignees}"`);
  for (const p of people)
    console.log(`      -> ${p.name}${p.guests ? " +" + p.guests : ""} [${p.coverageTypes.join(",")}]${p.isBackup ? " (backup)" : ""}`);
}
