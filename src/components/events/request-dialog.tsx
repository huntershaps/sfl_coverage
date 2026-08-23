"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { Dialog, Notice } from "@/components/dialog";
import { Button, IconCheck, IconClock } from "@/components/ui";
import { COVERAGE_TYPES, COVERAGE_TYPE_LABEL, type CoverageType } from "@/lib/constants";
import {
  requestCoverageAction,
  withdrawRequestAction,
  type ActionResult,
} from "@/app/actions/coverage";
import { cx } from "@/lib/ui";
import { GuestPicker } from "@/components/guest-picker";

const TYPE_HINT: Record<CoverageType, string> = {
  photography: "Shooting the event",
  video: "Filming / reels",
  article: "Writing a review or recap",
  interview: "Talking to talent or organizers",
  social: "Live posting and stories",
  other: "Something else — tell us below",
};

function SubmitBtn({ label, pending: pendingLabel }: { label: string; pending: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" size="md" disabled={pending} className="w-full sm:w-auto">
      {pending ? pendingLabel : label}
    </Button>
  );
}

export function RequestCoverageButton({
  eventId,
  eventTitle,
  isFull,
  allowWaitlist,
  suggestedTypes,
  openTypeLabels,
  guestLimit,
  guestNote,
  className,
}: {
  eventId: number;
  eventTitle: string;
  isFull: boolean;
  allowWaitlist: boolean;
  suggestedTypes: string[];
  openTypeLabels: string[];
  guestLimit: number;
  guestNote?: string | null;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<CoverageType[]>(
    (suggestedTypes.filter((t) =>
      (COVERAGE_TYPES as readonly string[]).includes(t),
    ) as CoverageType[]).slice(0, 2),
  );
  const [message, setMessage] = useState("");
  const [reason, setReason] = useState("");
  const [guests, setGuests] = useState(0);
  const [state, formAction] = useActionState<ActionResult, FormData>(
    requestCoverageAction,
    {},
  );
  const router = useRouter();

  useEffect(() => {
    if (state.ok) {
      setOpen(false);
      router.refresh();
    }
  }, [state.ok, router]);

  function toggle(t: CoverageType) {
    setSelected((cur) =>
      cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t],
    );
  }

  return (
    <>
      <Button
        variant={isFull ? "secondary" : "primary"}
        size="lg"
        onClick={() => setOpen(true)}
        className={className}
      >
        {isFull && allowWaitlist ? "Join the waitlist" : "Request to cover"}
      </Button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={isFull && allowWaitlist ? "Join the waitlist" : "Request to cover"}
        description={eventTitle}
        footer={
          <form action={formAction} className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <input type="hidden" name="eventId" value={eventId} />
            {selected.map((t) => (
              <input key={t} type="hidden" name="coverageTypes" value={t} />
            ))}
            <input type="hidden" name="message" value={message} />
            <input type="hidden" name="reason" value={reason} />
            <input type="hidden" name="guests" value={guests} />
            <Button
              type="button"
              variant="ghost"
              size="md"
              onClick={() => setOpen(false)}
              className="w-full sm:w-auto"
            >
              Cancel
            </Button>
            <SubmitBtn label="Submit request" pending="Submitting…" />
          </form>
        }
      >
        <RequestBody
          state={state}
          selected={selected}
          toggle={toggle}
          isFull={isFull}
          allowWaitlist={allowWaitlist}
          openTypeLabels={openTypeLabels}
          message={message}
          setMessage={setMessage}
          reason={reason}
          setReason={setReason}
          guests={guests}
          setGuests={setGuests}
          guestLimit={guestLimit}
          guestNote={guestNote}
        />
      </Dialog>
    </>
  );
}

