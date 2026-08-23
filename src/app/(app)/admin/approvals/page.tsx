import Link from "next/link";
import { requireAdmin, isSuperAdmin, canFinalizeDecision } from "@/lib/rbac";
import { getDb, parseJson, boolSetting } from "@/lib/db";
import { capacityFor } from "@/lib/events";
import {
  Card,
  Avatar,
  Badge,
  EmptyState,
  LinkButton,
  IconInbox,
  IconChevron,
  IconShield,
  IconCheck,
} from "@/components/ui";
import { CategoryBadge, CoverageMeter } from "@/components/events/badges";
import { fmtDate, fmtTime, fmtAgo, relativeDay, posterStyle, cx } from "@/lib/ui";
import { COVERAGE_TYPE_LABEL, type CoverageType } from "@/lib/constants";

export const metadata = { title: "Approval Center" };
export const dynamic = "force-dynamic";

type EventGroup = {
  id: number;
  title: string;
  category: string;
  start_datetime: string;
  time_tbd: number;
  venue: string | null;
  city: string | null;
  image_url: string | null;
  coverage_limit: number | null;
  requests_closed: number;
  pending: number;
  under_review: number;
  waitlisted: number;
  oldest: string;
};

export default async function ApprovalCenterPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const user = await requireAdmin();
  const db = getDb();
  const filter = (Array.isArray(sp.show) ? sp.show[0] : sp.show) ?? "open";

  const groups = db
    .prepare(
      `SELECT e.id, e.title, e.category, e.start_datetime, e.time_tbd, e.venue, e.city,
              e.image_url, e.coverage_limit, e.requests_closed,
              SUM(CASE WHEN r.status = 'pending' THEN 1 ELSE 0 END) pending,
              SUM(CASE WHEN r.status = 'under_review' THEN 1 ELSE 0 END) under_review,
              SUM(CASE WHEN r.status = 'waitlisted' THEN 1 ELSE 0 END) waitlisted,
              MIN(r.submitted_at) oldest
         FROM events e JOIN coverage_requests r ON r.event_id = e.id
        WHERE r.status IN ('pending','under_review','waitlisted')
        GROUP BY e.id
        ORDER BY
          CASE WHEN date(e.start_datetime) < date('now','+7 days') THEN 0 ELSE 1 END,
          SUM(CASE WHEN r.status IN ('pending','under_review') THEN 1 ELSE 0 END) DESC,
          e.start_datetime ASC`,
    )
    .all() as EventGroup[];

  const visible =
    filter === "all"
      ? groups
      : groups.filter((g) => g.pending + g.under_review > 0);

  const totalPending = groups.reduce((a, g) => a + g.pending + g.under_review, 0);
  const awaitingSuperAdmin = (
    db
      .prepare(
        `SELECT COUNT(*) n FROM coverage_requests WHERE status = 'under_review' AND recommendation IS NOT NULL`,
      )
      .get() as { n: number }
  ).n;

  const finalMode = boolSetting("require_super_admin_approval");
  const canFinalize = canFinalizeDecision(user);

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <header className="mb-6">
        <h1 className="text-[30px] sm:text-[36px] text-ink">Approval Center</h1>
        <p className="mt-1.5 max-w-[62ch] text-[14px] text-slate text-pretty">
          Requests grouped by event, so when five people want the same show you
          decide between them side by side instead of one at a time.
        </p>
      </header>

      {/* Authority banner */}
      <Card
        className={cx(
          "mb-6 p-4",
          isSuperAdmin(user) ? "border-brand-200" : "border-sky-200",
        )}
      >
        <div className="flex items-start gap-3">
          <span
            className={cx(
              "grid size-9 shrink-0 place-items-center rounded-xl ring-1 ring-inset",
              isSuperAdmin(user)
                ? "bg-brand-50 text-brand-600 ring-brand-200"
                : "bg-sky-50 text-sky-700 ring-sky-200",
            )}
          >
            <IconShield size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-semibold text-ink">
              {isSuperAdmin(user)
                ? "You have final say on every coverage decision."
                : canFinalize
                  ? "You can approve requests directly."
                  : "Your decisions are recommendations."}
            </p>
            <p className="mt-0.5 text-[12.5px] leading-snug text-slate">
              {isSuperAdmin(user)
                ? finalMode
                  ? "Final-approval mode is on — Admin/Editor decisions come to you as recommendations before they take effect."
                  : "Final-approval mode is off, so Admin/Editors can approve on their own. You can still override anything they decide."
                : canFinalize
                  ? "Final-approval mode is off. The Super Admin can still override any decision you make."
                  : "Final-approval mode is on. What you choose is logged as a recommendation and sent to the Super Admin for sign-off."}
            </p>
          </div>
          {isSuperAdmin(user) && awaitingSuperAdmin > 0 && (
            <Badge tone="bg-brand-50 text-brand-700 ring-brand-200">
              {awaitingSuperAdmin} awaiting you
            </Badge>
          )}
        </div>
      </Card>

      {/* Filter tabs */}
      <div className="mb-5 flex items-center justify-between gap-3">
        <div className="flex gap-1 rounded-xl bg-sunken p-1 ring-1 ring-inset ring-line">
          {[
            { key: "open", label: `Needs a decision${totalPending ? ` (${totalPending})` : ""}` },
            { key: "all", label: "All with requests" },
          ].map((t) => (
            <Link
              key={t.key}
              href={`/admin/approvals${t.key === "all" ? "?show=all" : ""}`}
              className={cx(
                "rounded-lg px-3.5 py-1.5 text-[13px] font-medium transition-colors",
                filter === t.key
                  ? "bg-card text-brand-700 shadow-sm"
                  : "text-slate hover:bg-canvas hover:text-body",
              )}
            >
              {t.label}
            </Link>
          ))}
        </div>
      </div>

      {visible.length === 0 ? (
        <Card>
          <EmptyState
            icon={<IconCheck />}
            title="Everything's decided"
            body="No coverage requests are waiting on you. New ones land here the moment a contributor submits, and you'll get a notification too."
            action={
              <LinkButton href="/events" variant="secondary">
                Browse the board
              </LinkButton>
            }
          />
        </Card>
      ) : (
        <div className="space-y-3">
          {visible.map((g) => (
            <EventGroupCard key={g.id} group={g} />
          ))}
        </div>
      )}
    </div>
  );
}

