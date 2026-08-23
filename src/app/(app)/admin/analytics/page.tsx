import Link from "next/link";
import { requireAdmin } from "@/lib/rbac";
import { getDb } from "@/lib/db";
import { Card, Avatar, EmptyState, IconChart, LinkButton } from "@/components/ui";
import { CategoryBadge } from "@/components/events/badges";
import { categoryTone, fmtDate, cx } from "@/lib/ui";
import { COVERAGE_TYPE_LABEL, type CoverageType } from "@/lib/constants";

export const metadata = { title: "Analytics" };
export const dynamic = "force-dynamic";

export default async function AnalyticsPage() {
  await requireAdmin();
  const db = getDb();

  const n = (sql: string) => (db.prepare(sql).get() as { n: number }).n;

  const totalEvents = n("SELECT COUNT(*) n FROM events WHERE status != 'draft'");
  const upcoming = n(
    `SELECT COUNT(*) n FROM events WHERE date(coalesce(multi_day_end, start_datetime)) >= date('now') AND status NOT IN ('draft','archived','cancelled')`,
  );
  const covered = n(
    `SELECT COUNT(DISTINCT e.id) n FROM events e JOIN assignments a ON a.event_id = e.id
      WHERE a.status IN ('active','completed')
        AND date(coalesce(e.multi_day_end, e.start_datetime)) >= date('now')`,
  );
  const totalRequests = n("SELECT COUNT(*) n FROM coverage_requests");
  const approved = n("SELECT COUNT(*) n FROM coverage_requests WHERE status = 'approved'");
  const pending = n(
    "SELECT COUNT(*) n FROM coverage_requests WHERE status IN ('pending','under_review')",
  );

  const coverageRate = upcoming ? Math.round((covered / upcoming) * 100) : 0;
  const approvalRate = totalRequests ? Math.round((approved / totalRequests) * 100) : 0;

  const byCategory = db
    .prepare(
      `SELECT e.category,
              COUNT(*) total,
              SUM(CASE WHEN EXISTS (SELECT 1 FROM assignments a WHERE a.event_id = e.id AND a.status IN ('active','completed')) THEN 1 ELSE 0 END) covered
         FROM events e
        WHERE date(coalesce(e.multi_day_end, e.start_datetime)) >= date('now')
          AND e.status NOT IN ('draft','archived','cancelled')
        GROUP BY e.category ORDER BY total DESC`,
    )
    .all() as { category: string; total: number; covered: number }[];

  const byCity = db
    .prepare(
      `SELECT city, COUNT(*) total FROM events
        WHERE city IS NOT NULL AND city != ''
          AND date(coalesce(multi_day_end, start_datetime)) >= date('now')
          AND status NOT IN ('draft','archived','cancelled')
        GROUP BY city ORDER BY total DESC LIMIT 10`,
    )
    .all() as { city: string; total: number }[];

  const byVenue = db
    .prepare(
      `SELECT venue, COUNT(*) total FROM events
        WHERE venue IS NOT NULL AND venue != ''
          AND date(coalesce(multi_day_end, start_datetime)) >= date('now')
          AND status NOT IN ('draft','archived','cancelled')
        GROUP BY venue ORDER BY total DESC LIMIT 10`,
    )
    .all() as { venue: string; total: number }[];

  const byType = db
    .prepare(
      `SELECT coverage_type, COUNT(*) total FROM assignments
        WHERE status IN ('active','completed') GROUP BY coverage_type ORDER BY total DESC`,
    )
    .all() as { coverage_type: string; total: number }[];

  const topContributors = db
    .prepare(
      `SELECT u.id, u.name, u.profile_photo,
              COUNT(a.id) assignments,
              (SELECT COUNT(*) FROM coverage_requests r WHERE r.user_id = u.id) requests
         FROM users u JOIN assignments a ON a.user_id = u.id AND a.status IN ('active','completed')
        GROUP BY u.id ORDER BY assignments DESC LIMIT 8`,
    )
    .all() as {
    id: number;
    name: string;
    profile_photo: string | null;
    assignments: number;
    requests: number;
  }[];

  const monthly = db
    .prepare(
      `SELECT substr(start_datetime, 1, 7) month, COUNT(*) total
         FROM events
        WHERE date(start_datetime) >= date('now','-1 month')
          AND status NOT IN ('draft','archived')
        GROUP BY month ORDER BY month ASC LIMIT 12`,
    )
    .all() as { month: string; total: number }[];

  const maxMonth = Math.max(1, ...monthly.map((m) => m.total));

  if (totalEvents === 0)
    return (
      <div className="mx-auto max-w-[1100px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <h1 className="mb-6 text-[30px] text-ink">Analytics</h1>
        <Card>
          <EmptyState
            icon={<IconChart />}
            title="Nothing to measure yet"
            body="Import or add some events and the coverage picture builds itself from there."
            action={
              <LinkButton href="/admin/import" variant="primary">
                Import events
              </LinkButton>
            }
          />
        </Card>
      </div>
    );

  return (
    <div className="mx-auto max-w-[1100px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <header className="mb-6">
        <h1 className="text-[30px] sm:text-[36px] text-ink">Analytics</h1>
        <p className="mt-1.5 max-w-[58ch] text-[14px] text-slate text-pretty">
          Operational numbers, not vanity metrics — what&apos;s covered, what
          isn&apos;t, and who&apos;s carrying the load.
        </p>
      </header>

      {/* Headline */}
      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <BigStat
          value={`${coverageRate}%`}
          label="of upcoming events have someone on them"
          detail={`${covered} of ${upcoming}`}
          tone={coverageRate >= 60 ? "surf" : coverageRate >= 30 ? "gold" : "sun"}
        />
        <BigStat value={upcoming - covered} label="upcoming events with no coverage" tone="gold" />
        <BigStat value={pending} label="requests waiting on a decision" tone={pending ? "sun" : undefined} />
        <BigStat
          value={`${approvalRate}%`}
          label="of all requests were approved"
          detail={`${approved} of ${totalRequests}`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Coverage by category */}
        <Card className="p-5">
          <h2 className="mb-4 text-[16px] text-ink">Coverage by category</h2>
          {byCategory.length === 0 ? (
            <p className="py-6 text-center text-[13px] text-slate">No upcoming events.</p>
          ) : (
            <div className="space-y-3">
              {byCategory.slice(0, 9).map((c) => {
                const pct = c.total ? Math.round((c.covered / c.total) * 100) : 0;
                return (
                  <div key={c.category}>
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <CategoryBadge category={c.category} />
                      <span className="tnum text-[12px] text-slate">
                        {c.covered}/{c.total} covered
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-canvas">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${Math.max(2, pct)}%`,
                          background: categoryTone(c.category).hue,
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        {/* Events per month */}
        <Card className="p-5">
          <h2 className="mb-4 text-[16px] text-ink">Events by month</h2>
          {monthly.length === 0 ? (
            <p className="py-6 text-center text-[13px] text-slate">Nothing scheduled.</p>
          ) : (
            <div className="flex h-[180px] items-end gap-1.5">
              {monthly.map((m) => (
                <div key={m.month} className="flex flex-1 flex-col items-center gap-1.5">
                  <span className="tnum text-[11.5px] text-slate">{m.total}</span>
                  <div
                    className="w-full rounded-t-md bg-gradient-to-t from-brand-500/50 to-sky-500/70 transition-all"
                    style={{ height: `${Math.max(4, (m.total / maxMonth) * 130)}px` }}
                  />
                  <span className="text-[11px] text-slate">
                    {fmtDate(`${m.month}-01T00:00`).split(" ")[0]}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Busiest venues */}
        <Card className="p-5">
          <h2 className="mb-4 text-[16px] text-ink">Busiest venues</h2>
          {byVenue.length === 0 ? (
            <p className="py-6 text-center text-[13px] text-slate">No venue data.</p>
          ) : (
            <ul className="space-y-2">
              {byVenue.map((v) => (
                <li key={v.venue} className="flex items-center gap-3">
                  <span className="min-w-0 flex-1 truncate text-[13px] text-body">
                    {v.venue}
                  </span>
                  <span className="h-1.5 w-24 overflow-hidden rounded-full bg-canvas">
                    <span
                      className="block h-full rounded-full bg-teal-400"
                      style={{ width: `${(v.total / byVenue[0].total) * 100}%` }}
                    />
                  </span>
                  <span className="tnum w-6 text-right text-[12px] text-slate">
                    {v.total}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Cities + coverage types */}
        <Card className="p-5">
          <h2 className="mb-4 text-[16px] text-ink">Where and what</h2>

          <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-slate">
            Cities
          </h3>
          <div className="mb-5 flex flex-wrap gap-1.5">
            {byCity.map((c) => (
              <Link
                key={c.city}
                href={`/events?city=${encodeURIComponent(c.city)}`}
                className="rounded-full bg-canvas px-2.5 py-1 text-[12px] text-body ring-1 ring-inset ring-line transition-colors hover:bg-line"
              >
                {c.city} <span className="tnum text-slate">{c.total}</span>
              </Link>
            ))}
          </div>

          <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-slate">
            Assignments by coverage type
          </h3>
          {byType.length === 0 ? (
            <p className="text-[13px] text-slate">No assignments made yet.</p>
          ) : (
            <ul className="space-y-1.5">
              {byType.map((t) => (
                <li key={t.coverage_type} className="flex items-center justify-between">
                  <span className="text-[13px] text-body">
                    {COVERAGE_TYPE_LABEL[t.coverage_type as CoverageType] ??
                      t.coverage_type}
                  </span>
                  <span className="tnum text-[13px] text-ink">{t.total}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* Contributors */}
      <Card className="mt-4 p-5">
        <h2 className="mb-4 text-[16px] text-ink">Most active contributors</h2>
        {topContributors.length === 0 ? (
          <EmptyState
            className="!py-8"
            icon={<IconChart />}
            title="No assignments yet"
            body="Once you start approving coverage this fills in with who's doing what."
          />
        ) : (
          <ul className="space-y-2">
            {topContributors.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/admin/contributors/${c.id}`}
                  className="flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-canvas"
                >
                  <Avatar name={c.name} src={c.profile_photo} size={32} />
                  <span className="min-w-0 flex-1 truncate text-[13.5px] text-ink">
                    {c.name}
                  </span>
                  <span className="h-1.5 w-28 overflow-hidden rounded-full bg-canvas">
                    <span
                      className="block h-full rounded-full bg-gradient-to-r from-brand-500 to-sky-500"
                      style={{
                        width: `${(c.assignments / topContributors[0].assignments) * 100}%`,
                      }}
                    />
                  </span>
                  <span className="tnum shrink-0 text-[12px] text-slate">
                    {c.assignments} assigned · {c.requests} asked
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function BigStat({
  value,
  label,
  detail,
  tone,
}: {
  value: string | number;
  label: string;
  detail?: string;
  tone?: "sun" | "surf" | "gold";
}) {
  const tones = { sun: "text-brand-700", surf: "text-teal-700", gold: "text-amber-700" };
  return (
    <Card className="p-5">
      <div
        className={cx(
          "tnum font-[family-name:var(--font-display)] text-[34px] font-bold leading-none",
          tone ? tones[tone] : "text-ink",
        )}
      >
        {value}
      </div>
      <div className="mt-2 text-[12.5px] leading-snug text-slate">{label}</div>
      {detail && <div className="mt-1 tnum text-[12.5px] text-slate">{detail}</div>}
    </Card>
  );
}
