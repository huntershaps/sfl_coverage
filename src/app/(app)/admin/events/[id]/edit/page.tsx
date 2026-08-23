import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin, isSuperAdmin } from "@/lib/rbac";
import { getDb } from "@/lib/db";
import { getEvent } from "@/lib/events";
import { EventForm } from "@/components/admin/event-form";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ev = getEvent(Number(id));
  return { title: ev ? `Edit ${ev.title}` : "Edit event" };
}

export default async function EditEventPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireAdmin();
  const ev = getEvent(Number(id));
  if (!ev) notFound();

  const activeAssignments = (
    getDb()
      .prepare(
        "SELECT COUNT(*) n FROM assignments WHERE event_id = ? AND status = 'active'",
      )
      .get(ev.id) as { n: number }
  ).n;

  return (
    <div className="mx-auto max-w-[1100px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <Link
        href="/admin/events"
        className="inline-flex items-center gap-1.5 text-[13px] text-body transition-colors hover:text-ink"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden>
          <path d="m14 6-6 6 6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Manage events
      </Link>

      <header className="mb-6 mt-4">
        <h1 className="text-[28px] sm:text-[34px] text-ink text-balance">
          Edit “{ev.title}”
        </h1>
        <p className="mt-1.5 text-[14px] text-slate">
          {activeAssignments > 0
            ? `${activeAssignments} contributor${activeAssignments === 1 ? " is" : "s are"} assigned — they're notified if the date, venue or status changes.`
            : "Nobody is assigned to this event yet."}
        </p>
      </header>

      <EventForm
        draft={{
          id: ev.id,
          title: ev.title,
          subtitle: ev.subtitle,
          description: ev.description,
          category: ev.category,
          start_datetime: ev.start_datetime,
          multi_day_end: ev.multi_day_end,
          time_tbd: ev.time_tbd,
          venue: ev.venue,
          address: ev.address,
          city: ev.city,
          organizer: ev.organizer,
          ticket_url: ev.ticket_url,
          image_url: ev.image_url,
          status: ev.status,
          legacy_assignees: ev.legacy_assignees,
          source_note: ev.source_note,
        }}
        isSuperAdmin={isSuperAdmin(user)}
        activeAssignments={activeAssignments}
      />
    </div>
  );
}
