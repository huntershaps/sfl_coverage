/**
 * Reads the Google Doc's HTML export rather than its plain-text export.
 *
 * The text export throws away two things the coverage doc depends on:
 *
 *   1. Hyperlinks — every venue in the header table links to that venue's site,
 *      and event lines carry ticket/festival/press links. In `?format=txt`
 *      these become bare words.
 *   2. The venue directory's table structure.
 *
 * So the importer reads `?format=html`, keeps the anchors attached to the line
 * they came from, and hands the plain text on to the existing line parser —
 * which stays untouched and proven.
 */

export type DocLink = { label: string; href: string };

export type DocLine = {
  /** Plain text of the line, matching what the txt export would have given. */
  text: string;
  links: DocLink[];
  /** Table cells carry the venue directory; body paragraphs carry events. */
  inTable: boolean;
};

export type VenueEntry = {
  name: string;
  /** Short form used in event lines, e.g. "HR" for Hard Rock. */
  abbreviation: string | null;
  website: string | null;
  note: string | null;
};

/* ------------------------------ html helpers ------------------------------ */

const ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  rsquo: "’", lsquo: "‘", ldquo: "“", rdquo: "”",
  ndash: "–", mdash: "—", hellip: "…", middot: "·",
};

function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, name) => ENTITIES[name.toLowerCase()] ?? m);
}

/**
 * Google rewrites every link as a tracking redirect:
 *   https://www.google.com/url?q=<real>&sa=D&source=editors&ust=…&usg=…
 * Only the `q` parameter is worth keeping.
 */
export function unwrapGoogleUrl(href: string): string {
  const decoded = decodeEntities(href);
  const m = decoded.match(/^https?:\/\/(?:www\.)?google\.com\/url\?(.+)$/i);
  if (!m) return decoded;
  const q = new URLSearchParams(m[1]).get("q");
  if (!q) return decoded;
  try {
    return decodeURIComponent(q);
  } catch {
    return q;
  }
}

function stripTags(html: string): string {
  return decodeEntities(html.replace(/<[^>]*>/g, ""))
    .replace(/ /g, " ")
    .replace(/[ \t]+/g, " ")
    .trim();
}

