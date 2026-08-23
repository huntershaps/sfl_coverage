"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog, Notice } from "@/components/dialog";
import { Button, IconCheck } from "@/components/ui";
import { GuestPicker } from "@/components/guest-picker";
import { coverItMyselfAction, type ActionResult } from "@/app/actions/coverage";
import { COVERAGE_TYPES, COVERAGE_TYPE_LABEL, type CoverageType } from "@/lib/constants";
import { cx } from "@/lib/ui";

/**
 * Lets an admin put themselves straight onto an event rather than filing a
 * request they would only end up approving. It runs through the same direct
 * assignment path as any other, so capacity and guest rules still apply.
 */
export function CoverItMyselfButton({
  eventId,
  eventTitle,
  isFull,
  guestLimit,
  guestNote,
  suggestedTypes,
  isSuperAdmin,
  className,
}: {
  eventId: number;
  eventTitle: string;
  isFull: boolean;
  guestLimit: number;
  guestNote?: string | null;
  suggestedTypes: string[];
  isSuperAdmin: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<CoverageType>(
    (suggestedTypes.find((t) =>
      (COVERAGE_TYPES as readonly string[]).includes(t),
    ) as CoverageType) ?? "photography",
  );
  const [guests, setGuests] = useState(0);
  const [state, action, isPending] = useActionState<ActionResult, FormData>(
    coverItMyselfAction,
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
      <Button variant="secondary" size="lg" onClick={() => setOpen(true)} className={className}>
        <IconCheck size={16} /> Cover this myself
      </Button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Put yourself on this event"
        description={eventTitle}
        footer={
          <form action={action} className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <input type="hidden" name="eventId" value={eventId} />
            <input type="hidden" name="coverageType" value={type} />
            <input type="hidden" name="guests" value={guests} />
            {isSuperAdmin && <input type="hidden" name="override" value="on" />}
            <Button
              type="button"
              variant="ghost"
              size="md"
              onClick={() => setOpen(false)}
              className="w-full sm:w-auto"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="md"
              disabled={isPending}
              className="w-full sm:w-auto"
            >
              {isPending ? "Adding…" : "Add me to this event"}
            </Button>
          </form>
        }
      >
        <div className="space-y-5 pt-1">
          {state.error && <Notice kind="error">{state.error}</Notice>}

          <p className="text-[13.5px] leading-relaxed text-body">
            This assigns you directly — no request, no approval step. It lands on
            your schedule straight away and counts against the event&apos;s
            coverage limit.
          </p>

          {isFull && (
            <Notice kind="info">
              Coverage is already full on this event.{" "}
              {isSuperAdmin
                ? "Adding yourself expands the crew past its limit."
                : "You may not be able to add yourself past the limit."}
            </Notice>
          )}

          <div>
            <p className="mb-2 text-[13px] font-semibold text-body">
              What are you covering?
            </p>
            <div className="flex flex-wrap gap-1.5">
              {COVERAGE_TYPES.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setType(t)}
                  aria-pressed={type === t}
                  className={cx(
                    "rounded-full border px-3.5 py-1.5 text-[12.5px] font-semibold transition-all",
                    type === t
                      ? "border-transparent bg-brand-600 text-white shadow-sm"
                      : "border-line bg-card text-body hover:border-brand-300 hover:text-brand-700",
                  )}
                >
                  {COVERAGE_TYPE_LABEL[t]}
                </button>
              ))}
            </div>
          </div>

          {guestLimit > 0 ? (
            <GuestPicker
              value={guests}
              onChange={setGuests}
              max={guestLimit}
              label="Bringing anyone?"
              hint={
                guestNote ||
                `Up to ${guestLimit} guest${guestLimit === 1 ? "" : "s"} allowed per person on this event.`
              }
            />
          ) : (
            <p className="rounded-xl bg-canvas px-3.5 py-2.5 text-[12.5px] leading-relaxed text-slate ring-1 ring-inset ring-line">
              {guestNote ||
                "No +1s set on this event. Change the guest allowance under Set coverage capacity if you need one."}
            </p>
          )}
        </div>
      </Dialog>
    </>
  );
}
