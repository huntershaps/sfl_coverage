import { requireUser } from "@/lib/rbac";
import { getDb, parseJson } from "@/lib/db";
import { Card, Badge, LinkButton, IconShield, IconArchive } from "@/components/ui";
import { RoleBadge } from "@/components/shell/sidebar";
import { ProfileForm, PasswordForm } from "./profile-form";
import { fmtDate } from "@/lib/ui";

export const metadata = { title: "Profile" };
export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const user = await requireUser();
  const db = getDb();

  const full = db
    .prepare(
      `SELECT id, name, email, phone, bio, coverage_area, profile_photo,
              specialties, social_links, role, created_at, email_notifications
         FROM users WHERE id = ?`,
    )
    .get(user.id) as {
    id: number;
    name: string;
    email: string;
    phone: string | null;
    bio: string | null;
    coverage_area: string | null;
    profile_photo: string | null;
    specialties: string;
    social_links: string;
    role: string;
    created_at: string;
    email_notifications: number;
  };

  const stats = db
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM assignments a JOIN events e ON e.id = a.event_id
           WHERE a.user_id = ? AND a.status IN ('active','completed')
             AND date(e.start_datetime) < date('now')) covered,
         (SELECT COUNT(*) FROM assignments WHERE user_id = ? AND status = 'active') assignments,
         (SELECT COUNT(*) FROM coverage_requests WHERE user_id = ?) requests`,
    )
    .get(user.id, user.id, user.id) as {
    covered: number;
    assignments: number;
    requests: number;
  };

  return (
    <div className="mx-auto max-w-[820px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <header className="mb-6">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-[30px] sm:text-[36px] text-ink">Profile</h1>
          <RoleBadge role={full.role as "super_admin" | "admin" | "contributor"} />
        </div>
        <p className="mt-1.5 text-[14px] text-slate">
          Member since {fmtDate(full.created_at.replace(" ", "T"), "long")} ·{" "}
          {stats.covered} events covered · {stats.requests} requests submitted
        </p>
      </header>

      {full.role === "super_admin" && (
        <Card className="mb-5 border-brand-200 p-4">
          <div className="flex items-start gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600 ring-1 ring-inset ring-brand-200">
              <IconShield size={18} />
            </span>
            <div>
              <p className="text-[14px] font-semibold text-ink">
                Super Admin account
              </p>
              <p className="mt-0.5 text-[12.5px] leading-snug text-slate">
                You hold final approval authority over every coverage decision. This
                role can&apos;t be removed from {full.email} through the app.
              </p>
            </div>
          </div>
        </Card>
      )}

      <Card className="p-5 sm:p-6">
        <h2 className="mb-5 text-[18px] text-ink">Your details</h2>
        <ProfileForm
          user={full}
          specialties={parseJson<string[]>(full.specialties, [])}
          social={parseJson<Record<string, string>>(full.social_links, {})}
        />
      </Card>

      <Card className="mt-5 p-5 sm:p-6">
        <h2 className="mb-1 text-[18px] text-ink">Password</h2>
        <p className="mb-5 text-[13px] text-slate">
          Changing your password keeps you signed in on this device.
        </p>
        <PasswordForm />
      </Card>

      <Card className="mt-5 p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-[18px] text-ink">Your coverage record</h2>
            <p className="mt-0.5 text-[13px] text-slate">
              {stats.covered > 0
                ? `${stats.covered} past ${stats.covered === 1 ? "event" : "events"} on the books.`
                : "Nothing archived yet — it builds up as you cover events."}
            </p>
          </div>
          <LinkButton href="/history" variant="secondary" size="md">
            <IconArchive size={16} /> View history
          </LinkButton>
        </div>
      </Card>

      <form action="/api/auth/signout" method="post" className="mt-5">
        <button
          type="submit"
          className="w-full rounded-xl px-4 py-3 text-[13.5px] font-medium text-slate transition-colors hover:bg-canvas hover:text-body"
        >
          Sign out of the Coverage Desk
        </button>
      </form>
    </div>
  );
}

export { Badge };
