import Link from "next/link";
import { requireUser } from "@/lib/rbac";
import { getDb } from "@/lib/db";
import {
  Card,
  EmptyState,
  LinkButton,
  Badge,
  IconCheck,
  IconPin,
  IconClock,
  IconGrid,
  IconList,
  IconCalendar,
} from "@/components/ui";
import { CategoryBadge, CoverageTypeBadge } from "@/components/events/badges";
import { GuestBadge } from "@/components/guest-picker";
import { EventCalendar } from "@/components/events/calendar";
import {
  fmtDate,
  fmtTime,
  dayParts,
  relativeDay,
  posterStyle,
  parseLocal,
  cx,
} from "@/lib/ui";

export const metadata = { title: "My Schedule" };
export const dynamic = "force-dynamic";

type Assignment = {
  assignment_id: number;
  coverage_type: string;
  guests: number;
  assigned_at: string;
  id: number;
  title: string;
  subtitle: string | null;
  category: string;
  start_datetime: string;
  multi_day_end: string | null;
  time_tbd: number;
  venue: string | null;
  address: string | null;
  city: string | null;
  image_url: string | null;
  status: string;
  ticket_url: string | null;
};

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const user = await requireUser();
  const view = (Array.isArray(sp.view) ? sp.view[0] : sp.view) ?? "list";

  const rows = getDb()
    .prepare(
      `SELECT a.id assignment_id, a.coverage_type, a.assigned_at, a.guests,
              e.id, e.title, e.subtitle, e.category, e.start_datetime, e.multi_day_end,
              e.time_tbd, e.venue, e.address, e.city, e.image_url, e.status, e.ticket_url
         FROM assignments a JOIN events e ON e.id = a.event_id
        WHERE a.user_id = ? AND a.status = 'active'
          AND date(coalesce(e.multi_day_end, e.start_datetime)) >= date('now')
        ORDER BY e.start_datetime ASC`,
    )
    .all(user.id) as Assignment[];

  // Group by month so a long schedule stays scannable.
  const groups = new Map<string, Assignment[]>();
  for (const r of rows) {
    const d = parseLocal(r.start_datetime);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r);
  }

  const cancelled = rows.filter((r) => r.status === "cancelled");

  return (
    <div className="mx-auto max-w-[1000px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[30px] sm:text-[36px] text-ink">My schedule</h1>
          <p className="mt-1.5 max-w-[56ch] text-[14px] text-slate text-pretty">
            {rows.length > 0
              ? `${rows.length} upcoming ${rows.length === 1 ? "assignment" : "assignments"} — with exactly what you're on the hook for.`
              : "Everything you've been approved to cover shows up here."}
          </p>
        </div>

        {rows.length > 0 && (
          <div className="flex rounded-xl bg-sunken p-1 ring-1 ring-inset ring-line">
            {[
              { key: "list", icon: <IconList size={17} />, label: "List view" },
              { key: "calendar", icon: <IconCalendar size={17} />, label: "Calendar view" },
            ].map((v) => (
              <Link
                key={v.key}
                href={`/schedule${v.key === "calendar" ? "?view=calendar" : ""}`}
                aria-label={v.label}
                title={v.label}
                className={cx(
                  "grid size-9 place-items-center rounded-lg transition-colors",
                  view === v.key
                    ? "bg-card text-brand-700 shadow-sm"
                    : "text-slate hover:bg-canvas hover:text-body",
                )}
              >
                {v.icon}
              </Link>
            ))}
          </div>
        )}
      </header>

      {cancelled.length > 0 && (
        <Card className="mb-5 border-red-200 p-4">
          <p className="text-[13.5px] text-red-700">
            <strong>Heads up:</strong>{" "}
            {cancelled.length === 1
              ? `"${cancelled[0].title}" has been cancelled.`
              : `${cancelled.length} events on your schedule have been cancelled.`}{" "}
            You don&apos;t need to show up.
          </p>
        </Card>
      )}

      {rows.length === 0 ? (
        <Card>
          <EmptyState
            icon={<IconCheck />}
            title="Your schedule is clear"
            body="Once the Super Admin approves one of your coverage requests, the event lands here with the date, venue, call time and your specific responsibility."
            action={
              <LinkButton href="/events?availability=open" variant="primary">
                Find events to cover
              </LinkButton>
            }
          />
        </Card>
      ) : view === "calendar" ? (
        <EventCalendar
          events={rows.map((r) => ({
            id: r.id,
            title: r.title,
            category: r.category,
            start_datetime: r.start_datetime,
            multi_day_end: r.multi_day_end,
            time_tbd: r.time_tbd,
            venue: r.venue,
            city: r.city,
            status: r.status,
            approved_count: 1,
            myRequestStatus: null,
            myAssignmentId: r.assignment_id,
          }))}
        />
      ) : (
        <div className="space-y-8">
          {[...groups.entries()].map(([key, items]) => {
            const d = parseLocal(`${key}-01T00:00`);
            return (
              <section key={key}>
                <h2 className="mb-3 text-[15px] uppercase tracking-[0.1em] text-slate">
                  {d.toLocaleString("en-US", { month: "long" })} {d.getFullYear()}
                </h2>
                <div className="space-y-3">
                  {items.map((a) => (
                    <AssignmentCard key={a.assignment_id} a={a} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function AssignmentCard({ a }: { a: Assignment }) {
  const d = dayParts(a.start_datetime);
  const rel = relativeDay(a.start_datetime);
  const cancelled = a.status === "cancelled";

  return (
    <Card
      className={cx(
        "overflow-hidden transition-colors",
        cancelled ? "border-red-200 opacity-70" : "border-teal-200",
      )}
    >
      <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:p-5">
        {/* Date rail */}
        <div className="flex shrink-0 items-center gap-3 sm:w-[74px] sm:flex-col sm:gap-0 sm:rounded-xl sm:bg-canvas sm:py-3 sm:ring-1 sm:ring-inset sm:ring-line">
          <span className="text-[12px] font-bold uppercase tracking-[0.08em] text-brand-700">
            {d.mon}
          </span>
          <span className="tnum text-[26px] font-bold leading-none text-ink">
            {d.day}
          </span>
          <span className="text-[12px] text-slate sm:mt-0.5">{d.dow}</span>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <CategoryBadge category={a.category} />
            <CoverageTypeBadge type={a.coverage_type} />
            <GuestBadge guests={Number(a.guests ?? 0)} />
            {rel && !cancelled && (
              <Badge tone="bg-coral-600 text-white ring-coral-600">{rel}</Badge>
            )}
            {cancelled && (
              <Badge tone="bg-red-50 text-red-600 ring-red-200">Cancelled</Badge>
            )}
          </div>

          <Link href={`/events/${a.id}`} className="group">
            <h3 className="mt-1.5 text-[18px] leading-tight text-ink transition-colors group-hover:text-brand-600">
              {a.title}
            </h3>
          </Link>
          {a.subtitle && (
            <p className="mt-0.5 line-clamp-1 text-[12.5px] text-slate">{a.subtitle}</p>
          )}

          <div className="mt-2 space-y-1 text-[13px] text-body">
            <p className="flex items-center gap-1.5">
              <IconClock size={14} className="shrink-0 text-slate" />
              <span className="tnum">{fmtTime(a.start_datetime, a.time_tbd)}</span>
              {a.multi_day_end && (
                <span className="text-slate">
                  · runs through {fmtDate(a.multi_day_end, "long")}
                </span>
              )}
            </p>
            {a.venue && (
              <p className="flex items-start gap-1.5">
                <IconPin size={14} className="mt-px shrink-0 text-slate" />
                <span>
                  {a.venue}
                  {a.city && <span className="text-slate"> · {a.city}</span>}
                  {a.address && (
                    <span className="block text-[12px] text-slate">{a.address}</span>
                  )}
                </span>
              </p>
            )}
          </div>
        </div>

        {/* Responsibility callout */}
        <div className="shrink-0 rounded-xl bg-teal-50 px-4 py-3 text-center ring-1 ring-inset ring-teal-200 sm:w-[132px]">
          <div className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-teal-700">
            You&apos;re on
          </div>
          <div className="mt-0.5 text-[14px] font-semibold text-ink">
            {a.coverage_type === "article"
              ? "Article"
              : a.coverage_type === "photography"
                ? "Photos"
                : a.coverage_type === "video"
                  ? "Video"
                  : a.coverage_type === "interview"
                    ? "Interview"
                    : a.coverage_type === "social"
                      ? "Social"
                      : "Coverage"}
          </div>
          {Number(a.guests ?? 0) > 0 && (
            <div className="mt-1 text-[11.5px] font-semibold text-amber-700">
              +{a.guests} guest{Number(a.guests) === 1 ? "" : "s"}
            </div>
          )}
          {a.ticket_url && (
            <a
              href={a.ticket_url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1.5 block text-[12.5px] text-teal-700 underline-offset-2 hover:underline"
            >
              Event info
            </a>
          )}
        </div>
      </div>
    </Card>
  );
}

export { IconGrid, posterStyle };
