import Link from "next/link";
import { requireAdmin } from "@/lib/rbac";
import { getDb, parseJson } from "@/lib/db";
import { Card, Avatar, Badge, EmptyState, IconArchive } from "@/components/ui";
import { fmtAgo, cx } from "@/lib/ui";

export const metadata = { title: "Activity Log" };
export const dynamic = "force-dynamic";

type Entry = {
  id: number;
  action: string;
  entity_type: string;
  entity_id: number | null;
  event_id: number | null;
  summary: string;
  meta: string;
  created_at: string;
  actor_name: string | null;
  actor_photo: string | null;
  actor_role: string | null;
};

const GROUPS: { key: string; label: string; match: (a: string) => boolean }[] = [
  { key: "all", label: "Everything", match: () => true },
  {
    key: "decisions",
    label: "Approval decisions",
    match: (a) => a.startsWith("request."),
  },
  {
    key: "assignments",
    label: "Assignments",
    match: (a) => a.startsWith("assignment."),
  },
  { key: "events", label: "Event changes", match: (a) => a.startsWith("event.") },
  { key: "imports", label: "Imports", match: (a) => a.startsWith("import.") },
  {
    key: "accounts",
    label: "Accounts & settings",
    match: (a) =>
      a.startsWith("user.") ||
      a.startsWith("role.") ||
      a.startsWith("password.") ||
      a.startsWith("settings.") ||
      a.startsWith("profile."),
  },
];

function toneFor(action: string) {
  if (action.includes("approved") || action.includes("assignment.created"))
    return "bg-teal-400";
  if (
    action.includes("rejected") ||
    action.includes("removed") ||
    action.includes("deleted")
  )
    return "bg-red-400";
  if (action.includes("waitlisted") || action.includes("recommended"))
    return "bg-sky-500";
  if (action.startsWith("import.")) return "bg-amber-500";
  if (action.startsWith("event.")) return "bg-sky-400";
  return "bg-line-strong";
}

export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  await requireAdmin();
  const group = String((Array.isArray(sp.g) ? sp.g[0] : sp.g) ?? "all");
  const page = Math.max(1, Number((Array.isArray(sp.page) ? sp.page[0] : sp.page) ?? 1));
  const perPage = 60;

  const db = getDb();
  const all = db
    .prepare(
      `SELECT a.id, a.action, a.entity_type, a.entity_id, a.event_id, a.summary,
              a.meta, a.created_at,
              u.name actor_name, u.profile_photo actor_photo, u.role actor_role
         FROM audit_log a LEFT JOIN users u ON u.id = a.actor_id
        ORDER BY a.created_at DESC, a.id DESC
        LIMIT 1200`,
    )
    .all() as Entry[];

  const matcher = GROUPS.find((g) => g.key === group) ?? GROUPS[0];
  const filtered = all.filter((e) => matcher.match(e.action));
  const total = filtered.length;
  const rows = filtered.slice((page - 1) * perPage, page * perPage);
  const totalPages = Math.ceil(total / perPage);

  // Group by day so a long log stays readable.
  const byDay = new Map<string, Entry[]>();
  for (const e of rows) {
    const day = e.created_at.slice(0, 10);
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day)!.push(e);
  }

  return (
    <div className="mx-auto max-w-[900px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <header className="mb-6">
        <h1 className="text-[30px] sm:text-[36px] text-ink">Activity log</h1>
        <p className="mt-1.5 max-w-[60ch] text-[14px] text-slate text-pretty">
          Every decision that mattered — who approved what, when assignments
          changed, and what each import brought in. Visible to administrators only.
        </p>
      </header>

      <div className="mb-5 flex flex-wrap gap-1.5">
        {GROUPS.map((g) => (
          <Link
            key={g.key}
            href={`/admin/activity${g.key === "all" ? "" : `?g=${g.key}`}`}
            className={cx(
              "rounded-full px-3.5 py-1.5 text-[12.5px] font-medium ring-1 ring-inset transition-colors",
              group === g.key
                ? "bg-line text-ink ring-line"
                : "text-slate ring-transparent hover:bg-canvas hover:text-body",
            )}
          >
            {g.label}
          </Link>
        ))}
      </div>

      {rows.length === 0 ? (
        <Card>
          <EmptyState
            icon={<IconArchive />}
            title="Nothing logged here yet"
            body="Approvals, assignment changes, event edits and imports all get recorded automatically. Take an action and it shows up."
          />
        </Card>
      ) : (
        <div className="space-y-6">
          {[...byDay.entries()].map(([day, entries]) => (
            <section key={day}>
              <h2 className="mb-2.5 text-[12px] font-semibold uppercase tracking-[0.1em] text-slate">
                {new Date(day + "T12:00:00").toLocaleDateString(undefined, {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })}
              </h2>

              <Card className="divide-y divide-line">
                {entries.map((e) => {
                  const meta = parseJson<Record<string, unknown>>(e.meta, {});
                  const inner = (
                    <div className="flex items-start gap-3 p-3.5">
                      <span
                        className={cx(
                          "mt-1.5 size-2 shrink-0 rounded-full",
                          toneFor(e.action),
                        )}
                        aria-hidden
                      />
                      {e.actor_name ? (
                        <Avatar
                          name={e.actor_name}
                          src={e.actor_photo}
                          size={26}
                          className="mt-px shrink-0"
                        />
                      ) : (
                        <span className="mt-px grid size-[26px] shrink-0 place-items-center rounded-full bg-line-strong text-[11px] font-bold text-body">
                          SYS
                        </span>
                      )}

                      <div className="min-w-0 flex-1">
                        <p className="text-[13.5px] leading-snug text-body">
                          {e.summary}
                        </p>
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          <span className="text-[12.5px] text-slate">
                            {fmtAgo(e.created_at)}
                          </span>
                          <code className="rounded bg-canvas px-1.5 py-0.5 font-mono text-[11.5px] text-slate">
                            {e.action}
                          </code>
                          {e.actor_role === "super_admin" && (
                            <Badge tone="bg-brand-50 text-brand-700 ring-brand-200">
                              Super Admin
                            </Badge>
                          )}
                          {meta.override === true && (
                            <Badge tone="bg-amber-50 text-amber-700 ring-amber-200">
                              Capacity override
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  );

                  return e.event_id ? (
                    <Link
                      key={e.id}
                      href={`/events/${e.event_id}`}
                      className="block transition-colors hover:bg-canvas"
                    >
                      {inner}
                    </Link>
                  ) : (
                    <div key={e.id}>{inner}</div>
                  );
                })}
              </Card>
            </section>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <nav className="mt-8 flex items-center justify-center gap-2" aria-label="Pagination">
          {page > 1 && (
            <Link
              href={`/admin/activity?${group !== "all" ? `g=${group}&` : ""}page=${page - 1}`}
              className="rounded-xl bg-canvas px-4 py-2 text-[13.5px] font-medium text-ink ring-1 ring-inset ring-line hover:bg-line-strong"
            >
              Previous
            </Link>
          )}
          <span className="tnum px-3 text-[13px] text-slate">
            Page {page} of {totalPages}
          </span>
          {page < totalPages && (
            <Link
              href={`/admin/activity?${group !== "all" ? `g=${group}&` : ""}page=${page + 1}`}
              className="rounded-xl bg-canvas px-4 py-2 text-[13.5px] font-medium text-ink ring-1 ring-inset ring-line hover:bg-line-strong"
            >
              Next
            </Link>
          )}
        </nav>
      )}
    </div>
  );
}
