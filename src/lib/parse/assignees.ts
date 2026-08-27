/**
 * Turns the coverage doc's assignment shorthand into structured coverage.
 *
 * The doc's legend defines it:
 *
 *   Confirmed requests = (name)
 *   Shows that Scott will be attending, but will need a reporter = *
 *
 * So a parenthetical is *existing confirmed coverage*, not a request awaiting a
 * decision — the distinction Phase 2 asks the app to make. Real examples:
 *
 *   (Reporter: Charity)
 *   (Reporter: Charity +3)
 *   (Photo/Reporter: Sebastian +1; Backup: Gleb)
 *   (Photo/Reporter: Charity; Backup - Piper +1)
 */

import type { CoverageType } from "../constants";

export type DetectedAssignee = {
  /** The name as written in the doc — matched to an account separately. */
  name: string;
  coverageTypes: CoverageType[];
  guests: number;
  /** Backups are recorded but not assigned; they are the fallback list. */
  isBackup: boolean;
  /** The label as written, e.g. "Photo/Reporter". */
  rawRole: string | null;
};

/** Role words in the doc mapped onto the app's coverage types. */
const ROLE_WORDS: [RegExp, CoverageType][] = [
  [/\bphoto(?:grapher|graphy|s)?\b/i, "photography"],
  [/\bvideo(?:grapher|graphy)?\b/i, "video"],
  [/\breporter\b/i, "article"],
  [/\breview(?:er)?\b/i, "article"],
  [/\bwrit(?:er|ing)\b/i, "article"],
  [/\binterview(?:s|er)?\b/i, "interview"],
  [/\bsocial\b/i, "social"],
];

const BACKUP_RE = /\bback-?up\b/i;

function rolesFrom(label: string): CoverageType[] {
  const out: CoverageType[] = [];
  for (const [re, type] of ROLE_WORDS) {
    if (re.test(label) && !out.includes(type)) out.push(type);
  }
  return out;
}

/** True when a fragment is made only of role words — a label, not a person. */
function isOnlyRoleWords(fragment: string): boolean {
  let s = fragment;
  for (const [re] of ROLE_WORDS) s = s.replace(new RegExp(re.source, "gi"), "");
  s = s.replace(/\bback-?up\b/gi, "").replace(/[^A-Za-z]/g, "");
  return s.length === 0;
}

/** A label only introduces people when it names a role or marks a backup. */
function isRoleLabel(label: string): boolean {
  return rolesFrom(label).length > 0 || BACKUP_RE.test(label);
}

/** Words that appear inside parentheses but are not people. */
const NOT_A_NAME =
  /^(tbd|tba|n\/?a|none|open|no\s|pending|maybe|tribute|cover band|experience|premier|free|sold out|cancell?ed|postponed|\d)/i;

/**
 * Splits one person entry: "Charity +3", "Sebastian+1", or just "Gleb".
 * Returns null when the fragment is not plausibly a person's name.
 */
function parsePerson(
  fragment: string,
  roles: CoverageType[],
  isBackup: boolean,
  rawRole: string | null,
): DetectedAssignee | null {
  let text = fragment.trim().replace(/^[,;&]+|[,;.&]+$/g, "").trim();
  if (!text) return null;

  let guests = 0;
  const plus = text.match(/\+\s*(\d+)\s*$/);
  if (plus) {
    guests = parseInt(plus[1], 10);
    text = text.slice(0, plus.index).trim();
  }

  const name = text.replace(/\s+/g, " ").trim();
  if (!name || name.length < 2 || name.length > 40) return null;
  if (NOT_A_NAME.test(name)) return null;
  // Must read like a name, not a sentence or a leftover label.
  if (!/^[A-Za-z][A-Za-z'’.\- ]*$/.test(name)) return null;
  if (name.split(/\s+/).length > 3) return null;
  if (isOnlyRoleWords(name)) return null;

  return {
    name,
    coverageTypes: roles.length ? roles : ["other"],
    guests,
    isBackup,
    rawRole,
  };
}

/**
 * Parses the inside of an assignment parenthetical into people.
 *
 * Segments are separated by ";" and each may carry its own role label, using
 * either a colon or a dash — the doc uses both, with inconsistent spacing.
 */
export function parseAssignees(inner: string | null | undefined): DetectedAssignee[] {
  if (!inner) return [];
  const out: DetectedAssignee[] = [];

  for (const segment of inner.split(/;/)) {
    const seg = segment.trim();
    if (!seg) continue;

    let label: string | null = null;
    let people = seg;

    // Splitting on a dash is only safe once the left side is confirmed to be a
    // role word, otherwise a hyphenated name would be torn in half.
    const sep = seg.match(/^([^:]{1,40}?)\s*(?::|[-–—])\s*(.+)$/);
    if (sep && isRoleLabel(sep[1])) {
      label = sep[1].trim();
      people = sep[2].trim();
    } else {
      const colon = seg.indexOf(":");
      if (colon > 0 && colon < 40) {
        label = seg.slice(0, colon).trim();
        people = seg.slice(colon + 1).trim();
      }
    }

    const isBackup = BACKUP_RE.test(label ?? "") || BACKUP_RE.test(seg);
    const roles = rolesFrom(label ?? "");

    // One segment can name several people: "Charity and Gleb", "Charity, Gleb".
    for (const frag of people.split(/\s*(?:,|\band\b|&|\/)\s*/i)) {
      if (isOnlyRoleWords(frag)) continue;
      const person = parsePerson(frag, roles, isBackup, label);
      if (person) out.push(person);
    }
  }

  // The same person named twice in one line is one assignment.
  const seen = new Map<string, DetectedAssignee>();
  for (const a of out) {
    const key = `${a.name.toLowerCase()}|${a.isBackup}`;
    const prev = seen.get(key);
    if (!prev) {
      seen.set(key, a);
      continue;
    }
    prev.guests = Math.max(prev.guests, a.guests);
    for (const t of a.coverageTypes)
      if (!prev.coverageTypes.includes(t)) prev.coverageTypes.push(t);
  }

  return [...seen.values()];
}

/** Every distinct person named across a set of parsed events. */
export function uniqueNames(all: DetectedAssignee[][]): string[] {
  const set = new Set<string>();
  for (const list of all) for (const a of list) set.add(a.name);
  return [...set].sort((a, b) => a.localeCompare(b));
}
