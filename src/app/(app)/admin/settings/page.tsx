import { requireSuperAdmin } from "@/lib/rbac";
import { getSettings, getDb } from "@/lib/db";
import { SUPER_ADMIN_EMAIL } from "@/lib/auth";
import { Card, Avatar, Badge, IconShield } from "@/components/ui";
import { SettingsForm } from "./settings-form";
import { fmtDate } from "@/lib/ui";

export const metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await requireSuperAdmin();
  const settings = getSettings();
  const db = getDb();

  const superAdmins = db
    .prepare(
      `SELECT id, name, email, profile_photo, created_at, status
         FROM users WHERE role = 'super_admin' ORDER BY created_at ASC`,
    )
    .all() as {
    id: number;
    name: string;
    email: string;
    profile_photo: string | null;
    created_at: string;
    status: string;
  }[];

  const counts = db
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM events) events,
         (SELECT COUNT(*) FROM users) users,
         (SELECT COUNT(*) FROM coverage_requests) requests,
         (SELECT COUNT(*) FROM assignments) assignments,
         (SELECT COUNT(*) FROM audit_log) audit,
         (SELECT COUNT(*) FROM imports) imports`,
    )
    .get() as Record<string, number>;

  return (
    <div className="mx-auto max-w-[860px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <header className="mb-6">
        <h1 className="text-[30px] sm:text-[36px] text-ink">Settings</h1>
        <p className="mt-1.5 max-w-[58ch] text-[14px] text-slate text-pretty">
          How approvals flow through the desk. Only you can change these.
        </p>
      </header>

      <SettingsForm settings={settings} />

      {/* Super admins */}
      <Card className="mt-5 p-5 sm:p-6">
        <div className="mb-1 flex items-center gap-2">
          <IconShield size={17} className="text-brand-600" />
          <h2 className="text-[17px] text-ink">Super Admins</h2>
        </div>
        <p className="mb-4 text-[13px] text-slate">
          Accounts with final approval authority. Promote someone from their
          contributor page; the primary account below can never be demoted.
        </p>

        <ul className="space-y-2">
          {superAdmins.map((s) => {
            const primary = s.email.toLowerCase() === SUPER_ADMIN_EMAIL;
            return (
              <li
                key={s.id}
                className="flex items-center gap-3 rounded-xl bg-canvas px-3.5 py-3 ring-1 ring-inset ring-line"
              >
                <Avatar name={s.name} src={s.profile_photo} size={36} />
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-1.5 text-[14px] font-semibold text-ink">
                    {s.name}
                    {primary && (
                      <Badge tone="bg-gradient-to-r from-brand-500/25 to-sky-500/25 text-brand-700 ring-brand-200">
                        Primary
                      </Badge>
                    )}
                    {s.id === user.id && (
                      <span className="text-[12.5px] font-normal text-teal-700">
                        (you)
                      </span>
                    )}
                    {s.status === "provisional" && (
                      <Badge tone="bg-sky-50 text-sky-700 ring-sky-200">
                        Unclaimed
                      </Badge>
                    )}
                  </p>
                  <p className="truncate text-[12px] text-slate">
                    {s.email} · since{" "}
                    {fmtDate(s.created_at.replace(" ", "T"), "long")}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      </Card>

      {/* Data */}
      <Card className="mt-5 p-5 sm:p-6">
        <h2 className="mb-4 text-[17px] text-ink">What&apos;s in the database</h2>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {[
            ["Events", counts.events],
            ["People", counts.users],
            ["Coverage requests", counts.requests],
            ["Assignments", counts.assignments],
            ["Audit entries", counts.audit],
            ["Import runs", counts.imports],
          ].map(([label, value]) => (
            <div key={String(label)}>
              <dt className="text-[12.5px] text-slate">{label}</dt>
              <dd className="tnum font-[family-name:var(--font-display)] text-[22px] font-bold text-ink">
                {value}
              </dd>
            </div>
          ))}
        </dl>
        <p className="mt-4 text-[12px] leading-relaxed text-slate">
          Events are archived rather than deleted, and every approval decision is
          written to the activity log, so coverage history stays traceable.
        </p>
      </Card>
    </div>
  );
}
