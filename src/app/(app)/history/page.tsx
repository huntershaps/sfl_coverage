import Link from "next/link";
import { requireUser } from "@/lib/rbac";
import { getDb } from "@/lib/db";
import { coverageHistory } from "@/lib/events";
import {
  Card,
  EmptyState,
  LinkButton,
  IconArchive,
  IconCamera,
} from "@/components/ui";
import { CategoryBadge, CoverageTypeBadge } from "@/components/events/badges";
import { fmtDate, posterStyle, parseLocal, cx } from "@/lib/ui";
import { COVERAGE_TYPE_LABEL, type CoverageType } from "@/lib/constants";

export const metadata = { title: "Coverage History" };
export const dynamic = "force-dynamic";

export default async function HistoryPage() {
  const user = await requireUser();
  const rows = coverageHistory(user.id);

  const byType = new Map<string, number>();
  const byCategory = new Map<string, number>();
  const byYear = new Map<number, typeof rows>();

  for (const r of rows) {
    byType.set(r.coverage_type, (byType.get(r.coverage_type) ?? 0) + 1);
    byCategory.set(r.category, (byCategory.get(r.category) ?? 0) + 1);
    const y = parseLocal(r.start_datetime).getFullYear();
    if (!byYear.has(y)) byYear.set(y, []);
    byYear.get(y)!.push(r);
  }

  const venues = new Set(rows.map((r) => r.venue).filter(Boolean));

  // Requests that didn't become assignments still belong in a personal record.
  const passed = (
    getDb()
      .prepare(
        `SELECT COUNT(*) n FROM coverage_requests
          WHERE user_id = ? AND status IN ('rejected','withdrawn','cancelled')`,
      )
      .get(user.id) as { n: number }
  ).n;

  return (
    <div className="mx-auto max-w-[1000px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <header className="mb-6">
        <h1 className="text-[30px] sm:text-[36px] text-ink">Coverage history</h1>
        <p className="mt-1.5 max-w-[58ch] text-[14px] text-slate text-pretty">
          Every event you&apos;ve covered for South Florida Insider. Nothing gets
          deleted here — past events are archived, not removed.
        </p>
      </header>

      {rows.length === 0 ? (
        <Card>
          <EmptyState
            icon={<IconArchive />}
            title="No coverage on the record yet"
            body="Once an event you were assigned to has passed, it lands here as part of your portfolio — date, venue and what you covered."
            action={
              <LinkButton href="/events?availability=open" variant="primary">
                Find your first event
              </LinkButton>
            }
          />
        </Card>
      ) : (
        <>
          {/* Summary strip */}
          <div className="mb-7 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            <Stat value={rows.length} label={rows.length === 1 ? "event covered" : "events covered"} />
            <Stat value={venues.size} label={venues.size === 1 ? "venue" : "venues"} />
            <Stat value={byCategory.size} label="categories" />
            <Stat value={passed} label="requests not taken" muted />
          </div>

          {/* What you shoot most */}
          {byType.size > 0 && (
            <Card className="mb-7 p-5">
              <h2 className="mb-3 text-[15px] text-ink">What you cover</h2>
              <div className="space-y-2">
                {[...byType.entries()]
                  .sort((a, b) => b[1] - a[1])
                  .map(([type, count]) => {
                    const pct = Math.round((count / rows.length) * 100);
                    return (
                      <div key={type} className="flex items-center gap-3">
                        <span className="w-[110px] shrink-0 text-[13px] text-body">
                          {COVERAGE_TYPE_LABEL[type as CoverageType] ?? type}
                        </span>
                        <span className="h-2 flex-1 overflow-hidden rounded-full bg-canvas">
                          <span
                            className="block h-full rounded-full bg-gradient-to-r from-brand-500 to-sky-500"
                            style={{ width: `${Math.max(4, pct)}%` }}
                          />
                        </span>
                        <span className="tnum w-9 shrink-0 text-right text-[12.5px] text-slate">
                          {count}
                        </span>
                      </div>
                    );
                  })}
              </div>
            </Card>
          )}

          {/* Timeline by year */}
          <div className="space-y-8">
            {[...byYear.entries()]
              .sort((a, b) => b[0] - a[0])
              .map(([year, items]) => (
                <section key={year}>
                  <div className="mb-3 flex items-baseline gap-3">
                    <h2 className="font-[family-name:var(--font-display)] text-[24px] font-bold text-ink">
                      {year}
                    </h2>
                    <span className="text-[12.5px] text-slate">
                      {items.length} {items.length === 1 ? "event" : "events"}
                    </span>
                  </div>

                  <Card className="divide-y divide-line">
                    {items.map((r, i) => (
                      <Link
                        key={`${r.id}-${i}`}
                        href={`/events/${r.id}`}
                        className="group flex items-center gap-3.5 p-3.5 transition-colors hover:bg-canvas"
                      >
                        <div className="relative size-12 shrink-0 overflow-hidden rounded-lg">
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
                        </div>

                        <div className="min-w-0 flex-1">
                          <h3 className="line-clamp-1 text-[14.5px] font-semibold text-ink transition-colors group-hover:text-brand-600">
                            {r.title}
                          </h3>
                          <p className="mt-0.5 truncate text-[12px] text-slate">
                            <span className="tnum">{fmtDate(r.start_datetime, "long")}</span>
                            {r.venue && ` · ${r.venue}`}
                            {r.city && ` · ${r.city}`}
                          </p>
                        </div>

                        <div className="hidden shrink-0 sm:block">
                          <CategoryBadge category={r.category} />
                        </div>
                        <CoverageTypeBadge type={r.coverage_type} />
                      </Link>
                    ))}
                  </Card>
                </section>
              ))}
          </div>
        </>
      )}
    </div>
  );
}

function Stat({
  value,
  label,
  muted,
}: {
  value: number;
  label: string;
  muted?: boolean;
}) {
  return (
    <div className="surface p-4">
      <div
        className={cx(
          "tnum font-[family-name:var(--font-display)] text-[28px] font-bold leading-none",
          muted ? "text-slate" : "text-ink",
        )}
      >
        {value}
      </div>
      <div className="mt-1.5 text-[12.5px] leading-tight text-slate">{label}</div>
    </div>
  );
}

export { IconCamera };
