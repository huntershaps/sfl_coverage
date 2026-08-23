/**
 * Parser for events written as prose rather than in the coverage doc's
 * date-header + bullet format. This is what you get when someone pastes from a
 * press release, an email, or a research/search result:
 *
 *   The Fairgrounds Card Expo is scheduled for Saturday, 10/31, and Sunday,
 *   11/1, 2026, at the South Florida Fair Expo Center East (9067 Southern Blvd,
 *   West Palm Beach, FL 33411).
 *
 *   Courtside Cardshow in Miami takes place from October 2 to October 4, 2026,
 *   at the Hyatt Regency / James L. Knight Center located at 400 SE 2nd Ave,
 *   Miami, FL. [1, 2, 3]
 *
 * One paragraph (or line) becomes one candidate event. Everything it cannot
 * work out is reported as an issue rather than guessed at.
 */

import { resolveVenue } from "./venues";
import { inferCategory, type ParsedEvent, type ParseIssue } from "./coverage-doc";

const MONTHS: Record<string, number> = {
  january: 1, jan: 1, february: 2, feb: 2, march: 3, mar: 3, april: 4, apr: 4,
  may: 5, june: 6, jun: 6, july: 7, jul: 7, august: 8, aug: 8,
  september: 9, sep: 9, sept: 9, october: 10, oct: 10,
  november: 11, nov: 11, december: 12, dec: 12,
};

const MONTH_RE =
  "(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";

/** Phrases that separate an event's name from its scheduling clause. */
const TRIGGERS =
  /\b(is scheduled for|is scheduled|takes place|taking place|will take place|will be held|is being held|is held|will run|runs|is set for|is on|happens|occurs|kicks off|opens|returns)\b/i;

const pad = (n: number) => String(n).padStart(2, "0");

type Found = { m: number; d: number; y?: number; index: number };

/* --------------------------------- dates ---------------------------------- */

function findDates(text: string): Found[] {
  const out: Found[] = [];

  // "October 2", "Oct. 2nd, 2026", "August 29, 2026"
  const named = new RegExp(
    `\\b(${MONTH_RE})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:\\s*,\\s*(\\d{4}))?`,
    "gi",
  );
  for (const m of text.matchAll(named)) {
    const mon = MONTHS[m[1].toLowerCase().replace(/\./g, "")];
    if (!mon) continue;
    out.push({
      m: mon,
      d: parseInt(m[2], 10),
      y: m[3] ? parseInt(m[3], 10) : undefined,
      index: m.index ?? 0,
    });
  }

  // "10/31", "11/1, 2026", "10/31/2026"
  const numeric = /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4})|\s*,\s*(\d{4}))?/g;
  for (const m of text.matchAll(numeric)) {
    const mon = parseInt(m[1], 10);
    const day = parseInt(m[2], 10);
    if (mon < 1 || mon > 12 || day < 1 || day > 31) continue;
    let year: number | undefined;
    const raw = m[3] ?? m[4];
    if (raw) year = raw.length === 2 ? 2000 + parseInt(raw, 10) : parseInt(raw, 10);
    out.push({ m: mon, d: day, y: year, index: m.index ?? 0 });
  }

  return out.sort((a, b) => a.index - b.index);
}

/* --------------------------------- time ----------------------------------- */

function findTime(text: string): string | null {
  // "at 6:30 PM", "at 7 pm", "doors at 8:00pm"
  const m = text.match(/\b(?:at|from)\s+(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)/i);
  if (!m) return null;

  let hour = parseInt(m[1], 10);
  const min = m[2] ? parseInt(m[2], 10) : 0;
  const pm = /^p/i.test(m[3]);

  if (pm && hour < 12) hour += 12;
  if (!pm && hour === 12) hour = 0;
  if (hour > 23 || min > 59) return null;

  return `${pad(hour)}:${pad(min)}`;
}

/* -------------------------------- location -------------------------------- */

