/**
 * Prose-import parser checks, built from real pasted content that previously
 * produced "No events were found".
 *
 *   npx tsx scripts/test-prose.ts
 */

import { parseEventContent } from "../src/lib/parse";

let pass = 0;
let fail = 0;

const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;

function check(label: string, ok: boolean, got?: unknown) {
  if (ok) {
    pass++;
    console.log(`   ${green("✓")} ${label}`);
  } else {
    fail++;
    console.log(`   ${red("✗")} ${label}${got !== undefined ? red(`  got: ${JSON.stringify(got)}`) : ""}`);
  }
}

/* ------------------------- the paste that failed -------------------------- */

const CARD_SHOWS = `The Fairgrounds Card Expo is scheduled for Saturday, 10/31, and Sunday, 11/1, 2026, at the South Florida Fair Expo Center East (9067 Southern Blvd, West Palm Beach, FL 33411).

Courtside Cardshow in Miami takes place from October 2 to October 4, 2026, at the Hyatt Regency / James L. Knight Center located at 400 SE 2nd Ave, Miami, FL. [1, 2, 3]

The Foxtide show in Gainesville is on Saturday, August 29, 2026, at 6:30 PM at the Heartwood Soundstage. [1] Address: 619 South Main Street, Gainesville, FL 32601 [1]`;

console.log("\nPasted prose (the case that returned nothing before)\n");

const r = parseEventContent(CARD_SHOWS, { defaultYear: 2026 });
check("format detected as prose", r.format === "prose", r.format);
check("all three events found", r.events.length === 3, r.events.length);

console.log();
for (const e of r.events) {
  console.log(
    `   ${dim("•")} ${e.title}\n` +
      `     ${e.start_datetime}${e.multi_day_end ? ` → ${e.multi_day_end}` : ""}  ${e.category}\n` +
      `     ${e.venue || "(no venue)"} · ${e.city ?? "(no city)"}\n` +
      `     ${dim(e.address ?? "(no address)")}`,
  );
}
console.log();

const [expo, courtside, foxtide] = r.events;

check("Fairgrounds title", expo?.title === "The Fairgrounds Card Expo", expo?.title);
check("Fairgrounds starts 31 Oct 2026", expo?.start_datetime.startsWith("2026-10-31"), expo?.start_datetime);
check("Fairgrounds runs through 1 Nov", expo?.multi_day_end === "2026-11-01", expo?.multi_day_end);
check("Fairgrounds city", expo?.city === "West Palm Beach", expo?.city);
check("Fairgrounds address kept", !!expo?.address?.includes("9067 Southern Blvd"), expo?.address);

check("Courtside title drops the city", courtside?.title === "Courtside Cardshow", courtside?.title);
check("Courtside starts 2 Oct 2026", courtside?.start_datetime.startsWith("2026-10-02"), courtside?.start_datetime);
check("Courtside runs through 4 Oct", courtside?.multi_day_end === "2026-10-04", courtside?.multi_day_end);
check("Courtside city", courtside?.city === "Miami", courtside?.city);
check("Courtside venue", !!courtside?.venue?.includes("Knight Center"), courtside?.venue);

check("Foxtide title", foxtide?.title === "The Foxtide show", foxtide?.title);
check("Foxtide date and time", foxtide?.start_datetime === "2026-08-29T18:30", foxtide?.start_datetime);
check("Foxtide is single-day", foxtide?.multi_day_end === null, foxtide?.multi_day_end);
check("Foxtide venue", foxtide?.venue === "Heartwood Soundstage", foxtide?.venue);
check("Foxtide city", foxtide?.city === "Gainesville", foxtide?.city);
check("citation markers stripped from titles", !r.events.some((e) => /\[\d/.test(e.title)));

/* ---------------------- the doc format still wins ------------------------- */

console.log("\nCoverage-doc format still takes priority\n");

const DOC = `2026
SEPTEMBER
9/13
* The Strokes @ HR (Reporter/Photo: Gleb)
* Music for the Macabre @ Pugh Theater
9/16
* Empire of the Sun @ FPL Solar Amp *`;

const d = parseEventContent(DOC, { defaultYear: 2026 });
check("format detected as coverage-doc", d.format === "coverage-doc", d.format);
check("three events parsed", d.events.length === 3, d.events.length);
check("venue shorthand still expands", d.events[0]?.venue === "Hard Rock Live", d.events[0]?.venue);
check("assignment note still captured", d.events[0]?.legacy_assignees === "Reporter/Photo: Gleb", d.events[0]?.legacy_assignees);

/* ------------------------------ other shapes ------------------------------ */

console.log("\nOther things people paste\n");

const ONE_LINER = parseEventContent(
  "Ed Sheeran plays Hard Rock Live on November 12, 2026 at 8:00 PM.",
  { defaultYear: 2026 },
);
check("single sentence works", ONE_LINER.events.length === 1, ONE_LINER.events.length);
check("single sentence time", ONE_LINER.events[0]?.start_datetime === "2026-11-12T20:00", ONE_LINER.events[0]?.start_datetime);

const NO_YEAR = parseEventContent(
  "The Winter Market is on December 5 at Bayfront Park in Miami.",
  { defaultYear: 2027 },
);
check("missing year falls back to the chosen year", NO_YEAR.events[0]?.start_datetime.startsWith("2027-12-05"), NO_YEAR.events[0]?.start_datetime);
check(
  "missing year is flagged for review",
  !!NO_YEAR.events[0]?.issues.some((i) => /assumed 2027/i.test(i.message)),
  NO_YEAR.events[0]?.issues,
);

const JUNK = parseEventContent("Hey, can you send me the photos from last night? Thanks.", {});
check("prose with no dates yields nothing", JUNK.events.length === 0, JUNK.events.length);
check("empty result is reported as 'none'", JUNK.format === "none", JUNK.format);

console.log(
  `\n${fail === 0 ? green(`All ${pass} checks passed.`) : red(`${pass} passed, ${fail} failed.`)}\n`,
);
process.exit(fail > 0 ? 1 : 0);
