import { Suspense } from "react";
import { requireUser } from "@/lib/rbac";
import { listEvents, distinctCities } from "@/lib/events";
import { FilterBar } from "@/components/events/filter-bar";
import { EventCalendar } from "@/components/events/calendar";
import { Card, EmptyState, LinkButton, IconCalendar } from "@/components/ui";

export const metadata = { title: "Calendar" };
export const dynamic = "force-dynamic";

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
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
    view: "calendar",
  };

  // The calendar pages by month client-side, so it loads a wide window at once.
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
      limit: 600,
      sort: "soonest",
    },
    user,
  );

  return (
    <div className="mx-auto max-w-[1300px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <header className="mb-6">
        <h1 className="text-[30px] sm:text-[36px] text-ink">Coverage calendar</h1>
        <p className="mt-1.5 max-w-[58ch] text-[14px] text-slate text-pretty">
          The whole board by date. Events you&apos;re covering are highlighted, and
          anything you&apos;ve requested shows in amber.
        </p>
      </header>

      <Suspense fallback={<div className="h-11 rounded-xl bg-canvas" />}>
        <FilterBar
          cities={distinctCities()}
          values={values}
          total={total}
          showViewSwitch={false}
        />
      </Suspense>

      <div className="mt-6">
        {rows.length === 0 ? (
          <Card>
            <EmptyState
              icon={<IconCalendar />}
              title="Nothing on the calendar"
              body="No events match what you're filtering for. Clear the filters to see the full board."
              action={
                <LinkButton href="/calendar" variant="secondary">
                  Clear filters
                </LinkButton>
              }
            />
          </Card>
        ) : (
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
        )}
      </div>
    </div>
  );
}
