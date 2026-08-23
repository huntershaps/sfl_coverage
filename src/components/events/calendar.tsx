"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { categoryTone, cx, fmtTime, parseLocal } from "@/lib/ui";
import { IconChevron, EmptyState, IconCalendar } from "@/components/ui";

export type CalendarEvent = {
  id: number;
  title: string;
  category: string;
  start_datetime: string;
  multi_day_end: string | null;
  time_tbd: number;
  venue: string | null;
  city: string | null;
  status: string;
  approved_count: number;
  myRequestStatus: string | null;
  myAssignmentId: number | null;
};

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const isoDay = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/**
 * Month grid on desktop, agenda list on mobile — a 7-column grid is unusable
 * on a phone, so small screens get a scrollable day-by-day view instead.
 */
export function EventCalendar({
  events,
  initialMonth,
}: {
  events: CalendarEvent[];
  initialMonth?: string;
}) {
  // The month the current result set starts in. Filtering changes this, and the
  // grid has to follow — otherwise picking "Next week" leaves you looking at a
  // month with nothing in it and the filter appears to have done nothing.
  const anchor =
    initialMonth ??
    (events.length ? events[0].start_datetime.slice(0, 7) : null);

  const monthStart = (ym: string | null) => {
    if (!ym) {
      const n = new Date();
      return new Date(n.getFullYear(), n.getMonth(), 1);
    }
    const [y, m] = ym.split("-").map(Number);
    return new Date(y, m - 1, 1);
  };

  const [cursor, setCursor] = useState(() => monthStart(anchor));
  const [seenAnchor, setSeenAnchor] = useState(anchor);
  const [selected, setSelected] = useState<string | null>(null);

  // Jump to the new range when the results move, but leave the cursor alone
  // while the reader is paging through months by hand.
  if (anchor !== seenAnchor) {
    setSeenAnchor(anchor);
    setCursor(monthStart(anchor));
    setSelected(null);
  }

  // Multi-day runs occupy every day they span, so a festival shows across the week.
  const byDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const ev of events) {
      const start = parseLocal(ev.start_datetime);
      const end = ev.multi_day_end
        ? parseLocal(`${ev.multi_day_end}T00:00`)
        : start;
      const cur = new Date(start.getFullYear(), start.getMonth(), start.getDate());
      let guard = 0;
      while (cur <= end && guard++ < 120) {
        const key = isoDay(cur);
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(ev);
        cur.setDate(cur.getDate() + 1);
      }
    }
    return map;
  }, [events]);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayKey = isoDay(new Date());

  const cells: (Date | null)[] = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
  while (cells.length % 7 !== 0) cells.push(null);

  const monthEvents = events
    .filter((e) => {
      const s = parseLocal(e.start_datetime);
      const end = e.multi_day_end ? parseLocal(`${e.multi_day_end}T00:00`) : s;
      return (
        (s.getFullYear() === year && s.getMonth() === month) ||
        (end.getFullYear() === year && end.getMonth() === month) ||
        (s < new Date(year, month, 1) && end > new Date(year, month + 1, 0))
      );
    })
    .sort((a, b) => a.start_datetime.localeCompare(b.start_datetime));

  return (
    <div>
      {/* Month header */}
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-[20px] sm:text-[24px] text-ink">
          {MONTHS[month]} <span className="text-slate">{year}</span>
        </h2>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setCursor(new Date(year, month - 1, 1))}
            className="grid size-9 place-items-center rounded-xl text-body transition-colors hover:bg-canvas hover:text-ink"
            aria-label="Previous month"
          >
            <IconChevron size={16} className="rotate-180" />
          </button>
          <button
            onClick={() => {
              const n = new Date();
              setCursor(new Date(n.getFullYear(), n.getMonth(), 1));
            }}
            className="rounded-xl px-3 py-1.5 text-[13px] font-medium text-body transition-colors hover:bg-canvas hover:text-ink"
          >
            Today
          </button>
          <button
            onClick={() => setCursor(new Date(year, month + 1, 1))}
            className="grid size-9 place-items-center rounded-xl text-body transition-colors hover:bg-canvas hover:text-ink"
            aria-label="Next month"
          >
            <IconChevron size={16} />
          </button>
        </div>
      </div>

      {/* ---------- desktop month grid ---------- */}
      <div className="hidden md:block surface overflow-hidden">
        <div className="grid grid-cols-7 border-b border-line">
          {DOW.map((d) => (
            <div
              key={d}
              className="px-2 py-2.5 text-center text-[12px] font-semibold uppercase tracking-[0.1em] text-slate"
            >
              {d}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7">
          {cells.map((date, i) => {
            const key = date ? isoDay(date) : `empty-${i}`;
            const dayEvents = date ? (byDay.get(isoDay(date)) ?? []) : [];
            const isToday = date && isoDay(date) === todayKey;
            const isWeekend = date && (date.getDay() === 0 || date.getDay() === 6);

            return (
              <div
                key={key}
                className={cx(
                  "min-h-[112px] border-b border-r border-line bg-card p-1.5 last-in-row:border-r-0",
                  !date && "bg-sunken/60",
                  isWeekend && date && "bg-canvas/70",
                )}
              >
                {date && (
                  <>
                    <div className="mb-1 flex items-center justify-between px-0.5">
                      <span
                        className={cx(
                          "tnum grid size-6 place-items-center rounded-full text-[12px]",
                          isToday
                            ? "bg-coral-600 font-bold text-white shadow-sm"
                            : "font-medium text-body",
                        )}
                      >
                        {date.getDate()}
                      </span>
                      {dayEvents.length > 3 && (
                        <span className="text-[11px] font-semibold text-slate">
                          {dayEvents.length}
                        </span>
                      )}
                    </div>

                    <div className="space-y-1">
                      {dayEvents.slice(0, 3).map((ev) => (
                        <DayChip key={`${ev.id}-${key}`} ev={ev} />
                      ))}
                      {dayEvents.length > 3 && (
                        <button
                          onClick={() => setSelected(isoDay(date))}
                          className="w-full rounded-md px-1.5 py-0.5 text-left text-[11.5px] font-medium text-slate transition-colors hover:bg-canvas hover:text-body"
                        >
                          +{dayEvents.length - 3} more
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ---------- mobile agenda ---------- */}
      <div className="md:hidden">
        {monthEvents.length === 0 ? (
          <EmptyState
            icon={<IconCalendar />}
            title={`Nothing scheduled in ${MONTHS[month]}`}
            body="Try another month, or clear your filters to see everything on the board."
          />
        ) : (
          <ul className="space-y-2">
            {monthEvents.map((ev) => {
              const d = parseLocal(ev.start_datetime);
              return (
                <li key={ev.id}>
                  <Link
                    href={`/events/${ev.id}`}
                    className="surface flex gap-3 p-3 transition-colors active:bg-canvas"
                  >
                    <div className="flex w-11 shrink-0 flex-col items-center justify-center rounded-lg bg-canvas py-1.5">
                      <span className="text-[11px] font-bold uppercase text-brand-700">
                        {DOW[d.getDay()]}
                      </span>
                      <span className="tnum text-[18px] font-bold leading-none text-ink">
                        {d.getDate()}
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span
                          className="size-2 shrink-0 rounded-full"
                          style={{ background: categoryTone(ev.category).hue }}
                          aria-hidden
                        />
                        <span className="truncate text-[12.5px] text-slate">
                          {ev.category}
                        </span>
                      </div>
                      <p className="mt-0.5 line-clamp-2 text-[14px] font-semibold leading-snug text-ink">
                        {ev.title}
                      </p>
                      <p className="mt-0.5 truncate text-[12px] text-slate">
                        <span className="tnum">
                          {fmtTime(ev.start_datetime, ev.time_tbd)}
                        </span>
                        {ev.venue && ` · ${ev.venue}`}
                      </p>
                      <StateLine ev={ev} />
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Day detail sheet */}
      {selected && (
        <DaySheet
          dayKey={selected}
          events={byDay.get(selected) ?? []}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}

function DayChip({ ev }: { ev: CalendarEvent }) {
  const tone = categoryTone(ev.category);
  const mine = !!ev.myAssignmentId;
  const requested = !!ev.myRequestStatus && !mine;

  return (
    <Link
      href={`/events/${ev.id}`}
      title={`${ev.title}${ev.venue ? ` — ${ev.venue}` : ""}`}
      className={cx(
        "group block truncate rounded-md border px-1.5 py-1 text-[12px] leading-tight transition-all",
        mine
          ? "border-teal-200 bg-teal-50 font-semibold text-teal-700 hover:bg-teal-100"
          : requested
            ? "border-amber-200 bg-amber-50 font-semibold text-amber-700 hover:bg-amber-100"
            : "border-line bg-canvas text-body hover:border-brand-200 hover:bg-brand-50 hover:text-brand-700",
      )}
    >
      <span className="flex items-center gap-1.5">
        <span
          className="size-1.5 shrink-0 rounded-full"
          style={{ background: tone.hue }}
          aria-hidden
        />
        <span className="truncate font-medium">{ev.title}</span>
      </span>
    </Link>
  );
}

function StateLine({ ev }: { ev: CalendarEvent }) {
  if (ev.myAssignmentId)
    return (
      <p className="mt-1 text-[12.5px] font-semibold text-teal-700">
        You&apos;re covering this
      </p>
    );
  if (ev.myRequestStatus)
    return (
      <p className="mt-1 text-[12.5px] font-semibold text-amber-700">
        Request {ev.myRequestStatus.replace("_", " ")}
      </p>
    );
  return null;
}

function DaySheet({
  dayKey,
  events,
  onClose,
}: {
  dayKey: string;
  events: CalendarEvent[];
  onClose: () => void;
}) {
  const d = parseLocal(`${dayKey}T00:00`);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-[fade_0.18s_ease]">
      <button
        className="absolute inset-0 bg-ink/40 backdrop-blur-sm"
        onClick={onClose}
        aria-label="Close"
      />
      <div className="surface-raised relative max-h-[80vh] w-full max-w-md overflow-hidden">
        <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <h3 className="text-[16px] text-ink">
            {DOW[d.getDay()]}, {MONTHS[d.getMonth()]} {d.getDate()}
          </h3>
          <button
            onClick={onClose}
            className="grid size-8 place-items-center rounded-lg text-slate hover:bg-canvas hover:text-ink"
            aria-label="Close"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden>
              <path d="M6 6l12 12M18 6 6 18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <ul className="max-h-[60vh] overflow-y-auto p-3">
          {events.map((ev) => (
            <li key={ev.id}>
              <Link
                href={`/events/${ev.id}`}
                onClick={onClose}
                className="block rounded-xl p-2.5 transition-colors hover:bg-canvas"
              >
                <div className="flex items-center gap-1.5">
                  <span
                    className="size-2 rounded-full"
                    style={{ background: categoryTone(ev.category).hue }}
                    aria-hidden
                  />
                  <span className="text-[12.5px] text-slate">{ev.category}</span>
                </div>
                <p className="mt-0.5 text-[14px] font-semibold text-ink">{ev.title}</p>
                <p className="mt-0.5 text-[12px] text-slate">
                  <span className="tnum">{fmtTime(ev.start_datetime, ev.time_tbd)}</span>
                  {ev.venue && ` · ${ev.venue}`}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
