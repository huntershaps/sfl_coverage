import Link from "next/link";
import { requireUser } from "@/lib/rbac";
import { getDb, parseJson } from "@/lib/db";
import {
  Card,
  EmptyState,
  LinkButton,
  Badge,
  IconInbox,
  IconChevron,
  IconClock,
} from "@/components/ui";
import { RequestStatusBadge, CategoryBadge } from "@/components/events/badges";
import { WithdrawButton } from "@/components/events/request-dialog";
import { fmtDate, fmtTime, fmtAgo, posterStyle, cx } from "@/lib/ui";
import {
  COVERAGE_TYPE_LABEL,
  REQUEST_STATUS_MESSAGE,
  CREDENTIAL_STATUS_LABEL,
  CREDENTIAL_STATUS_ICON,
  REQUEST_GROUPS,
  type RequestStatus,
  type CoverageType,
} from "@/lib/constants";
import { EventTime } from "@/components/events/event-time";

export const metadata = { title: "My Requests" };
export const dynamic = "force-dynamic";

type Row = {
  id: number;
  status: RequestStatus;
  coverage_types: string;
  message: string | null;
  reason: string | null;
  decision_note: string | null;
  guests_requested: number;
  approved_guests: number | null;
  submitted_at: string;
  reviewed_at: string | null;
  reviewed_by_name: string | null;
  event_id: number;
  title: string;
  category: string;
  start_datetime: string;
  time_tbd: number;
  venue: string | null;
  city: string | null;
  image_url: string | null;
  event_status: string;
};

const OPEN: RequestStatus[] = ["pending", "under_review", "waitlisted"];

