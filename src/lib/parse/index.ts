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

export type SourceFormat = "coverage-doc" | "prose" | "none";

export type ParseResult = {
  events: ParsedEvent[];
  skipped: number;
  detectedYearSpan: string | null;
  format: SourceFormat;
  /** Human-readable note shown above the import preview. */
  formatNote: string;
};

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
  const structured = parseCoverageDoc(raw, opts);

  if (structured.events.length > 0) {
    return {
      ...structured,
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
      events: prose,
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
    format: "none",
    formatNote: looksLikeCoverageDoc(raw)
      ? "The content looks like the coverage doc but no events could be read from it."
      : "Nothing recognisable as an event was found.",
  };
}

export { parseCoverageDoc, parseProseEvents, looksLikeCoverageDoc };
export type { ParsedEvent, ParseIssue };
