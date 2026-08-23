import Link from "next/link";
import { notFound } from "next/navigation";
import {
  requireAdmin,
  isSuperAdmin,
  canFinalizeDecision,
  canViewNote,
} from "@/lib/rbac";
import { getDb, parseJson } from "@/lib/db";
import {
  getEvent,
  capacityFor,
  eventAssignments,
  eventRequests,
  openTypes,
} from "@/lib/events";
import {
  Card,
  Avatar,
  Badge,
  EmptyState,
  LinkButton,
  IconTicket,
  IconUsers,
  IconNote,
  IconChevron,
  IconShield,
  IconCheck,
} from "@/components/ui";
import {
  CategoryBadge,
  RequestStatusBadge,
  CoverageTypeBadge,
  CoverageMeter,
} from "@/components/events/badges";
import { DecisionControls } from "@/components/admin/decision-controls";
import { GuestBadge } from "@/components/guest-picker";
import { EventAdminPanel } from "@/components/events/event-admin-panel";
import { fmtDate, fmtTime, fmtAgo, posterStyle, cx } from "@/lib/ui";
import {
  COVERAGE_TYPE_LABEL,
  SPECIALTY_LABEL,
  type CoverageType,
  type RequestStatus,
} from "@/lib/constants";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;
  const ev = getEvent(Number(eventId));
  return { title: ev ? `Requests — ${ev.title}` : "Approval Center" };
}

