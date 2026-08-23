import Link from "next/link";
import { requireAdmin, isSuperAdmin } from "@/lib/rbac";
import { getDb, parseJson } from "@/lib/db";
import {
  Card,
  Avatar,
  Badge,
  EmptyState,
  IconUsers,
  IconChevron,
  IconShield,
} from "@/components/ui";
import { RoleBadge } from "@/components/shell/sidebar";
import { fmtAgo, cx } from "@/lib/ui";
import { SPECIALTY_LABEL, type Role } from "@/lib/constants";

export const metadata = { title: "Contributors" };
export const dynamic = "force-dynamic";

type Person = {
  id: number;
  name: string;
  email: string;
  role: Role;
  status: string;
  profile_photo: string | null;
  specialties: string;
  coverage_area: string | null;
  created_at: string;
  source: string | null;
  upcoming: number;
  covered: number;
  open_requests: number;
};

export default async function ContributorsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const user = await requireAdmin();
  const q = String((Array.isArray(sp.q) ? sp.q[0] : sp.q) ?? "").trim();
  const filter = String((Array.isArray(sp.show) ? sp.show[0] : sp.show) ?? "all");

  const people = getDb()
    .prepare(
      `SELECT u.id, u.name, u.email, u.role, u.status, u.profile_photo, u.specialties,
              u.coverage_area, u.created_at, u.source,
              (SELECT COUNT(*) FROM assignments a JOIN events e ON e.id = a.event_id
                WHERE a.user_id = u.id AND a.status = 'active'
                  AND date(e.start_datetime) >= date('now')) upcoming,
              (SELECT COUNT(*) FROM assignments a JOIN events e ON e.id = a.event_id
                WHERE a.user_id = u.id AND a.status IN ('active','completed')
                  AND date(e.start_datetime) < date('now')) covered,
              (SELECT COUNT(*) FROM coverage_requests r
                WHERE r.user_id = u.id AND r.status IN ('pending','under_review')) open_requests
         FROM users u
        ORDER BY
          CASE u.role WHEN 'super_admin' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END,
          u.name COLLATE NOCASE`,
    )
    .all() as Person[];

  const visible = people.filter((p) => {
    if (q) {
      const hay = `${p.name} ${p.email} ${p.coverage_area ?? ""}`.toLowerCase();
      if (!hay.includes(q.toLowerCase())) return false;
    }
    if (filter === "provisional") return p.status === "provisional";
    if (filter === "active") return p.status === "active";
    if (filter === "admins") return p.role !== "contributor";
    return true;
  });

  const provisional = people.filter((p) => p.status === "provisional").length;

  return (
    <div className="mx-auto max-w-[1100px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <header className="mb-6">
        <h1 className="text-[30px] sm:text-[36px] text-ink">Contributors</h1>
        <p className="mt-1.5 max-w-[60ch] text-[14px] text-slate text-pretty">
          Everyone with an account, plus the names carried over from the coverage
          doc that haven&apos;t been claimed yet.
        </p>
      </header>

      {provisional > 0 && (
        <Card className="mb-5 border-sky-200 p-4">
          <div className="flex items-start gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-sky-50 text-sky-700 ring-1 ring-inset ring-sky-200">
              <IconUsers size={18} />
            </span>
            <div className="min-w-0">
              <p className="text-[14px] font-semibold text-ink">
                {provisional} provisional {provisional === 1 ? "account" : "accounts"}
              </p>
              <p className="mt-0.5 text-[12.5px] leading-snug text-slate">
                These were created from names in the coverage doc and carry a
                placeholder email. Set a real address on each one, then they can
                claim it by signing up with that email. They can&apos;t sign in
                until then.
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* Filters */}
      <div className="mb-5 flex flex-wrap items-center gap-2">
        {[
          { key: "all", label: `All ${people.length}` },
          { key: "active", label: "Active" },
          { key: "provisional", label: `Provisional ${provisional || ""}`.trim() },
          { key: "admins", label: "Admins" },
        ].map((t) => (
          <Link
            key={t.key}
            href={`/admin/contributors${t.key === "all" ? "" : `?show=${t.key}`}`}
            className={cx(
              "rounded-full px-3.5 py-1.5 text-[12.5px] font-medium ring-1 ring-inset transition-colors",
              filter === t.key
                ? "bg-line text-ink ring-line"
                : "text-slate ring-transparent hover:bg-canvas hover:text-body",
            )}
          >
            {t.label}
          </Link>
        ))}

        <form className="relative ml-auto">
          {filter !== "all" && <input type="hidden" name="show" value={filter} />}
          <input
            name="q"
            defaultValue={q}
            placeholder="Search people…"
            className="h-9 w-[200px] rounded-xl bg-canvas px-3.5 text-[13px] text-ink ring-1 ring-inset ring-line placeholder:text-slate focus:ring-2 focus:ring-teal-400 focus:outline-none"
          />
        </form>
      </div>

      {visible.length === 0 ? (
        <Card>
          <EmptyState
            icon={<IconUsers />}
            title="Nobody matches"
            body="Try a different search or filter. New contributors appear here as soon as they sign up."
          />
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {visible.map((p) => (
            <Link
              key={p.id}
              href={`/admin/contributors/${p.id}`}
              className={cx(
                "surface-raised group flex gap-3.5 p-4 transition-all hover:-translate-y-0.5 hover:border-line-strong",
                p.status === "disabled" && "opacity-55",
              )}
            >
              <Avatar name={p.name} src={p.profile_photo} size={46} />

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="truncate text-[15px] font-semibold text-ink group-hover:text-brand-600 transition-colors">
                    {p.name}
                  </span>
                  {p.role !== "contributor" && <RoleBadge role={p.role} />}
                  {p.status === "provisional" && (
                    <Badge tone="bg-sky-50 text-sky-700 ring-sky-200">
                      Unclaimed
                    </Badge>
                  )}
                  {p.status === "disabled" && (
                    <Badge tone="bg-canvas text-slate ring-line">Disabled</Badge>
                  )}
                </div>

                <p className="mt-0.5 truncate text-[12px] text-slate">
                  {p.status === "provisional" ? (
                    <span className="text-sky-700">
                      Placeholder email — needs a real one
                    </span>
                  ) : (
                    p.email
                  )}
                </p>

                {parseJson<string[]>(p.specialties, []).length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {parseJson<string[]>(p.specialties, [])
                      .slice(0, 3)
                      .map((s) => (
                        <Badge key={s} tone="bg-canvas text-slate ring-line">
                          {SPECIALTY_LABEL[s] ?? s}
                        </Badge>
                      ))}
                  </div>
                )}

                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5 text-[12.5px] text-slate">
                  {p.upcoming > 0 && (
                    <span className="text-teal-700">{p.upcoming} upcoming</span>
                  )}
                  <span>{p.covered} covered</span>
                  {p.open_requests > 0 && (
                    <span className="text-amber-700">{p.open_requests} open requests</span>
                  )}
                  {p.coverage_area && <span>{p.coverage_area}</span>}
                </div>
              </div>

              <IconChevron size={15} className="mt-1 shrink-0 self-start text-slate" />
            </Link>
          ))}
        </div>
      )}

      {!isSuperAdmin(user) && (
        <p className="mt-6 flex items-center justify-center gap-1.5 text-center text-[12px] text-slate">
          <IconShield size={13} />
          Only the Super Admin can change roles or account status.
        </p>
      )}
    </div>
  );
}
