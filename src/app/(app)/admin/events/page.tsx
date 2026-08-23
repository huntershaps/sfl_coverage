import Link from "next/link";
import { Suspense } from "react";
import { requireAdmin, isSuperAdmin } from "@/lib/rbac";
import { listEvents, distinctCities, capacityFor } from "@/lib/events";
import { FilterBar } from "@/components/events/filter-bar";
import {
  Card,
  Badge,
  EmptyState,
  LinkButton,
  IconPlus,
  IconUpload,
  IconEdit,
  IconTicket,
} from "@/components/ui";
import { CategoryBadge, EventStatusBadge } from "@/components/events/badges";
import { fmtDate, fmtTime, posterStyle, cx } from "@/lib/ui";
import type { EventStatus } from "@/lib/constants";

export const metadata = { title: "Manage Events" };
export const dynamic = "force-dynamic";

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function ManageEventsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const user = await requireAdmin();

  const values = {
    q: one(sp.q),
    quick: one(sp.quick),
    category: one(sp.category),
    city: one(sp.city),
    status: one(sp.status),
    availability: one(sp.availability),
    scope: one(sp.scope) || "all",
    from: one(sp.from),
    to: one(sp.to),
    view: "list",
  };

  const page = Math.max(1, Number(one(sp.page)) || 1);
  const perPage = 50;

  const { rows, total } = listEvents(
    {
      q: values.q,
      quick: values.quick,
      category: values.category,
      city: values.city,
      status: values.status,
      availability: values.availability as "open" | "full" | "needs" | "",
      scope: "all",
      from: values.from,
      to: values.to,
      sort: "soonest",
      limit: perPage,
      offset: (page - 1) * perPage,
    },
    user,
  );

  const totalPages = Math.ceil(total / perPage);

  return (
    <div className="mx-auto max-w-[1300px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[30px] sm:text-[36px] text-ink">Manage events</h1>
          <p className="mt-1.5 max-w-[58ch] text-[14px] text-slate text-pretty">
            The full event database, drafts and archive included. Past events are
            archived rather than deleted so coverage history stays intact.
          </p>
        </div>
        <div className="flex gap-2">
          <LinkButton href="/admin/import" variant="secondary" size="md">
            <IconUpload size={16} /> Import
          </LinkButton>
          <LinkButton href="/admin/events/new" variant="primary" size="md">
            <IconPlus size={16} /> New event
          </LinkButton>
        </div>
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
              icon={<IconTicket />}
              title="No events match"
              body="Clear the filters to see the whole database, or import the latest list from the coverage doc."
              action={
                <LinkButton href="/admin/import" variant="primary">
                  Import events
                </LinkButton>
              }
            />
          </Card>
        ) : (
          <Card className="overflow-hidden">
            <div className="hidden border-b border-line bg-canvas px-4 py-2.5 text-[12px] font-semibold uppercase tracking-[0.08em] text-slate lg:grid lg:grid-cols-[1fr_130px_170px_140px_150px_92px] lg:gap-3">
              <span>Event</span>
              <span>Date</span>
              <span>Venue</span>
              <span>Category</span>
              <span>Coverage</span>
              <span className="text-right">Actions</span>
            </div>

            <div className="divide-y divide-line">
              {rows.map((ev) => {
                const cap = capacityFor(ev);
                return (
                  <div
                    key={ev.id}
                    className={cx(
                      "px-4 py-3 transition-colors hover:bg-canvas lg:grid lg:grid-cols-[1fr_130px_170px_140px_150px_92px] lg:items-center lg:gap-3",
                      ev.status === "draft" && "bg-sky-500/[0.05]",
                      ev.status === "archived" && "opacity-60",
                    )}
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="relative size-10 shrink-0 overflow-hidden rounded-lg">
                        {ev.image_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={ev.image_url} alt="" className="size-full object-cover" />
                        ) : (
                          <div
                            className="poster-mesh size-full"
                            style={posterStyle(ev.title, ev.category)}
                            aria-hidden
                          />
                        )}
                      </div>
                      <div className="min-w-0">
                        <Link
                          href={`/events/${ev.id}`}
                          className="line-clamp-1 text-[14px] font-semibold text-ink hover:text-brand-600"
                        >
                          {ev.title}
                        </Link>
                        <div className="mt-0.5 flex items-center gap-1.5">
                          <EventStatusBadge status={ev.status as EventStatus} />
                          {ev.pending_count > 0 && (
                            <Badge tone="bg-brand-50 text-brand-700 ring-brand-200">
                              {ev.pending_count} waiting
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="mt-2 lg:mt-0">
                      <p className="tnum text-[13px] text-body">
                        {fmtDate(ev.start_datetime, "long")}
                      </p>
                      <p className="tnum text-[12.5px] text-slate">
                        {fmtTime(ev.start_datetime, ev.time_tbd)}
                      </p>
                    </div>

                    <div className="mt-1.5 min-w-0 lg:mt-0">
                      <p className="line-clamp-1 text-[13px] text-body">
                        {ev.venue ?? "—"}
                      </p>
                      <p className="line-clamp-1 text-[12.5px] text-slate">
                        {ev.city ?? "City unknown"}
                      </p>
                    </div>

                    <div className="mt-1.5 lg:mt-0">
                      <CategoryBadge category={ev.category} />
                    </div>

                    <div className="mt-2 lg:mt-0">
                      <p className="tnum text-[13px] text-body">
                        {cap.approved}
                        {cap.limit != null ? ` / ${cap.limit}` : ""} assigned
                      </p>
                      {ev.legacy_assignees && (
                        <p className="line-clamp-1 text-[12px] text-sky-700">
                          Doc: {ev.legacy_assignees}
                        </p>
                      )}
                    </div>

                    <div className="mt-2 flex justify-start gap-1 lg:mt-0 lg:justify-end">
                      <Link
                        href={`/admin/events/${ev.id}/edit`}
                        className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[12.5px] font-medium text-body transition-colors hover:bg-canvas hover:text-ink"
                      >
                        <IconEdit size={14} /> Edit
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        )}
      </div>

      {totalPages > 1 && (
        <nav className="mt-8 flex items-center justify-center gap-2" aria-label="Pagination">
          {page > 1 && (
            <PageLink sp={sp} page={page - 1}>
              Previous
            </PageLink>
          )}
          <span className="tnum px-3 text-[13px] text-slate">
            Page {page} of {totalPages}
          </span>
          {page < totalPages && (
            <PageLink sp={sp} page={page + 1}>
              Next
            </PageLink>
          )}
        </nav>
      )}

      {isSuperAdmin(user) && (
        <p className="mt-6 text-center text-[12px] text-slate">
          Deleting an event permanently is available from its edit page, and only
          to you.
        </p>
      )}
    </div>
  );
}

function PageLink({
  sp,
  page,
  children,
}: {
  sp: Record<string, string | string[] | undefined>;
  page: number;
  children: React.ReactNode;
}) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (k === "page" || v == null) continue;
    params.set(k, Array.isArray(v) ? v[0] : v);
  }
  if (page > 1) params.set("page", String(page));
  return (
    <Link
      href={`/admin/events${params.toString() ? `?${params}` : ""}`}
      className="rounded-xl bg-canvas px-4 py-2 text-[13.5px] font-medium text-ink ring-1 ring-inset ring-line transition-colors hover:bg-line-strong"
    >
      {children}
    </Link>
  );
}
