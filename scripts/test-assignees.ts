/**
 * The coverage doc's assignment shorthand, checked against forms taken from the
 * real document.
 *
 *   npx tsx scripts/test-assignees.ts
 *
 * This parser decides who ends up assigned to an event during migration, so a
 * mistake here silently gives someone else's credential away.
 */

import { parseAssignees } from "../src/lib/parse/assignees";

let pass = 0;
let fail = 0;
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;

/** Compact form for comparison: "Name+guests[types](backup)". */
const fmt = (s: string) =>
  parseAssignees(s)
    .map(
      (a) =>
        `${a.name}${a.guests ? "+" + a.guests : ""}[${a.coverageTypes.join(",")}]${a.isBackup ? "(b)" : ""}`,
    )
    .join(" ");

function eq(input: string, expected: string) {
  const got = fmt(input);
  if (got === expected) {
    pass++;
    console.log(`  ${green("✓")} ${dim(input)}`);
  } else {
    fail++;
    console.log(`  ${red("✗")} ${input}\n      expected ${expected}\n      got      ${got}`);
  }
}

console.log("\nAssignment shorthand\n");

// --- the common forms ---
eq("Reporter: Charity", "Charity[article]");
eq("Reporter: Francois", "Francois[article]");
eq("Photo/Reporter: Charity", "Charity[photography,article]");
eq("Reporter/Photo: Gleb", "Gleb[photography,article]");

// --- guests, written as the doc writes them ---
eq("Reporter: Charity +3", "Charity+3[article]");
eq("Photo/Reporter: Sebastian +1", "Sebastian+1[photography,article]");
eq("Reporter: Piper+1", "Piper+1[article]");

// --- backups, with both separators and inconsistent spacing ---
eq("Reporter: Charity; Backup: Gleb", "Charity[article] Gleb[other](b)");
eq("Photo/Reporter: Charity; Backup - Piper +1", "Charity[photography,article] Piper+1[other](b)");
eq("Backup Photo/Review: Gleb", "Gleb[photography,article](b)");

// --- several people in one segment ---
eq("Reporter: Charity and Gleb", "Charity[article] Gleb[article]");
eq("Reporter: Charity, Gleb", "Charity[article] Gleb[article]");

// --- a bare name with no role ---
eq("Mom", "Mom[other]");
eq("Gleb", "Gleb[other]");

console.log("\nThings that must NOT become people\n");

function none(input: string) {
  const got = fmt(input);
  if (got === "") {
    pass++;
    console.log(`  ${green("✓")} ${dim(input)} → nobody`);
  } else {
    fail++;
    console.log(`  ${red("✗")} ${input} → ${got}`);
  }
}

none("Photo");
none("Reporter");
none("Backup");
none("Photo/Reporter");
none("TBD");
none("N/A");
none("");

console.log("\nDeduplication and edge cases\n");

// The same person twice in one line is one assignment, keeping the larger
// guest count and the union of roles.
eq("Photo: Charity; Reporter: Charity +2", "Charity+2[photography,article]");

// A hyphenated name must survive the dash-separator logic.
eq("Reporter: Jean-Luc", "Jean-Luc[article]");
eq("Jean-Luc", "Jean-Luc[other]");

// A role label with no person yields nobody, not a phantom assignment.
none("Reporter:");

console.log(
  `\n${fail === 0 ? green(`All ${pass} checks passed.`) : red(`${pass} passed, ${fail} failed.`)}\n`,
);
process.exit(fail > 0 ? 1 : 0);
