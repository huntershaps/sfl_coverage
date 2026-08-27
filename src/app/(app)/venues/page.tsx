import Link from "next/link";
import { requireUser } from "@/lib/rbac";
import { listVenues } from "@/lib/venues";
import { Card, EmptyState, IconSearch, IconPin } from "@/components/ui";
import { VenueSearch } from "./venue-search";
import { cx } from "@/lib/ui";

export const metadata = { title: "Venues" };
export const dynamic = "force-dynamic";

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function VenuesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  await requireUser();

  const q = one(sp.q);
  const all = listVenues({ q });
  const withUpcoming = all.filter((v) => v.upcoming_count > 0);
  const rest = all.filter((v) => v.upcoming_count === 0);

  return (
    <div className="mx-auto max-w-[1300px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <header className="mb-6">
        <h1 className="text-[30px] sm:text-[36px] text-ink">Venues</h1>
        <p className="mt-1.5 max-w-[60ch] text-[14px] text-body text-pretty">
          Every room on the board, with its listings page and what&apos;s coming
          up there. The regulars carry the shorthand the desk uses — HR, CR, FB.
        </p>
      </header>

      <VenueSearch defaultValue={q} />

      {all.length === 0 ? (
        <Card className="mt-5">
          <EmptyState
            icon={<IconSearch />}
            title={q ? `Nothing matching “${q}”` : "No venues yet"}
            body={
              q
                ? "Try a shorter search, or the venue's abbreviation."
                : "Venues appear here once events have been imported."
            }
          />
        </Card>
      ) : (
        <>
          <p className="mb-3 mt-5 text-[12.5px] text-slate">
            <span className="tnum font-semibold text-body">{all.length}</span>{" "}
            {all.length === 1 ? "venue" : "venues"}
            {withUpcoming.length > 0 && (
              <>
                {" "}
                · <span className="tnum font-semibold text-body">{withUpcoming.length}</span>{" "}
                with something coming up
              </>
            )}
          </p>

          {withUpcoming.length > 0 && (
            <div className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {withUpcoming.map((v) => (
                <VenueCard key={v.id} venue={v} />
              ))}
            </div>
          )}

          {rest.length > 0 && (
            <>
              <h2 className="eyebrow mb-3">Nothing scheduled right now</h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {rest.map((v) => (
                  <VenueCard key={v.id} venue={v} muted />
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

function VenueCard({
  venue,
  muted,
}: {
  venue: ReturnType<typeof listVenues>[number];
  muted?: boolean;
}) {
  let aliases: string[] = [];
  try {
    aliases = JSON.parse(venue.aka ?? "[]");
  } catch {
    aliases = [];
  }

  return (
    <Link
      href={`/venues/${venue.slug}`}
      className={cx(
        "surface group flex flex-col p-4 transition-all hover:shadow-[var(--shadow-lift)] hover:ring-1 hover:ring-brand-200",
        muted && "opacity-90",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-[15.5px] font-semibold leading-tight text-ink transition-colors group-hover:text-brand-700">
          {venue.name}
        </h3>
        {venue.upcoming_count > 0 && (
          <span className="tnum shrink-0 rounded-full bg-brand-50 px-2 py-0.5 text-[11.5px] font-bold text-brand-700 ring-1 ring-inset ring-brand-100">
            {venue.upcoming_count}
          </span>
        )}
      </div>

      {venue.city && (
        <p className="mt-1 flex items-center gap-1 text-[12.5px] text-slate">
          <IconPin size={12} />
          {venue.city}
        </p>
      )}

      {aliases.length > 0 && (
        <p className="mt-2 flex flex-wrap gap-1">
          {aliases.slice(0, 3).map((a) => (
            <span
              key={a}
              className="rounded-md bg-canvas px-1.5 py-0.5 font-mono text-[11px] text-slate ring-1 ring-inset ring-line"
            >
              {a}
            </span>
          ))}
        </p>
      )}

      <p className="mt-auto pt-3 text-[12px] text-slate">
        {venue.upcoming_count > 0
          ? `${venue.upcoming_count} coming up`
          : venue.past_count > 0
            ? `${venue.past_count} past`
            : "No events yet"}
        {venue.website && " · has a listings page"}
      </p>
    </Link>
  );
}
