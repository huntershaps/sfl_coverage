/**
 * Parser for the South Florida Insider upcoming-events doc.
 *
 * The source format, as it is actually written:
 *
 *   2026                          <- year marker
 *   SEPTEMBER                     <- month marker
 *   9/13                          <- date line (also "10/16 - 10/18" ranges)
 *   * The Strokes @ HR (Reporter/Photo: Gleb)
 *   * Beer Fest @ Bryant Park, 6 - 10pm (Reporter: Francois)
 *
 * A trailing "*" after the venue means Scott is attending but a reporter is
 * still needed. The parenthetical at the end is the existing assignment note.
 */

import { resolveVenue } from "./venues";
import { EVENT_CATEGORIES, type EventCategory } from "../constants";

/**
 * `info` is for things the source doc simply never states (most entries have no
 * showtime). Surfacing them is useful; counting them as problems is not.
 */
export type ParseIssue = {
  field: string;
  level: "info" | "warning" | "error";
  message: string;
};

export type ParsedEvent = {
  title: string;
  subtitle: string | null;
  category: EventCategory;
  start_datetime: string; // YYYY-MM-DDTHH:MM
  multi_day_end: string | null; // YYYY-MM-DD
  time_tbd: 0 | 1;
  venue: string;
  city: string | null;
  address: string | null;
  legacy_assignees: string | null;
  needs_reporter: boolean;
  raw_line: string;
  line_no: number;
  issues: ParseIssue[];
};

export type ParseResult = {
  events: ParsedEvent[];
  skipped: number;
  detectedYearSpan: string | null;
};

const MONTHS: Record<string, number> = {
  JANUARY: 1, FEBRUARY: 2, MARCH: 3, APRIL: 4, MAY: 5, JUNE: 6,
  JULY: 7, AUGUST: 8, SEPTEMBER: 9, OCTOBER: 10, NOVEMBER: 11, DECEMBER: 12,
};

/* --------------------------- category inference --------------------------- */

/**
 * Order matters: the first rule that matches wins. Specific food/family/arts
 * naming is checked before the generic "...Fest" sweep so that "Beer Fest" and
 * "Strawberry Fest" do not get filed as music festivals.
 */
