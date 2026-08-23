"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog, Notice } from "@/components/dialog";
import {
  Button,
  Card,
  Avatar,
  Badge,
  IconEdit,
  IconUsers,
  IconNote,
  IconSettings,
  IconShield,
  IconSearch,
} from "@/components/ui";
import {
  assignDirectlyAction,
  removeAssignmentAction,
  toggleRequestsAction,
  setCapacityAction,
  addNoteAction,
  type ActionResult,
} from "@/app/actions/coverage";
import { COVERAGE_TYPES, COVERAGE_TYPE_LABEL, type CoverageType } from "@/lib/constants";
import { GuestPicker } from "@/components/guest-picker";
import { cx } from "@/lib/ui";

type Contributor = {
  id: number;
  name: string;
  email: string;
  profile_photo: string | null;
  specialties: string[];
  provisional: boolean;
};

export function EventAdminPanel({
  event,
  slots,
  contributors,
  isSuperAdmin,
  assignments,
}: {
  event: {
    id: number;
    title: string;
    status: string;
    coverage_limit: number | null;
    allow_waitlist: boolean;
    requests_closed: boolean;
    guest_limit: number;
    guest_note: string | null;
  };
  slots: { type: string; capacity: number }[];
  contributors: Contributor[];
  isSuperAdmin: boolean;
  assignments: { id: number; name: string; coverage_type: string }[];
}) {
  const [dialog, setDialog] = useState<"assign" | "capacity" | "note" | "remove" | null>(
    null,
  );
  const [removeTarget, setRemoveTarget] = useState<{ id: number; name: string } | null>(
    null,
  );

  return (
    <Card className="border-brand-200 p-5">
      <div className="mb-3.5 flex items-center gap-2">
        <span className="grid size-7 place-items-center rounded-lg bg-brand-50 text-brand-600 ring-1 ring-inset ring-brand-200">
          <IconShield size={15} />
        </span>
        <h3 className="text-[15px] text-ink">Admin tools</h3>
      </div>

      <div className="space-y-1.5">
        <PanelLink href={`/admin/events/${event.id}/edit`} icon={<IconEdit size={16} />}>
          Edit event
        </PanelLink>
        <PanelLink href={`/admin/approvals/${event.id}`} icon={<IconUsers size={16} />}>
          Manage requests
        </PanelLink>

        <PanelButton onClick={() => setDialog("assign")} icon={<IconUsers size={16} />}>
          Assign a contributor
        </PanelButton>
        <PanelButton onClick={() => setDialog("capacity")} icon={<IconSettings size={16} />}>
          Set coverage capacity
        </PanelButton>
        <PanelButton onClick={() => setDialog("note")} icon={<IconNote size={16} />}>
          Add internal note
        </PanelButton>

        <ToggleRequests eventId={event.id} closed={event.requests_closed} />
      </div>

      {assignments.length > 0 && (
        <div className="mt-4 border-t border-line pt-3.5">
          <p className="eyebrow mb-2">Remove from event</p>
          <ul className="space-y-1">
            {assignments.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-2">
                <span className="truncate text-[13px] text-body">{a.name}</span>
                <button
                  onClick={() => {
                    setRemoveTarget({ id: a.id, name: a.name });
                    setDialog("remove");
                  }}
                  className="shrink-0 rounded-lg px-2 py-1 text-[12px] font-medium text-red-600 transition-colors hover:bg-red-50 hover:text-red-600"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <AssignDialog
        open={dialog === "assign"}
        onClose={() => setDialog(null)}
        event={event}
        contributors={contributors}
        isSuperAdmin={isSuperAdmin}
      />
      <CapacityDialog
        open={dialog === "capacity"}
        onClose={() => setDialog(null)}
        event={event}
        slots={slots}
      />
      <NoteDialog
        open={dialog === "note"}
        onClose={() => setDialog(null)}
        eventId={event.id}
        isSuperAdmin={isSuperAdmin}
      />
      <RemoveDialog
        open={dialog === "remove"}
        onClose={() => {
          setDialog(null);
          setRemoveTarget(null);
        }}
        target={removeTarget}
      />
    </Card>
  );
}

function PanelLink({
  href,
  icon,
  children,
}: {
  href: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13.5px] text-body transition-colors hover:bg-canvas hover:text-ink"
    >
      <span className="text-slate">{icon}</span>
      {children}
    </Link>
  );
}

function PanelButton({
  onClick,
  icon,
  children,
  tone,
}: {
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
  tone?: "danger";
}) {
  return (
    <button
      onClick={onClick}
      className={cx(
        "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13.5px] transition-colors",
        tone === "danger"
          ? "text-red-600 hover:bg-red-50 hover:text-red-600"
          : "text-body hover:bg-canvas hover:text-ink",
      )}
    >
      <span className={tone === "danger" ? "" : "text-slate"}>{icon}</span>
      {children}
    </button>
  );
}

/* ------------------------------ close/reopen ------------------------------ */

function ToggleRequests({ eventId, closed }: { eventId: number; closed: boolean }) {
  const [state, action] = useActionState<ActionResult, FormData>(
    toggleRequestsAction,
    {},
  );
  const router = useRouter();
  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state.ok, router]);

  return (
    <form action={action}>
      <input type="hidden" name="eventId" value={eventId} />
      <input type="hidden" name="closed" value={closed ? "false" : "true"} />
      <button
        type="submit"
        className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13.5px] text-body transition-colors hover:bg-canvas hover:text-ink"
      >
        <span className="text-slate">
          <IconSettings size={16} />
        </span>
        {closed ? "Reopen for requests" : "Close coverage requests"}
      </button>
    </form>
  );
}

