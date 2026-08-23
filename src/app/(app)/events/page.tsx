import Link from "next/link";
import { Suspense } from "react";
import { requireUser } from "@/lib/rbac";
import { isAdmin } from "@/lib/rbac";
import { listEvents, distinctCities, capacityFor } from "@/lib/events";
import { FilterBar } from "@/components/events/filter-bar";
import { EventCard, EventRow } from "@/components/events/event-card";
import { EventCalendar } from "@/components/events/calendar";
import {
  EmptyState,
  CardSkeleton,
  LinkButton,
  IconTicket,
  IconSearch,
  IconPlus,
} from "@/components/ui";

export const metadata = { title: "Events" };
export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function EventsPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const sp = await searchParams;
  const user = await requireUser();

  const values = {
    q: one(sp.q),
    quick: one(sp.quick),
    category: one(sp.category),
    city: one(sp.city),
    status: one(sp.status),
    availability: one(sp.availability),
    scope: one(sp.scope),
    from: one(sp.from),
    to: one(sp.to),
    view: one(sp.view) || "grid",
  };

  const page = Math.max(1, Number(one(sp.page)) || 1);
  const perPage = values.view === "calendar" ? 400 : 48;

  const { rows, total } = listEvents(
    {
      q: values.q,
      quick: values.quick,
      category: values.category,
      city: values.city,
      status: values.status,
      availability: values.availability as "open" | "full" | "needs" | "",
      scope: (values.scope || undefined) as "mine" | "requested" | "past" | undefined,
      from: values.from,
      to: values.to,
      sort: values.scope === "past" ? "latest" : "soonest",
      limit: perPage,
      offset: (page - 1) * perPage,
    },
    user,
  );

  const cities = distinctCities();
  const limits = new Map(rows.map((r) => [r.id, capacityFor(r).limit]));
  const totalPages = Math.ceil(total / perPage);

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      {/* Masthead */}
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[30px] sm:text-[38px] text-ink">
            What&apos;s{" "}
            <span className="bg-gradient-to-r from-brand-400 to-sky-400 bg-clip-text text-transparent">
              coming up
            </span>
          </h1>
          <p className="mt-1.5 max-w-[52ch] text-[13.5px] text-slate text-pretty">
            Every show, opening and game on the board. Find one you want and put
            your name in — the Super Admin makes the final call.
          </p>
        </div>

        {isAdmin(user) && (
          <div className="flex gap-2">
            <LinkButton href="/admin/import" variant="secondary" size="md">
              Import
            </LinkButton>
            <LinkButton href="/admin/events/new" variant="primary" size="md">
              <IconPlus size={16} /> New event
            </LinkButton>
          </div>
        )}
      </div>

      <Suspense fallback={<div className="h-11 rounded-xl bg-canvas" />}>
        <FilterBar cities={cities} values={values} total={total} />
      </Suspense>

      <div className="mt-6">
        {rows.length === 0 ? (
          <NoResults hasFilters={!!(values.q || values.category || values.city || values.status || values.availability || values.quick || values.scope)} scope={values.scope} />
        ) : values.view === "calendar" ? (
          <EventCalendar
            events={rows.map((r) => ({
              id: r.id,
              title: r.title,
              category: r.category,
              start_datetime: r.start_datetime,
              multi_day_end: r.multi_day_end,
              time_tbd: r.time_tbd,
              venue: r.venue,
              city: r.city,
              status: r.status,
              approved_count: r.approved_count,
              myRequestStatus: r.myRequestStatus,
              myAssignmentId: r.myAssignmentId,
            }))}
          />
        ) : values.view === "list" ? (
          <div className="surface divide-y divide-line p-1.5 sm:p-2">
            {rows.map((ev) => (
              <EventRow key={ev.id} ev={ev} limit={limits.get(ev.id)} />
            ))}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {rows.map((ev, i) => (
              <div key={ev.id} style={{ animationDelay: `${Math.min(i, 12) * 22}ms` }} className="animate-rise">
                <EventCard ev={ev} limit={limits.get(ev.id)} priority={i < 4} />
              </div>
            ))}
          </div>
        )}
      </div>

      {values.view !== "calendar" && totalPages > 1 && (
        <Pagination page={page} totalPages={totalPages} sp={sp} />
      )}
    </div>
  );
}

function NoResults({ hasFilters, scope }: { hasFilters: boolean; scope: string }) {
  if (scope === "mine")
    return (
      <EmptyState
        icon={<IconTicket />}
        title="No assignments yet"
        body="Once the Super Admin approves one of your coverage requests, the event shows up here and on your schedule."
        action={
          <LinkButton href="/events" variant="primary">
            Browse open events
          </LinkButton>
        }
      />
    );

  if (scope === "requested")
    return (
      <EmptyState
        icon={<IconTicket />}
        title="You haven't requested anything yet"
        body="Find a show you want to cover and hit Request to Cover. You'll be able to track its status right here."
        action={
          <LinkButton href="/events" variant="primary">
            Find something to cover
          </LinkButton>
        }
      />
    );

  if (hasFilters)
    return (
      <EmptyState
        icon={<IconSearch />}
        title="Nothing matches those filters"
        body="Try a wider date range, a different category, or clear the filters to see the whole board."
        action={
          <LinkButton href="/events" variant="secondary">
            Clear filters
          </LinkButton>
        }
      />
    );

  return (
    <EmptyState
      icon={<IconTicket />}
      title="No upcoming events on the board"
      body="Once events are imported from the coverage doc or added by hand, they'll appear here for the team to claim."
      action={
        <LinkButton href="/admin/import" variant="primary">
          Import events
        </LinkButton>
      }
    />
  );
}

function Pagination({
  page,
  totalPages,
  sp,
}: {
  page: number;
  totalPages: number;
  sp: SP;
}) {
  const href = (p: number) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) {
      if (k === "page" || v == null) continue;
      params.set(k, Array.isArray(v) ? v[0] : v);
    }
    if (p > 1) params.set("page", String(p));
    return `/events${params.toString() ? `?${params}` : ""}`;
  };

  return (
    <nav className="mt-8 flex items-center justify-center gap-2" aria-label="Pagination">
      {page > 1 && (
        <Link
          href={href(page - 1)}
          className="rounded-xl bg-canvas px-4 py-2 text-[13.5px] font-medium text-ink ring-1 ring-inset ring-line transition-colors hover:bg-line-strong"
        >
          Previous
        </Link>
      )}
      <span className="tnum px-3 text-[13px] text-slate">
        Page {page} of {totalPages}
      </span>
      {page < totalPages && (
        <Link
          href={href(page + 1)}
          className="rounded-xl bg-canvas px-4 py-2 text-[13.5px] font-medium text-ink ring-1 ring-inset ring-line transition-colors hover:bg-line-strong"
        >
          Next
        </Link>
      )}
    </nav>
  );
}

export function Loading() {
  return (
    <div className="mx-auto max-w-[1400px] px-4 py-8">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <CardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}
