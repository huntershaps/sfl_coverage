import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin, isSuperAdmin } from "@/lib/rbac";
import { getDb, parseJson } from "@/lib/db";
import { SUPER_ADMIN_EMAIL } from "@/lib/auth";
import {
  Card,
  Avatar,
  Badge,
  EmptyState,
  IconArchive,
  IconInbox,
  IconCheck,
} from "@/components/ui";
import { RoleBadge } from "@/components/shell/sidebar";
import {
  CategoryBadge,
  CoverageTypeBadge,
  RequestStatusBadge,
} from "@/components/events/badges";
import { ContributorControls } from "@/components/admin/contributor-controls";
import { fmtDate, fmtAgo, cx } from "@/lib/ui";
import { SPECIALTY_LABEL, type Role, type RequestStatus } from "@/lib/constants";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const p = getDb().prepare("SELECT name FROM users WHERE id = ?").get(Number(id)) as
    | { name: string }
    | undefined;
  return { title: p?.name ?? "Contributor" };
}

export default async function ContributorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const viewer = await requireAdmin();
  const db = getDb();

  const person = db
    .prepare(
      `SELECT id, name, email, role, status, profile_photo, phone, bio, coverage_area,
              specialties, social_links, created_at, source
         FROM users WHERE id = ?`,
    )
    .get(Number(id)) as
    | {
        id: number;
        name: string;
        email: string;
        role: Role;
        status: string;
        profile_photo: string | null;
        phone: string | null;
        bio: string | null;
        coverage_area: string | null;
        specialties: string;
        social_links: string;
        created_at: string;
        source: string | null;
      }
    | undefined;
  if (!person) notFound();

  const upcoming = db
    .prepare(
      `SELECT a.coverage_type, e.id, e.title, e.start_datetime, e.venue, e.category
         FROM assignments a JOIN events e ON e.id = a.event_id
        WHERE a.user_id = ? AND a.status = 'active'
          AND date(coalesce(e.multi_day_end, e.start_datetime)) >= date('now')
        ORDER BY e.start_datetime ASC`,
    )
    .all(person.id) as {
    coverage_type: string;
    id: number;
    title: string;
    start_datetime: string;
    venue: string | null;
    category: string;
  }[];

  const past = db
    .prepare(
      `SELECT a.coverage_type, e.id, e.title, e.start_datetime, e.venue, e.category
         FROM assignments a JOIN events e ON e.id = a.event_id
        WHERE a.user_id = ? AND a.status IN ('active','completed')
          AND date(coalesce(e.multi_day_end, e.start_datetime)) < date('now')
        ORDER BY e.start_datetime DESC LIMIT 25`,
    )
    .all(person.id) as typeof upcoming;

  const requests = db
    .prepare(
      `SELECT r.id, r.status, r.submitted_at, e.id event_id, e.title, e.start_datetime
         FROM coverage_requests r JOIN events e ON e.id = r.event_id
        WHERE r.user_id = ? ORDER BY r.submitted_at DESC LIMIT 20`,
    )
    .all(person.id) as {
    id: number;
    status: RequestStatus;
    submitted_at: string;
    event_id: number;
    title: string;
    start_datetime: string;
  }[];

  const notes = isSuperAdmin(viewer)
    ? (db
        .prepare(
          `SELECT n.note, n.created_at, u.name author FROM internal_notes n
             JOIN users u ON u.id = n.author_id
            WHERE n.subject_user_id = ? ORDER BY n.created_at DESC`,
        )
        .all(person.id) as { note: string; created_at: string; author: string }[])
    : [];

  const social = parseJson<Record<string, string>>(person.social_links, {});
  const specialties = parseJson<string[]>(person.specialties, []);
  const isPrimary = person.email.toLowerCase() === SUPER_ADMIN_EMAIL;

  const approvalRate = (() => {
    const decided = requests.filter((r) =>
      ["approved", "rejected", "waitlisted"].includes(r.status),
    );
    if (!decided.length) return null;
    return Math.round(
      (decided.filter((r) => r.status === "approved").length / decided.length) * 100,
    );
  })();

  return (
    <div className="mx-auto max-w-[1100px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <Link
        href="/admin/contributors"
        className="inline-flex items-center gap-1.5 text-[13px] text-body transition-colors hover:text-ink"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden>
          <path d="m14 6-6 6 6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Contributors
      </Link>

      {/* Header */}
      <Card raised className="mt-4 p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <Avatar name={person.name} src={person.profile_photo} size={72} />

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-[26px] leading-tight text-ink">{person.name}</h1>
              <RoleBadge role={person.role} />
              {person.status === "provisional" && (
                <Badge tone="bg-sky-50 text-sky-700 ring-sky-200">
                  Unclaimed account
                </Badge>
              )}
              {person.status === "disabled" && (
                <Badge tone="bg-canvas text-slate ring-line">Disabled</Badge>
              )}
            </div>

            <p className="mt-1 text-[13px] text-slate">
              {person.status === "provisional" ? (
                <span className="text-sky-700">
                  {person.email} — placeholder address from the coverage doc import
                </span>
              ) : (
                person.email
              )}
              {person.phone && ` · ${person.phone}`}
              {person.coverage_area && ` · Covers ${person.coverage_area}`}
            </p>

            {person.bio && (
              <p className="mt-2.5 max-w-[62ch] text-[13.5px] leading-relaxed text-body text-pretty">
                {person.bio}
              </p>
            )}

            {specialties.length > 0 && (
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {specialties.map((s) => (
                  <Badge key={s} tone="bg-canvas text-body ring-line">
                    {SPECIALTY_LABEL[s] ?? s}
                  </Badge>
                ))}
              </div>
            )}

            {Object.values(social).some(Boolean) && (
              <div className="mt-2.5 flex flex-wrap gap-3 text-[12.5px]">
                {social.instagram && (
                  <span className="text-body">Instagram: {social.instagram}</span>
                )}
                {social.x && <span className="text-body">X: {social.x}</span>}
                {social.website && (
                  <a
                    href={social.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-teal-700 underline-offset-2 hover:underline"
                  >
                    Portfolio
                  </a>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2.5 border-t border-line pt-4 sm:grid-cols-4">
          <Stat value={past.length} label="events covered" />
          <Stat value={upcoming.length} label="upcoming" tone="surf" />
          <Stat value={requests.length} label="requests made" />
          <Stat
            value={approvalRate ?? 0}
            label={approvalRate === null ? "no decisions yet" : "% approved"}
            muted={approvalRate === null}
          />
        </div>
      </Card>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0 space-y-6">
          <section>
            <h2 className="mb-3 text-[17px] text-ink">
              Upcoming assignments ({upcoming.length})
            </h2>
            {upcoming.length === 0 ? (
              <Card>
                <EmptyState
                  className="!py-9"
                  icon={<IconCheck />}
                  title="Nothing on their schedule"
                  body="Approve one of their requests, or assign them directly from an event page."
                />
              </Card>
            ) : (
              <Card className="divide-y divide-line">
                {upcoming.map((a) => (
                  <EventRowLine key={`${a.id}-${a.coverage_type}`} a={a} />
                ))}
              </Card>
            )}
          </section>

          <section>
            <h2 className="mb-3 text-[17px] text-ink">Request history</h2>
            {requests.length === 0 ? (
              <Card>
                <EmptyState
                  className="!py-9"
                  icon={<IconInbox />}
                  title="No requests yet"
                  body="They haven't asked to cover anything so far."
                />
              </Card>
            ) : (
              <Card className="divide-y divide-line">
                {requests.map((r) => (
                  <Link
                    key={r.id}
                    href={`/admin/approvals/${r.event_id}`}
                    className="flex items-center gap-3 p-3.5 transition-colors hover:bg-canvas"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-1 text-[13.5px] font-semibold text-ink">
                        {r.title}
                      </p>
                      <p className="text-[12.5px] text-slate">
                        {fmtDate(r.start_datetime, "long")} · asked {fmtAgo(r.submitted_at)}
                      </p>
                    </div>
                    <RequestStatusBadge status={r.status} />
                  </Link>
                ))}
              </Card>
            )}
          </section>

          <section>
            <h2 className="mb-3 text-[17px] text-ink">Coverage history</h2>
            {past.length === 0 ? (
              <Card>
                <EmptyState
                  className="!py-9"
                  icon={<IconArchive />}
                  title="No past coverage yet"
                  body="Events they've covered move here once the date has passed."
                />
              </Card>
            ) : (
              <Card className="divide-y divide-line">
                {past.map((a) => (
                  <EventRowLine key={`${a.id}-past-${a.coverage_type}`} a={a} />
                ))}
              </Card>
            )}
          </section>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          {isSuperAdmin(viewer) && (
            <ContributorControls
              person={{
                id: person.id,
                name: person.name,
                email: person.email,
                role: person.role,
                status: person.status,
              }}
              isPrimarySuperAdmin={isPrimary}
              isSelf={viewer.id === person.id}
            />
          )}

          {notes.length > 0 && (
            <Card className="p-5">
              <h3 className="mb-3 text-[15px] text-ink">Notes about this person</h3>
              <ul className="space-y-2.5">
                {notes.map((n, i) => (
                  <li key={i} className="text-[13px]">
                    <p className="whitespace-pre-wrap leading-snug text-body">{n.note}</p>
                    <p className="mt-0.5 text-[12px] text-slate">
                      {n.author} · {fmtAgo(n.created_at)}
                    </p>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card className="p-5">
            <h3 className="mb-2 text-[15px] text-ink">Account</h3>
            <dl className="space-y-2 text-[12.5px]">
              <div className="flex justify-between gap-3">
                <dt className="text-slate">Joined</dt>
                <dd className="text-body">
                  {fmtDate(person.created_at.replace(" ", "T"), "long")}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-slate">Status</dt>
                <dd className="text-body capitalize">{person.status}</dd>
              </div>
              {person.source && (
                <div className="flex justify-between gap-3">
                  <dt className="text-slate">Source</dt>
                  <dd className="text-right text-body">{person.source}</dd>
                </div>
              )}
            </dl>
          </Card>
        </aside>
      </div>
    </div>
  );
}

function EventRowLine({
  a,
}: {
  a: {
    id: number;
    title: string;
    start_datetime: string;
    venue: string | null;
    category: string;
    coverage_type: string;
  };
}) {
  return (
    <Link
      href={`/events/${a.id}`}
      className="flex items-center gap-3 p-3.5 transition-colors hover:bg-canvas"
    >
      <div className="min-w-0 flex-1">
        <p className="line-clamp-1 text-[13.5px] font-semibold text-ink">{a.title}</p>
        <p className="text-[12.5px] text-slate">
          {fmtDate(a.start_datetime, "long")}
          {a.venue && ` · ${a.venue}`}
        </p>
      </div>
      <div className="hidden shrink-0 sm:block">
        <CategoryBadge category={a.category} />
      </div>
      <CoverageTypeBadge type={a.coverage_type} />
    </Link>
  );
}

function Stat({
  value,
  label,
  tone,
  muted,
}: {
  value: number;
  label: string;
  tone?: "surf";
  muted?: boolean;
}) {
  return (
    <div>
      <div
        className={cx(
          "tnum font-[family-name:var(--font-display)] text-[24px] font-bold leading-none",
          muted ? "text-slate" : tone === "surf" ? "text-teal-700" : "text-ink",
        )}
      >
        {muted ? "—" : value}
      </div>
      <div className="mt-1 text-[12.5px] text-slate">{label}</div>
    </div>
  );
}
