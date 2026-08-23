"use client";

import { useActionState } from "react";
import { Notice } from "@/components/dialog";
import { Button, Card, Field, inputClass, IconShield } from "@/components/ui";
import { updateSettingsAction, type AdminResult } from "@/app/actions/admin";
import { cx } from "@/lib/ui";

export function SettingsForm({ settings }: { settings: Record<string, string> }) {
  const [state, action, isPending] = useActionState<AdminResult, FormData>(
    updateSettingsAction,
    {},
  );

  return (
    <form action={action} className="space-y-5">
      {state.error && <Notice kind="error">{state.error}</Notice>}
      {state.ok && <Notice kind="ok">{state.ok}</Notice>}

      {/* Approval authority — the important one */}
      <Card className="border-brand-200 p-5 sm:p-6">
        <div className="mb-4 flex items-center gap-2">
          <span className="grid size-7 place-items-center rounded-lg bg-brand-50 text-brand-600 ring-1 ring-inset ring-brand-200">
            <IconShield size={15} />
          </span>
          <h2 className="text-[17px] text-ink">Approval authority</h2>
        </div>

        <div className="space-y-3">
          <Toggle
            name="require_super_admin_approval"
            checked={settings.require_super_admin_approval === "true"}
            label="Require Super Admin final approval"
            hint="When on, an Admin/Editor's decision is recorded as a recommendation and the request sits at Under Review until the Super Admin signs off. Direct assignment is also reserved for the Super Admin. Turn it off to let trusted editors approve on their own."
          />

          <Toggle
            name="admins_can_approve"
            checked={settings.admins_can_approve === "true"}
            label="Admins / Editors can approve requests"
            hint="Only takes effect when final approval is switched off above. With both off, nobody but the Super Admin can decide anything."
          />

          <Toggle
            name="auto_close_requests_when_full"
            checked={settings.auto_close_requests_when_full === "true"}
            label="Show coverage as full once the limit is reached"
            hint="Events at capacity display as Fully Covered. Contributors can still join the waitlist when an event allows it, and the Super Admin can always override the limit."
          />
        </div>

        <p className="mt-4 rounded-xl bg-canvas px-3.5 py-3 text-[12.5px] leading-relaxed text-slate ring-1 ring-inset ring-line">
          No setting here can remove the Super Admin&apos;s ability to override a
          decision, reassign an event, or approve past a capacity limit. That
          authority is enforced in the permission layer, not by configuration.
        </p>
      </Card>

      {/* Organization */}
      <Card className="p-5 sm:p-6">
        <h2 className="mb-4 text-[17px] text-ink">Organization</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Organization name">
            <input
              name="org_name"
              defaultValue={settings.org_name}
              className={inputClass}
            />
          </Field>
          <Field
            label="Default city"
            hint="Used when a venue can't be matched to a city."
          >
            <input
              name="default_city"
              defaultValue={settings.default_city}
              className={inputClass}
            />
          </Field>
        </div>
      </Card>

      <div className="flex justify-end">
        <Button type="submit" variant="primary" size="lg" disabled={isPending}>
          {isPending ? "Saving…" : "Save settings"}
        </Button>
      </div>
    </form>
  );
}

function Toggle({
  name,
  checked,
  label,
  hint,
}: {
  name: string;
  checked: boolean;
  label: string;
  hint: string;
}) {
  return (
    <label
      className={cx(
        "flex cursor-pointer items-start gap-3 rounded-xl px-3.5 py-3 ring-1 ring-inset transition-colors",
        "bg-canvas ring-line hover:bg-line",
      )}
    >
      <input
        type="checkbox"
        name={name}
        defaultChecked={checked}
        className="mt-0.5 size-4 shrink-0 accent-brand-500"
      />
      <span className="min-w-0">
        <span className="block text-[14px] font-semibold text-ink">{label}</span>
        <span className="mt-0.5 block text-[12.5px] leading-relaxed text-slate">
          {hint}
        </span>
      </span>
    </label>
  );
}