function anchorsIn(html: string): DocLink[] {
  const out: DocLink[] = [];
  for (const m of html.matchAll(/<a\b[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi)) {
    const href = unwrapGoogleUrl(m[1]);
    // Internal comment/bookmark anchors are not real links.
    if (!/^https?:\/\//i.test(href)) continue;
    const label = stripTags(m[2]);
    out.push({ label, href });
  }
  return out;
}

/**
 * Google splits a single linked phrase across several anchors when the text has
 * mixed formatting ("Amerant Bank" + "Arena"). Adjacent anchors sharing an href
 * are one link.
 */
function mergeAdjacent(links: DocLink[]): DocLink[] {
  const out: DocLink[] = [];
  for (const l of links) {
    const prev = out[out.length - 1];
    if (prev && prev.href === l.href) {
      prev.label = `${prev.label} ${l.label}`.replace(/\s+/g, " ").trim();
    } else {
      out.push({ ...l });
    }
  }
  return out;
}

/* -------------------------------- the parse -------------------------------- */

/** Splits the document body into block-level lines, keeping anchors per line. */
export function parseGoogleDocHtml(html: string): {
  lines: DocLine[];
  venues: VenueEntry[];
} {
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  const body = bodyMatch ? bodyMatch[1] : html;

  const lines: DocLine[] = [];

  // Every block element becomes one line. Table cells are marked so the venue
  // directory can be told apart from the event list.
  const blockRe = /<(p|li|h[1-6]|td)\b[^>]*>([\s\S]*?)<\/\1>/gi;
  for (const m of body.matchAll(blockRe)) {
    const tag = m[1].toLowerCase();
    const inner = m[2];
    let text = stripTags(inner);
    const links = mergeAdjacent(anchorsIn(inner));
    if (!text && !links.length) continue;

    // Google renders the doc's "* " event bullets as real list items, which
    // drops the marker the line parser keys on. Put it back so the plain text
    // matches what the txt export produces.
    if (tag === "li" && !/^[*•·]\s/.test(text)) text = `* ${text}`;

    lines.push({ text, links, inTable: tag === "td" });
  }

  return { lines, venues: venueDirectory(lines) };
}

/**
 * The header table lists every venue the desk works with, most linked to their
 * site, several with an abbreviation used throughout the event list
 * ("HR = Hard Rock", "CR = Culture Room").
 */
function venueDirectory(lines: DocLine[]): VenueEntry[] {
  const out: VenueEntry[] = [];
  const seen = new Set<string>();

  for (const line of lines) {
    if (!line.inTable) continue;
    let text = line.text.trim();
    if (!text || text.length > 90) continue;
    // Skip anything that reads like an event rather than a venue.
    if (/\d{1,2}\/\d{1,2}/.test(text)) continue;

    let note: string | null = null;
    // "HR = Hard Rock (No +1's)" — the parenthetical is a standing rule.
    const paren = text.match(/\(([^)]+)\)\s*$/);
    if (paren) {
      note = paren[1].trim();
      text = text.slice(0, paren.index).trim();
    }

    let abbreviation: string | null = null;
    // "CR = Culture Room"
    const eq = text.match(/^([A-Za-z]{1,5})\s*=\s*(.+)$/);
    if (eq) {
      abbreviation = eq[1].trim();
      text = eq[2].trim();
    }

    // "Improv: Dania Beach (FLL), Miami" — keep the venue, drop the branch list.
    const colon = text.match(/^([^:]{2,40}):\s*(.+)$/);
    if (colon && !/^https?/i.test(colon[1])) {
      note = note ? `${colon[2].trim()} — ${note}` : colon[2].trim();
      text = colon[1].trim();
    }

    const name = text.replace(/[.,;]+$/, "").trim();
    if (name.length < 3) continue;

    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    // Prefer a link whose label looks like this venue.
    const website =
      line.links.find((l) => l.label && name.toLowerCase().includes(l.label.toLowerCase().slice(0, 8)))
        ?.href ??
      line.links[0]?.href ??
      null;

    out.push({ name, abbreviation, website, note });
  }

  return out;
}

/** The plain text the existing line parser expects. */
export function docPlainText(lines: DocLine[]): string {
  return lines.map((l) => l.text).join("\n");
}

/* ------------------------- attaching links to events ----------------------- */

export type EventLinks = {
  event_url: string | null;
  ticket_url: string | null;
  festival_url: string | null;
  press_url: string | null;
};

const TICKET_HOSTS =
  /ticketmaster|livenation|axs|seetickets|eventbrite|dice\.fm|etix|tixr|frontgate|stubhub|vividseats|showclix|prekindle|ticketweb|seatgeek|gametime/i;
const PRESS_HINT = /press|media|credential|photo-?pass|accreditation|prrequest|pr-?request/i;
const FESTIVAL_HINT = /fest|festival|carnival|expo|weekend/i;

/**
 * Sorts a line's links into the four slots the event page shows. Anything not
 * clearly a ticket or press link becomes the official site.
 */
export function classifyLinks(
  links: DocLink[],
  ctx: { title: string; isFestival: boolean },
): EventLinks {
  const out: EventLinks = {
    event_url: null,
    ticket_url: null,
    festival_url: null,
    press_url: null,
  };

  for (const l of links) {
    const hay = `${l.href} ${l.label}`;
    if (!out.press_url && PRESS_HINT.test(hay)) {
      out.press_url = l.href;
      continue;
    }
    if (!out.ticket_url && TICKET_HOSTS.test(l.href)) {
      out.ticket_url = l.href;
      continue;
    }
    if (
      !out.festival_url &&
      (ctx.isFestival || FESTIVAL_HINT.test(ctx.title)) &&
      FESTIVAL_HINT.test(hay)
    ) {
      out.festival_url = l.href;
      continue;
    }
    if (!out.event_url) out.event_url = l.href;
  }

  // A festival whose only link is the official site should show it as the
  // festival link, which is the one people actually need.
  if (ctx.isFestival && !out.festival_url && out.event_url) {
    out.festival_url = out.event_url;
    out.event_url = null;
  }

  return out;
}

/** Normalised key for matching a parsed event back to the line it came from. */
export function lineKey(text: string): string {
  return text
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