/* ----------------------------- direct assign ------------------------------ */

function AssignDialog({
  open,
  onClose,
  event,
  contributors,
  isSuperAdmin,
}: {
  open: boolean;
  onClose: () => void;
  event: { id: number; title: string; guest_limit: number };
  contributors: Contributor[];
  isSuperAdmin: boolean;
}) {
  const [state, action] = useActionState<ActionResult, FormData>(
    assignDirectlyAction,
    {},
  );
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<Contributor | null>(null);
  const [type, setType] = useState<CoverageType>("photography");
  const [guests, setGuests] = useState(0);
  const router = useRouter();

  useEffect(() => {
    if (state.ok) {
      onClose();
      setPicked(null);
      setQ("");
      router.refresh();
    }
  }, [state.ok, onClose, router]);

  const filtered = contributors
    .filter(
      (c) =>
        !q ||
        c.name.toLowerCase().includes(q.toLowerCase()) ||
        c.email.toLowerCase().includes(q.toLowerCase()),
    )
    .slice(0, 40);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Assign a contributor"
      description={`${event.title} — this creates an official assignment even without a request.`}
      footer={
        <form action={action} className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <input type="hidden" name="eventId" value={event.id} />
          <input type="hidden" name="userId" value={picked?.id ?? ""} />
          <input type="hidden" name="coverageType" value={type} />
          <input type="hidden" name="guests" value={guests} />
          {isSuperAdmin && <input type="hidden" name="override" value="on" />}
          <Button type="button" variant="ghost" size="md" onClick={onClose} className="w-full sm:w-auto">
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            size="md"
            disabled={!picked}
            className="w-full sm:w-auto"
          >
            {picked ? `Assign ${picked.name.split(" ")[0]}` : "Pick someone"}
          </Button>
        </form>
      }
    >
      <div className="space-y-4 pt-1">
        {state.error && <Notice kind="error">{state.error}</Notice>}

        <div>
          <p className="mb-2 text-[13px] font-semibold text-body">Coverage responsibility</p>
          <div className="flex flex-wrap gap-1.5">
            {COVERAGE_TYPES.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setType(t)}
                aria-pressed={type === t}
                className={cx(
                  "rounded-full px-3 py-1.5 text-[12.5px] font-medium ring-1 ring-inset transition-colors",
                  type === t
                    ? "bg-brand-50 text-brand-600 ring-brand-200"
                    : "text-slate ring-line hover:bg-canvas hover:text-body",
                )}
              >
                {COVERAGE_TYPE_LABEL[t]}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="relative mb-2">
            <IconSearch
              size={15}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate"
            />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search contributors…"
              className="h-10 w-full rounded-xl bg-canvas pl-9 pr-3 text-[13.5px] text-ink ring-1 ring-inset ring-line
                         placeholder:text-slate focus:ring-2 focus:ring-teal-400 focus:outline-none"
            />
          </div>

          <ul className="max-h-[280px] space-y-1 overflow-y-auto">
            {filtered.length === 0 && (
              <li className="px-2 py-6 text-center text-[13px] text-slate">
                No contributors match “{q}”.
              </li>
            )}
            {filtered.map((c) => {
              const on = picked?.id === c.id;
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => setPicked(c)}
                    className={cx(
                      "flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors ring-1 ring-inset",
                      on
                        ? "bg-brand-50 ring-brand-200"
                        : "ring-transparent hover:bg-canvas",
                    )}
                  >
                    <Avatar name={c.name} src={c.profile_photo} size={34} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="truncate text-[13.5px] font-semibold text-ink">
                          {c.name}
                        </span>
                        {c.provisional && (
                          <Badge tone="bg-canvas text-slate ring-line">
                            Provisional
                          </Badge>
                        )}
                      </span>
                      <span className="block truncate text-[12.5px] text-slate">
                        {c.specialties.length
                          ? c.specialties.join(", ")
                          : c.email}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        <GuestPicker
          value={guests}
          onChange={setGuests}
          max={event.guest_limit}
          label="Guests they can bring"
        />

        {isSuperAdmin && (
          <Notice kind="info">
            As Super Admin you can assign past the coverage limit — capacity is
            overridden automatically if the event is already full.
          </Notice>
        )}
      </div>
    </Dialog>
  );
}

/* -------------------------------- capacity -------------------------------- */

function CapacityDialog({
  open,
  onClose,
  event,
  slots,
}: {
  open: boolean;
  onClose: () => void;
  event: {
    id: number;
    coverage_limit: number | null;
    allow_waitlist: boolean;
    guest_limit: number;
    guest_note: string | null;
  };
  slots: { type: string; capacity: number }[];
}) {
  const [state, action, isPending] = useActionState<ActionResult, FormData>(
    setCapacityAction,
    {},
  );
  const [mode, setMode] = useState<"unlimited" | "total" | "typed">(
    slots.length ? "typed" : event.coverage_limit != null ? "total" : "unlimited",
  );
  const router = useRouter();

  useEffect(() => {
    if (state.ok) {
      onClose();
      router.refresh();
    }
  }, [state.ok, onClose, router]);

  const slotMap = new Map(slots.map((s) => [s.type, s.capacity]));

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Coverage capacity"
      description="Decide how many people can be approved for this event."
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="ghost" size="md" onClick={onClose} className="w-full sm:w-auto">
            Cancel
          </Button>
          <Button
            type="submit"
            form="capacity-form"
            variant="primary"
            size="md"
            disabled={isPending}
            className="w-full sm:w-auto"
          >
            {isPending ? "Saving…" : "Save capacity"}
          </Button>
        </div>
      }
    >
      <form id="capacity-form" action={action} className="space-y-4 pt-1">
        <input type="hidden" name="eventId" value={event.id} />
        {state.error && <Notice kind="error">{state.error}</Notice>}

        <div className="space-y-2">
          {(
            [
              ["unlimited", "Unlimited", "Anyone approved can cover it."],
              ["total", "Total limit", "A single cap on how many people go."],
              ["typed", "Limit by coverage type", "e.g. Photography 2, Video 1, Writer 1."],
            ] as const
          ).map(([key, label, hint]) => (
            <button
              key={key}
              type="button"
              onClick={() => setMode(key)}
              className={cx(
                "flex w-full items-start gap-2.5 rounded-xl px-3 py-2.5 text-left ring-1 ring-inset transition-colors",
                mode === key
                  ? "bg-brand-50 ring-brand-200"
                  : "ring-line hover:bg-canvas",
              )}
            >
              <span
                className={cx(
                  "mt-1 size-3.5 shrink-0 rounded-full ring-1 transition-colors",
                  mode === key ? "bg-brand-500 ring-brand-500" : "ring-line-strong",
                )}
                aria-hidden
              />
              <span>
                <span className="block text-[13.5px] font-semibold text-ink">{label}</span>
                <span className="block text-[12px] text-slate">{hint}</span>
              </span>
            </button>
          ))}
        </div>

        {mode === "total" && (
          <label className="block">
            <span className="mb-1.5 block text-[13px] font-semibold text-body">
              Maximum contributors
            </span>
            <input
              name="coverageLimit"
              type="number"
              min={1}
              defaultValue={event.coverage_limit ?? 2}
              className="w-32 rounded-xl bg-canvas px-3.5 py-2.5 text-[14px] text-ink ring-1 ring-inset ring-line focus:ring-2 focus:ring-teal-400 focus:outline-none"
            />
          </label>
        )}

        {mode === "typed" && (
          <div className="space-y-2">
            <p className="text-[13px] font-semibold text-body">Spots per coverage type</p>
            {COVERAGE_TYPES.map((t) => (
              <label key={t} className="flex items-center justify-between gap-3">
                <span className="text-[13.5px] text-body">{COVERAGE_TYPE_LABEL[t]}</span>
                <input
                  name={`slot_${t}`}
                  type="number"
                  min={0}
                  defaultValue={slotMap.get(t) ?? 0}
                  className="w-20 rounded-lg bg-canvas px-3 py-1.5 text-center text-[13.5px] text-ink ring-1 ring-inset ring-line focus:ring-2 focus:ring-teal-400 focus:outline-none"
                />
              </label>
            ))}
            <p className="text-[12px] text-slate">Set a type to 0 to leave it uncapped by type.</p>
          </div>
        )}

        {mode === "unlimited" && <input type="hidden" name="coverageLimit" value="" />}

        {/* Plus-ones. The source doc tracks these per person ("Charity +3") and
            bans them at some rooms, so the policy lives on the event. */}
        <div className="space-y-2 border-t border-line pt-4">
          <label className="block">
            <span className="mb-1.5 block text-[13px] font-semibold text-body">
              Guests (+1s) allowed per contributor
            </span>
            <input
              name="guestLimit"
              type="number"
              min={0}
              max={10}
              defaultValue={event.guest_limit}
              className="w-24 rounded-xl bg-card px-3.5 py-2.5 text-[14px] text-ink ring-1 ring-inset ring-line focus:ring-2 focus:ring-brand-500 focus:outline-none"
            />
            <span className="mt-1.5 block text-[12px] text-slate">
              0 means nobody may bring a guest. The Super Admin can still override
              this for an individual.
            </span>
          </label>

          <label className="block">
            <span className="mb-1.5 block text-[13px] font-semibold text-body">
              Guest note <span className="font-normal text-slate">(optional)</span>
            </span>
            <input
              name="guestNote"
              defaultValue={event.guest_note ?? ""}
              placeholder="e.g. No +1s for photographers at this venue"
              className="w-full rounded-xl bg-card px-3.5 py-2.5 text-[14px] text-ink ring-1 ring-inset ring-line placeholder:text-slate focus:ring-2 focus:ring-brand-500 focus:outline-none"
            />
          </label>
        </div>

        <label className="flex items-start gap-2.5 rounded-xl bg-canvas px-3 py-2.5 ring-1 ring-inset ring-line">
          <input
            type="checkbox"
            name="allowWaitlist"
            defaultChecked={event.allow_waitlist}
            className="mt-0.5 size-4 accent-brand-500"
          />
          <span>
            <span className="block text-[13.5px] font-semibold text-ink">
              Allow a waitlist when full
            </span>
            <span className="block text-[12px] text-slate">
              Contributors can still put their name in after every spot is taken.
            </span>
          </span>
        </label>
      </form>
    </Dialog>
  );
}