function EventGroupCard({ group: g }: { group: EventGroup }) {
  const db = getDb();
  const cap = capacityFor({ id: g.id, coverage_limit: g.coverage_limit });

  const requesters = db
    .prepare(
      `SELECT u.id, u.name, u.profile_photo, r.coverage_types, r.status
         FROM coverage_requests r JOIN users u ON u.id = r.user_id
        WHERE r.event_id = ? AND r.status IN ('pending','under_review','waitlisted')
        ORDER BY r.submitted_at ASC LIMIT 8`,
    )
    .all(g.id) as {
    id: number;
    name: string;
    profile_photo: string | null;
    coverage_types: string;
    status: string;
  }[];

  const openCount = g.pending + g.under_review;
  const rel = relativeDay(g.start_datetime);

  return (
    <Link
      href={`/admin/approvals/${g.id}`}
      className="surface-raised group block p-4 transition-all hover:-translate-y-0.5 hover:border-line-strong sm:p-5"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        {/* Artwork */}
        <div className="relative hidden size-[76px] shrink-0 overflow-hidden rounded-xl sm:block">
          {g.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={g.image_url} alt="" className="size-full object-cover" />
          ) : (
            <div
              className="poster-mesh size-full"
              style={posterStyle(g.title, g.category)}
              aria-hidden
            />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <CategoryBadge category={g.category} />
            {rel && (
              <Badge tone="bg-coral-600 text-white ring-coral-600">{rel}</Badge>
            )}
            {g.requests_closed ? (
              <Badge tone="bg-line text-body ring-line">Requests closed</Badge>
            ) : null}
          </div>

          <h2 className="mt-1.5 line-clamp-1 text-[17px] text-ink group-hover:text-brand-600 transition-colors">
            {g.title}
          </h2>
          <p className="mt-0.5 truncate text-[12.5px] text-slate">
            <span className="tnum">
              {fmtDate(g.start_datetime, "long")} · {fmtTime(g.start_datetime, g.time_tbd)}
            </span>
            {g.venue && ` · ${g.venue}`}
            {g.city && ` · ${g.city}`}
          </p>

          {/* Requester faces */}
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <div className="flex -space-x-2">
              {requesters.slice(0, 6).map((r) => (
                <span key={r.id} title={r.name} className="ring-2 ring-card rounded-full">
                  <Avatar name={r.name} src={r.profile_photo} size={28} />
                </span>
              ))}
              {requesters.length > 6 && (
                <span className="grid size-7 place-items-center rounded-full bg-line text-[11.5px] font-bold text-body ring-2 ring-card">
                  +{requesters.length - 6}
                </span>
              )}
            </div>

            <p className="text-[12.5px] text-body">
              <strong className="tnum text-ink">{openCount}</strong>{" "}
              {openCount === 1 ? "request" : "requests"}
              {g.waitlisted > 0 && (
                <span className="text-slate"> · {g.waitlisted} waitlisted</span>
              )}
              {g.oldest && (
                <span className="text-slate"> · oldest {fmtAgo(g.oldest)}</span>
              )}
            </p>
          </div>
        </div>

        {/* Capacity + CTA */}
        <div className="flex shrink-0 items-center justify-between gap-4 sm:flex-col sm:items-end sm:gap-2.5">
          <div className="text-right">
            <div className="tnum font-[family-name:var(--font-display)] text-[22px] font-bold leading-none text-ink">
              {cap.limit == null ? "∞" : `${cap.spotsLeft}`}
            </div>
            <div className="text-[12px] text-slate">
              {cap.limit == null
                ? "no limit set"
                : cap.spotsLeft === 1
                  ? "spot available"
                  : "spots available"}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <CoverageMeter approved={cap.approved} limit={cap.limit} showLabel={false} />
            <span className="flex items-center gap-1 rounded-lg bg-canvas px-2.5 py-1.5 text-[12.5px] font-semibold text-ink transition-colors group-hover:bg-line-strong">
              Review <IconChevron size={13} />
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}

export { IconInbox, COVERAGE_TYPE_LABEL, parseJson };
export type { CoverageType };
