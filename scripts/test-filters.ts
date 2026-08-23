/**
 * Quick-filter date windows, checked from every day of the week.
 *
 *   npx tsx --conditions=react-server scripts/test-filters.ts
 *
 * These chips are easy to get subtly wrong — "this weekend" pointing at next
 * weekend when it is already Saturday, for instance — and the mistake is
 * invisible on most days of the week.
 */

import { quickRange } from "../src/lib/events";

let pass = 0;
let fail = 0;

const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function check(label: string, ok: boolean, got?: unknown) {
  if (ok) {
    pass++;
    console.log(`   ${green("✓")} ${label}`);
  } else {
    fail++;
    console.log(`   ${red("✗")} ${label}${got !== undefined ? red(`  got ${JSON.stringify(got)}`) : ""}`);
  }
}

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const dayOf = (s: string) => DAYS[new Date(`${s}T12:00:00`).getDay()];

// A full week: Sunday 16 Aug 2026 through Saturday 22 Aug 2026.
const WEEK = Array.from({ length: 7 }, (_, i) => new Date(2026, 7, 16 + i));

console.log("\nQuick filters, evaluated from each day of one week\n");

for (const day of WEEK) {
  const name = DAYS[day.getDay()];
  const today = quickRange("today", day);
  const week = quickRange("week", day);
  const weekend = quickRange("weekend", day);
  const next = quickRange("nextweek", day);
  const month = quickRange("month", day);

  console.log(
    `  ${dim(`${name} ${iso(day)}`)}  today ${today.from}` +
      `  week ${week.from}→${week.to}` +
      `  weekend ${weekend.from}→${weekend.to}` +
      `  next ${next.from}→${next.to}`,
  );

  check(`${name}: today is a single day`, today.from === iso(day) && today.to === iso(day), today);

  check(
    `${name}: this week starts today and never runs backwards`,
    week.from === iso(day) && week.to! >= week.from!,
    week,
  );
  check(`${name}: this week ends on a Sunday`, dayOf(week.to!) === "Sun", week.to);
  check(
    `${name}: this week never runs past seven days`,
    daysBetween(week.from!, week.to!) <= 6,
    week,
  );

  // The weekend must never start before today, must end on a Sunday, and must
  // be the current weekend when today is already Fri/Sat/Sun.
  check(`${name}: weekend does not start in the past`, weekend.from! >= iso(day), weekend);
  check(`${name}: weekend ends on a Sunday`, dayOf(weekend.to!) === "Sun", weekend.to);

  const isWeekendDay = [0, 5, 6].includes(day.getDay());
  check(
    `${name}: weekend is ${isWeekendDay ? "the one happening now" : "the one coming up"}`,
    isWeekendDay ? weekend.from === iso(day) : dayOf(weekend.from!) === "Fri",
    weekend.from,
  );

  check(`${name}: next week starts on a Monday`, dayOf(next.from!) === "Mon", next.from);
  check(`${name}: next week ends on a Sunday`, dayOf(next.to!) === "Sun", next.to);
  check(`${name}: next week is 7 days`, daysBetween(next.from!, next.to!) === 6, next);
  check(
    `${name}: next week begins the day after this week ends`,
    daysBetween(week.to!, next.from!) === 1,
    { week, next },
  );

  check(`${name}: this month starts today`, month.from === iso(day), month);
  check(
    `${name}: this month ends on the last of the month`,
    month.to === iso(new Date(day.getFullYear(), day.getMonth() + 1, 0)),
    month.to,
  );
}

console.log("\nSpecific cases\n");

// Saturday 22 Aug 2026 — the day the bug showed up.
const sat = new Date(2026, 7, 22);
check(
  "Saturday: this weekend is today and tomorrow",
  quickRange("weekend", sat).from === "2026-08-22" &&
    quickRange("weekend", sat).to === "2026-08-23",
  quickRange("weekend", sat),
);

const sun = new Date(2026, 7, 23);
check(
  "Sunday: this weekend is just today",
  quickRange("weekend", sun).from === "2026-08-23" &&
    quickRange("weekend", sun).to === "2026-08-23",
  quickRange("weekend", sun),
);

const wed = new Date(2026, 7, 19);
check(
  "Wednesday: this weekend is the coming Fri–Sun",
  quickRange("weekend", wed).from === "2026-08-21" &&
    quickRange("weekend", wed).to === "2026-08-23",
  quickRange("weekend", wed),
);

// Month end should not spill into the next month.
const monthEnd = new Date(2026, 7, 31);
check(
  "31 Aug: this month is a single day",
  quickRange("month", monthEnd).from === "2026-08-31" &&
    quickRange("month", monthEnd).to === "2026-08-31",
  quickRange("month", monthEnd),
);

// A week that straddles a month boundary.
const straddle = new Date(2026, 7, 30); // Sunday
check(
  "30 Aug (Sun): next week runs into September",
  quickRange("nextweek", straddle).from === "2026-08-31" &&
    quickRange("nextweek", straddle).to === "2026-09-06",
  quickRange("nextweek", straddle),
);

check("no filter yields no window", Object.keys(quickRange("")).length === 0);
check("unknown filter yields no window", Object.keys(quickRange("nonsense")).length === 0);

function daysBetween(a: string, b: string) {
  return Math.round(
    (new Date(`${b}T12:00:00`).getTime() - new Date(`${a}T12:00:00`).getTime()) / 864e5,
  );
}

console.log(
  `\n${fail === 0 ? green(`All ${pass} checks passed.`) : red(`${pass} passed, ${fail} failed.`)}\n`,
);
process.exit(fail > 0 ? 1 : 0);