const CATEGORY_RULES: { cat: EventCategory; patterns: RegExp[] }[] = [
  {
    cat: "Sporting Event",
    patterns: [
      /\b(monster jam|jai-alai|jai alai|basketball|rodeo|spartan race|tough mudder|savage race|daytona 500|grand prix|f1\b|tgl\b|miami open|delray beach open|pickleball|drag racing|night of fire|boxing|wrestling|hall of fame invitational|orange blossom|race|speedway|inter miami|marathon)\b/i,
    ],
  },
  {
    cat: "Comedy",
    patterns: [
      /\bimprov\b/i,
      /\b(jo koy|nikki glaser|anthony jeselnik|sebastian maniscalo|chelsea handler|andrew dice clay|billy gardell|jon lovitz|rita rudner|shawn waynes|ron taylor|laurie kilmartin|caitlin peluffo|marcelo hernandez|golden girls: the laughs)\b/i,
      /\b(comedy|comedian|funny af|stand-?up)\b/i,
    ],
  },
  {
    cat: "Theater",
    patterns: [
      /\b(the musical|musical|broadway|playhouse|theatre|theater|cirque|ballet|orchestra|opera|symphony)\b/i,
      /\b(hamilton|wicked|mama mia|six|the notebook|spamalot|oliver!|rent|jersey boys|the outsiders|mean girls|dear evan hanson|beauty & the beast|little women|the great gatsby|snow white|the bodyguard|death becomes her|a beautiful noise|charlie & the chocolate factory|dirty dancing|young frankenstein|the sound of music|boop|hell's kitchen|oh, mary|forever tango|tango after dark|come from away|bullets over broadway|how to succeed in business|a human being died that night|the vampire circus|rock cauldron cabaret|disney on ice|the calling)\b/i,
    ],
  },
  {
    cat: "Food & Drink",
    patterns: [
      /\b(beer fest|food & wine|food and wine|sobewff|bourbon tasting|chili|cookoff|sweet corn|pickle|strawberry|wine|tasting|truluck)\b/i,
      /\bdinner & show\b/i,
    ],
  },
  // Checked before Family Event so a "Card Expo" held at a fairground is not
  // filed as a fair on the strength of the venue name alone.
  {
    cat: "Conference",
    patterns: [
      /\b(boat show|convention|expo|summit|card show|cardshow|trade show|collectibles?|comic con)\b/i,
    ],
  },
  {
    cat: "Family Event",
    patterns: [
      /\b(halloween horror nights|howl-o-scream|house of horror|fright nights|ice! ft|polar express|disney on ice|fair\b|renfest|sumo & sushi|air dot show|boat parade|winterfest)\b/i,
    ],
  },
  {
    cat: "Arts & Culture",
    patterns: [/\b(art basel|art week|megacon|spooky empire|fantasy fest|gasparilla)\b/i],
  },
  { cat: "Fashion", patterns: [/\b(swim week|fashion week|fashion)\b/i] },
  { cat: "Nightlife", patterns: [/\b(nightclub|liv\b|club night|dj set)\b/i] },
  { cat: "Grand Opening", patterns: [/\b(grand opening|ribbon cutting|now open)\b/i] },
  { cat: "Community Event", patterns: [/\b(parade|community|charity walk|5k)\b/i] },
  {
    cat: "Music Festival",
    patterns: [
      /\b(music fest|musicfest|ultra|edc|rockville|hulaween|iii points|warped tour|okeechobee|tortuga|groundup|reggae rise up|amp jam|spring reunion|we belong here|cyclops cove|lunatic ball|the fest)\b/i,
      /\bfest(ival)?\b/i,
    ],
  },
  // Tribute and "experience" acts are concerts even when the room is a
  // black-box theater rather than a music venue.
  {
    cat: "Concert",
    patterns: [/\b(tribute|cover band|experience|premier .* experience)\b/i],
  },
];

/** Rooms that host live music by default. Stems, so no trailing word boundary. */
const MUSIC_VENUE =
  /(hard rock|culture room|revolution|amphitheat|\bamp\b|arena|kaseya|fillmore|banyan|beacham|house of blues|jannus|stadium|bandshell|funky biscuit|bamboo room|respectable street|watsco|war memorial|propaganda|kia center|coliseum|soundstage|music hall|live\b)/i;

export function inferCategory(title: string, venue: string): EventCategory {
  const hay = `${title} @ ${venue}`;
  for (const rule of CATEGORY_RULES) {
    for (const p of rule.patterns) if (p.test(hay)) return rule.cat;
  }
  // Music rooms default to Concert; everything else stays Other so the
  // importer surfaces it for a human decision rather than guessing.
  if (MUSIC_VENUE.test(venue)) return "Concert";
  return "Other";
}

/* ------------------------------ time parsing ------------------------------ */

/** Pulls a trailing time like ", 6 - 10pm" or ", 5:30" out of the venue tail. */
function extractTime(tail: string): { time: string | null; rest: string } {
  const re =
    /,\s*(\d{1,2})(?::(\d{2}))?\s*(?:-\s*\d{1,2}(?::\d{2})?\s*)?(am|pm)?\s*$/i;
  const m = tail.match(re);
  if (!m) return { time: null, rest: tail };

  let hour = parseInt(m[1], 10);
  const min = m[2] ? parseInt(m[2], 10) : 0;
  const mer = m[3]?.toLowerCase();

  if (mer === "pm" && hour < 12) hour += 12;
  if (mer === "am" && hour === 12) hour = 0;
  // No meridiem written: evening shows are the norm, so 1-11 means PM.
  if (!mer && hour >= 1 && hour <= 11) hour += 12;

  if (hour > 23 || min > 59) return { time: null, rest: tail };
  return {
    time: `${String(hour).padStart(2, "0")}:${String(min).padStart(2, "0")}`,
    rest: tail.slice(0, m.index).trim(),
  };
}

/* -------------------------------- the parser ------------------------------- */

const DATE_LINE =
  /^(\d{1,2})\/(\d{1,2})(?:['’])?\s*(?:-|–|—|to)\s*(\d{1,2})\/(\d{1,2})(?:['’])?|^(\d{1,2})\/(\d{1,2})(?:['’])?/;

function isBulletLine(line: string) {
  return /^[*•·]\s+/.test(line) || /^\s+[*•·]\s+/.test(line);
}

function cleanText(s: string) {
  return s
    .replace(/\[[a-z]\]/gi, "") // strip Google Docs comment anchors
    .replace(/\s+/g, " ")
    .trim();
}

export function parseCoverageDoc(raw: string, opts?: { defaultYear?: number }): ParseResult {
  const text = raw.replace(/\r\n/g, "\n").replace(/﻿/g, "");
  const lines = text.split("\n");

  const today = new Date();
  let year = opts?.defaultYear ?? today.getFullYear();
  let sawYearMarker = false;
  let month: number | null = null;
  let curDate: { m: number; d: number; y: number } | null = null;
  let curEnd: { m: number; d: number; y: number } | null = null;

  const events: ParsedEvent[] = [];
  const years = new Set<number>();
  let skipped = 0;
  let started = false;

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const line = cleanText(rawLine);
    if (!line) continue;

    // Year marker: a bare "2026" / "2027"
    const ym = line.match(/^(20\d{2})$/);
    if (ym) {
      year = parseInt(ym[1], 10);
      sawYearMarker = true;
      started = true;
      month = null;
      curDate = null;
      continue;
    }

    // Month marker
    const upper = line.toUpperCase().replace(/[^A-Z]/g, "");
    if (MONTHS[upper]) {
      const nextMonth = MONTHS[upper];
      // Months only ever move forward in this doc; a wrap means a new year.
      if (sawYearMarker && month !== null && nextMonth < month) year += 1;
      month = nextMonth;
      curDate = null;
      started = true;
      continue;
    }

    // Footnote block at the end of the export
    if (/^\[[a-z]\]/i.test(cleanText(rawLine)) || /^\[[a-z]\]/i.test(rawLine)) {
      continue;
    }

    const bullet = isBulletLine(rawLine);
    const body = bullet ? line.replace(/^[*•·]\s+/, "") : line;

    // Date-only line, e.g. "9/13" or "10/16 - 10/18"
    if (!bullet) {
      const dm = line.match(DATE_LINE);
      if (dm && /^\d{1,2}\/\d{1,2}/.test(line)) {
        const afterDate = line.replace(DATE_LINE, "").trim();
        // A comma right after the date means it's an inline event
        // ("8/27 - 11/1, Halloween Horror Nights"), not a date header.
        if (!afterDate.startsWith(",")) {
          started = true;
          if (dm[1]) {
            curDate = { m: +dm[1], d: +dm[2], y: year };
            curEnd = { m: +dm[3], d: +dm[4], y: year };
            if (curEnd.m < curDate.m) curEnd.y = year + 1;
          } else {
            curDate = { m: +dm[5], d: +dm[6], y: year };
            curEnd = null;
          }
          if (month !== null && curDate.m < month && curDate.m <= 6 && month >= 11) {
            curDate.y = year + 1;
            if (curEnd) curEnd.y = year + 1;
          }
          continue;
        }
      }
    }

    if (!started) continue; // still in the legend / preamble

    // Inline dated event: "8/27 - 11/1, Halloween Horror Nights"
    const inline = body.match(
      /^(\d{1,2})\/(\d{1,2})(?:['’])?\s*(?:-|–)\s*(\d{1,2})\/(\d{1,2})(?:['’])?\s*,\s*(.+)$/,
    );
    const inlineSingle = body.match(/^(\d{1,2})\/(\d{1,2})(?:['’])?\s*,\s*(.+)$/);

    let dateFor: { m: number; d: number; y: number } | null = curDate;
    let endFor: { m: number; d: number; y: number } | null = curEnd;
    let content = body;

    if (inline) {
      dateFor = { m: +inline[1], d: +inline[2], y: year };
      endFor = { m: +inline[3], d: +inline[4], y: year };
      if (endFor.m < dateFor.m) endFor.y = dateFor.y + 1;
      content = inline[5];
    } else if (inlineSingle) {
      dateFor = { m: +inlineSingle[1], d: +inlineSingle[2], y: year };
      endFor = null;
      content = inlineSingle[3];
    } else if (!bullet) {
      // Undated prose in the body (e.g. "World Jai-Alai League @ Jam Arena")
      if (!body.includes("@")) continue;
      dateFor = null;
      endFor = null;
    }

    content = content.trim();
    if (!content || content.length < 3) {
      skipped++;
      continue;
    }

    // The source doc occasionally bullets a bare date ("* 2/9"). Treat it as
    // the date header it was meant to be rather than an event called "2/9".
    const bareDate = content.match(/^(\d{1,2})\/(\d{1,2})(?:['’])?$/);
    if (bareDate) {
      curDate = { m: +bareDate[1], d: +bareDate[2], y: year };
      curEnd = null;
      continue;
    }

    // Continuation lines — a support lineup listed on its own bullet, with no
    // venue and no date of its own — belong to the event directly above.
    if (!content.includes("@")) {
      const prev = events[events.length - 1];
      if (bullet && prev) {
        prev.subtitle = prev.subtitle ? `${prev.subtitle}; ${content}` : content;
        continue;
      }
      skipped++;
      continue;
    }

    const parsed = buildEvent(content, dateFor, endFor, rawLine, i + 1);
    if (!parsed) {
      skipped++;
      continue;
    }
    years.add(parseInt(parsed.start_datetime.slice(0, 4), 10));
    events.push(parsed);
  }

  const sortedYears = [...years].sort();
  return {
    events,
    skipped,
    detectedYearSpan: sortedYears.length
      ? sortedYears.length === 1
        ? String(sortedYears[0])
        : `${sortedYears[0]}–${sortedYears[sortedYears.length - 1]}`
      : null,
  };
}

const ASSIGN_KEYWORD =
  /\b(reporter|photog?|photo|review|backup|interview|video|social|mom|uncle|aunt)\b/i;

/**
 * Distinguishes an assignment parenthetical — "(Reporter: Piper+1)", "(Mom)",
 * "(Cary, Arielle)" — from a descriptive one that belongs in the title, such as
 * "(Iron Maiden cover band)" or a support lineup "(Shinedown, Bush, Hanson +)".
 */
function looksLikeAssignees(inner: string): boolean {
  if (!inner || inner.length > 90) return false;
  if (ASSIGN_KEYWORD.test(inner)) return true;

  const parts = inner.split(/[,;]/).map((p) => p.trim()).filter(Boolean);
  if (!parts.length || parts.length > 3) return false; // 4+ names reads as a lineup

  // Every part must look like a bare person reference: "Sarai +1", "NORELEY??"
  return parts.every((p) => /^[A-Z][A-Za-z.'’-]*(\s+[A-Z][A-Za-z.'’-]*)?\s*(\+\s*\d)?\s*\??\??$/.test(p));
}

function buildEvent(
  content: string,
  date: { m: number; d: number; y: number } | null,
  end: { m: number; d: number; y: number } | null,
  rawLine: string,
  lineNo: number,
): ParsedEvent | null {
  const issues: ParseIssue[] = [];
  let work = content;

  // Trailing assignment parenthetical, e.g. "(Reporter/Photo: Gleb; Backup: Sebastian +1)"
  let legacy: string | null = null;
  const assignMatch = work.match(/\(([^()]*)\)\s*$/);
  if (assignMatch) {
    const inner = assignMatch[1].trim();
    if (looksLikeAssignees(inner)) {
      legacy = inner;
      work = work.slice(0, assignMatch.index).trim();
    }
  }

  // "*" marker = Scott attending, reporter still needed
  let needsReporter = false;
  const starred = work.match(/\*+\s*$/);
  if (starred) {
    needsReporter = true;
    work = work.replace(/\*+\s*$/, "").trim();
  }

  // Split title from venue on the LAST " @ " so venue names containing "@"
  // ("The Casino @ Dania Beach") stay intact when they are the venue.
  let title = work;
  let venueRaw = "";
  const at = work.lastIndexOf(" @ ");
  if (at > 0) {
    title = work.slice(0, at).trim();
    venueRaw = work.slice(at + 3).trim();
  } else {
    issues.push({
      field: "venue",
      level: "warning",
      message: "No venue found on this line.",
    });
  }

  // A time can trail the venue: "Bryant Park, 6 - 10pm"
  const { time, rest } = extractTime(venueRaw);
  venueRaw = rest;

  // Some lines carry a "ft:" or parenthetical descriptor worth keeping as subtitle.
  let subtitle: string | null = null;
  const ft = title.match(/\s+ft:\s*(.+)$/i);
  if (ft) {
    subtitle = ft[1].trim();
    title = title.slice(0, ft.index).trim();
  } else {
    const paren = title.match(/\(([^()]+)\)\s*$/);
    if (paren && /\b(tribute|cover band|experience|premier)\b/i.test(paren[1])) {
      subtitle = paren[1].trim();
      title = title.slice(0, paren.index).trim();
    }
  }

  title = title.replace(/^[*•·\s]+/, "").replace(/[,;]\s*$/, "").trim();
  if (!title) return null;

  const isTbd = /^(tbd|various|various events|tba)$/i.test(venueRaw.trim());
  const { venue, city, matched } = resolveVenue(isTbd ? "" : venueRaw);
  if (isTbd)
    issues.push({
      field: "venue",
      level: "warning",
      message: `Venue listed as "${venueRaw.trim()}" in the source doc — needs confirming.`,
    });
  else if (venueRaw && !matched)
    issues.push({
      field: "venue",
      level: "warning",
      message: `"${venueRaw}" is not in the venue directory — city may be missing.`,
    });
  if (!city)
    issues.push({
      field: "city",
      level: "warning",
      message: "City could not be determined from the venue.",
    });

  if (!date) {
    issues.push({
      field: "start_datetime",
      level: "error",
      message: "No date on this entry — needs a date before it can be imported.",
    });
  }

  const d = date ?? { m: 1, d: 1, y: new Date().getFullYear() };
  const iso = `${d.y}-${pad(d.m)}-${pad(d.d)}`;
  if (!isValidDate(d.y, d.m, d.d))
    issues.push({
      field: "start_datetime",
      level: "error",
      message: `"${d.m}/${d.d}" is not a valid date.`,
    });

  if (!time)
    issues.push({
      field: "start_datetime",
      level: "info",
      message: "No start time listed — showtime should be confirmed with the venue.",
    });

  const category = inferCategory(title, venue);
  if (category === "Other")
    issues.push({
      field: "category",
      level: "warning",
      message: "Category could not be inferred — set it before importing.",
    });

  return {
    title,
    subtitle,
    category,
    start_datetime: `${iso}T${time ?? "19:00"}`,
    multi_day_end: end ? `${end.y}-${pad(end.m)}-${pad(end.d)}` : null,
    time_tbd: time ? 0 : 1,
    venue,
    city,
    address: null,
    legacy_assignees: legacy,
    needs_reporter: needsReporter,
    raw_line: rawLine.trim(),
    line_no: lineNo,
    issues,
  };
}

const pad = (n: number) => String(n).padStart(2, "0");

function isValidDate(y: number, m: number, d: number) {
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(y, m - 1, d);
  return dt.getMonth() === m - 1 && dt.getDate() === d;
}

export { EVENT_CATEGORIES };
