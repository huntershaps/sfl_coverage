import { fmtTime, cx } from "@/lib/ui";

/**
 * Event times, shown the same way everywhere.
 *
 * The doc records doors and showtime separately when it knows them, and most
 * often knows neither. Inventing a time would be worse than saying so, hence
 * the explicit "Time TBD" rather than a plausible-looking 8:00 PM.
 */

export type TimeFields = {
  start_datetime: string;
  doors_time?: string | null;
  end_time?: string | null;
  time_tbd?: number | null;
};

/** "8:00 PM", or "Time TBD" when the doc never said. */
export function showTime(ev: TimeFields): string {
  return ev.time_tbd ? "Time TBD" : fmtTime(ev.start_datetime);
}

/** Formats a bare "HH:MM" the same way as a full timestamp. */
export function clock(hhmm: string): string {
  return fmtTime(`2000-01-01T${hhmm}`);
}

/**
 * The compact form for cards and lists: the showtime, big enough to read at a
 * glance, with doors underneath only when they differ.
 */
export function EventTime({
  ev,
  size = "md",
  className,
}: {
  ev: TimeFields;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const tbd = !!ev.time_tbd;
  const sizes = {
    sm: "text-[12.5px]",
    md: "text-[14px]",
    lg: "text-[17px]",
  };

  return (
    <span className={cx("inline-flex items-baseline gap-1.5", className)}>
      <span
        className={cx(
          "tnum font-semibold",
          sizes[size],
          tbd ? "text-slate" : "text-ink",
        )}
      >
        {showTime(ev)}
      </span>
      {!tbd && ev.doors_time && (
        <span className="text-[11.5px] text-slate">
          doors {clock(ev.doors_time)}
        </span>
      )}
    </span>
  );
}

/**
 * The full breakdown for an event page: date, doors, show and end, each on its
 * own line so nobody has to parse a run-on string.
 */
export function EventTimeDetail({ ev }: { ev: TimeFields }) {
  const tbd = !!ev.time_tbd;

  return (
    <dl className="space-y-2 text-[14px]">
      {ev.doors_time && (
        <Line icon="🚪" label="Doors" value={clock(ev.doors_time)} />
      )}
      <Line
        icon="🎬"
        label={tbd ? "Showtime" : "Show"}
        value={tbd ? "Time TBD" : fmtTime(ev.start_datetime)}
        muted={tbd}
      />
      {ev.end_time && <Line icon="🏁" label="Ends" value={clock(ev.end_time)} />}
      {tbd && (
        <p className="pt-1 text-[12.5px] leading-relaxed text-slate">
          The coverage doc doesn&apos;t list a time for this one. Check the
          venue&apos;s listing, and arrive 45 minutes early if you&apos;re
          shooting.
        </p>
      )}
    </dl>
  );
}

function Line({
  icon,
  label,
  value,
  muted,
}: {
  icon: string;
  label: string;
  value: string;
  muted?: boolean;
}) {
  return (
    <div className="flex items-baseline gap-2">
      <span aria-hidden className="w-5 shrink-0 text-[13px]">
        {icon}
      </span>
      <dt className="w-14 shrink-0 text-[12.5px] text-slate">{label}</dt>
      <dd className={cx("tnum font-semibold", muted ? "text-slate" : "text-ink")}>
        {value}
      </dd>
    </div>
  );
}