/* --------------------------------- notes ---------------------------------- */

function NoteDialog({
  open,
  onClose,
  eventId,
  isSuperAdmin,
}: {
  open: boolean;
  onClose: () => void;
  eventId: number;
  isSuperAdmin: boolean;
}) {
  const [state, action, isPending] = useActionState<ActionResult, FormData>(
    addNoteAction,
    {},
  );
  const router = useRouter();
  useEffect(() => {
    if (state.ok) {
      onClose();
      router.refresh();
    }
  }, [state.ok, onClose, router]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Add an internal note"
      description="Admin-only. Contributors never see this."
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="ghost" size="md" onClick={onClose} className="w-full sm:w-auto">
            Cancel
          </Button>
          <Button
            type="submit"
            form="note-form"
            variant="primary"
            size="md"
            disabled={isPending}
            className="w-full sm:w-auto"
          >
            {isPending ? "Saving…" : "Save note"}
          </Button>
        </div>
      }
    >
      <form id="note-form" action={action} className="space-y-4 pt-1">
        <input type="hidden" name="eventId" value={eventId} />
        {state.error && <Notice kind="error">{state.error}</Notice>}

        <textarea
          name="note"
          rows={4}
          required
          placeholder="e.g. Waiting on credentials from the promoter. Strong contributor for concert photography."
          className="w-full resize-y rounded-xl bg-canvas px-3.5 py-2.5 text-[14px] text-ink ring-1 ring-inset ring-line
                     placeholder:text-slate focus:ring-2 focus:ring-teal-400 focus:outline-none"
        />

        {isSuperAdmin && (
          <label className="flex items-start gap-2.5">
            <input
              type="checkbox"
              name="visibility"
              value="super_admin_only"
              className="mt-0.5 size-4 accent-brand-500"
            />
            <span>
              <span className="block text-[13.5px] font-semibold text-ink">
                Super Admin only
              </span>
              <span className="block text-[12px] text-slate">
                Hide this note from Admin/Editor accounts too.
              </span>
            </span>
          </label>
        )}
      </form>
    </Dialog>
  );
}

