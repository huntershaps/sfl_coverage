"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Notice } from "@/components/dialog";
import { Button, Card, IconUsers, IconCheck, IconShield } from "@/components/ui";
import {
  setNameMapAction,
  backfillCoverageAction,
  type AdminResult,
} from "@/app/actions/admin";
import { cx } from "@/lib/ui";

export type Candidate = {
  name: string;
  occurrences: number;
  mappedUserId: number | null;
  suggestedUserId: number | null;
  suggestedLabel: string | null;
};

export type Account = { id: number; name: string; email: string; role: string };

/**
 * Maps the first names written in the coverage doc to real accounts.
 *
 * The doc says "Charity", not an email address. Assigning coverage on a
 * first-name match alone would eventually hand someone else's credential to the
 * wrong person, so nothing is applied until this is confirmed. Suggestions are
 * pre-filled as a convenience and still have to be saved.
 */
export function NameMapPanel({
  importId,
  candidates,
  accounts,
  starredUserId,
  starredCount,
  committed,
}: {
  importId: number;
  candidates: Candidate[];
  accounts: Account[];
  starredUserId: number | null;
  starredCount: number;
  committed: boolean;
}) {
  // Start from what is already saved, falling back to the suggestion so the
  // common case is a glance and a save rather than 22 dropdowns.
  const [picks, setPicks] = useState<Record<string, number | "">>(() =>
    Object.fromEntries(
      candidates.map((c) => [c.name, c.mappedUserId ?? c.suggestedUserId ?? ""]),
    ),
  );
  const [starred, setStarred] = useState<number | "">(starredUserId ?? "");

  const [saveState, save, saving] = useActionState<AdminResult, FormData>(
    setNameMapAction,
    {},
  );
  const [applyState, apply, applying] = useActionState<AdminResult, FormData>(
    backfillCoverageAction,
    {},
  );
  const router = useRouter();

  useEffect(() => {
    if (saveState.ok || applyState.ok) router.refresh();
  }, [saveState.ok, applyState.ok, router]);

  const mappedCount = useMemo(
    () => Object.values(picks).filter(Boolean).length,
    [picks],
  );
  const unmapped = candidates.length - mappedCount;

  if (!candidates.length && !starredCount) return null;

  return (
    <Card className="mb-5 border-brand-200 p-5 sm:p-6">
      <div className="mb-4 flex items-start gap-2.5">
        <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600 ring-1 ring-inset ring-brand-100">
          <IconUsers size={16} />
        </span>
        <div className="min-w-0">
          <h2 className="text-[17px] text-ink">Who are these people?</h2>
          <p className="mt-0.5 max-w-[70ch] text-[13px] leading-relaxed text-body text-pretty">
            The doc records coverage by first name. Match each one to an account
            and that person&apos;s existing coverage becomes real assignments —
            no request, no approval step. Anyone left unmatched is kept as text
            on the event instead, so nothing is lost and nobody is assigned by
            guesswork.
          </p>
        </div>
      </div>

      {saveState.error && <Notice kind="error">{saveState.error}</Notice>}
      {saveState.ok && <Notice kind="ok">{saveState.ok}</Notice>}

      <form action={save} className="mt-4 space-y-4">
        <input type="hidden" name="importId" value={importId} />

        {/* Starred events — Super Admin territory */}
        {starredCount > 0 && (
          <div className="rounded-xl bg-sunshine-50 px-4 py-3.5 ring-1 ring-inset ring-sunshine-200">
            <div className="flex items-start gap-2">
              <IconShield size={15} className="mt-0.5 shrink-0 text-sunshine-600" />
              <div className="min-w-0 flex-1">
                <p className="text-[13.5px] font-semibold text-sunshine-700">
                  {starredCount} starred event{starredCount === 1 ? "" : "s"} —
                  who is attending these?
                </p>
                <p className="mt-0.5 text-[12.5px] leading-relaxed text-sunshine-700/90">
                  A <code className="font-mono">*</code> in the doc means that
                  person is going but a reporter is still wanted, so these events
                  stay open for requests.
                </p>
                <select
                  name="starredUserId"
                  value={starred}
                  onChange={(e) =>
                    setStarred(e.target.value === "" ? "" : Number(e.target.value))
                  }
                  className="mt-2.5 w-full max-w-[320px] rounded-lg bg-card px-3 py-2 text-[13.5px] text-ink ring-1 ring-inset ring-sunshine-200 focus:ring-2 focus:ring-brand-500 focus:outline-none"
                >
                  <option value="">Nobody — leave these unassigned</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({a.email})
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        )}

        {/* The names */}
        {candidates.length > 0 && (
          <div className="overflow-hidden rounded-xl ring-1 ring-inset ring-line">
            <table className="w-full text-left">
              <thead className="bg-canvas">
                <tr className="text-[11.5px] uppercase tracking-wider text-slate">
                  <th className="px-3.5 py-2 font-semibold">Name in the doc</th>
                  <th className="px-3.5 py-2 font-semibold">Events</th>
                  <th className="px-3.5 py-2 font-semibold">Account</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {candidates.map((c) => {
                  const value = picks[c.name] ?? "";
                  const isSuggestion =
                    !c.mappedUserId && value !== "" && value === c.suggestedUserId;
                  return (
                    <tr key={c.name} className="align-middle">
                      <td className="px-3.5 py-2.5">
                        <span className="text-[13.5px] font-semibold text-ink">
                          {c.name}
                        </span>
                      </td>
                      <td className="px-3.5 py-2.5">
                        <span className="tnum text-[12.5px] text-slate">
                          {c.occurrences}
                        </span>
                      </td>
                      <td className="px-3.5 py-2.5">
                        <div className="flex items-center gap-2">
                          <select
                            name={`name:${c.name}`}
                            value={value}
                            onChange={(e) =>
                              setPicks((p) => ({
                                ...p,
                                [c.name]: e.target.value === "" ? "" : Number(e.target.value),
                              }))
                            }
                            className={cx(
                              "w-full max-w-[300px] rounded-lg bg-card px-3 py-1.5 text-[13px] text-ink ring-1 ring-inset transition-colors focus:ring-2 focus:ring-brand-500 focus:outline-none",
                              value === "" ? "ring-line" : "ring-brand-200",
                            )}
                          >
                            <option value="">Not on the team / skip</option>
                            {accounts.map((a) => (
                              <option key={a.id} value={a.id}>
                                {a.name} ({a.email})
                              </option>
                            ))}
                          </select>
                          {c.mappedUserId ? (
                            <IconCheck size={14} className="shrink-0 text-teal-600" />
                          ) : isSuggestion ? (
                            <span className="shrink-0 whitespace-nowrap text-[11px] text-slate">
                              suggested
                            </span>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[12.5px] text-slate">
            <span className="tnum font-semibold text-body">{mappedCount}</span> of{" "}
            <span className="tnum">{candidates.length}</span> matched
            {unmapped > 0 && (
              <>
                {" "}
                · <span className="tnum">{unmapped}</span> will stay as text on
                the event
              </>
            )}
          </p>
          <Button type="submit" variant="primary" size="md" disabled={saving}>
            {saving ? "Saving…" : "Save the mapping"}
          </Button>
        </div>
      </form>

      {/* Applying to already-imported events */}
      {committed && (
        <div className="mt-5 border-t border-line pt-4">
          {applyState.error && <Notice kind="error">{applyState.error}</Notice>}
          {applyState.ok && <Notice kind="ok">{applyState.ok}</Notice>}

          <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
            <p className="max-w-[54ch] text-[12.5px] leading-relaxed text-slate">
              These events are already imported. Applying the mapping adds the
              coverage to them now — existing assignments are left alone, so this
              is safe to run again after correcting a name.
            </p>
            <form action={apply}>
              <input type="hidden" name="importId" value={importId} />
              <Button type="submit" variant="secondary" size="md" disabled={applying}>
                {applying ? "Applying…" : "Apply to imported events"}
              </Button>
            </form>
          </div>
        </div>
      )}
    </Card>
  );
}
