import Link from "next/link";
import type { EventWithCoverage } from "@/lib/events";
import {
  CategoryBadge,
  CoverageMeter,
  EventStatusBadge,
  MyStateBadge,
} from "./badges";
import { IconPin, IconClock } from "@/components/ui";
import { posterStyle, dayParts, fmtTime, relativeDay, cx, fmtDate } from "@/lib/ui";
import { EventTime } from "./event-time";
import type { EventStatus } from "@/lib/constants";

type CardEvent = EventWithCoverage & { limit?: number | null };

/* ------------------------------- grid card -------------------------------- */

export function EventCard({
  ev,
  limit,
  priority,
}: {
  ev: CardEvent;
  limit?: number | null;
  priority?: boolean;
}) {
  const d = dayParts(ev.start_datetime);
  const rel = relativeDay(ev.start_datetime);
  const cap = limit === undefined ? ev.coverage_limit : limit;
  const dimmed = ev.status === "cancelled" || ev.status === "archived";

  return (
    <Link
      href={`/events/${ev.id}`}
      className={cx(
        "group surface-raised flex flex-col overflow-hidden transition-all duration-200",
        "hover:-translate-y-0.5 hover:border-line-strong hover:shadow-[0_24px_50px_-28px_rgba(0,0,0,0.95)]",
        dimmed && "opacity-65",
      )}
    >
      {/* Artwork */}
      <div className="relative aspect-[16/10] overflow-hidden">
        {ev.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={ev.image_url}
            alt=""
            loading={priority ? "eager" : "lazy"}
            className="size-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
          />
        ) : (
          <div
            className="poster-mesh size-full transition-transform duration-500 group-hover:scale-[1.04]"
            style={posterStyle(ev.title, ev.category)}
            aria-hidden
          />
        )}
        <div
          className={cx(
            "absolute inset-0",
            ev.image_url
              ? "bg-gradient-to-t from-ink/65 via-ink/10 to-transparent"
              : "bg-gradient-to-t from-white/60 via-transparent to-transparent",
          )}
        />

        {/* Date chip */}
        <div className="absolute left-3 top-3 rounded-xl bg-card px-2.5 py-1.5 text-center shadow-sm ring-1 ring-inset ring-line">
          <div className="text-[11px] font-bold uppercase tracking-[0.1em] text-coral-600">
            {d.mon}
          </div>
          <div className="tnum text-[19px] font-bold leading-none text-ink">
            {d.day}
          </div>
          {ev.multi_day_end && (
            <div className="mt-0.5 text-[11px] leading-none text-slate">
              thru {fmtDate(ev.multi_day_end)}
            </div>
          )}
        </div>

        <div className="absolute right-3 top-3">
          <CategoryBadge category={ev.category} />
        </div>

        {rel && (
          <div className="absolute bottom-3 left-3">
            <span className="rounded-full bg-coral-600 px-2.5 py-1 text-[12px] font-bold text-white shadow-sm">
              {rel}
            </span>
          </div>
        )}
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col p-4">
        <h3 className="line-clamp-2 text-[16.5px] leading-tight text-ink text-balance">
          {ev.title}
        </h3>
        {ev.subtitle && (
          <p className="mt-1 line-clamp-1 text-[12.5px] text-slate">{ev.subtitle}</p>
        )}

        <div className="mt-2.5 space-y-1 text-[12.5px] text-body">
          {ev.venue && (
            <p className="flex items-start gap-1.5">
              <IconPin size={14} className="mt-px shrink-0 text-slate" />
              <span className="line-clamp-1">
                {ev.venue}
                {ev.city && <span className="text-slate"> · {ev.city}</span>}
              </span>
            </p>
          )}
          <p className="flex items-center gap-1.5">
            <IconClock size={14} className="shrink-0 text-slate" />
            <EventTime ev={ev} size="sm" />
          </p>
        </div>

        <div className="mt-auto flex items-center justify-between gap-2 pt-3.5">
          <CoverageMeter approved={ev.approved_count} limit={cap ?? null} />
          <div className="flex items-center gap-1.5">
            <MyStateBadge
              requestStatus={ev.myRequestStatus}
              assigned={!!ev.myAssignmentId}
            />
            {!ev.myAssignmentId && !ev.myRequestStatus && (
              <EventStatusBadge status={ev.status as EventStatus} />
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}

/* -------------------------------- list row -------------------------------- */

export function EventRow({ ev, limit }: { ev: CardEvent; limit?: number | null }) {
  const d = dayParts(ev.start_datetime);
  const cap = limit === undefined ? ev.coverage_limit : limit;
  const dimmed = ev.status === "cancelled" || ev.status === "archived";

  return (
    <Link
      href={`/events/${ev.id}`}
      className={cx(
        "group flex gap-3 sm:gap-4 rounded-2xl p-2.5 sm:p-3 transition-colors hover:bg-canvas",
        dimmed && "opacity-65",
      )}
    >
      {/* Date rail */}
      <div className="flex w-[52px] shrink-0 flex-col items-center justify-center rounded-xl bg-canvas py-2 ring-1 ring-inset ring-line">
        <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-brand-700">
          {d.mon}
        </span>
        <span className="tnum text-[20px] font-bold leading-none text-ink">
          {d.day}
        </span>
        <span className="mt-0.5 text-[11px] text-slate">{d.dow}</span>
      </div>

      {/* Thumb — hidden on the narrowest screens to keep the row readable */}
      <div className="relative hidden sm:block size-[68px] shrink-0 overflow-hidden rounded-xl">
        {ev.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={ev.image_url} alt="" loading="lazy" className="size-full object-cover" />
        ) : (
          <div
            className="poster-mesh size-full"
            style={posterStyle(ev.title, ev.category)}
            aria-hidden
          />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <CategoryBadge category={ev.category} />
          <MyStateBadge
            requestStatus={ev.myRequestStatus}
            assigned={!!ev.myAssignmentId}
          />
          {!ev.myAssignmentId && !ev.myRequestStatus && (
            <EventStatusBadge status={ev.status as EventStatus} />
          )}
        </div>

        <h3 className="mt-1.5 line-clamp-1 text-[15.5px] font-semibold text-ink group-hover:text-brand-600 transition-colors">
          {ev.title}
        </h3>

        <p className="mt-0.5 line-clamp-1 text-[12.5px] text-slate">
          <EventTime ev={ev} size="sm" />
          {ev.venue && ` · ${ev.venue}`}
          {ev.city && ` · ${ev.city}`}
        </p>
      </div>

      <div className="hidden shrink-0 items-center sm:flex">
        <CoverageMeter approved={ev.approved_count} limit={cap ?? null} />
      </div>
    </Link>
  );
}

/* ------------------------------ compact card ------------------------------ */
/** Used on dashboards where space is tight but artwork still helps. */
export function MiniEventCard({
  ev,
  footer,
}: {
  ev: {
    id: number;
    title: string;
    category: string;
    start_datetime: string;
    time_tbd?: number;
    venue: string | null;
    city: string | null;
    image_url?: string | null;
  };
  footer?: React.ReactNode;
}) {
  const d = dayParts(ev.start_datetime);
  return (
    <Link
      href={`/events/${ev.id}`}
      className="group surface flex items-center gap-3 p-2.5 transition-colors hover:border-line-strong hover:bg-canvas"
    >
      <div className="relative size-14 shrink-0 overflow-hidden rounded-xl">
        {ev.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={ev.image_url} alt="" loading="lazy" className="size-full object-cover" />
        ) : (
          <div
            className="poster-mesh size-full"
            style={posterStyle(ev.title, ev.category)}
            aria-hidden
          />
        )}
        <div className="absolute inset-x-0 bottom-0 bg-ink/60 py-0.5 text-center text-[11px] font-bold tracking-wide text-ink backdrop-blur-sm">
          {d.mon} {d.day}
        </div>
      </div>

      <div className="min-w-0 flex-1">
        <h4 className="line-clamp-1 text-[14px] font-semibold text-ink group-hover:text-brand-600 transition-colors">
          {ev.title}
        </h4>
        <p className="mt-0.5 line-clamp-1 text-[12px] text-slate">
          <EventTime ev={ev} size="sm" />
          {ev.venue && ` · ${ev.venue}`}
        </p>
        {footer && <div className="mt-1.5">{footer}</div>}
      </div>
    </Link>
  );
}