export default async function EventApprovalPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;
  const user = await requireAdmin();
  const ev = getEvent(Number(eventId));
  if (!ev) notFound();

  const db = getDb();
  const cap = capacityFor(ev);
  const requests = eventRequests(ev.id);
  const assignments = eventAssignments(ev.id).filter((a) => a.status !== "removed");
  const canFinalize = canFinalizeDecision(user);
  const superAdmin = isSuperAdmin(user);

  const active = requests.filter((r) =>
    ["pending", "under_review", "waitlisted"].includes(r.status),
  );
  const decided = requests.filter((r) =>
    ["approved", "rejected", "withdrawn", "cancelled"].includes(r.status),
  );

  const notes = (
    db
      .prepare(
        `SELECT n.*, u.name author_name, u.profile_photo author_photo
           FROM internal_notes n JOIN users u ON u.id = n.author_id
          WHERE n.event_id = ? ORDER BY n.created_at DESC LIMIT 10`,
      )
      .all(ev.id) as {
      id: number;
      note: string;
      visibility: string;
      created_at: string;
      author_name: string;
      author_photo: string | null;
    }[]
  ).filter((n) => canViewNote(user, n.visibility));

  const contributors = db
    .prepare(
      `SELECT id, name, email, profile_photo, specialties, status FROM users
        WHERE status != 'disabled' ORDER BY name`,
    )
    .all() as {
    id: number;
    name: string;
    email: string;
    profile_photo: string | null;
    specialties: string;
    status: string;
  }[];

  const openTypeLabels = openTypes(cap).map((t) => COVERAGE_TYPE_LABEL[t]);

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <Link
        href="/admin/approvals"
        className="inline-flex items-center gap-1.5 text-[13px] text-body transition-colors hover:text-ink"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden>
          <path d="m14 6-6 6 6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Approval Center
      </Link>

      {/* --------------------------- event header --------------------------- */}
      <Card raised className="mt-4 overflow-hidden">
        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:p-6">
          <div className="relative hidden size-[88px] shrink-0 overflow-hidden rounded-2xl sm:block">
            {ev.image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={ev.image_url} alt="" className="size-full object-cover" />
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
              {ev.requests_closed ? (
                <Badge tone="bg-line text-body ring-line">Requests closed</Badge>
              ) : null}
            </div>
            <h1 className="mt-2 text-[24px] leading-tight text-ink text-balance sm:text-[28px]">
              {ev.title}
            </h1>
            <p className="mt-1 text-[13px] text-slate">
              <span className="tnum">
                {fmtDate(ev.start_datetime, "full")} ·{" "}
                {fmtTime(ev.start_datetime, ev.time_tbd)}
              </span>
              {ev.venue && ` · ${ev.venue}`}
              {ev.city && ` · ${ev.city}`}
            </p>
          </div>

          {/* The headline count the spec asks for: N requests, M spots */}
          <div className="flex shrink-0 items-center gap-5 rounded-2xl bg-canvas px-5 py-3.5 ring-1 ring-inset ring-line">
            <div>
              <div className="tnum font-[family-name:var(--font-display)] text-[26px] font-bold leading-none text-ink">
                {active.length}
              </div>
              <div className="mt-1 text-[12px] text-slate">
                {active.length === 1 ? "request" : "requests"}
              </div>
            </div>
            <span className="h-9 w-px bg-line-strong/60" aria-hidden />
            <div>
              <div
                className={cx(
                  "tnum font-[family-name:var(--font-display)] text-[26px] font-bold leading-none",
                  cap.isFull ? "text-body" : "text-teal-700",
                )}
              >
                {cap.limit == null ? "∞" : cap.spotsLeft}
              </div>
              <div className="mt-1 text-[12px] text-slate">
                {cap.limit == null ? "no limit" : "spots left"}
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-line bg-canvas px-5 py-3 sm:px-6">
          <CoverageMeter approved={cap.approved} limit={cap.limit} />
          {cap.typed && (
            <span className="flex flex-wrap gap-2 text-[12px] text-slate">
              {cap.byType.map((t) => (
                <span
                  key={t.type}
                  className={cx(
                    "rounded-md px-2 py-0.5 ring-1 ring-inset",
                    t.filled >= t.capacity
                      ? "bg-canvas text-slate ring-line"
                      : "bg-teal-50 text-teal-700 ring-teal-200",
                  )}
                >
                  {t.label} {t.filled}/{t.capacity}
                </span>
              ))}
            </span>
          )}
          {openTypeLabels.length > 0 && (
            <span className="text-[12px] text-slate">
              Still needed: {openTypeLabels.join(", ")}
            </span>
          )}
          <span className="text-[12px] text-slate">
            {(ev.guest_limit ?? 0) > 0
              ? `Guests: up to +${ev.guest_limit} each`
              : "No +1s"}
          </span>
          <Link
            href={`/events/${ev.id}`}
            className="ml-auto flex items-center gap-1 text-[12.5px] text-body hover:text-ink"
          >
            Public event page <IconChevron size={12} />
          </Link>
        </div>
      </Card>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0 space-y-6">
          {/* ------------------------ current crew ------------------------ */}
          {assignments.length > 0 && (
            <section>
              <h2 className="mb-3 text-[17px] text-ink">
                Approved crew ({assignments.length})
              </h2>
              <div className="space-y-2">
                {assignments.map((a) => (
                  <Card key={a.id} className="border-teal-200 p-3.5">
                    <div className="flex items-center gap-3">
                      <Avatar name={a.name} src={a.profile_photo} size={40} />
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-1.5 truncate text-[14.5px] font-semibold text-ink">
                          <span className="truncate">{a.name}</span>
                          <GuestBadge guests={Number(a.guests ?? 0)} />
                        </p>
                        <p className="text-[12px] text-slate">
                          {a.assigned_by_name ? `Assigned by ${a.assigned_by_name}` : "Assigned"} ·{" "}
                          {fmtAgo(a.assigned_at)}
                        </p>
                      </div>
                      <CoverageTypeBadge type={a.coverage_type} />
                    </div>
                  </Card>
                ))}
              </div>
            </section>
          )}

          {/* ------------------------ open requests ------------------------ */}
          <section>
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-[17px] text-ink">
                Waiting on a decision ({active.length})
              </h2>
              {active.length > 1 && (
                <span className="text-[12px] text-slate">
                  Compare and pick — oldest request first
                </span>
              )}
            </div>

            {active.length === 0 ? (
              <Card>
                <EmptyState
                  icon={<IconCheck />}
                  title="No open requests on this event"
                  body="Everyone who asked has been decided. You can still assign someone directly from the panel."
                />
              </Card>
            ) : (
              <div className="space-y-3">
                {active.map((r) => (
                  <RequesterCard
                    key={r.id}
                    request={r}
                    eventTitle={ev.title}
                    canFinalize={canFinalize}
                    superAdmin={superAdmin}
                    isFull={cap.isFull}
                    guestLimit={ev.guest_limit ?? 0}
                  />
                ))}
              </div>
            )}
          </section>

          {/* -------------------------- decided -------------------------- */}
          {decided.length > 0 && (
            <section>
              <h2 className="mb-3 text-[17px] text-ink">
                Already decided ({decided.length})
              </h2>
              <Card className="divide-y divide-line">
                {decided.map((r) => (
                  <div key={r.id} className="flex flex-wrap items-center gap-3 p-3.5">
                    <Avatar name={r.name} src={r.profile_photo} size={32} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13.5px] font-semibold text-ink">
                        {r.name}
                      </p>
                      <p className="text-[12.5px] text-slate">
                        {r.reviewed_by_name
                          ? `Decided by ${r.reviewed_by_name}`
                          : "Decided"}
                        {r.decision_note && ` · “${r.decision_note}”`}
                      </p>
                    </div>
                    <RequestStatusBadge status={r.status as RequestStatus} />
                    {/* A Super Admin can always revisit a past decision. */}
                    {(superAdmin || canFinalize) && r.status !== "withdrawn" && (
                      <DecisionControls
                        requestId={r.id}
                        contributorName={r.name}
                        eventTitle={ev.title}
                        requestedTypes={parseJson<string[]>(r.coverage_types, [])}
                        canFinalize={canFinalize}
                        isSuperAdmin={superAdmin}
                        isFull={cap.isFull}
                        currentStatus={r.status}
                        guestLimit={ev.guest_limit ?? 0}
                        guestsRequested={Number(r.guests_requested ?? 0)}
                        compact
                      />
                    )}
                  </div>
                ))}
              </Card>
            </section>
          )}
        </div>

        {/* ---------------------------- sidebar ---------------------------- */}
        <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <EventAdminPanel
            event={{
              id: ev.id,
              title: ev.title,
              status: ev.status,
              coverage_limit: ev.coverage_limit,
              allow_waitlist: !!ev.allow_waitlist,
              requests_closed: !!ev.requests_closed,
              guest_limit: ev.guest_limit ?? 0,
              guest_note: ev.guest_note,
            }}
            slots={cap.byType.map((t) => ({ type: t.type, capacity: t.capacity }))}
            contributors={contributors.map((c) => ({
              id: c.id,
              name: c.name,
              email: c.email,
              profile_photo: c.profile_photo,
              specialties: parseJson<string[]>(c.specialties, []),
              provisional: c.status === "provisional",
            }))}
            isSuperAdmin={superAdmin}
            assignments={assignments.map((a) => ({
              id: a.id,
              name: a.name,
              coverage_type: a.coverage_type,
            }))}
          />

          <Card className="p-5">
            <h3 className="mb-1 text-[15px] text-ink">Internal notes</h3>
            <p className="mb-3 text-[12px] text-slate">Admins only.</p>
            {notes.length === 0 ? (
              <p className="py-3 text-[12.5px] text-slate">
                No notes yet. Use the panel above to add one.
              </p>
            ) : (
              <ul className="space-y-2.5">
                {notes.map((n) => (
                  <li key={n.id} className="text-[13px]">
                    <div className="mb-1 flex items-center gap-1.5">
                      <span className="font-semibold text-body">{n.author_name}</span>
                      <span className="text-[12px] text-slate">{fmtAgo(n.created_at)}</span>
                      {n.visibility === "super_admin_only" && (
                        <Badge tone="bg-brand-50 text-brand-700 ring-brand-200">SA</Badge>
                      )}
                    </div>
                    <p className="whitespace-pre-wrap leading-snug text-body">{n.note}</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </aside>
      </div>
    </div>
  );
}

/* ---------------------------- requester card ------------------------------ */

function RequesterCard({
  request: r,
  eventTitle,
  canFinalize,
  superAdmin,
  isFull,
  guestLimit,
}: {
  request: ReturnType<typeof eventRequests>[number];
  eventTitle: string;
  canFinalize: boolean;
  superAdmin: boolean;
  isFull: boolean;
  guestLimit: number;
}) {
  const db = getDb();
  const types = parseJson<string[]>(r.coverage_types, []);
  const specialties = parseJson<string[]>(r.specialties, []);

  // Track record, so the decision isn't made blind.
  const stats = db
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM assignments a JOIN events e ON e.id = a.event_id
           WHERE a.user_id = ? AND a.status IN ('active','completed')
             AND date(e.start_datetime) < date('now')) completed,
         (SELECT COUNT(*) FROM assignments a JOIN events e ON e.id = a.event_id
           WHERE a.user_id = ? AND a.status = 'active'
             AND date(e.start_datetime) >= date('now')) upcoming,
         (SELECT COUNT(*) FROM coverage_requests c
           WHERE c.user_id = ? AND c.status IN ('pending','under_review')) openRequests`,
    )
    .get(r.user_id, r.user_id, r.user_id) as {
    completed: number;
    upcoming: number;
    openRequests: number;
  };

  return (
    <Card
      className={cx(
        "p-4 transition-colors sm:p-5",
        r.status === "waitlisted" && "border-sky-200",
        r.recommendation && "border-amber-200",
      )}
    >
      <div className="flex flex-col gap-4 sm:flex-row">
        <div className="flex gap-3 sm:block sm:shrink-0">
          <Avatar name={r.name} src={r.profile_photo} size={52} />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/admin/contributors/${r.user_id}`}
              className="text-[16px] font-semibold text-ink transition-colors hover:text-brand-600"
            >
              {r.name}
            </Link>
            <RequestStatusBadge status={r.status as RequestStatus} />
            {r.recommendation && (
              <Badge tone="bg-amber-50 text-amber-700 ring-amber-200">
                <IconShield size={11} /> Recommended: {String(r.recommendation)}
              </Badge>
            )}
          </div>

          <p className="mt-1 text-[12.5px] text-slate">
            Requested {fmtAgo(r.submitted_at)}
            {r.coverage_area && ` · Covers ${r.coverage_area}`}
          </p>

          {/* What they're offering */}
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            <span className="text-[12px] text-slate">Offering:</span>
            {types.map((t) => (
              <CoverageTypeBadge key={t} type={t} />
            ))}
            {Number(r.guests_requested ?? 0) > 0 && (
              <span className="text-[12px] text-slate">
                and asking to bring{" "}
                <strong className="text-amber-700">
                  +{Number(r.guests_requested)}
                </strong>
              </span>
            )}
          </div>

          {specialties.length > 0 && (
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <span className="text-[12px] text-slate">Specialties:</span>
              {specialties.map((s) => (
                <Badge key={s} tone="bg-canvas text-slate ring-line">
                  {SPECIALTY_LABEL[s] ?? s}
                </Badge>
              ))}
            </div>
          )}

          {/* Track record */}
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-slate">
            <span>
              <strong className="tnum text-body">{stats.completed}</strong> past events
              covered
            </span>
            <span>
              <strong className="tnum text-body">{stats.upcoming}</strong> upcoming
              assignments
            </span>
            {stats.openRequests > 1 && (
              <span>
                <strong className="tnum text-body">{stats.openRequests}</strong> open
                requests overall
              </span>
            )}
          </div>

          {r.message && (
            <blockquote className="mt-3 rounded-xl bg-canvas px-3.5 py-2.5 text-[13px] italic leading-relaxed text-body ring-1 ring-inset ring-line">
              “{r.message}”
            </blockquote>
          )}
          {r.reason && (
            <p className="mt-2 text-[12.5px] text-slate">
              <span className="font-semibold">Why this one:</span> {r.reason}
            </p>
          )}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3.5">
        <Link
          href={`/admin/contributors/${r.user_id}`}
          className="flex items-center gap-1 text-[12.5px] text-body transition-colors hover:text-ink"
        >
          <IconUsers size={13} /> View profile
        </Link>
        <DecisionControls
          requestId={r.id}
          contributorName={r.name}
          eventTitle={eventTitle}
          requestedTypes={types}
          canFinalize={canFinalize}
          isSuperAdmin={superAdmin}
          isFull={isFull}
          currentStatus={r.status}
          guestLimit={guestLimit}
          guestsRequested={Number(r.guests_requested ?? 0)}
        />
      </div>
    </Card>
  );
}

export { IconTicket, IconNote, LinkButton };
export type { CoverageType };
