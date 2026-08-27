/**
 * Picks a parser for whatever got pasted in.
 *
 * The coverage doc has its own shape (date headers, `* Title @ Venue` bullets).
 * Anything else — a press release, an email, a search result — arrives as prose.
 * Rather than making whoever is importing pick a format, this tries the
 * structured parser first and falls back to prose extraction when it comes up
 * empty, then reports which one it used.
 */

import { parseCoverageDoc, type ParsedEvent, type ParseIssue } from "./coverage-doc";
import { parseProseEvents } from "./prose";
import {
  parseGoogleDocHtml,
  docPlainText,
  classifyLinks,
  lineKey,
  type DocLine,
  type VenueEntry,
} from "./gdoc-html";
import { parseAssignees, type DetectedAssignee } from "./assignees";

export type SourceFormat = "coverage-doc" | "gdoc-html" | "prose" | "none";

export type ParseResult = {
  events: EnrichedEvent[];
  skipped: number;
  detectedYearSpan: string | null;
  format: SourceFormat;
  /** Human-readable note shown above the import preview. */
  formatNote: string;
  /** Venue directory, only present when reading the doc's HTML export. */
  venues: VenueEntry[];
};

/** A parsed event plus everything only the HTML export can supply. */
export type EnrichedEvent = ParsedEvent & {
  event_url: string | null;
  ticket_url: string | null;
  festival_url: string | null;
  press_url: string | null;
  is_festival: boolean;
  /** People named as already covering this, from "(Reporter: Charity +1)". */
  detected_assignees: DetectedAssignee[];
};

const FESTIVAL_RE = /\b(fest|festival|carnival|expo|art week|music week|swim week)\b/i;

/** Fills the Phase 2 fields for parsers that cannot supply them. */
function enrich(e: ParsedEvent): EnrichedEvent {
  return {
    ...e,
    event_url: null,
    ticket_url: null,
    festival_url: null,
    press_url: null,
    is_festival: FESTIVAL_RE.test(e.title) || e.category === "Music Festival",
    detected_assignees: parseAssignees(e.legacy_assignees),
  };
}

/** True when the content is a Google Docs HTML export rather than plain text. */
export function looksLikeGoogleDocHtml(raw: string): boolean {
  return /<html/i.test(raw) && /<body/i.test(raw);
}

/**
 * Reads the doc's HTML export: parses the plain text with the proven line
 * parser, then matches each event back to its source line to attach the links
 * that only exist in the HTML.
 */
function parseHtmlExport(raw: string, opts?: { defaultYear?: number }): ParseResult {
  const { lines, venues } = parseGoogleDocHtml(raw);
  const structured = parseCoverageDoc(docPlainText(lines), opts);

  // Index the source lines so each parsed event can find the anchors it came
  // with. Keyed on normalised text, which both sides derive from the same line.
  const byKey = new Map<string, DocLine>();
  for (const l of lines) {
    const k = lineKey(l.text);
    if (k && !byKey.has(k)) byKey.set(k, l);
  }

  let linked = 0;
  const events: EnrichedEvent[] = structured.events.map((e) => {
    const base = enrich(e);
    const line = e.raw_line ? byKey.get(lineKey(e.raw_line)) : undefined;
    if (!line?.links.length) return base;

    linked++;
    const links = classifyLinks(line.links, {
      title: base.title,
      isFestival: base.is_festival,
    });
    return { ...base, ...links };
  });

  return {
    events,
    skipped: structured.skipped,
    detectedYearSpan: structured.detectedYearSpan,
    format: "gdoc-html",
    formatNote:
      `Read the Google Doc with its formatting intact — ${events.length} event` +
      `${events.length === 1 ? "" : "s"}, ${linked} carrying links, and ` +
      `${venues.length} venue${venues.length === 1 ? "" : "s"} from the directory at the top.`,
    venues,
  };
}

/** Cheap structural test for the coverage doc's own layout. */
function looksLikeCoverageDoc(raw: string): boolean {
  const lines = raw.split("\n").map((l) => l.trim());
  const dateHeaders = lines.filter((l) => /^\d{1,2}\/\d{1,2}(\s*[-–]\s*\d{1,2}\/\d{1,2})?$/.test(l)).length;
  const bullets = lines.filter((l) => /^[*•·]\s+.+\s@\s/.test(l)).length;
  return dateHeaders >= 1 && bullets >= 1;
}

export function parseEventContent(
  raw: string,
  opts?: { defaultYear?: number },
): ParseResult {
  // The HTML export carries links and the venue directory, so prefer it.
  if (looksLikeGoogleDocHtml(raw)) return parseHtmlExport(raw, opts);

  const structured = parseCoverageDoc(raw, opts);

  if (structured.events.length > 0) {
    return {
      ...structured,
      events: structured.events.map(enrich),
      venues: [],
      format: "coverage-doc",
      formatNote: `Read as the coverage doc format — ${structured.events.length} event${
        structured.events.length === 1 ? "" : "s"
      } found.`,
    };
  }

  const prose = parseProseEvents(raw, opts);
  if (prose.length > 0) {
    const years = [
      ...new Set(prose.map((e) => parseInt(e.start_datetime.slice(0, 4), 10))),
    ].sort();
    return {
      events: prose.map(enrich),
      venues: [],
      skipped: 0,
      detectedYearSpan: years.length
        ? years.length === 1
          ? String(years[0])
          : `${years[0]}–${years[years.length - 1]}`
        : null,
      format: "prose",
      formatNote: `No coverage-doc structure found, so this was read as plain description text — ${prose.length} event${
        prose.length === 1 ? "" : "s"
      } picked out. Check the dates and venues below before importing.`,
    };
  }

  return {
    events: [],
    skipped: structured.skipped,
    detectedYearSpan: null,
    venues: [],
    format: "none",
    formatNote: looksLikeCoverageDoc(raw)
      ? "The content looks like the coverage doc but no events could be read from it."
      : "Nothing recognisable as an event was found.",
  };
}

export { parseCoverageDoc, parseProseEvents, looksLikeCoverageDoc };
export type { ParsedEvent, ParseIssue };