export default async function MyRequestsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const user = await requireUser();
  const tab = (Array.isArray(sp.tab) ? sp.tab[0] : sp.tab) ?? "open";

  const rows = getDb()
    .prepare(
      `SELECT r.id, r.status, r.coverage_types, r.message, r.reason, r.decision_note,
              r.guests_requested, r.submitted_at, r.reviewed_at, rv.name reviewed_by_name,
              (SELECT a.guests FROM assignments a
                WHERE a.request_id = r.id AND a.status = 'active' LIMIT 1) approved_guests,
              e.id event_id, e.title, e.category, e.start_datetime, e.time_tbd,
              e.venue, e.city, e.image_url, e.status event_status
         FROM coverage_requests r
         JOIN events e ON e.id = r.event_id
         LEFT JOIN users rv ON rv.id = r.reviewed_by
        WHERE r.user_id = ?
        ORDER BY
          CASE r.status WHEN 'pending' THEN 0 WHEN 'under_review' THEN 1
                        WHEN 'waitlisted' THEN 2 ELSE 3 END,
          e.start_datetime ASC`,
    )
    .all(user.id) as Row[];

  const open = rows.filter((r) => OPEN.includes(r.status));
  const closed = rows.filter((r) => !OPEN.includes(r.status));
  const visible = tab === "closed" ? closed : open;

  // Grouped by what the contributor needs to know, rather than one flat list
  // where "Pending" and "Not approved" sit side by side.
  const groups = REQUEST_GROUPS.map((g) => ({
    ...g,
    rows: visible.filter((r) => (g.statuses as RequestStatus[]).includes(r.status)),
  })).filter((g) => g.rows.length > 0);

  return (
    <div className="mx-auto max-w-[900px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <header className="mb-6">
        <h1 className="text-[30px] sm:text-[36px] text-ink">My requests</h1>
        <p className="mt-1.5 max-w-[58ch] text-[14px] text-slate text-pretty">
          Every credential you&apos;ve asked for, and exactly where it stands.
          The Super Admin has the final say on all of them.
        </p>
      </header>

      <div className="mb-5 flex gap-1 rounded-xl bg-sunken p-1 ring-1 ring-inset ring-line">
        {[
          { key: "open", label: `Open${open.length ? ` (${open.length})` : ""}` },
          { key: "closed", label: `Decided${closed.length ? ` (${closed.length})` : ""}` },
        ].map((t) => (
          <Link
            key={t.key}
            href={`/requests${t.key === "closed" ? "?tab=closed" : ""}`}
            className={cx(
              "rounded-lg px-4 py-1.5 text-[13px] font-medium transition-colors",
              tab === t.key
                ? "bg-card text-brand-700 shadow-sm"
                : "text-slate hover:bg-canvas hover:text-body",
            )}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {visible.length === 0 ? (
        <Card>
          {tab === "closed" ? (
            <EmptyState
              icon={<IconClock />}
              title="No decisions yet"
              body="Once the desk approves, waitlists or passes on a request, it moves here with any note they left you."
            />
          ) : (
            <EmptyState
              icon={<IconInbox />}
              title="No open requests"
              body="Find a show, opening or game you want and hit Request to Cover. You'll be able to track it right here."
              action={
                <LinkButton href="/events?availability=open" variant="primary">
                  Find something to cover
                </LinkButton>
              }
            />
          )}
        </Card>
      ) : (
        <div className="space-y-8">
          {groups.map((g) => (
            <section key={g.key}>
              <div className="mb-3">
                <h2 className="flex items-baseline gap-2 text-[18px] text-ink">
                  {g.title}
                  <span className="tnum text-[13px] font-normal text-slate">
                    {g.rows.length}
                  </span>
                </h2>
                <p className="mt-0.5 text-[12.5px] text-slate">{g.blurb}</p>
              </div>
              <div className="space-y-3">
                {g.rows.map((r) => (
                  <RequestCard key={r.id} r={r} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function RequestCard({ r }: { r: Row }) {
  const types = parseJson<string[]>(r.coverage_types, []);
  const isOpen = OPEN.includes(r.status);

  return (
    <Card
      className={cx(
        "p-4 sm:p-5",
        r.status === "approved" && "border-teal-200",
        r.status === "waitlisted" && "border-sky-200",
      )}
    >
      <div className="flex gap-4">
        <Link
          href={`/events/${r.event_id}`}
          className="relative hidden size-[72px] shrink-0 overflow-hidden rounded-xl sm:block"
        >
          {r.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={r.image_url} alt="" className="size-full object-cover" />
          ) : (
            <div
              className="poster-mesh size-full"
              style={posterStyle(r.title, r.category)}
              aria-hidden
            />
          )}
        </Link>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <CategoryBadge category={r.category} />
            <RequestStatusBadge status={r.status} />
            {r.event_status === "cancelled" && (
              <Badge tone="bg-red-50 text-red-600 ring-red-200">
                Event cancelled
              </Badge>
            )}
          </div>

          <Link href={`/events/${r.event_id}`} className="group">
            <h2 className="mt-1.5 text-[17px] leading-tight text-ink transition-colors group-hover:text-brand-600">
              {r.title}
            </h2>
          </Link>

          <p className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[12.5px] text-slate">
            <span className="tnum">{fmtDate(r.start_datetime, "long")}</span>
            <EventTime ev={r} size="sm" />
            {r.venue && <span>· {r.venue}</span>}
            {r.city && <span>· {r.city}</span>}
          </p>

          <p className="mt-2.5 text-[12.5px] text-body">
            <span className="text-slate">You offered:</span>{" "}
            {types.map((t) => COVERAGE_TYPE_LABEL[t as CoverageType] ?? t).join(", ")}
            {r.guests_requested > 0 && (
              <span className="text-slate"> · asked to bring +{r.guests_requested}</span>
            )}
            {r.status === "approved" && (r.approved_guests ?? 0) > 0 && (
              <span className="font-semibold text-amber-700">
                {" "}· approved for +{r.approved_guests}
              </span>
            )}
            <span className="text-slate"> · submitted {fmtAgo(r.submitted_at)}</span>
          </p>

          {/* Status message — the plain-language line the spec asks for */}
          <div
            className={cx(
              "mt-3 rounded-xl px-3.5 py-2.5 text-[13px] leading-relaxed ring-1 ring-inset",
              r.status === "approved"
                ? "bg-teal-50 text-teal-700 ring-teal-200"
                : r.status === "waitlisted"
                  ? "bg-sky-50 text-sky-700 ring-sky-200"
                  : r.status === "rejected"
                    ? "bg-canvas text-body ring-line"
                    : "bg-amber-50 text-amber-700 ring-amber-200",
            )}
          >
            <span className="block font-semibold">
              {CREDENTIAL_STATUS_ICON[r.status]} {CREDENTIAL_STATUS_LABEL[r.status]}
            </span>
            <span className="mt-0.5 block">{REQUEST_STATUS_MESSAGE[r.status]}</span>
            {r.decision_note && (
              <span className="mt-1.5 block border-t border-current/15 pt-1.5 italic opacity-90">
                “{r.decision_note}”
                {r.reviewed_by_name && (
                  <span className="not-italic opacity-70"> — {r.reviewed_by_name}</span>
                )}
              </span>
            )}
          </div>

          {r.message && (
            <p className="mt-2 text-[12px] text-slate">
              <span className="font-semibold">Your message:</span> “{r.message}”
            </p>
          )}

          <div className="mt-3.5 flex flex-wrap items-center gap-2">
            <Link
              href={`/events/${r.event_id}`}
              className="flex items-center gap-1 text-[12.5px] font-medium text-body transition-colors hover:text-ink"
            >
              View event <IconChevron size={12} />
            </Link>
            {isOpen && (
              <WithdrawButton requestId={r.id} eventTitle={r.title} size="sm" />
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}
