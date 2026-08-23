"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Dialog, Notice } from "@/components/dialog";
import {
  Button,
  Card,
  Field,
  inputClass,
  selectClass,
  IconTicket,
} from "@/components/ui";
import {
  createEventAction,
  updateEventAction,
  archiveEventAction,
  deleteEventAction,
  type EventFormState,
} from "@/app/actions/events";
import {
  EVENT_CATEGORIES,
  EVENT_STATUSES,
  EVENT_STATUS_LABEL,
} from "@/lib/constants";
import { posterStyle, cx } from "@/lib/ui";

export type EventDraft = {
  id?: number;
  title: string;
  subtitle: string | null;
  description: string | null;
  category: string;
  start_datetime: string;
  multi_day_end: string | null;
  time_tbd: number;
  venue: string | null;
  address: string | null;
  city: string | null;
  organizer: string | null;
  ticket_url: string | null;
  image_url: string | null;
  status: string;
  legacy_assignees?: string | null;
  source_note?: string | null;
};

export function EventForm({
  draft,
  isSuperAdmin,
  activeAssignments = 0,
}: {
  draft: EventDraft;
  isSuperAdmin: boolean;
  activeAssignments?: number;
}) {
  const editing = !!draft.id;
  const [state, action, isPending] = useActionState<EventFormState, FormData>(
    editing ? updateEventAction : createEventAction,
    {},
  );

  const [date, time] = draft.start_datetime.split("T");
  const [title, setTitle] = useState(draft.title);
  const [category, setCategory] = useState(draft.category);
  const [image, setImage] = useState(draft.image_url ?? "");

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
      <form action={action} className="min-w-0 space-y-5">
        {draft.id && <input type="hidden" name="id" value={draft.id} />}

        {state.error && <Notice kind="error">{state.error}</Notice>}
        {state.ok && <Notice kind="ok">{state.ok}</Notice>}

        <Card className="p-5 sm:p-6">
          <h2 className="mb-5 text-[17px] text-ink">The basics</h2>
          <div className="space-y-4">
            <Field label="Event title" required>
              <input
                name="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                placeholder="The Strokes"
                className={inputClass}
              />
            </Field>

            <Field label="Subtitle" hint="Support acts, tour name, or a short descriptor.">
              <input
                name="subtitle"
                defaultValue={draft.subtitle ?? ""}
                placeholder="with Mac DeMarco"
                className={inputClass}
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Category" required>
                <select
                  name="category"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className={selectClass}
                >
                  {EVENT_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Coverage status">
                <select name="status" defaultValue={draft.status} className={selectClass}>
                  {EVENT_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {EVENT_STATUS_LABEL[s]}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <Field
              label="Description"
              hint="What contributors should know before requesting it."
            >
              <textarea
                name="description"
                rows={4}
                defaultValue={draft.description ?? ""}
                className={cx(inputClass, "resize-y")}
              />
            </Field>
          </div>
        </Card>

        <Card className="p-5 sm:p-6">
          <h2 className="mb-5 text-[17px] text-ink">When</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Date" required>
              <input
                name="date"
                type="date"
                defaultValue={date}
                required
                className={cx(inputClass, "[color-scheme:dark]")}
              />
            </Field>
            <Field label="Start time" hint="Blank marks it Time TBD.">
              <input
                name="time"
                type="time"
                defaultValue={draft.time_tbd ? "" : time}
                className={cx(inputClass, "[color-scheme:dark]")}
              />
            </Field>
            <Field label="Runs through" hint="For festivals and multi-day runs.">
              <input
                name="multiDayEnd"
                type="date"
                defaultValue={draft.multi_day_end ?? ""}
                className={cx(inputClass, "[color-scheme:dark]")}
              />
            </Field>
          </div>
        </Card>

        <Card className="p-5 sm:p-6">
          <h2 className="mb-5 text-[17px] text-ink">Where</h2>
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Venue">
                <input
                  name="venue"
                  defaultValue={draft.venue ?? ""}
                  placeholder="Hard Rock Live"
                  className={inputClass}
                />
              </Field>
              <Field label="City" hint="Left blank, this fills in from the venue directory.">
                <input
                  name="city"
                  defaultValue={draft.city ?? ""}
                  placeholder="Hollywood"
                  className={inputClass}
                />
              </Field>
            </div>

            <Field label="Full address">
              <input
                name="address"
                defaultValue={draft.address ?? ""}
                placeholder="1 Seminole Way, Hollywood, FL 33314"
                className={inputClass}
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Organizer / promoter">
                <input
                  name="organizer"
                  defaultValue={draft.organizer ?? ""}
                  placeholder="Live Nation"
                  className={inputClass}
                />
              </Field>
              <Field label="Ticket or info link">
                <input
                  name="ticketUrl"
                  type="url"
                  defaultValue={draft.ticket_url ?? ""}
                  placeholder="https://…"
                  className={inputClass}
                />
              </Field>
            </div>

            <Field
              label="Poster / banner image URL"
              hint="Leave blank to use the generated artwork shown on the right."
            >
              <input
                name="imageUrl"
                type="url"
                value={image}
                onChange={(e) => setImage(e.target.value)}
                placeholder="https://…"
                className={inputClass}
              />
            </Field>
          </div>
        </Card>

        <div className="flex flex-wrap items-center justify-end gap-2">
          {draft.id && (
            <Link
              href={`/events/${draft.id}`}
              className="rounded-xl px-4 py-2.5 text-[14px] font-medium text-body transition-colors hover:bg-canvas hover:text-ink"
            >
              View event page
            </Link>
          )}
          <Button type="submit" variant="primary" size="lg" disabled={isPending}>
            {isPending ? "Saving…" : editing ? "Save changes" : "Create event"}
          </Button>
        </div>
      </form>

      {/* Live preview + danger zone */}
      <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
        <Card className="overflow-hidden">
          <div className="relative aspect-[16/10]">
            {image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={image} alt="" className="size-full object-cover" />
            ) : (
              <div
                className="poster-mesh size-full"
                style={posterStyle(title || "Untitled", category)}
                aria-hidden
              />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-white/70 to-transparent" />
          </div>
          <div className="p-4">
            <p className="text-[12px] uppercase tracking-[0.1em] text-slate">Preview</p>
            <p className="mt-1 line-clamp-2 text-[15px] font-semibold text-ink">
              {title || "Untitled event"}
            </p>
            <p className="mt-0.5 text-[12px] text-slate">{category}</p>
          </div>
        </Card>

        {draft.legacy_assignees && (
          <Card className="border-sky-200 p-4">
            <p className="text-[12.5px] font-semibold uppercase tracking-[0.08em] text-sky-700">
              From the source doc
            </p>
            <p className="mt-1 text-[13px] text-body">{draft.legacy_assignees}</p>
            <p className="mt-1.5 text-[12.5px] leading-snug text-slate">
              Kept for reference. Assign people properly from the event page so it
              lands on their schedule.
            </p>
          </Card>
        )}

        {draft.source_note && (
          <Card className="p-4">
            <p className="text-[12.5px] leading-snug text-slate">{draft.source_note}</p>
          </Card>
        )}

        {draft.id && (
          <DangerZone
            eventId={draft.id}
            title={draft.title}
            archived={draft.status === "archived"}
            isSuperAdmin={isSuperAdmin}
            activeAssignments={activeAssignments}
          />
        )}
      </aside>
    </div>
  );
}

function DangerZone({
  eventId,
  title,
  archived,
  isSuperAdmin,
  activeAssignments,
}: {
  eventId: number;
  title: string;
  archived: boolean;
  isSuperAdmin: boolean;
  activeAssignments: number;
}) {
  const [archiveState, archiveAction, archiving] = useActionState<
    EventFormState,
    FormData
  >(archiveEventAction, {});
  const [deleteState, deleteAction, deleting] = useActionState<EventFormState, FormData>(
    deleteEventAction,
    {},
  );
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <Card className="border-red-200 p-4">
      <h3 className="text-[14px] text-ink">Danger zone</h3>
      <p className="mt-1 text-[12px] leading-snug text-slate">
        Archiving keeps the event and its coverage history but takes it off the
        board.
      </p>

      {archiveState.error && (
        <div className="mt-2">
          <Notice kind="error">{archiveState.error}</Notice>
        </div>
      )}

      <form action={archiveAction} className="mt-3">
        <input type="hidden" name="id" value={eventId} />
        <input type="hidden" name="restore" value={archived ? "true" : "false"} />
        <Button type="submit" variant="secondary" size="sm" disabled={archiving} className="w-full">
          {archiving ? "Working…" : archived ? "Restore from archive" : "Archive event"}
        </Button>
      </form>

      {isSuperAdmin && (
        <>
          <button
            onClick={() => setConfirmDelete(true)}
            className="mt-2 w-full rounded-lg px-3 py-2 text-[12.5px] font-medium text-red-600 transition-colors hover:bg-red-50 hover:text-red-600"
          >
            Delete permanently
          </button>

          <Dialog
            open={confirmDelete}
            onClose={() => setConfirmDelete(false)}
            title="Delete this event permanently?"
            description={title}
            size="sm"
            footer={
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button
                  type="button"
                  variant="ghost"
                  size="md"
                  onClick={() => setConfirmDelete(false)}
                  className="w-full sm:w-auto"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  form="delete-event-form"
                  variant="danger"
                  size="md"
                  disabled={deleting}
                  className="w-full sm:w-auto"
                >
                  {deleting ? "Deleting…" : "Delete forever"}
                </Button>
              </div>
            }
          >
            <form id="delete-event-form" action={deleteAction} className="space-y-3 pt-1">
              <input type="hidden" name="id" value={eventId} />
              {deleteState.error && <Notice kind="error">{deleteState.error}</Notice>}

              <p className="text-[13.5px] leading-relaxed text-body">
                This removes the event, its requests, assignments and internal notes
                for good. Archiving is almost always the better call — it keeps
                contributors&apos; coverage history intact.
              </p>

              {activeAssignments > 0 && (
                <label className="flex items-start gap-2.5 rounded-xl bg-red-50 px-3.5 py-3 ring-1 ring-inset ring-red-200">
                  <input type="checkbox" name="force" className="mt-0.5 size-4 accent-red-500" />
                  <span className="text-[12.5px] leading-snug text-red-700">
                    {activeAssignments} contributor
                    {activeAssignments === 1 ? " is" : "s are"} assigned to this event.
                    Tick to confirm you want to delete it anyway.
                  </span>
                </label>
              )}
            </form>
          </Dialog>
        </>
      )}
    </Card>
  );
}

export { IconTicket };