/* -------------------------------- removal --------------------------------- */

function RemoveDialog({
  open,
  onClose,
  target,
}: {
  open: boolean;
  onClose: () => void;
  target: { id: number; name: string } | null;
}) {
  const [state, action, isPending] = useActionState<ActionResult, FormData>(
    removeAssignmentAction,
    {},
  );
  const router = useRouter();
  useEffect(() => {
    if (state.ok) {
      onClose();
      router.refresh();
    }
  }, [state.ok, onClose, router]);

  if (!target) return null;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Remove ${target.name}?`}
      description="They'll be notified and the event comes off their schedule."
      size="sm"
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="ghost" size="md" onClick={onClose} className="w-full sm:w-auto">
            Keep assignment
          </Button>
          <Button
            type="submit"
            form="remove-form"
            variant="danger"
            size="md"
            disabled={isPending}
            className="w-full sm:w-auto"
          >
            {isPending ? "Removing…" : "Remove"}
          </Button>
        </div>
      }
    >
      <form id="remove-form" action={action} className="space-y-3 pt-1">
        <input type="hidden" name="assignmentId" value={target.id} />
        {state.error && <Notice kind="error">{state.error}</Notice>}
        <label className="block">
          <span className="mb-1.5 block text-[13px] font-semibold text-body">
            Reason <span className="font-normal text-slate">(shared with them)</span>
          </span>
          <input
            name="reason"
            placeholder="e.g. Promoter cut the photo list to one."
            className="w-full rounded-xl bg-canvas px-3.5 py-2.5 text-[14px] text-ink ring-1 ring-inset ring-line
                       placeholder:text-slate focus:ring-2 focus:ring-teal-400 focus:outline-none"
          />
        </label>
      </form>
    </Dialog>
  );
}
