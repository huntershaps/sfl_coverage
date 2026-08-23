import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser, isAdmin, isSuperAdmin, canViewNote } from "@/lib/rbac";
import { getDb, parseJson } from "@/lib/db";
import {
  getEvent,
  capacityFor,
  viewerStateFor,
  eventAssignments,
  eventRequests,
  openTypes,
} from "@/lib/events";
import {
  Card,
  Badge,
  Avatar,
  LinkButton,
  EmptyState,
  IconPin,
  IconClock,
  IconCalendar,
  IconTicket,
  IconNote,
  IconUsers,
  IconCheck,
  IconArchive,
} from "@/components/ui";
import {
  CategoryBadge,
  EventStatusBadge,
  CoverageTypeBadge,
  RequestStatusBadge,
} from "@/components/events/badges";
import { RequestCoverageButton, WithdrawButton } from "@/components/events/request-dialog";
import { CoverItMyselfButton } from "@/components/events/cover-myself";
import { GuestBadge } from "@/components/guest-picker";
import { EventAdminPanel } from "@/components/events/event-admin-panel";
import {
  posterStyle,
  fmtDate,
  fmtTime,
  fmtAgo,
  relativeDay,
  cx,
} from "@/lib/ui";
import {
  COVERAGE_TYPE_LABEL,
  REQUEST_STATUS_MESSAGE,
  type EventStatus,
  type RequestStatus,
  type CoverageType,
} from "@/lib/constants";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ev = getEvent(Number(id));
  return { title: ev?.title ?? "Event" };
}

