import Link from "next/link";
import { requireUser, isAdmin, isSuperAdmin } from "@/lib/rbac";
import { getDb, parseJson } from "@/lib/db";
import { listEvents } from "@/lib/events";
import {
  Card,
  Avatar,
  Badge,
  LinkButton,
  EmptyState,
  SectionHeader,
  IconTicket,
  IconInbox,
  IconCheck,
  IconUsers,
  IconChevron,
  IconClock,
  IconUpload,
  IconShield,
  IconCalendar,
  IconChart,
  IconAlert,
} from "@/components/ui";
import { MiniEventCard, EventCard } from "@/components/events/event-card";
import { RequestStatusBadge, CoverageTypeBadge } from "@/components/events/badges";
import {
  greeting,
  fmtDate,
  fmtTime,
  fmtAgo,
  relativeDay,
  cx,
  TILE_TONE,
  type TileTone,
} from "@/lib/ui";
import {
  COVERAGE_TYPE_LABEL,
  type RequestStatus,
  type CoverageType,
} from "@/lib/constants";

export const metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const user = await requireUser();
  const db = getDb();
  const admin = isAdmin(user);
  const denied = (Array.isArray(sp.denied) ? sp.denied[0] : sp.denied) === "admin";

  /* ------------------------- contributor's own data ------------------------ */

  const myAssignments = db
    .prepare(
      `SELECT e.*, a.coverage_type, a.id assignment_id
         FROM assignments a JOIN events e ON e.id = a.event_id
        WHERE a.user_id = ? AND a.status = 'active'
          AND date(coalesce(e.multi_day_end, e.start_datetime)) >= date('now')
          AND e.status != 'cancelled'
        ORDER BY e.start_datetime ASC LIMIT 6`,
    )
    .all(user.id) as (Record<string, unknown> & {
    id: number;
    title: string;
    category: string;
    start_datetime: string;
    time_tbd: number;
    venue: string | null;
    city: string | null;
    image_url: string | null;
    coverage_type: string;
  })[];

  const myPending = db
    .prepare(
      `SELECT r.id, r.status, r.coverage_types, r.submitted_at,
              e.id event_id, e.title, e.start_datetime, e.time_tbd, e.venue, e.city, e.category, e.image_url
         FROM coverage_requests r JOIN events e ON e.id = r.event_id
        WHERE r.user_id = ? AND r.status IN ('pending','under_review','waitlisted')
        ORDER BY e.start_datetime ASC LIMIT 6`,
    )
    .all(user.id) as (Record<string, unknown> & {
    id: number;
    status: string;
    coverage_types: string;
    submitted_at: string;
    event_id: number;
    title: string;
    start_datetime: string;
    time_tbd: number;
    venue: string | null;
    city: string | null;
    category: string;
    image_url: string | null;
  })[];

  const recentDecisions = db
    .prepare(
      `SELECT r.id, r.status, r.reviewed_at, r.decision_note,
              e.id event_id, e.title, e.start_datetime, e.venue, e.category
         FROM coverage_requests r JOIN events e ON e.id = r.event_id
        WHERE r.user_id = ? AND r.status IN ('approved','rejected','waitlisted')
          AND r.reviewed_at IS NOT NULL
        ORDER BY r.reviewed_at DESC LIMIT 5`,
    )
    .all(user.id) as {
    id: number;
    status: string;
    reviewed_at: string;
    decision_note: string | null;
    event_id: number;
    title: string;
    start_datetime: string;
    venue: string | null;
    category: string;
  }[];

  // Personalized suggestions: open events matching the contributor's specialties
  // where they have nothing going on yet.
  const { rows: suggestions } = listEvents(
    { availability: "open", limit: 8, sort: "soonest" },
    user,
  );
  const fresh = suggestions
    .filter((e) => !e.myAssignmentId && !e.myRequestStatus)
    .slice(0, 4);

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      {/* -------------------------- welcome -------------------------- */}
      <header className="mb-7">
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="text-[28px] sm:text-[34px] text-ink">
            {greeting()}, {user.name.split(" ")[0]}.
          </h1>
          {isSuperAdmin(user) && (
            <Badge tone="bg-gradient-to-r from-brand-500/25 to-sky-500/25 text-brand-700 ring-brand-200">
              <IconShield size={12} /> Super Admin
            </Badge>
          )}
        </div>
        <p className="mt-1.5 text-[14px] text-slate">
          <DeskSummary
            assignments={myAssignments.length}
            pending={myPending.length}
            admin={admin}
          />
        </p>
      </header>

      {denied && (
        <Card className="mb-6 border-amber-200 p-4">
          <div className="flex items-start gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200">
              <IconShield size={18} />
            </span>
            <div>
              <p className="text-[14px] font-semibold text-ink">
                That area is for administrators
              </p>
              <p className="mt-0.5 text-[12.5px] leading-snug text-slate">
                Coverage decisions are made by the Super Admin. You can request
                any event you want to cover — everything you need is below.
              </p>
            </div>
          </div>
        </Card>
      )}

      {admin && <AdminOverview userId={user.id} superAdmin={isSuperAdmin(user)} />}

      {/* ---------------------- my upcoming assignments ---------------------- */}
      <section className="mb-8">
        <SectionHeader
          title="My upcoming assignments"
          action={
            myAssignments.length > 0 && (
              <Link
                href="/schedule"
                className="flex items-center gap-1 text-[13px] text-body transition-colors hover:text-ink"
              >
                Full schedule <IconChevron size={13} />
              </Link>
            )
          }
        />

        {myAssignments.length === 0 ? (
          <Card>
            <EmptyState
              icon={<IconCheck />}
              title="Nothing assigned to you yet"
              body="When the Super Admin approves one of your requests, the event lands here with the date, venue and exactly what you're responsible for."
              action={
                <LinkButton href="/events?availability=open" variant="primary">
                  Browse open events
                </LinkButton>
              }
            />
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {myAssignments.map((a) => {
              const rel = relativeDay(a.start_datetime);
              return (
                <Link
                  key={a.assignment_id as number}
                  href={`/events/${a.id}`}
                  className="surface-raised group flex flex-col gap-2.5 border-teal-200 p-4 transition-all hover:-translate-y-0.5 hover:border-teal-200"
                >
                  <div className="flex items-center justify-between gap-2">
                    <CoverageTypeBadge type={a.coverage_type} />
                    {rel && (
                      <span className="text-[12.5px] font-bold text-brand-700">{rel}</span>
                    )}
                  </div>
                  <h3 className="line-clamp-2 text-[16px] leading-tight text-ink">
                    {a.title}
                  </h3>
                  <p className="text-[12.5px] text-slate">
                    <span className="tnum">
                      {fmtDate(a.start_datetime, "long")} ·{" "}
                      {fmtTime(a.start_datetime, a.time_tbd)}
                    </span>
                    {a.venue && (
                      <span className="mt-0.5 block truncate">{a.venue}</span>
                    )}
                  </p>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      <div className="grid gap-8 lg:grid-cols-2">
        {/* ------------------------ pending requests ------------------------ */}
        <section>
          <SectionHeader
            title="Pending requests"
            action={
              myPending.length > 0 && (
                <Link
                  href="/requests"
                  className="flex items-center gap-1 text-[13px] text-body transition-colors hover:text-ink"
                >
                  All requests <IconChevron size={13} />
                </Link>
              )
            }
          />

          {myPending.length === 0 ? (
            <Card>
              <EmptyState
                className="!py-10"
                icon={<IconInbox />}
                title="No requests in flight"
                body="Find an event you want and hit Request to Cover. You'll track its status here."
              />
            </Card>
          ) : (
            <div className="space-y-2">
              {myPending.map((r) => (
                <MiniEventCard
                  key={r.id}
                  ev={{
                    id: r.event_id,
                    title: r.title,
                    category: r.category,
                    start_datetime: r.start_datetime,
                    time_tbd: r.time_tbd,
                    venue: r.venue,
                    city: r.city,
                    image_url: r.image_url,
                  }}
                  footer={
                    <div className="flex flex-wrap items-center gap-1.5">
                      <RequestStatusBadge status={r.status as RequestStatus} />
                      <span className="text-[12px] text-slate">
                        {parseJson<string[]>(r.coverage_types, [])
                          .map((t) => COVERAGE_TYPE_LABEL[t as CoverageType] ?? t)
                          .join(", ")}
                      </span>
                    </div>
                  }
                />
              ))}
            </div>
          )}
        </section>

        {/* ------------------------ recent decisions ------------------------ */}
        <section>
          <SectionHeader title="Recent decisions" />

          {recentDecisions.length === 0 ? (
            <Card>
              <EmptyState
                className="!py-10"
                icon={<IconClock />}
                title="No decisions yet"
                body="Approvals, waitlists and passes will show up here with any note the desk left you."
              />
            </Card>
          ) : (
            <Card className="divide-y divide-line">
              {recentDecisions.map((d) => (
                <Link
                  key={d.id}
                  href={`/events/${d.event_id}`}
                  className="flex items-start gap-3 p-3.5 transition-colors hover:bg-canvas"
                >
                  <span
                    className={cx(
                      "mt-1 size-2 shrink-0 rounded-full",
                      d.status === "approved"
                        ? "bg-teal-400"
                        : d.status === "waitlisted"
                          ? "bg-sky-500"
                          : "bg-line-strong",
                    )}
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-1 text-[13.5px] font-semibold text-ink">
                      {d.title}
                    </p>
                    <p className="mt-0.5 text-[12px] text-slate">
                      {fmtDate(d.start_datetime, "long")}
                      {d.venue && ` · ${d.venue}`} · {fmtAgo(d.reviewed_at)}
                    </p>
                    {d.decision_note && (
                      <p className="mt-1 line-clamp-2 rounded-lg bg-canvas px-2.5 py-1.5 text-[12px] italic text-body">
                        “{d.decision_note}”
                      </p>
                    )}
                  </div>
                  <RequestStatusBadge status={d.status as RequestStatus} />
                </Link>
              ))}
            </Card>
          )}
        </section>
      </div>

      {/* --------------------------- suggestions --------------------------- */}
      {fresh.length > 0 && (
        <section className="mt-8">
          <SectionHeader
            title="Events you might want"
            action={
              <LinkButton href="/events" variant="secondary" size="sm">
                Browse events
              </LinkButton>
            }
          />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {fresh.map((ev) => (
              <EventCard key={ev.id} ev={ev} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function DeskSummary({
  assignments,
  pending,
  admin,
}: {
  assignments: number;
  pending: number;
  admin: boolean;
}) {
  const bits: string[] = [];
  if (assignments)
    bits.push(`${assignments} upcoming ${assignments === 1 ? "assignment" : "assignments"}`);
  if (pending) bits.push(`${pending} request${pending === 1 ? "" : "s"} awaiting a decision`);
  if (!bits.length)
    return <>Nothing on your plate right now — good time to claim something.</>;
  return (
    <>
      You have {bits.join(" and ")}.
      {admin && " The desk overview is below."}
    </>
  );
}

/* --------------------------- admin overview block -------------------------- */

async function AdminOverview({
  userId,
  superAdmin,
}: {
  userId: number;
  superAdmin: boolean;
}) {
  const db = getDb();

  const n = (sql: string, ...p: unknown[]) =>
    (db.prepare(sql).get(...(p as [])) as { n: number }).n;

  const upcoming = n(
    `SELECT COUNT(*) n FROM events WHERE date(coalesce(multi_day_end, start_datetime)) >= date('now') AND status NOT IN ('draft','archived','cancelled')`,
  );
  const openForCoverage = n(
    `SELECT COUNT(*) n FROM events WHERE requests_closed = 0 AND status IN ('open','requests_pending')
      AND date(coalesce(multi_day_end, start_datetime)) >= date('now')`,
  );
  const pendingRequests = n(
    `SELECT COUNT(*) n FROM coverage_requests WHERE status IN ('pending','under_review')`,
  );
  const thisWeek = n(
    `SELECT COUNT(*) n FROM events WHERE date(start_datetime) BETWEEN date('now') AND date('now','+7 days')
      AND status NOT IN ('draft','archived','cancelled')`,
  );
  const needsCoverage = n(
    `SELECT COUNT(*) n FROM events e
      WHERE date(e.start_datetime) BETWEEN date('now') AND date('now','+21 days')
        AND e.status NOT IN ('draft','archived','cancelled')
        AND NOT EXISTS (SELECT 1 FROM assignments a WHERE a.event_id = e.id AND a.status = 'active')`,
  );
  const contributors = n(
    `SELECT COUNT(*) n FROM users WHERE role = 'contributor' AND status != 'disabled'`,
  );

  // Needs attention: soon + uncovered, ordered by urgency.
  const urgent = db
    .prepare(
      `SELECT e.id, e.title, e.start_datetime, e.venue, e.category, e.time_tbd,
              (SELECT COUNT(*) FROM coverage_requests r WHERE r.event_id = e.id AND r.status IN ('pending','under_review')) reqs
         FROM events e
        WHERE date(e.start_datetime) BETWEEN date('now') AND date('now','+14 days')
          AND e.status NOT IN ('draft','archived','cancelled')
          AND NOT EXISTS (SELECT 1 FROM assignments a WHERE a.event_id = e.id AND a.status = 'active')
        ORDER BY e.start_datetime ASC LIMIT 6`,
    )
    .all() as {
    id: number;
    title: string;
    start_datetime: string;
    venue: string | null;
    category: string;
    time_tbd: number;
    reqs: number;
  }[];

  const contested = db
    .prepare(
      `SELECT e.id, e.title, e.start_datetime, e.venue, COUNT(r.id) reqs
         FROM events e JOIN coverage_requests r ON r.event_id = e.id
        WHERE r.status IN ('pending','under_review')
        GROUP BY e.id HAVING COUNT(r.id) >= 2
        ORDER BY COUNT(r.id) DESC, e.start_datetime ASC LIMIT 5`,
    )
    .all() as {
    id: number;
    title: string;
    start_datetime: string;
    venue: string | null;
    reqs: number;
  }[];

  const incompleteImports = n(
    `SELECT COUNT(*) n FROM events WHERE status = 'draft'`,
  );

  const recentRequests = db
    .prepare(
      `SELECT r.id, r.status, r.submitted_at, r.coverage_types,
              u.name, u.profile_photo,
              e.id event_id, e.title, e.start_datetime
         FROM coverage_requests r
         JOIN users u ON u.id = r.user_id
         JOIN events e ON e.id = r.event_id
        WHERE r.status IN ('pending','under_review')
        ORDER BY r.submitted_at DESC LIMIT 6`,
    )
    .all() as {
    id: number;
    status: string;
    submitted_at: string;
    coverage_types: string;
    name: string;
    profile_photo: string | null;
    event_id: number;
    title: string;
    start_datetime: string;
  }[];

  const activeContributors = db
    .prepare(
      `SELECT u.id, u.name, u.profile_photo,
              COUNT(a.id) total,
              SUM(CASE WHEN date(e.start_datetime) >= date('now') THEN 1 ELSE 0 END) upcoming
         FROM users u
         JOIN assignments a ON a.user_id = u.id AND a.status IN ('active','completed')
         JOIN events e ON e.id = a.event_id
        GROUP BY u.id ORDER BY total DESC LIMIT 5`,
    )
    .all() as {
    id: number;
    name: string;
    profile_photo: string | null;
    total: number;
    upcoming: number;
  }[];

  return (
    <section className="mb-9">
      <SectionHeader
        title="The board at a glance"
        action={
          <div className="hidden gap-2 sm:flex">
            <LinkButton href="/admin/import" variant="secondary" size="sm">
              <IconUpload size={14} /> Import
            </LinkButton>
            <LinkButton href="/admin/approvals" variant="accent" size="sm">
              Approval Center
            </LinkButton>
          </div>
        }
      />

      {/* Metrics */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
        <Metric label="Upcoming events" value={upcoming} href="/events" tone="brand" icon={<IconCalendar size={20} />} />
        <Metric
          label="Open for coverage"
          value={openForCoverage}
          href="/events?availability=open"
          tone="teal"
          icon={<IconTicket size={20} />}
        />
        <Metric
          label="Pending requests"
          value={pendingRequests}
          href="/admin/approvals"
          tone="sunshine"
          icon={<IconClock size={20} />}
        />
        <Metric
          label="Needs coverage"
          value={needsCoverage}
          href="/events?availability=needs"
          tone="coral"
          icon={<IconAlert size={20} />}
        />
        <Metric label="This week" value={thisWeek} href="/events?quick=week" tone="violet" icon={<IconChart size={20} />} />
        <Metric label="Contributors" value={contributors} href="/admin/contributors" tone="sky" icon={<IconUsers size={20} />} />
      </div>

      {/* Needs attention */}
      {(urgent.length > 0 || contested.length > 0 || incompleteImports > 0) && (
        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <Card className="p-5">
            <div className="mb-3 flex items-center gap-2">
              <span className="grid size-6 place-items-center rounded-md bg-amber-50 text-amber-700">
                <IconClock size={14} />
              </span>
              <h3 className="text-[15px] text-ink">Needs attention</h3>
            </div>

            {urgent.length === 0 && incompleteImports === 0 ? (
              <p className="py-4 text-center text-[13px] text-slate">
                Nothing urgent — every event in the next two weeks has someone on it.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {incompleteImports > 0 && (
                  <li>
                    <Link
                      href="/admin/events?status=draft"
                      className="flex items-center gap-2.5 rounded-lg px-2 py-2 transition-colors hover:bg-canvas"
                    >
                      <Badge tone="bg-sky-50 text-sky-700 ring-sky-200">
                        {incompleteImports}
                      </Badge>
                      <span className="text-[13.5px] text-body">
                        imported {incompleteImports === 1 ? "event is" : "events are"} still
                        in draft
                      </span>
                    </Link>
                  </li>
                )}
                {urgent.map((u) => {
                  const rel = relativeDay(u.start_datetime);
                  return (
                    <li key={u.id}>
                      <Link
                        href={`/events/${u.id}`}
                        className="flex items-center gap-3.5 rounded-lg px-2 py-2 transition-colors hover:bg-canvas"
                      >
                        <span className="tnum w-[74px] shrink-0 whitespace-nowrap text-[12.5px] font-semibold text-coral-700">
                          {rel ?? fmtDate(u.start_datetime)}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13.5px] text-ink">
                            {u.title}
                          </span>
                          <span className="block truncate text-[12.5px] text-slate">
                            No one assigned{u.venue && ` · ${u.venue}`}
                          </span>
                        </span>
                        {u.reqs > 0 && (
                          <Badge tone="bg-brand-50 text-brand-700 ring-brand-200">
                            {u.reqs} waiting
                          </Badge>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <Card className="p-5">
            <div className="mb-3 flex items-center gap-2">
              <span className="grid size-6 place-items-center rounded-md bg-sky-50 text-sky-700">
                <IconUsers size={14} />
              </span>
              <h3 className="text-[15px] text-ink">Multiple people want these</h3>
            </div>

            {contested.length === 0 ? (
              <p className="py-4 text-center text-[13px] text-slate">
                No events with competing requests right now.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {contested.map((c) => (
                  <li key={c.id}>
                    <Link
                      href={`/admin/approvals/${c.id}`}
                      className="flex items-center gap-2.5 rounded-lg px-2 py-2 transition-colors hover:bg-canvas"
                    >
                      <Badge tone="bg-sky-50 text-sky-700 ring-sky-200">
                        {c.reqs}
                      </Badge>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13.5px] text-ink">
                          {c.title}
                        </span>
                        <span className="block truncate text-[12.5px] text-slate">
                          {fmtDate(c.start_datetime, "long")}
                          {c.venue && ` · ${c.venue}`}
                        </span>
                      </span>
                      <IconChevron size={14} className="shrink-0 text-slate" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}

      {/* Recent requests + contributor activity */}
      <div className="mt-4 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card className="p-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className="text-[15px] text-ink">Recent coverage requests</h3>
            <Link
              href="/admin/approvals"
              className="flex items-center gap-1 text-[12.5px] text-body hover:text-ink"
            >
              Approval Center <IconChevron size={12} />
            </Link>
          </div>

          {recentRequests.length === 0 ? (
            <EmptyState
              className="!py-8"
              icon={<IconInbox />}
              title="No requests waiting"
              body="Everything submitted has been decided. New requests land here the moment they come in."
            />
          ) : (
            <ul className="divide-y divide-line">
              {recentRequests.map((r) => (
                <li key={r.id}>
                  <Link
                    href={`/admin/approvals/${r.event_id}`}
                    className="flex items-center gap-3 py-2.5 transition-colors hover:bg-canvas"
                  >
                    <Avatar name={r.name} src={r.profile_photo} size={32} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13.5px] text-ink">
                        <span className="font-semibold">{r.name}</span>{" "}
                        <span className="text-slate">wants</span> {r.title}
                      </p>
                      <p className="text-[12.5px] text-slate">
                        {parseJson<string[]>(r.coverage_types, [])
                          .map((t) => COVERAGE_TYPE_LABEL[t as CoverageType] ?? t)
                          .join(", ")}{" "}
                        · {fmtAgo(r.submitted_at)}
                      </p>
                    </div>
                    <RequestStatusBadge status={r.status as RequestStatus} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-5">
          <h3 className="mb-3 text-[15px] text-ink">Contributor activity</h3>

          {activeContributors.length === 0 ? (
            <EmptyState
              className="!py-8"
              icon={<IconUsers />}
              title="No assignments yet"
              body="Once you start approving coverage, your most active contributors show up here."
            />
          ) : (
            <ul className="space-y-2">
              {activeContributors.map((c) => (
                <li key={c.id}>
                  <Link
                    href={`/admin/contributors/${c.id}`}
                    className="flex items-center gap-3 rounded-lg px-1.5 py-1.5 transition-colors hover:bg-canvas"
                  >
                    <Avatar name={c.name} src={c.profile_photo} size={30} />
                    <span className="min-w-0 flex-1 truncate text-[13.5px] text-ink">
                      {c.name}
                    </span>
                    <span className="tnum shrink-0 text-[12px] text-slate">
                      {c.upcoming > 0 && (
                        <span className="text-teal-700">{c.upcoming} upcoming · </span>
                      )}
                      {c.total} total
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}

          {superAdmin && (
            <LinkButton
              href="/admin/contributors"
              variant="secondary"
              size="sm"
              className="mt-3 w-full"
            >
              Manage contributors
            </LinkButton>
          )}
        </Card>
      </div>
    </section>
  );
}

function Metric({
  label,
  value,
  href,
  tone = "brand",
  icon,
}: {
  label: string;
  value: number;
  href: string;
  tone?: TileTone;
  icon: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="surface group flex items-center gap-3 p-3.5 transition-all hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-md"
    >
      <span
        className={cx(
          "icon-tile size-11 shrink-0 transition-transform group-hover:scale-105",
          TILE_TONE[tone],
        )}
        aria-hidden
      >
        {icon}
      </span>
      <span className="min-w-0">
        <span className="tnum block font-[family-name:var(--font-display)] text-[26px] font-bold leading-none text-ink">
          {value}
        </span>
        <span className="mt-1 block truncate text-[12.5px] leading-tight text-slate">
          {label}
        </span>
      </span>
    </Link>
  );
}

