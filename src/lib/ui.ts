import type { EventStatus, RequestStatus, EventCategory } from "./constants";

/* ----------------------------- category tokens ----------------------------
 * Each category carries a hue (for dots and meters), a pill class for badges,
 * and three pastel stops used to generate artwork when an event has no poster.
 * Pills follow the house rule: soft tinted fill, darker text, hairline ring.
 * -------------------------------------------------------------------------- */

type Tone = {
  hue: string;
  chip: string;
  ring: string;
  tile: string;
  mesh: [string, string, string];
};

const CATEGORY_TONES: Record<string, Tone> = {
  Concert: {
    hue: "#ff6b6b",
    chip: "bg-coral-50 text-coral-700 ring-coral-200",
    ring: "ring-coral-200",
    tile: "bg-coral-50 text-coral-700",
    mesh: ["#ffd0d0", "#ffe4c4", "#d9ecff"],
  },
  "Music Festival": {
    hue: "#8b5cf6",
    chip: "bg-violet-50 text-violet-700 ring-violet-200",
    ring: "ring-violet-200",
    tile: "bg-violet-50 text-violet-700",
    mesh: ["#ddd3ff", "#c9f2e7", "#ffd7ea"],
  },
  "Sporting Event": {
    hue: "#00c9a7",
    chip: "bg-teal-50 text-teal-700 ring-teal-200",
    ring: "ring-teal-200",
    tile: "bg-teal-50 text-teal-600",
    mesh: ["#c2f3e8", "#cfe8ff", "#d8f5c8"],
  },
  Theater: {
    hue: "#f59e0b",
    chip: "bg-amber-50 text-amber-700 ring-amber-200",
    ring: "ring-amber-200",
    tile: "bg-amber-50 text-amber-700",
    mesh: ["#ffe6b8", "#ffd6d6", "#e2d6ff"],
  },
  Comedy: {
    hue: "#ffc107",
    chip: "bg-sunshine-50 text-sunshine-700 ring-sunshine-200",
    ring: "ring-sunshine-200",
    tile: "bg-sunshine-50 text-sunshine-600",
    mesh: ["#ffeeb0", "#ffd9c0", "#d7e9ff"],
  },
  Nightlife: {
    hue: "#a855f7",
    chip: "bg-purple-50 text-purple-700 ring-purple-200",
    ring: "ring-purple-200",
    tile: "bg-purple-50 text-purple-600",
    mesh: ["#e6d4ff", "#ffd2ec", "#c8e6ff"],
  },
  "Restaurant Event": {
    hue: "#fb7185",
    chip: "bg-rose-50 text-rose-700 ring-rose-200",
    ring: "ring-rose-200",
    tile: "bg-rose-50 text-rose-600",
    mesh: ["#ffd6dd", "#ffe8c9", "#d5f0e8"],
  },
  "Food & Drink": {
    hue: "#f97316",
    chip: "bg-orange-50 text-orange-700 ring-orange-200",
    ring: "ring-orange-200",
    tile: "bg-orange-50 text-orange-700",
    mesh: ["#ffdfc2", "#ffeeb5", "#d3efe2"],
  },
  "Grand Opening": {
    hue: "#14b8a6",
    chip: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    ring: "ring-emerald-200",
    tile: "bg-emerald-50 text-emerald-700",
    mesh: ["#c6f1e4", "#fff0bd", "#d5e6ff"],
  },
  "Community Event": {
    hue: "#0ea5e9",
    chip: "bg-sky-50 text-sky-700 ring-sky-200",
    ring: "ring-sky-200",
    tile: "bg-sky-50 text-sky-700",
    mesh: ["#cbe9ff", "#c9f2e7", "#e0dcff"],
  },
  "Arts & Culture": {
    hue: "#ec4899",
    chip: "bg-pink-50 text-pink-700 ring-pink-200",
    ring: "ring-pink-200",
    tile: "bg-pink-50 text-pink-700",
    mesh: ["#ffd4e8", "#e2d6ff", "#ffe7bf"],
  },
  Fashion: {
    hue: "#d946ef",
    chip: "bg-fuchsia-50 text-fuchsia-700 ring-fuchsia-200",
    ring: "ring-fuchsia-200",
    tile: "bg-fuchsia-50 text-fuchsia-600",
    mesh: ["#f6d3ff", "#ffd6e5", "#d5e4ff"],
  },
  "Celebrity Appearance": {
    hue: "#facc15",
    chip: "bg-yellow-50 text-yellow-700 ring-yellow-200",
    ring: "ring-yellow-200",
    tile: "bg-yellow-50 text-yellow-600",
    mesh: ["#fff0b3", "#ffd9d9", "#dfd4ff"],
  },
  Conference: {
    hue: "#64748b",
    chip: "bg-slate-100 text-slate-700 ring-slate-200",
    ring: "ring-slate-200",
    tile: "bg-slate-100 text-slate-600",
    mesh: ["#dbe3ef", "#cfe6f7", "#d8f0e8"],
  },
  "Family Event": {
    hue: "#16a34a",
    chip: "bg-green-50 text-green-700 ring-green-200",
    ring: "ring-green-200",
    tile: "bg-green-50 text-green-700",
    mesh: ["#cdf0d3", "#fff1b8", "#cfe8ff"],
  },
  Other: {
    hue: "#94a3b8",
    chip: "bg-slate-100 text-slate-600 ring-slate-200",
    ring: "ring-slate-200",
    tile: "bg-slate-100 text-slate-500",
    mesh: ["#e2e8f2", "#dfeaf6", "#e6e2f5"],
  },
};

export function categoryTone(cat: string): Tone {
  return CATEGORY_TONES[cat] ?? CATEGORY_TONES.Other;
}

