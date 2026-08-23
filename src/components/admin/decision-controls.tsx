"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog, Notice } from "@/components/dialog";
import { Button, IconCheck, IconX, IconClock, IconShield } from "@/components/ui";
import { decideRequestAction, type ActionResult } from "@/app/actions/coverage";
import { COVERAGE_TYPES, COVERAGE_TYPE_LABEL, type CoverageType } from "@/lib/constants";
import { cx } from "@/lib/ui";
import { GuestPicker } from "@/components/guest-picker";

type DecisionKind = "approve" | "reject" | "waitlist" | "review";

const COPY: Record<
  DecisionKind,
  { title: string; verb: string; hint: string; note: string }
> = {
  approve: {
    title: "Approve this request",
    verb: "Approve",
    hint: "Creates an official assignment and puts the event on their schedule.",
    note: "Anything they should know — call time, credential pickup, who to ask for.",
  },
  reject: {
    title: "Pass on this request",
    verb: "Send decision",
    hint: "They'll be told this one went another direction. Nothing harsh.",
    note: "Optional note shown to them. A short reason goes a long way.",
  },
  waitlist: {
    title: "Waitlist this contributor",
    verb: "Waitlist",
    hint: "Keeps them in line if a spot opens or the crew expands.",
    note: "Optional note shown to them.",
  },
  review: {
    title: "Mark as under review",
    verb: "Move to review",
    hint: "Signals you're weighing it without deciding yet.",
    note: "Optional note shown to them.",
  },
};

/**
 * The decision buttons attached to a single request. When the signed-in admin
 * cannot finalize (Super-Admin-approval mode), the copy says "recommend" so
 * nobody thinks they just approved someone.
 */
export function DecisionControls({
  requestId,
  contributorName,
  eventTitle,
  requestedTypes,
  canFinalize,
  isSuperAdmin,
  isFull,
  currentStatus,
  guestLimit,
  guestsRequested,
  compact,
}: {
  requestId: number;
  contributorName: string;
  eventTitle: string;
  requestedTypes: string[];
  canFinalize: boolean;
  isSuperAdmin: boolean;
  isFull: boolean;
  currentStatus: string;
  guestLimit: number;
  guestsRequested: number;
  compact?: boolean;
}) {
  const [kind, setKind] = useState<DecisionKind | null>(null);

  const decided = ["approved", "rejected", "waitlisted"].includes(currentStatus);

  return (
    <>
      <div className={cx("flex flex-wrap gap-1.5", compact && "justify-end")}>
        {currentStatus !== "approved" && (
          <Button variant="success" size="sm" onClick={() => setKind("approve")}>
            <IconCheck size={14} />
            {canFinalize ? "Approve" : "Recommend approve"}
          </Button>
        )}
        {currentStatus !== "waitlisted" && (
          <Button variant="secondary" size="sm" onClick={() => setKind("waitlist")}>
            Waitlist
          </Button>
        )}
        {currentStatus !== "rejected" && (
          <Button variant="ghost" size="sm" onClick={() => setKind("reject")}>
            <IconX size={14} /> Pass
          </Button>
        )}
        {!decided && currentStatus !== "under_review" && (
          <Button variant="ghost" size="sm" onClick={() => setKind("review")}>
            <IconClock size={14} />
          </Button>
        )}
      </div>

      {kind && (
        <DecisionDialog
          kind={kind}
          onClose={() => setKind(null)}
          requestId={requestId}
          contributorName={contributorName}
          eventTitle={eventTitle}
          requestedTypes={requestedTypes}
          canFinalize={canFinalize}
          isSuperAdmin={isSuperAdmin}
          isFull={isFull}
          guestLimit={guestLimit}
          guestsRequested={guestsRequested}
        />
      )}
    </>
  );
}

