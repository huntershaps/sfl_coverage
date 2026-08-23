"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Notice } from "@/components/dialog";
import { Button, Card, Field, inputClass, selectClass, IconShield } from "@/components/ui";
import {
  changeRoleAction,
  setUserStatusAction,
  updateContributorEmailAction,
  type AdminResult,
} from "@/app/actions/admin";
import { ROLES, ROLE_LABEL, type Role } from "@/lib/constants";

/**
 * Super-Admin-only controls for one contributor. Rendered only for Super
 * Admins; the server actions re-check the role regardless of what the UI shows.
 */
export function ContributorControls({
  person,
  isPrimarySuperAdmin,
  isSelf,
}: {
  person: { id: number; name: string; email: string; role: Role; status: string };
  isPrimarySuperAdmin: boolean;
  isSelf: boolean;
}) {
  const router = useRouter();
  const [roleState, roleAction, roleBusy] = useActionState<AdminResult, FormData>(
    changeRoleAction,
    {},
  );
  const [statusState, statusAction, statusBusy] = useActionState<AdminResult, FormData>(
    setUserStatusAction,
    {},
  );
  const [emailState, emailAction, emailBusy] = useActionState<AdminResult, FormData>(
    updateContributorEmailAction,
    {},
  );

  useEffect(() => {
    if (roleState.ok || statusState.ok || emailState.ok) router.refresh();
  }, [roleState.ok, statusState.ok, emailState.ok, router]);

  return (
    <Card className="border-brand-200 p-5">
      <div className="mb-4 flex items-center gap-2">
        <span className="grid size-7 place-items-center rounded-lg bg-brand-50 text-brand-600 ring-1 ring-inset ring-brand-200">
          <IconShield size={15} />
        </span>
        <h3 className="text-[15px] text-ink">Super Admin controls</h3>
      </div>

      {isPrimarySuperAdmin && (
        <div className="mb-4">
          <Notice kind="info">
            This is the primary Super Admin account. Its role and email are locked
            so the org can&apos;t lose final approval authority.
          </Notice>
        </div>
      )}

      {/* Role */}
      <form action={roleAction} className="space-y-2">
        <input type="hidden" name="userId" value={person.id} />
        {roleState.error && <Notice kind="error">{roleState.error}</Notice>}
        {roleState.ok && <Notice kind="ok">{roleState.ok}</Notice>}

        <Field label="Role" hint="Admins review requests; Super Admins have final say.">
          <select
            name="role"
            defaultValue={person.role}
            disabled={isPrimarySuperAdmin}
            className={selectClass}
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </select>
        </Field>

        <Button
          type="submit"
          variant="secondary"
          size="sm"
          disabled={roleBusy || isPrimarySuperAdmin}
          className="w-full"
        >
          {roleBusy ? "Updating…" : "Update role"}
        </Button>
      </form>

      {/* Email — the fix for provisional accounts */}
      <form action={emailAction} className="mt-5 space-y-2 border-t border-line pt-4">
        <input type="hidden" name="userId" value={person.id} />
        {emailState.error && <Notice kind="error">{emailState.error}</Notice>}
        {emailState.ok && <Notice kind="ok">{emailState.ok}</Notice>}

        <Field
          label="Email address"
          hint={
            person.status === "provisional"
              ? "Set their real address so they can claim this account at sign-up."
              : "Changing this changes the address they sign in with."
          }
        >
          <input
            name="email"
            type="email"
            defaultValue={person.email}
            disabled={isPrimarySuperAdmin}
            className={inputClass}
          />
        </Field>

        <Button
          type="submit"
          variant="secondary"
          size="sm"
          disabled={emailBusy || isPrimarySuperAdmin}
          className="w-full"
        >
          {emailBusy ? "Saving…" : "Save email"}
        </Button>
      </form>

      {/* Account status */}
      <form action={statusAction} className="mt-5 space-y-2 border-t border-line pt-4">
        <input type="hidden" name="userId" value={person.id} />
        {statusState.error && <Notice kind="error">{statusState.error}</Notice>}
        {statusState.ok && <Notice kind="ok">{statusState.ok}</Notice>}

        <Field
          label="Account status"
          hint="Disabling ends their sessions immediately and blocks sign-in."
        >
          <select
            name="status"
            defaultValue={person.status}
            disabled={isPrimarySuperAdmin || isSelf}
            className={selectClass}
          >
            <option value="active">Active</option>
            <option value="provisional">Provisional (cannot sign in)</option>
            <option value="disabled">Disabled</option>
          </select>
        </Field>

        <Button
          type="submit"
          variant="secondary"
          size="sm"
          disabled={statusBusy || isPrimarySuperAdmin || isSelf}
          className="w-full"
        >
          {statusBusy ? "Saving…" : "Update status"}
        </Button>
      </form>
    </Card>
  );
}