export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();
  const ev = getEvent(Number(id));
  if (!ev) notFound();
  if (ev.status === "draft" && !isAdmin(user)) notFound();

  const admin = isAdmin(user);
  const cap = capacityFor(ev);
  const mine = viewerStateFor(ev.id, user.id);
  const assignments = eventAssignments(ev.id).filter((a) => a.status !== "removed");
  const requests = admin ? eventRequests(ev.id) : [];
  const pendingCount = requests.filter((r) =>
    ["pending", "under_review"].includes(r.status),
  ).length;

  const db = getDb();
  const notes = admin
    ? (
        db
          .prepare(
            `SELECT n.*, u.name author_name, u.profile_photo author_photo
               FROM internal_notes n JOIN users u ON u.id = n.author_id
              WHERE n.event_id = ? ORDER BY n.created_at DESC`,
          )
          .all(ev.id) as {
          id: number;
          note: string;
          visibility: string;
          created_at: string;
          author_name: string;
          author_photo: string | null;
        }[]
      ).filter((n) => canViewNote(user, n.visibility))
    : [];

  const history = admin
    ? (db
        .prepare(
          `SELECT a.*, u.name actor_name FROM audit_log a
             LEFT JOIN users u ON u.id = a.actor_id
            WHERE a.event_id = ? ORDER BY a.created_at DESC LIMIT 25`,
        )
        .all(ev.id) as {
        id: number;
        summary: string;
        action: string;
        created_at: string;
        actor_name: string | null;
      }[])
    : [];

  const contributors = admin
    ? (db
        .prepare(
          `SELECT id, name, email, profile_photo, specialties, status FROM users
            WHERE role IN ('contributor','admin','super_admin') AND status != 'disabled'
            ORDER BY name`,
        )
        .all() as {
        id: number;
        name: string;
        email: string;
        profile_photo: string | null;
        specialties: string;
        status: string;
      }[])
    : [];

  const rel = relativeDay(ev.start_datetime);
  const openTypeLabels = openTypes(cap).map((t) => COVERAGE_TYPE_LABEL[t]);
  const canRequest =
    !mine.myAssignmentId &&
    !["pending", "under_review", "approved", "waitlisted"].includes(
      mine.myRequestStatus ?? "",
    ) &&
    !ev.requests_closed &&
    !["cancelled", "archived", "draft"].includes(ev.status) &&
    (!cap.isFull || !!ev.allow_waitlist);

  const mySpecialties = parseJson<string[]>(user.specialties, []);
  const suggested = mySpecialties
    .map((s) =>
      s === "videography" ? "video" : s === "writing" ? "article" : s === "interviews" ? "interview" : s,
    )
    .filter((s) => s !== "other");

  return (
    <div>
      {/* ------------------------------ hero ------------------------------ */}
      <div className="relative">
        <div className="absolute inset-0 overflow-hidden">
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
          <div className="absolute inset-0 bg-gradient-to-t from-canvas via-canvas/85 to-canvas/55" />
          <div className="absolute inset-x-0 bottom-0 h-px bg-line" />
        </div>

        <div className="relative mx-auto max-w-[1200px] px-4 pb-8 pt-6 sm:px-6 lg:px-8">
          <Link
            href="/events"
            className="inline-flex items-center gap-1.5 text-[13px] text-body transition-colors hover:text-ink"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden>
              <path d="m14 6-6 6 6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            All events
          </Link>

          <div className="mt-20 sm:mt-28 lg:mt-36">
            <div className="flex flex-wrap items-center gap-2">
              <CategoryBadge category={ev.category} />
              <EventStatusBadge status={ev.status as EventStatus} />
              {rel && (
                <Badge tone="bg-coral-600 text-white ring-coral-600">{rel}</Badge>
              )}
              {ev.requests_closed && (
                <Badge tone="bg-slate-100 text-slate-600 ring-slate-200">
                  Requests closed
                </Badge>
              )}
            </div>

            <h1 className="mt-3 max-w-[22ch] text-[32px] leading-[1.03] text-ink text-balance sm:text-[46px] lg:text-[56px]">
              {ev.title}
            </h1>
            {ev.subtitle && (
              <p className="mt-2 max-w-[60ch] text-[15px] text-body text-pretty">
                {ev.subtitle}
              </p>
            )}

            <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-2 text-[14px] text-body">
              <span className="flex items-center gap-2">
                <IconCalendar size={17} className="text-brand-500" />
                <span className="tnum">
                  {fmtDate(ev.start_datetime, "full")}
                  {ev.multi_day_end && ` — ${fmtDate(ev.multi_day_end, "long")}`}
                </span>
              </span>
              <span className="flex items-center gap-2">
                <IconClock size={17} className="text-brand-500" />
                <span className="tnum">{fmtTime(ev.start_datetime, ev.time_tbd)}</span>
              </span>
              {ev.venue && (
                <span className="flex items-center gap-2">
                  <IconPin size={17} className="text-brand-500" />
                  {ev.venue}
                  {ev.city && <span className="text-slate">· {ev.city}</span>}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ----------------------------- body ------------------------------ */}
      <div className="mx-auto max-w-[1200px] px-4 pb-10 sm:px-6 lg:px-8">
        <div className="grid gap-6 lg:grid-cols-[1fr_356px]">
          {/* Main column */}
          <div className="min-w-0 space-y-6">
            <CoverageCallout
              ev={ev}
              cap={cap}
              mine={mine}
              canRequest={canRequest}
              suggested={suggested}
              openTypeLabels={openTypeLabels}
              isAdminViewer={admin}
              isSuperAdminViewer={isSuperAdmin(user)}
            />

            {ev.description && (
              <Card className="p-5 sm:p-6">
                <h2 className="mb-3 text-[17px] text-ink">About this event</h2>
                <p className="whitespace-pre-wrap text-[14.5px] leading-relaxed text-body text-pretty">
                  {ev.description}
                </p>
              </Card>
            )}

            {/* Who's covering */}
            <Card className="p-5 sm:p-6">
              <div className="mb-4 flex items-center justify-between gap-3">
                <h2 className="text-[17px] text-ink">Coverage crew</h2>
                <span className="tnum text-[12.5px] text-slate">
                  {cap.approved}
                  {cap.limit != null && ` of ${cap.limit}`}{" "}
                  {cap.approved === 1 ? "person" : "people"}
                </span>
              </div>

              {assignments.length === 0 ? (
                <EmptyState
                  className="!py-8"
                  icon={<IconUsers />}
                  title="Nobody assigned yet"
                  body={
                    admin
                      ? "Approve a request or assign someone directly to get this covered."
                      : "This one is still open. Put your name in and the Super Admin will make the call."
                  }
                />
              ) : (
                <ul className="space-y-2">
                  {assignments.map((a) => (
                    <li
                      key={a.id}
                      className="flex items-center gap-3 rounded-xl bg-canvas px-3 py-2.5 ring-1 ring-inset ring-line"
                    >
                      <Avatar name={a.name} src={a.profile_photo} size={36} />
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-1.5 truncate text-[14px] font-semibold text-ink">
                          <span className="truncate">{a.name}</span>
                          <GuestBadge guests={Number(a.guests ?? 0)} />
                          {a.user_id === user.id && (
                            <span className="text-[12.5px] font-normal text-teal-700">
                              (you)
                            </span>
                          )}
                        </p>
                        <p className="text-[12px] text-slate">
                          {a.assigned_by_name
                            ? `Assigned by ${a.assigned_by_name}`
                            : "Assigned"}{" "}
                          · {fmtAgo(a.assigned_at)}
                        </p>
                      </div>
                      <CoverageTypeBadge type={a.coverage_type} />
                    </li>
                  ))}
                </ul>
              )}

              {ev.legacy_assignees && (
                <div className="mt-4 rounded-xl bg-sky-50 px-3.5 py-3 ring-1 ring-inset ring-sky-200">
                  <p className="text-[12.5px] font-semibold uppercase tracking-[0.08em] text-sky-700">
                    From the source doc
                  </p>
                  <p className="mt-1 text-[13px] text-body">{ev.legacy_assignees}</p>
                  <p className="mt-1.5 text-[12.5px] leading-snug text-slate">
                    Carried over verbatim when this event was imported. It is not a
                    platform assignment — approve or assign someone above to make it official.
                  </p>
                </div>
              )}
            </Card>

            {/* Admin: requests on this event */}
            {admin && (
              <Card className="p-5 sm:p-6">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <h2 className="text-[17px] text-ink">Coverage requests</h2>
                  {pendingCount > 0 && (
                    <LinkButton href={`/admin/approvals/${ev.id}`} variant="primary" size="sm">
                      Review {pendingCount}
                    </LinkButton>
                  )}
                </div>

                {requests.length === 0 ? (
                  <EmptyState
                    className="!py-8"
                    icon={<IconTicket />}
                    title="No requests yet"
                    body="When contributors ask to cover this event, they'll line up here for you to compare."
                  />
                ) : (
                  <ul className="space-y-2">
                    {requests.map((r) => (
                      <li
                        key={r.id}
                        className="flex flex-wrap items-center gap-3 rounded-xl bg-canvas px-3 py-2.5 ring-1 ring-inset ring-line"
                      >
                        <Avatar name={r.name} src={r.profile_photo} size={32} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13.5px] font-semibold text-ink">
                            {r.name}
                          </p>
                          <p className="text-[12.5px] text-slate">
                            {parseJson<string[]>(r.coverage_types, [])
                              .map((t) => COVERAGE_TYPE_LABEL[t as CoverageType] ?? t)
                              .join(", ")}{" "}
                            · {fmtAgo(r.submitted_at)}
                          </p>
                        </div>
                        <RequestStatusBadge status={r.status as RequestStatus} />
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            )}

            {/* Admin: internal notes */}
            {admin && (
              <Card className="p-5 sm:p-6">
                <h2 className="mb-1 text-[17px] text-ink">Internal notes</h2>
                <p className="mb-4 text-[12.5px] text-slate">
                  Only visible to administrators. Contributors never see these.
                </p>

                {notes.length === 0 ? (
                  <EmptyState
                    className="!py-7"
                    icon={<IconNote />}
                    title="No notes on this event"
                    body="Jot down credential status, promoter contacts, or why a decision went the way it did."
                  />
                ) : (
                  <ul className="space-y-2.5">
                    {notes.map((n) => (
                      <li
                        key={n.id}
                        className="rounded-xl bg-canvas px-3.5 py-3 ring-1 ring-inset ring-line"
                      >
                        <div className="mb-1.5 flex items-center gap-2">
                          <Avatar name={n.author_name} src={n.author_photo} size={22} />
                          <span className="text-[12.5px] font-semibold text-body">
                            {n.author_name}
                          </span>
                          <span className="text-[12.5px] text-slate">
                            {fmtAgo(n.created_at)}
                          </span>
                          {n.visibility === "super_admin_only" && (
                            <Badge tone="bg-brand-50 text-brand-700 ring-brand-200">
                              Super Admin only
                            </Badge>
                          )}
                        </div>
                        <p className="whitespace-pre-wrap text-[13.5px] leading-relaxed text-body">
                          {n.note}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            )}

            {/* Admin: audit trail */}
            {admin && history.length > 0 && (
              <Card className="p-5 sm:p-6">
                <h2 className="mb-4 text-[17px] text-ink">Decision history</h2>
                <ol className="relative space-y-3 border-l border-line pl-5">
                  {history.map((h) => (
                    <li key={h.id} className="relative">
                      <span
                        className="absolute -left-[23px] top-1.5 size-2 rounded-full bg-line-strong ring-4 ring-card"
                        aria-hidden
                      />
                      <p className="text-[13.5px] leading-snug text-body">{h.summary}</p>
                      <p className="mt-0.5 text-[12.5px] text-slate">
                        {fmtAgo(h.created_at)}
                      </p>
                    </li>
                  ))}
                </ol>
              </Card>
            )}
          </div>

          {/* Sidebar */}
          <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
            <Card className="p-5">
              <h3 className="mb-3.5 text-[15px] text-ink">Details</h3>
              <dl className="space-y-3 text-[13.5px]">
                <Detail label="Date">
                  {fmtDate(ev.start_datetime, "full")}
                  {ev.multi_day_end && (
                    <span className="block text-slate">
                      through {fmtDate(ev.multi_day_end, "full")}
                    </span>
                  )}
                </Detail>
                <Detail label="Time">
                  {fmtTime(ev.start_datetime, ev.time_tbd)}
                  {ev.time_tbd ? (
                    <span className="block text-[12px] text-slate">
                      Showtime not listed in the source — confirm with the venue.
                    </span>
                  ) : null}
                </Detail>
                {ev.venue && <Detail label="Venue">{ev.venue}</Detail>}
                {ev.address && <Detail label="Address">{ev.address}</Detail>}
                {ev.city && <Detail label="City">{ev.city}</Detail>}
                {ev.organizer && <Detail label="Organizer">{ev.organizer}</Detail>}
                <Detail label="Category">{ev.category}</Detail>
                <Detail label="Guests (+1s)">
                  {(ev.guest_limit ?? 0) > 0
                    ? `Up to ${ev.guest_limit} per contributor`
                    : "Not allowed on this event"}
                  {ev.guest_note && (
                    <span className="mt-1 block text-[12px] text-slate">
                      {ev.guest_note}
                    </span>
                  )}
                </Detail>
                <Detail label="Coverage limit">
                  {cap.limit == null ? "Unlimited" : `${cap.limit} contributors`}
                  {cap.typed && (
                    <span className="mt-1 block space-y-0.5">
                      {cap.byType.map((t) => (
                        <span key={t.type} className="block text-[12px] text-slate">
                          {t.label}: {t.filled}/{t.capacity}
                        </span>
                      ))}
                    </span>
                  )}
                </Detail>
              </dl>

              {ev.ticket_url && (
                <a
                  href={ev.ticket_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-canvas px-4 py-2.5 text-[13.5px] font-semibold text-ink ring-1 ring-inset ring-line transition-colors hover:bg-line-strong"
                >
                  <IconTicket size={16} /> Tickets &amp; info
                </a>
              )}

              {ev.source_note && (
                <p className="mt-4 flex items-start gap-1.5 border-t border-line pt-3 text-[12.5px] leading-snug text-slate">
                  <IconArchive size={13} className="mt-px shrink-0" />
                  {ev.source_note}
                </p>
              )}
            </Card>

            {admin && (
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
                isSuperAdmin={isSuperAdmin(user)}
                assignments={assignments.map((a) => ({
                  id: a.id,
                  name: a.name,
                  coverage_type: a.coverage_type,
                }))}
              />
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[12.5px] font-semibold uppercase tracking-[0.08em] text-slate">
        {label}
      </dt>
      <dd className="mt-0.5 text-body">{children}</dd>
    </div>
  );
}

/* --------------------------- the contributor CTA -------------------------- */

function CoverageCallout({
  ev,
  cap,
  mine,
  canRequest,
  suggested,
  openTypeLabels,
  isAdminViewer,
  isSuperAdminViewer,
}: {
  ev: {
    id: number;
    title: string;
    status: string;
    allow_waitlist: number;
    requests_closed: number;
    guest_limit: number;
    guest_note: string | null;
  };
  cap: ReturnType<typeof capacityFor>;
  mine: ReturnType<typeof viewerStateFor>;
  canRequest: boolean;
  suggested: string[];
  openTypeLabels: string[];
  isAdminViewer: boolean;
  isSuperAdminViewer: boolean;
}) {
  // --- assigned ---
  if (mine.myAssignmentId)
    return (
      <Card raised className="border-teal-200 p-5 sm:p-6">
        <div className="flex items-start gap-3.5">
          <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-teal-50 text-teal-700 ring-1 ring-inset ring-teal-200">
            <IconCheck size={22} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-[19px] text-ink">
              You&apos;re approved to cover this event
            </h2>
            <p className="mt-1 text-[13.5px] text-body">
              Your responsibility:{" "}
              <strong className="text-teal-700">
                {COVERAGE_TYPE_LABEL[mine.myCoverageType as CoverageType] ??
                  mine.myCoverageType}
              </strong>
              . It&apos;s on your schedule.
            </p>
            <div className="mt-3.5 flex flex-wrap gap-2">
              <LinkButton href="/schedule" variant="secondary" size="sm">
                View my schedule
              </LinkButton>
            </div>
          </div>
        </div>
      </Card>
    );

  // --- has an open request ---
  if (mine.myRequestStatus && ["pending", "under_review", "waitlisted"].includes(mine.myRequestStatus))
    return (
      <Card raised className="border-amber-200 p-5 sm:p-6">
        <div className="flex items-start gap-3.5">
          <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200">
            <IconClock size={22} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-[19px] text-ink">
              {mine.myRequestStatus === "waitlisted"
                ? "You're on the waitlist"
                : mine.myRequestStatus === "under_review"
                  ? "Your request is under review"
                  : "Request pending"}
            </h2>
            <p className="mt-1 text-[13.5px] text-body">
              {REQUEST_STATUS_MESSAGE[mine.myRequestStatus as RequestStatus]}{" "}
              {mine.myRequestStatus !== "waitlisted" &&
                "Pending Super Admin approval — you'll get a notification as soon as there's a decision."}
            </p>
            <div className="mt-3.5 flex flex-wrap gap-2">
              <LinkButton href="/requests" variant="secondary" size="sm">
                My requests
              </LinkButton>
              <WithdrawButton requestId={mine.myRequestId!} eventTitle={ev.title} size="sm" />
            </div>
          </div>
        </div>
      </Card>
    );

  // --- cancelled ---
  if (ev.status === "cancelled")
    return (
      <Card className="border-red-200 p-5 sm:p-6">
        <h2 className="text-[18px] text-ink">This event has been cancelled</h2>
        <p className="mt-1 text-[13.5px] text-body">
          It stays on the board for reference. Coverage requests are closed.
        </p>
      </Card>
    );

  if (ev.status === "postponed")
    return (
      <Card className="border-orange-200 p-5 sm:p-6">
        <h2 className="text-[18px] text-ink">This event has been postponed</h2>
        <p className="mt-1 text-[13.5px] text-body">
          A new date hasn&apos;t been set yet. Check back — requests reopen once
          it&apos;s rescheduled.
        </p>
      </Card>
    );

  // --- full ---
  if (cap.isFull && !ev.allow_waitlist)
    return (
      <Card className="p-5 sm:p-6">
        <h2 className="text-[18px] text-ink">Coverage is full</h2>
        <p className="mt-1 text-[13.5px] text-body">
          All {cap.limit} spots on this event are filled. The Super Admin can
          still expand the crew if plans change.
        </p>
      </Card>
    );

  // --- requests closed ---
  if (ev.requests_closed)
    return (
      <Card className="p-5 sm:p-6">
        <h2 className="text-[18px] text-ink">Requests are closed</h2>
        <p className="mt-1 text-[13.5px] text-body">
          The desk has stopped taking requests for this event. Reach out
          directly if something changes on your end.
        </p>
      </Card>
    );

  // --- open ---
  if (canRequest)
    return (
      <Card raised className="p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h2 className="text-[19px] text-ink">
              {cap.isFull ? "Coverage is full — waitlist open" : "Open for coverage"}
            </h2>
            <p className="mt-1 max-w-[52ch] text-[13.5px] text-body text-pretty">
              {cap.isFull
                ? "Every spot is taken, but you can join the waitlist in case something opens up."
                : cap.limit != null
                  ? `${cap.spotsLeft} of ${cap.limit} ${cap.spotsLeft === 1 ? "spot is" : "spots are"} still open.`
                  : "No limit set on this one — the desk decides who goes."}
              {openTypeLabels.length > 0 && ` Still needed: ${openTypeLabels.join(", ")}.`}
            </p>
          </div>
          <div className="flex w-full shrink-0 flex-col gap-2 sm:w-auto sm:flex-row">
            {isAdminViewer && (
              <CoverItMyselfButton
                eventId={ev.id}
                eventTitle={ev.title}
                isFull={cap.isFull}
                guestLimit={ev.guest_limit ?? 0}
                guestNote={ev.guest_note}
                suggestedTypes={suggested}
                isSuperAdmin={isSuperAdminViewer}
                className="w-full sm:w-auto"
              />
            )}
            <RequestCoverageButton
              eventId={ev.id}
              eventTitle={ev.title}
              isFull={cap.isFull}
              allowWaitlist={!!ev.allow_waitlist}
              suggestedTypes={suggested}
              openTypeLabels={openTypeLabels}
              guestLimit={ev.guest_limit ?? 0}
              guestNote={ev.guest_note}
              className="w-full sm:w-auto"
            />
          </div>
        </div>
      </Card>
    );

  // --- previously decided ---
  return (
    <Card className="p-5 sm:p-6">
      <h2 className="text-[18px] text-ink">
        {mine.myRequestStatus === "rejected"
          ? "This one went another direction"
          : "Not currently open to you"}
      </h2>
      <p className="mt-1 text-[13.5px] text-body">
        {mine.myRequestStatus === "rejected"
          ? "Thanks for putting your name in — plenty more on the board."
          : "Check the events page for what's still open."}
      </p>
      <div className="mt-3.5">
        <LinkButton href="/events?availability=open" variant="secondary" size="sm">
          Find open events
        </LinkButton>
      </div>
    </Card>
  );
}

export { cx };