function DecisionDialog({
  kind,
  onClose,
  requestId,
  contributorName,
  eventTitle,
  requestedTypes,
  canFinalize,
  isSuperAdmin,
  isFull,
  guestLimit,
  guestsRequested,
}: {
  kind: DecisionKind;
  onClose: () => void;
  requestId: number;
  contributorName: string;
  eventTitle: string;
  requestedTypes: string[];
  canFinalize: boolean;
  isSuperAdmin: boolean;
  isFull: boolean;
  guestLimit: number;
  guestsRequested: number;
}) {
  const [state, action, isPending] = useActionState<ActionResult, FormData>(
    decideRequestAction,
    {},
  );
  const [type, setType] = useState<CoverageType>(
    (requestedTypes.find((t) =>
      (COVERAGE_TYPES as readonly string[]).includes(t),
    ) as CoverageType) ?? "other",
  );
  const [override, setOverride] = useState(false);
  // Default to what they asked for; the decider can raise or lower it.
  const [guests, setGuests] = useState(Math.min(guestsRequested, guestLimit));
  const router = useRouter();
  const copy = COPY[kind];

  useEffect(() => {
    if (state.ok) {
      onClose();
      router.refresh();
    }
  }, [state.ok, onClose, router]);

  return (
    <Dialog
      open
      onClose={onClose}
      title={canFinalize ? copy.title : `Recommend: ${copy.verb.toLowerCase()}`}
      description={`${contributorName} — ${eventTitle}`}
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="ghost" size="md" onClick={onClose} className="w-full sm:w-auto">
            Cancel
          </Button>
          <Button
            type="submit"
            form="decision-form"
            variant="primary"
            size="md"
            disabled={isPending}
            className="w-full sm:w-auto"
          >
            {isPending ? "Saving…" : canFinalize ? copy.verb : "Log recommendation"}
          </Button>
        </div>
      }
    >
      <form id="decision-form" action={action} className="space-y-4 pt-1">
        <input type="hidden" name="requestId" value={requestId} />
        <input type="hidden" name="decision" value={kind} />
        {kind === "approve" && <input type="hidden" name="coverageType" value={type} />}
        {kind === "approve" && <input type="hidden" name="guests" value={guests} />}
        {override && <input type="hidden" name="override" value="on" />}

        {state.error && <Notice kind="error">{state.error}</Notice>}

        {!canFinalize && (
          <Notice kind="info">
            <span className="flex items-start gap-2">
              <IconShield size={15} className="mt-px shrink-0" />
              <span>
                Final-approval mode is on, so this is logged as a recommendation.
                The Super Admin still has to sign off before {contributorName} is
                actually assigned.
              </span>
            </span>
          </Notice>
        )}

        <p className="text-[13.5px] leading-relaxed text-body">{copy.hint}</p>

        {kind === "approve" && (
          <div>
            <p className="mb-2 text-[13px] font-semibold text-body">
              Coverage responsibility
              {requestedTypes.length > 0 && (
                <span className="font-normal text-slate">
                  {" "}
                  — they asked for{" "}
                  {requestedTypes
                    .map((t) => COVERAGE_TYPE_LABEL[t as CoverageType] ?? t)
                    .join(", ")}
                </span>
              )}
            </p>
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
                      ? "bg-teal-50 text-teal-700 ring-teal-200"
                      : "text-slate ring-line hover:bg-canvas hover:text-body",
                  )}
                >
                  {COVERAGE_TYPE_LABEL[t]}
                </button>
              ))}
            </div>
          </div>
        )}

        {kind === "approve" &&
          (guestLimit > 0 ? (
            <GuestPicker
              value={guests}
              onChange={setGuests}
              max={guestLimit}
              label={`Guests ${contributorName.split(" ")[0]} can bring`}
              hint={
                guestsRequested > 0
                  ? `They asked for +${guestsRequested}. Up to ${guestLimit} allowed on this event.`
                  : `They didn't ask for a guest. Up to ${guestLimit} allowed on this event.`
              }
            />
          ) : (
            guestsRequested > 0 && (
              <Notice kind="info">
                They asked to bring {guestsRequested} guest
                {guestsRequested === 1 ? "" : "s"}, but this event doesn&apos;t allow
                any. Raise the allowance under Set coverage capacity first if you
                want to say yes.
              </Notice>
            )
          ))}

        <label className="block">
          <span className="mb-1.5 block text-[13px] font-semibold text-body">
            Note to {contributorName.split(" ")[0]}{" "}
            <span className="font-normal text-slate">(optional)</span>
          </span>
          <textarea
            name="decisionNote"
            rows={3}
            placeholder={copy.note}
            className="w-full resize-y rounded-xl bg-canvas px-3.5 py-2.5 text-[14px] text-ink ring-1 ring-inset ring-line
                       placeholder:text-slate focus:ring-2 focus:ring-teal-400 focus:outline-none"
          />
          <span className="mt-1.5 block text-[12.5px] text-slate">
            This one is shown to them. Internal notes stay on the event page.
          </span>
        </label>

        {kind === "approve" && isFull && (
          <label
            className={cx(
              "flex items-start gap-2.5 rounded-xl px-3.5 py-3 ring-1 ring-inset transition-colors",
              isSuperAdmin
                ? "bg-brand-50 ring-brand-200"
                : "bg-canvas ring-line opacity-60",
            )}
          >
            <input
              type="checkbox"
              checked={override}
              onChange={(e) => setOverride(e.target.checked)}
              disabled={!isSuperAdmin}
              className="mt-0.5 size-4 accent-brand-500"
            />
            <span>
              <span className="block text-[13.5px] font-semibold text-ink">
                Override the coverage limit
              </span>
              <span className="block text-[12px] leading-snug text-slate">
                {isSuperAdmin
                  ? "This event is already full. Approving anyway expands the crew past its limit."
                  : "This event is full. Only the Super Admin can approve past the limit."}
              </span>
            </span>
          </label>
        )}
      </form>
    </Dialog>
  );
}
