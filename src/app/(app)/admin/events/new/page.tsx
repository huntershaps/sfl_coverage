import Link from "next/link";
import { requireAdmin, isSuperAdmin } from "@/lib/rbac";
import { EventForm } from "@/components/admin/event-form";

export const metadata = { title: "New event" };

export default async function NewEventPage() {
  const user = await requireAdmin();

  const today = new Date();
  const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

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
        <h1 className="text-[30px] sm:text-[36px] text-ink">Add an event</h1>
        <p className="mt-1.5 max-w-[58ch] text-[14px] text-slate text-pretty">
          For one-offs the doc doesn&apos;t cover. For a batch, the importer is
          faster.
        </p>
      </header>

      <EventForm
        draft={{
          title: "",
          subtitle: null,
          description: null,
          category: "Concert",
          start_datetime: `${iso}T19:00`,
          multi_day_end: null,
          time_tbd: 0,
          venue: null,
          address: null,
          city: null,
          organizer: null,
          ticket_url: null,
          image_url: null,
          status: "open",
        }}
        isSuperAdmin={isSuperAdmin(user)}
      />
    </div>
  );
}
