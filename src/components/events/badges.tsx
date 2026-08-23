import { Badge } from "@/components/ui";
import {
  EVENT_STATUS_LABEL,
  REQUEST_STATUS_LABEL,
  COVERAGE_TYPE_LABEL,
  type EventStatus,
  type RequestStatus,
} from "@/lib/constants";
import {
  EVENT_STATUS_TONE,
  REQUEST_STATUS_TONE,
  categoryTone,
  cx,
} from "@/lib/ui";

export function CategoryBadge({
  category,
  className,
}: {
  category: string;
  className?: string;
}) {
  return (
    <Badge tone={categoryTone(category).chip} className={className}>
      {category}
    </Badge>
  );
}

export function EventStatusBadge({
  status,
  className,
}: {
  status: EventStatus;
  className?: string;
}) {
  return (
    <Badge tone={EVENT_STATUS_TONE[status]} className={className} dot>
      {EVENT_STATUS_LABEL[status]}
    </Badge>
  );
}

export function RequestStatusBadge({
  status,
  className,
}: {
  status: RequestStatus;
  className?: string;
}) {
  return (
    <Badge tone={REQUEST_STATUS_TONE[status]} className={className} dot>
      {REQUEST_STATUS_LABEL[status]}
    </Badge>
  );
}

export function CoverageTypeBadge({
  type,
  className,
}: {
  type: string;
  className?: string;
}) {
  return (
    <Badge tone="bg-canvas text-body ring-line" className={className}>
      {COVERAGE_TYPE_LABEL[type as keyof typeof COVERAGE_TYPE_LABEL] ?? type}
    </Badge>
  );
}

/**
 * Compact "2 of 3 spots" indicator. Renders as a meter so capacity is legible
 * at a glance in a dense grid, rather than another word-shaped badge.
 */
export function CoverageMeter({
  approved,
  limit,
  className,
  showLabel = true,
}: {
  approved: number;
  limit: number | null;
  className?: string;
  showLabel?: boolean;
}) {
  if (limit == null) {
    return (
      <span className={cx("flex items-center gap-1.5 text-[12px] text-slate", className)}>
        <span className="tnum font-semibold text-body">{approved}</span>
        {showLabel && (approved === 1 ? "contributor" : "contributors")}
      </span>
    );
  }

  const pct = limit ? Math.min(100, (approved / limit) * 100) : 0;
  const full = approved >= limit;

  return (
    <span className={cx("flex items-center gap-2", className)}>
      <span className="flex gap-1" aria-hidden>
        {Array.from({ length: Math.min(limit, 6) }).map((_, i) => (
          <span
            key={i}
            className={cx(
              "h-1.5 w-3.5 rounded-full transition-colors",
              i < approved ? (full ? "bg-mist" : "bg-teal-400") : "bg-line",
            )}
          />
        ))}
        {limit > 6 && <span className="text-[12px] text-slate">+{limit - 6}</span>}
      </span>
      {showLabel && (
        <span className="tnum text-[12px] text-slate">
          {approved}/{limit} {full ? "full" : "spots"}
        </span>
      )}
      <span className="sr-only">
        {approved} of {limit} coverage spots filled ({Math.round(pct)}%)
      </span>
    </span>
  );
}

/** The contributor's own relationship to an event, shown on cards. */
export function MyStateBadge({
  requestStatus,
  assigned,
}: {
  requestStatus?: string | null;
  assigned?: boolean;
}) {
  if (assigned)
    return (
      <Badge tone="bg-teal-100 text-teal-700 ring-teal-200" dot>
        You&apos;re covering
      </Badge>
    );
  if (!requestStatus) return null;
  if (requestStatus === "pending" || requestStatus === "under_review")
    return (
      <Badge tone="bg-amber-50 text-amber-700 ring-amber-200" dot>
        Request {requestStatus === "pending" ? "pending" : "under review"}
      </Badge>
    );
  if (requestStatus === "waitlisted")
    return (
      <Badge tone="bg-sky-50 text-sky-700 ring-sky-200" dot>
        Waitlisted
      </Badge>
    );
  return null;
}