function findAddress(text: string): string | null {
  // "(9067 Southern Blvd, West Palm Beach, FL 33411)"
  const paren = text.match(/\(([^)]*\d{2,}[^)]*)\)/);
  if (paren && /\d/.test(paren[1])) return paren[1].trim();

  // "Address: 619 South Main Street, Gainesville, FL 32601"
  const labelled = text.match(/\bAddress:\s*([^.]+?)(?:\.|$)/i);
  if (labelled) return labelled[1].trim();

  // "located at 400 SE 2nd Ave, Miami, FL"
  const located = text.match(/\blocated at\s+([^.]+?)(?:\.|$)/i);
  if (located) return located[1].trim();

  return null;
}

function findCity(text: string, address: string | null): string | null {
  const source = address ?? text;

  // "…, West Palm Beach, FL 33411" / "…, Miami, FL"
  const stateForm = source.match(
    /,\s*([A-Z][A-Za-z.'\- ]{2,30}?),\s*(?:FL|Florida|GA|Georgia|NY|NJ)\b/,
  );
  if (stateForm) return stateForm[1].trim();

  // "Cardshow in Miami takes place", "show in Gainesville is on"
  const inForm = text.match(
    /\bin\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})(?=\s+(?:takes|is|will|happens|on|from)\b)/,
  );
  if (inForm) return inForm[1].trim();

  return null;
}

function findVenue(text: string): string | null {
  // Every "at <Capitalised phrase>", skipping times ("at 6:30 PM") and
  // street addresses ("at 400 SE 2nd Ave").
  const re =
    /\bat\s+(?:the\s+)?([A-Z][A-Za-z0-9'&.\-]*(?:\s+(?:[A-Z][A-Za-z0-9'&.\-]*|of|the|and|at|de|la|\/))*)/g;

  const candidates: string[] = [];
  for (const m of text.matchAll(re)) {
    let v = m[1].trim();
    // Cut at a sentence break. A full stop after two or more lowercase letters
    // ends the sentence ("Soundstage. Address:"); one after a single initial
    // ("James L. Knight Center") does not.
    v = v.replace(/([a-z]{2,})\.\s+.*$/, "$1");
    v = v.replace(/[.,]+$/, "").trim();
    if (!v || /^\d/.test(v)) continue;
    if (/^(a\.?m|p\.?m)\b/i.test(v)) continue;
    candidates.push(v);
  }
  if (!candidates.length) return null;

  // Prefer the longest — "Hyatt Regency / James L. Knight Center" over "Hyatt".
  return candidates.sort((a, b) => b.length - a.length)[0];
}

/* --------------------------------- title ---------------------------------- */

