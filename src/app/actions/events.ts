"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin, requireSuperAdmin, HttpError, isSuperAdmin } from "@/lib/rbac";
import { getDb, audit } from "@/lib/db";
import { getEvent, refreshEventStatus } from "@/lib/events";
import { notifyAssignees } from "@/lib/workflow";
import { EVENT_CATEGORIES, EVENT_STATUSES } from "@/lib/constants";
import { resolveVenue } from "@/lib/parse/venues";

export type EventFormState = { error?: string; ok?: string; id?: number };

function fail(e: unknown): EventFormState {
  if (e instanceof HttpError) return { error: e.message };
  console.error(e);
  return { error: "Something went wrong saving this event." };
}

function readForm(formData: FormData) {
  const s = (k: string) => String(formData.get(k) ?? "").trim();

  const title = s("title");
  const date = s("date");
  const time = s("time");
  const category = s("category");
  const status = s("status");

  if (!title) throw new HttpError(400, "The event needs a title.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
    throw new HttpError(400, "Pick a valid date for the event.");
  if (!(EVENT_CATEGORIES as readonly string[]).includes(category))
    throw new HttpError(400, "Pick a valid category.");
  if (status && !(EVENT_STATUSES as readonly string[]).includes(status))
    throw new HttpError(400, "That status isn't valid.");

  const timeTbd = !time;
  const multiDayEnd = s("multiDayEnd");
  if (multiDayEnd && multiDayEnd < date)
    throw new HttpError(400, "The end date can't be before the start date.");

  const ticketUrl = s("ticketUrl");
  if (ticketUrl && !/^https?:\/\//i.test(ticketUrl))
    throw new HttpError(400, "The ticket link needs to start with http:// or https://");

  const imageUrl = s("imageUrl");
  if (imageUrl && !/^https?:\/\//i.test(imageUrl))
    throw new HttpError(400, "The image link needs to start with http:// or https://");

  // Fill in the city from the venue directory when the form leaves it blank.
  let city = s("city");
  const venue = s("venue");
  if (!city && venue) city = resolveVenue(venue).city ?? "";

  return {
    title,
    subtitle: s("subtitle") || null,
    description: s("description") || null,
    category,
    start_datetime: `${date}T${time || "19:00"}`,
    time_tbd: timeTbd ? 1 : 0,
    multi_day_end: multiDayEnd || null,
    venue: venue || null,
    address: s("address") || null,
    city: city || null,
    organizer: s("organizer") || null,
    ticket_url: ticketUrl || null,
    image_url: imageUrl || null,
    status: status || "open",
  };
}

export async function createEventAction(
  _prev: EventFormState,
  formData: FormData,
): Promise<EventFormState> {
  let newId: number;
  try {
    const user = await requireAdmin();
    const d = readForm(formData);

    const info = getDb()
      .prepare(
        `INSERT INTO events
           (title, subtitle, description, category, start_datetime, time_tbd, multi_day_end,
            venue, address, city, organizer, ticket_url, image_url, status, created_by, source_note)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        d.title, d.subtitle, d.description, d.category, d.start_datetime, d.time_tbd,
        d.multi_day_end, d.venue, d.address, d.city, d.organizer, d.ticket_url,
        d.image_url, d.status, user.id, `Added by ${user.name}`,
      );

    newId = Number(info.lastInsertRowid);
    audit({
      actorId: user.id,
      action: "event.created",
      entityType: "event",
      entityId: newId,
      eventId: newId,
      summary: `${user.name} created "${d.title}"`,
    });
  } catch (e) {
    return fail(e);
  }

  revalidatePath("/events");
  revalidatePath("/admin/events");
  redirect(`/events/${newId}`);
}

export async function updateEventAction(
  _prev: EventFormState,
  formData: FormData,
): Promise<EventFormState> {
  try {
    const user = await requireAdmin();
    const id = Number(formData.get("id"));
    const before = getEvent(id);
    if (!before) throw new HttpError(404, "That event no longer exists.");

    const d = readForm(formData);

    getDb()
      .prepare(
        `UPDATE events SET title=?, subtitle=?, description=?, category=?, start_datetime=?,
                time_tbd=?, multi_day_end=?, venue=?, address=?, city=?, organizer=?,
                ticket_url=?, image_url=?, status=?, updated_at=datetime('now')
          WHERE id = ?`,
      )
      .run(
        d.title, d.subtitle, d.description, d.category, d.start_datetime, d.time_tbd,
        d.multi_day_end, d.venue, d.address, d.city, d.organizer, d.ticket_url,
        d.image_url, d.status, id,
      );

    // Anyone already assigned needs to know when the date, venue or status moves.
    const dateChanged = before.start_datetime !== d.start_datetime;
    const venueChanged = (before.venue ?? "") !== (d.venue ?? "");
    const cancelled = d.status === "cancelled" && before.status !== "cancelled";
    const postponed = d.status === "postponed" && before.status !== "postponed";

    if (cancelled) {
      notifyAssignees(
        before,
        "event.cancelled",
        `Cancelled — ${d.title}`,
        "This event has been cancelled. It's off your schedule.",
      );
    } else if (postponed) {
      notifyAssignees(
        before,
        "event.postponed",
        `Postponed — ${d.title}`,
        "This event has been postponed. We'll update you when it's rescheduled.",
      );
    } else if (dateChanged || venueChanged) {
      notifyAssignees(
        before,
        "event.updated",
        `Details changed — ${d.title}`,
        [
          dateChanged && "The date or time moved.",
          venueChanged && `The venue is now ${d.venue ?? "TBD"}.`,
        ]
          .filter(Boolean)
          .join(" "),
      );
    }

    audit({
      actorId: user.id,
      action: "event.updated",
      entityType: "event",
      entityId: id,
      eventId: id,
      summary: `${user.name} updated "${d.title}"${cancelled ? " and cancelled it" : ""}`,
      meta: { dateChanged, venueChanged, statusFrom: before.status, statusTo: d.status },
    });

    refreshEventStatus(id);
    revalidatePath(`/events/${id}`);
    revalidatePath("/events");
    revalidatePath("/admin/events");
    return { ok: "Event saved.", id };
  } catch (e) {
    return fail(e);
  }
}

export async function archiveEventAction(
  _prev: EventFormState,
  formData: FormData,
): Promise<EventFormState> {
  try {
    const user = await requireAdmin();
    const id = Number(formData.get("id"));
    const restore = formData.get("restore") === "true";
    const ev = getEvent(id);
    if (!ev) throw new HttpError(404, "That event no longer exists.");

    getDb()
      .prepare("UPDATE events SET status = ?, updated_at = datetime('now') WHERE id = ?")
      .run(restore ? "open" : "archived", id);

    audit({
      actorId: user.id,
      action: restore ? "event.restored" : "event.archived",
      entityType: "event",
      entityId: id,
      eventId: id,
      summary: `${user.name} ${restore ? "restored" : "archived"} "${ev.title}"`,
    });

    if (restore) refreshEventStatus(id);
    revalidatePath("/admin/events");
    revalidatePath("/events");
    return { ok: restore ? "Event restored." : "Event archived." };
  } catch (e) {
    return fail(e);
  }
}

/**
 * Hard delete is Super-Admin-only and refuses to run while anyone is assigned,
 * so history can't vanish out from under a contributor. Archive is the norm.
 */
export async function deleteEventAction(
  _prev: EventFormState,
  formData: FormData,
): Promise<EventFormState> {
  try {
    const user = await requireSuperAdmin();
    const id = Number(formData.get("id"));
    const ev = getEvent(id);
    if (!ev) throw new HttpError(404, "That event no longer exists.");

    const db = getDb();
    const active = (
      db
        .prepare(
          "SELECT COUNT(*) n FROM assignments WHERE event_id = ? AND status = 'active'",
        )
        .get(id) as { n: number }
    ).n;
    if (active > 0 && formData.get("force") !== "on")
      throw new HttpError(
        409,
        `${active} contributor${active === 1 ? " is" : "s are"} assigned to this event. Archive it instead, or confirm you want to delete anyway.`,
      );

    db.prepare("DELETE FROM events WHERE id = ?").run(id);

    audit({
      actorId: user.id,
      action: "event.deleted",
      entityType: "event",
      entityId: id,
      summary: `${user.name} permanently deleted "${ev.title}"`,
      meta: { hadAssignments: active },
    });
  } catch (e) {
    return fail(e);
  }

  revalidatePath("/admin/events");
  revalidatePath("/events");
  redirect("/admin/events");
}

export async function bulkEventAction(
  _prev: EventFormState,
  formData: FormData,
): Promise<EventFormState> {
  try {
    const user = await requireAdmin();
    const op = String(formData.get("op") ?? "");
    const ids = formData
      .getAll("ids")
      .map((v) => Number(v))
      .filter((n) => Number.isFinite(n));
    if (!ids.length) return { error: "Nothing selected." };

    const db = getDb();
    const list = ids.map(() => "?").join(",");

    if (op === "publish") {
      db.prepare(
        `UPDATE events SET status = 'open', updated_at = datetime('now')
          WHERE id IN (${list}) AND status = 'draft'`,
      ).run(...ids);
    } else if (op === "archive") {
      db.prepare(
        `UPDATE events SET status = 'archived', updated_at = datetime('now') WHERE id IN (${list})`,
      ).run(...ids);
    } else if (op === "delete") {
      if (!isSuperAdmin(user))
        throw new HttpError(403, "Only the Super Admin can delete events.");
      db.prepare(`DELETE FROM events WHERE id IN (${list})`).run(...ids);
    } else {
      return { error: "Unknown action." };
    }

    audit({
      actorId: user.id,
      action: `event.bulk_${op}`,
      entityType: "event",
      summary: `${user.name} ran "${op}" on ${ids.length} event${ids.length === 1 ? "" : "s"}`,
      meta: { ids },
    });

    revalidatePath("/admin/events");
    revalidatePath("/events");
    return { ok: `${ids.length} event${ids.length === 1 ? "" : "s"} updated.` };
  } catch (e) {
    return fail(e);
  }
}