function RequestBody({
  state,
  selected,
  toggle,
  isFull,
  allowWaitlist,
  openTypeLabels,
  message,
  setMessage,
  reason,
  setReason,
  guests,
  setGuests,
  guestLimit,
  guestNote,
}: {
  state: ActionResult;
  selected: CoverageType[];
  toggle: (t: CoverageType) => void;
  isFull: boolean;
  allowWaitlist: boolean;
  openTypeLabels: string[];
  message: string;
  setMessage: (v: string) => void;
  reason: string;
  setReason: (v: string) => void;
  guests: number;
  setGuests: (n: number) => void;
  guestLimit: number;
  guestNote?: string | null;
}) {
  return (
    <div className="space-y-5 pt-1">
      {state.error && <Notice kind="error">{state.error}</Notice>}

      {isFull && allowWaitlist && (
        <Notice kind="info">
          Coverage for this event is currently full. Your request goes on the
          waitlist — the Super Admin can still add you if a spot opens or they
          decide to expand the crew.
        </Notice>
      )}

      {openTypeLabels.length > 0 && (
        <Notice kind="info">
          Still needed on this one: <strong>{openTypeLabels.join(", ")}</strong>.
        </Notice>
      )}

      <div>
        <p className="mb-2 text-[13px] font-semibold text-body">
          What coverage can you provide?{" "}
          <span className="font-normal text-slate">Pick everything that applies.</span>
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {COVERAGE_TYPES.map((t) => {
            const on = selected.includes(t);
            return (
              <button
                key={t}
                type="button"
                onClick={() => toggle(t)}
                aria-pressed={on}
                className={cx(
                  "flex items-start gap-2.5 rounded-xl px-3 py-2.5 text-left transition-all ring-1 ring-inset",
                  on
                    ? "bg-brand-50 ring-brand-200"
                    : "bg-canvas ring-line hover:bg-line hover:ring-line-strong",
                )}
              >
                <span
                  className={cx(
                    "mt-0.5 grid size-4 shrink-0 place-items-center rounded-[5px] ring-1 transition-colors",
                    on ? "bg-brand-500 ring-brand-500 text-white" : "ring-line-strong",
                  )}
                  aria-hidden
                >
                  {on && <IconCheck size={11} />}
                </span>
                <span className="min-w-0">
                  <span
                    className={cx(
                      "block text-[13.5px] font-semibold",
                      on ? "text-ink" : "text-body",
                    )}
                  >
                    {COVERAGE_TYPE_LABEL[t]}
                  </span>
                  <span className="block text-[12.5px] leading-snug text-slate">
                    {TYPE_HINT[t]}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
        {selected.length === 0 && (
          <p className="mt-2 text-[12px] text-amber-700">
            Pick at least one so the desk knows what you&apos;re bringing.
          </p>
        )}
      </div>

      {guestLimit > 0 ? (
        <GuestPicker
          value={guests}
          onChange={setGuests}
          max={guestLimit}
          hint={
            guestNote ||
            `Up to ${guestLimit} guest${guestLimit === 1 ? "" : "s"} allowed per person on this event. The desk has the final say.`
          }
        />
      ) : (
        <p className="rounded-xl bg-canvas px-3.5 py-2.5 text-[12.5px] leading-relaxed text-slate ring-1 ring-inset ring-line">
          {guestNote || "No +1s on this event — the credential is for you only."}
        </p>
      )}

      <label className="block">
        <span className="mb-1.5 block text-[13px] font-semibold text-body">
          Message to the desk{" "}
          <span className="font-normal text-slate">(optional)</span>
        </span>
        <textarea
          rows={3}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Anything the Super Admin should know — gear, past coverage of this artist, turnaround time…"
          className="w-full resize-y rounded-xl bg-canvas px-3.5 py-2.5 text-[14px] text-ink ring-1 ring-inset ring-line
                     transition-colors placeholder:text-slate hover:ring-line-strong focus:ring-2 focus:ring-teal-400 focus:outline-none"
        />
      </label>

      <label className="block">
        <span className="mb-1.5 block text-[13px] font-semibold text-body">
          Why you want this one{" "}
          <span className="font-normal text-slate">(optional)</span>
        </span>
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Longtime fan, know the promoter, building a portfolio…"
          className="w-full rounded-xl bg-canvas px-3.5 py-2.5 text-[14px] text-ink ring-1 ring-inset ring-line
                     transition-colors placeholder:text-slate hover:ring-line-strong focus:ring-2 focus:ring-teal-400 focus:outline-none"
        />
      </label>

      <p className="flex items-start gap-2 rounded-xl bg-canvas px-3.5 py-2.5 text-[12.5px] leading-relaxed text-slate ring-1 ring-inset ring-line">
        <IconClock size={15} className="mt-px shrink-0" />
        <span>
          Submitting doesn&apos;t assign you. Your request goes to the Super Admin,
          who has the final say on who covers each event. You&apos;ll get a
          notification the moment there&apos;s a decision.
        </span>
      </p>
    </div>
  );
}

/* ------------------------------- withdraw -------------------------------- */

export function WithdrawButton({
  requestId,
  eventTitle,
  size = "md",
}: {
  requestId: number;
  eventTitle: string;
  size?: "sm" | "md";
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState<ActionResult, FormData>(
    withdrawRequestAction,
    {},
  );
  const router = useRouter();

  useEffect(() => {
    if (state.ok) {
      setOpen(false);
      router.refresh();
    }
  }, [state.ok, router]);

  return (
    <>
      <Button variant="ghost" size={size} onClick={() => setOpen(true)}>
        Withdraw
      </Button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Withdraw this request?"
        description={eventTitle}
        size="sm"
        footer={
          <form action={formAction} className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <input type="hidden" name="requestId" value={requestId} />
            <Button
              type="button"
              variant="ghost"
              size="md"
              onClick={() => setOpen(false)}
              className="w-full sm:w-auto"
            >
              Keep it
            </Button>
            <SubmitBtn label="Withdraw request" pending="Withdrawing…" />
          </form>
        }
      >
        <div className="space-y-3 pt-1">
          {state.error && <Notice kind="error">{state.error}</Notice>}
          <p className="text-[13.5px] leading-relaxed text-body">
            Your request comes off the Super Admin&apos;s list. You can always put
            your name back in later while the event is still open.
          </p>
        </div>
      </Dialog>
    </>
  );
}
