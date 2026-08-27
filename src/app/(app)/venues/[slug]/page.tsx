import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/rbac";
import { getVenueBySlug, mapsUrlFor } from "@/lib/venues";
import { listEvents } from "@/lib/events";
import { getDb } from "@/lib/db";
import { Card, EmptyState, IconCalendar, IconPin, IconChevron } from "@/components/ui";
import { MiniEventCard } from "@/components/events/event-card";
import { fmtDate, fmtTime, cx } from "@/lib/ui";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const venue = getVenueBySlug(slug);
  return { title: venue?.name ?? "Venue" };
}

export default async function VenuePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const user = await requireUser();

  const venue = getVenueBySlug(slug);
  if (!venue) notFound();

  const db = getDb();

  const upcoming = listEvents(
    { venueId: venue.id, sort: "soonest", limit: 60 },
    user,
  ).rows;

  const past = db
    .prepare(
      `SELECT id, title, start_datetime, time_tbd, category, venue, city
         FROM events
        WHERE venue_id = ? AND date(start_datetime) < date('now')
        ORDER BY start_datetime DESC LIMIT 12`,
    )
    .all(venue.id) as {
    id: number;
    title: string;
    start_datetime: string;
    time_tbd: number;
    category: string;
    venue: string | null;
    city: string | null;
  }[];

  // Who is currently down to cover anything here.
  const crew = db
    .prepare(
      `SELECT u.id, u.name, COUNT(*) n
         FROM assignments a
         JOIN users u ON u.id = a.user_id
         JOIN events e ON e.id = a.event_id
        WHERE e.venue_id = ? AND a.status = 'active'
          AND date(e.start_datetime) >= date('now')
        GROUP BY u.id ORDER BY n DESC, u.name`,
    )
    .all(venue.id) as { id: number; name: string; n: number }[];

  let aliases: string[] = [];
  try {
    aliases = JSON.parse(venue.aka ?? "[]");
  } catch {
    aliases = [];
  }

  const maps = venue.maps_url ?? mapsUrlFor(venue);

  return (
    <div className="mx-auto max-w-[1100px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <Link
        href="/venues"
        className="inline-flex items-center gap-1.5 text-[13px] text-slate transition-colors hover:text-ink"
      >
        <IconChevron size={14} className="rotate-180" />
        Venues
      </Link>

      {/* Header */}
      <header className="mb-6 mt-4">
        <h1 className="text-[30px] sm:text-[38px] text-ink">{venue.name}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-[13.5px] text-body">
          {(venue.city || venue.address) && (
            <span className="flex items-center gap-1.5">
              <IconPin size={14} className="text-slate" />
              {[venue.address, venue.city].filter(Boolean).join(", ")}
            </span>
          )}
          {aliases.length > 0 && (
            <span className="flex items-center gap-1.5 text-slate">
              also written as
              {aliases.map((a) => (
                <code
                  key={a}
                  className="rounded-md bg-canvas px-1.5 py-0.5 font-mono text-[11.5px] ring-1 ring-inset ring-line"
                >
                  {a}
                </code>
              ))}
            </span>
          )}
        </div>

        {venue.notes && (
          <p className="mt-3 rounded-xl bg-sunshine-50 px-3.5 py-2.5 text-[13px] text-sunshine-700 ring-1 ring-inset ring-sunshine-200">
            {venue.notes}
          </p>
        )}
      </header>

      {/* Links */}
      <div className="mb-6 flex flex-wrap gap-2.5">
        {venue.website && <VenueLink href={venue.website} label="Website" primary />}
        {venue.events_url && <VenueLink href={venue.events_url} label="Event listings" />}
        {venue.press_url && <VenueLink href={venue.press_url} label="Press / credentials" />}
        <VenueLink href={maps} label="Directions" />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
        <div className="min-w-0 space-y-5">
          {/* Upcoming */}
          <Card className="p-5 sm:p-6">
            <div className="mb-4 flex items-baseline justify-between gap-3">
              <h2 className="text-[19px] text-ink">Coming up</h2>
              <span className="tnum text-[12.5px] text-slate">
                {upcoming.length} {upcoming.length === 1 ? "event" : "events"}
              </span>
            </div>

            {upcoming.length === 0 ? (
              <EmptyState
                icon={<IconCalendar />}
                title="Nothing scheduled here"
                body="When events at this venue are added they will show up here."
              />
            ) : (
              <ul className="space-y-2">
                {upcoming.map((e) => (
                  <li key={e.id}>
                    <MiniEventCard ev={e} />
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/* Past */}
          {past.length > 0 && (
            <Card className="p-5 sm:p-6">
              <h2 className="mb-3 text-[17px] text-ink">Previously here</h2>
              <ul className="divide-y divide-line">
                {past.map((e) => (
                  <li key={e.id}>
                    <Link
                      href={`/events/${e.id}`}
                      className="group flex items-center justify-between gap-3 py-2.5"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-[14px] font-semibold text-ink transition-colors group-hover:text-brand-700">
                          {e.title}
                        </span>
                        <span className="text-[12px] text-slate">
                          {fmtDate(e.start_datetime)}
                          {!e.time_tbd && ` · ${fmtTime(e.start_datetime)}`}
                        </span>
                      </span>
                      <IconChevron size={14} className="shrink-0 text-slate" />
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>

        {/* Side */}
        <div className="space-y-5">
          <Card className="p-5">
            <h2 className="mb-3 text-[15px] text-ink">Coverage here</h2>
            {crew.length === 0 ? (
              <p className="text-[13px] text-slate">
                Nobody is assigned to anything at this venue yet.
              </p>
            ) : (
              <ul className="space-y-2">
                {crew.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-3">
                    <span className="truncate text-[13.5px] text-body">{c.name}</span>
                    <span className="tnum shrink-0 rounded-full bg-brand-50 px-2 py-0.5 text-[11.5px] font-bold text-brand-700 ring-1 ring-inset ring-brand-100">
                      {c.n}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="p-5">
            <h2 className="mb-3 text-[15px] text-ink">At a glance</h2>
            <dl className="space-y-2.5 text-[13px]">
              <Row label="Coming up" value={String(venue.upcoming_count)} />
              <Row label="Past events" value={String(venue.past_count)} />
              {venue.city && <Row label="City" value={venue.city} />}
            </dl>
          </Card>
        </div>
      </div>
    </div>
  );
}

function VenueLink({
  href,
  label,
  primary,
}: {
  href: string;
  label: string;
  primary?: boolean;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cx(
        "rounded-full px-4 py-2 text-[13.5px] font-semibold transition-all",
        primary
          ? "bg-brand-500 text-white shadow-sm hover:bg-brand-600"
          : "bg-card text-brand-700 ring-1 ring-inset ring-brand-200 hover:bg-brand-50",
      )}
    >
      {label}
    </a>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-slate">{label}</dt>
      <dd className="tnum font-semibold text-ink">{value}</dd>
    </div>
  );
}