/**
 * Deterministic artwork for events with no supplied poster: the category picks
 * the palette, the title picks the angles, so the same event always renders the
 * same card and a grid never looks like a wall of grey placeholders.
 */
export function posterStyle(
  title: string,
  category: EventCategory | string,
): React.CSSProperties {
  const tone = categoryTone(category);
  let h = 0;
  for (let i = 0; i < title.length; i++) h = (h * 31 + title.charCodeAt(i)) >>> 0;
  const rot = h % 360;
  const shift = (h >> 8) % 3;
  const m = tone.mesh;
  const pick = (i: number) => m[(i + shift) % 3];
  return {
    "--mesh-a": pick(0),
    "--mesh-b": pick(1),
    "--mesh-c": pick(2),
    backgroundPosition: `${rot % 40}% ${(rot >> 2) % 40}%`,
  } as React.CSSProperties;
}

/* ------------------------------ status tokens -----------------------------
 * Badge colours follow the house scheme: amber for waiting, coral for needing
 * coverage, green for open, sky for informational.
 * -------------------------------------------------------------------------- */

export const EVENT_STATUS_TONE: Record<EventStatus, string> = {
  draft: "bg-slate-100 text-slate-600 ring-slate-200",
  upcoming: "bg-sky-50 text-sky-700 ring-sky-200",
  open: "bg-green-50 text-green-700 ring-green-200",
  requests_pending: "bg-amber-50 text-amber-700 ring-amber-200",
  assigned: "bg-brand-50 text-brand-700 ring-brand-200",
  full: "bg-slate-100 text-slate-600 ring-slate-200",
  cancelled: "bg-red-50 text-red-700 ring-red-200",
  postponed: "bg-orange-50 text-orange-700 ring-orange-200",
  archived: "bg-slate-100 text-slate-500 ring-slate-200",
};

export const REQUEST_STATUS_TONE: Record<RequestStatus, string> = {
  pending: "bg-amber-50 text-amber-700 ring-amber-200",
  under_review: "bg-sky-50 text-sky-700 ring-sky-200",
  approved: "bg-green-50 text-green-700 ring-green-200",
  rejected: "bg-slate-100 text-slate-600 ring-slate-200",
  waitlisted: "bg-violet-50 text-violet-700 ring-violet-200",
  withdrawn: "bg-slate-100 text-slate-500 ring-slate-200",
  cancelled: "bg-slate-100 text-slate-500 ring-slate-200",
};

export const ROLE_TONE: Record<string, string> = {
  super_admin: "bg-coral-50 text-coral-700 ring-coral-200",
  admin: "bg-brand-50 text-brand-700 ring-brand-200",
  contributor: "bg-slate-100 text-slate-600 ring-slate-200",
};

/** Soft tinted tile behind a metric or section icon. */
export const TILE_TONE = {
  brand: "bg-brand-50 text-brand-500",
  teal: "bg-teal-50 text-teal-600",
  coral: "bg-coral-50 text-coral-700",
  sunshine: "bg-sunshine-50 text-sunshine-700",
  sky: "bg-sky-50 text-sky-700",
  violet: "bg-violet-50 text-violet-700",
  slate: "bg-slate-100 text-slate-500",
  green: "bg-green-50 text-green-700",
} as const;

export type TileTone = keyof typeof TILE_TONE;

/* -------------------------------- date fmt -------------------------------- */

const MONTHS_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const DAYS_SHORT = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const DAYS_LONG = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];

/**
 * Event datetimes are stored as wall-clock strings ("2026-09-13T19:00") in
 * South Florida local time. Parsing them with `new Date(str)` would apply the
 * viewer's timezone and slide dates across midnight, so they are split by hand.
 */
export function parseLocal(dt: string): Date {
  const [d, t] = dt.split("T");
  const [y, m, day] = d.split("-").map(Number);
  const [hh, mm] = (t ?? "00:00").split(":").map(Number);
  return new Date(y, (m ?? 1) - 1, day ?? 1, hh ?? 0, mm ?? 0);
}

export function fmtDate(dt: string, style: "short" | "long" | "full" = "short") {
  const d = parseLocal(dt);
  if (style === "full")
    return `${DAYS_LONG[d.getDay()]}, ${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
  if (style === "long")
    return `${DAYS_SHORT[d.getDay()]}, ${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}`;
  return `${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}`;
}

export function fmtTime(dt: string, timeTbd?: number | boolean) {
  if (timeTbd) return "Time TBD";
  const d = parseLocal(dt);
  let h = d.getHours();
  const m = d.getMinutes();
  const mer = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return m ? `${h}:${String(m).padStart(2, "0")} ${mer}` : `${h} ${mer}`;
}

export function dayParts(dt: string) {
  const d = parseLocal(dt);
  return {
    dow: DAYS_SHORT[d.getDay()],
    mon: MONTHS_SHORT[d.getMonth()].toUpperCase(),
    day: d.getDate(),
    year: d.getFullYear(),
  };
}

export function relativeDay(dt: string): string | null {
  const d = parseLocal(dt);
  const now = new Date();
  const a = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const b = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diff = Math.round((a.getTime() - b.getTime()) / 864e5);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  if (diff > 1 && diff < 7) return `In ${diff} days`;
  if (diff < 0) return null;
  return null;
}

export function fmtAgo(iso: string): string {
  const then = new Date(iso.includes("T") ? iso : iso.replace(" ", "T") + "Z");
  const secs = Math.max(0, (Date.now() - then.getTime()) / 1000);
  if (secs < 60) return "just now";
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  if (secs < 604800) return `${Math.floor(secs / 86400)}d ago`;
  return then.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function greeting(d = new Date()): string {
  const h = d.getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}