function findTitle(text: string, city: string | null): string | null {
  let head = text;

  const trig = text.match(TRIGGERS);
  if (trig && trig.index !== undefined && trig.index > 2) {
    head = text.slice(0, trig.index);
  } else {
    // No trigger phrase — fall back to whatever precedes the first date.
    const firstDate = findDates(text)[0];
    if (firstDate && firstDate.index > 2) head = text.slice(0, firstDate.index);
  }

  head = head
    .replace(/\[[\d,\s]+\]/g, "")
    .replace(/\s+/g, " ")
    .replace(/[,\-–—:;]+\s*$/, "")
    .trim();

  // Drop a leading weekday that belongs to the date clause, not the name.
  head = head.replace(
    /\s*(?:,\s*)?(?:on\s+)?(Mon|Tues|Wednes|Thurs|Fri|Satur|Sun)day\s*$/i,
    "",
  );

  // "Courtside Cardshow in Miami" → "Courtside Cardshow" when Miami is the city.
  if (city) {
    const re = new RegExp(`\\s+in\\s+${city.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "i");
    head = head.replace(re, "");
  }

  head = head.trim();
  if (head.length < 3 || head.length > 140) return null;
  if (!/[A-Za-z]/.test(head)) return null;
  return head;
}

/* -------------------------------- the parser ------------------------------- */

/** Splits pasted prose into one chunk per candidate event. */
function chunk(raw: string): { text: string; line: number }[] {
  const lines = raw.replace(/\r\n/g, "\n").split("\n");
  const out: { text: string; line: number }[] = [];

  let buf: string[] = [];
  let start = 1;

  const flush = () => {
    const text = buf.join(" ").replace(/\s+/g, " ").trim();
    if (text) out.push({ text, line: start });
    buf = [];
  };

  lines.forEach((l, i) => {
    if (!l.trim()) {
      flush();
      return;
    }
    if (!buf.length) start = i + 1;
    buf.push(l.trim());
  });
  flush();

  return out;
}

export function parseProseEvents(
  raw: string,
  opts?: { defaultYear?: number },
): ParsedEvent[] {
  const fallbackYear = opts?.defaultYear ?? new Date().getFullYear();
  const events: ParsedEvent[] = [];

  for (const c of chunk(raw)) {
    // Citation markers from pasted research output are noise, not content.
    const text = c.text.replace(/\[\s*\d+(?:\s*,\s*\d+)*\s*\]/g, " ").replace(/\s+/g, " ").trim();
    if (text.length < 12) continue;

    const dates = findDates(text);
    if (!dates.length) continue;

    const issues: ParseIssue[] = [];

    // A year stated anywhere in the sentence applies to every date in it.
    const statedYear = dates.find((d) => d.y)?.y;
    const year = statedYear ?? fallbackYear;
    if (!statedYear)
      issues.push({
        field: "start_datetime",
        level: "warning",
        message: `No year written out — assumed ${year}. Check this one.`,
      });

    const start = dates[0];
    const last = dates[dates.length - 1];

    let startY = start.y ?? year;
    let endY = last.y ?? year;
    // "December 30 to January 2" rolls into the following year.
    if (dates.length > 1 && last.m < start.m) endY = startY + 1;

    if (!isValidDate(startY, start.m, start.d)) {
      issues.push({
        field: "start_datetime",
        level: "error",
        message: `"${start.m}/${start.d}" is not a valid date.`,
      });
    }

    const address = findAddress(text);
    const city = findCity(text, address);
    const venueRaw = findVenue(text);
    const time = findTime(text);
    const title = findTitle(text, city);

    if (!title) {
      // Without a name there is nothing worth importing.
      continue;
    }

    const resolved = venueRaw ? resolveVenue(venueRaw) : { venue: "", city: null, matched: false };
    const venue = resolved.venue || venueRaw || "";
    const finalCity = city ?? resolved.city ?? null;

    if (!venue)
      issues.push({
        field: "venue",
        level: "warning",
        message: "No venue found in this text — add one before importing.",
      });
    if (!finalCity)
      issues.push({
        field: "city",
        level: "warning",
        message: "City could not be determined.",
      });
    if (!time)
      issues.push({
        field: "start_datetime",
        level: "info",
        message: "No start time listed — confirm the showtime with the venue.",
      });

    const multiDay =
      dates.length > 1 && !(last.m === start.m && last.d === start.d)
        ? `${endY}-${pad(last.m)}-${pad(last.d)}`
        : null;

    const category = inferCategory(title, venue);
    if (category === "Other")
      issues.push({
        field: "category",
        level: "warning",
        message: "Category could not be inferred — set it before importing.",
      });

    events.push({
      title,
      subtitle: null,
      category,
      start_datetime: `${startY}-${pad(start.m)}-${pad(start.d)}T${time ?? "19:00"}`,
      multi_day_end: multiDay,
      time_tbd: time ? 0 : 1,
      venue,
      city: finalCity,
      address,
      legacy_assignees: null,
      needs_reporter: false,
      raw_line: c.text,
      line_no: c.line,
      issues,
    });
  }

  return events;
}

function isValidDate(y: number, m: number, d: number) {
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(y, m - 1, d);
  return dt.getMonth() === m - 1 && dt.getDate() === d;
}
