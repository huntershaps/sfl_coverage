"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  signInAction,
  signUpAction,
  forgotPasswordAction,
  resetPasswordAction,
  type FormState,
} from "@/app/actions/auth";
import { Field, inputClass, IconX } from "@/components/ui";

function Submit({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="mt-1 inline-flex h-11 w-full items-center justify-center rounded-xl bg-brand-500 text-[14.5px] font-semibold text-white
                 shadow-[0_10px_30px_-12px] shadow-brand-500/80 transition-all hover:bg-brand-400 active:scale-[0.99]
                 disabled:opacity-60 disabled:pointer-events-none"
    >
      {pending ? pendingLabel : label}
    </button>
  );
}

function Alert({ state }: { state: FormState }) {
  if (!state.error && !state.ok) return null;
  const bad = !!state.error;
  return (
    <div
      role="status"
      className={
        "mb-4 flex items-start gap-2.5 rounded-xl px-3.5 py-3 text-[13px] ring-1 ring-inset " +
        (bad
          ? "bg-red-50 text-red-700 ring-red-200"
          : "bg-teal-50 text-teal-700 ring-teal-200")
      }
    >
      {bad && <IconX size={16} className="mt-px shrink-0" />}
      <span>{state.error ?? state.ok}</span>
    </div>
  );
}

export function AuthForm({ mode }: { mode: "signin" | "signup" }) {
  const action = mode === "signin" ? signInAction : signUpAction;
  const [state, formAction] = useActionState<FormState, FormData>(action, {});

  return (
    <form action={formAction} className="mt-7 space-y-4">
      <Alert state={state} />

      {mode === "signup" && (
        <Field label="Full name" required>
          <input
            name="name"
            required
            autoComplete="name"
            placeholder="Hunter Shapiro"
            className={inputClass}
          />
        </Field>
      )}

      <Field label="Email" required>
        <input
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="you@sflinsider.com"
          className={inputClass}
        />
      </Field>

      <Field
        label="Password"
        required
        hint={mode === "signup" ? "At least 8 characters." : undefined}
      >
        <input
          name="password"
          type="password"
          required
          autoComplete={mode === "signup" ? "new-password" : "current-password"}
          placeholder="••••••••"
          className={inputClass}
        />
      </Field>

      {mode === "signup" && (
        <Field label="Confirm password" required>
          <input
            name="confirm"
            type="password"
            required
            autoComplete="new-password"
            placeholder="••••••••"
            className={inputClass}
          />
        </Field>
      )}

      {mode === "signin" && (
        <div className="flex justify-end -mt-1">
          <Link
            href="/forgot-password"
            className="text-[13px] text-slate hover:text-body transition-colors"
          >
            Forgot password?
          </Link>
        </div>
      )}

      <Submit
        label={mode === "signin" ? "Sign in" : "Create account"}
        pendingLabel={mode === "signin" ? "Signing in…" : "Creating account…"}
      />
    </form>
  );
}

export function ForgotForm() {
  const [state, formAction] = useActionState<FormState, FormData>(
    forgotPasswordAction,
    {},
  );

  return (
    <form action={formAction} className="mt-7 space-y-4">
      <Alert state={state} />

      {state.token && (
        <div className="mb-4 rounded-xl bg-sky-50 px-3.5 py-3 text-[12.5px] ring-1 ring-inset ring-sky-200">
          <p className="font-semibold text-sky-700">Development mode</p>
          <p className="mt-1 text-body leading-relaxed">
            No mail service is connected yet, so the reset link is shown here
            instead of being emailed:
          </p>
          <Link
            href={`/reset-password?token=${state.token}`}
            className="mt-2 block break-all font-mono text-[12.5px] text-teal-700 hover:text-teal-700"
          >
            /reset-password?token={state.token}
          </Link>
        </div>
      )}

      <Field label="Email" required>
        <input
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="you@sflinsider.com"
          className={inputClass}
        />
      </Field>

      <Submit label="Send reset link" pendingLabel="Sending…" />
    </form>
  );
}

export function ResetForm({ token }: { token: string }) {
  const [state, formAction] = useActionState<FormState, FormData>(
    resetPasswordAction,
    {},
  );

  return (
    <form action={formAction} className="mt-7 space-y-4">
      <Alert state={state} />
      <input type="hidden" name="token" value={token} />

      <Field label="New password" required hint="At least 8 characters.">
        <input
          name="password"
          type="password"
          required
          autoComplete="new-password"
          placeholder="••••••••"
          className={inputClass}
        />
      </Field>

      <Field label="Confirm new password" required>
        <input
          name="confirm"
          type="password"
          required
          autoComplete="new-password"
          placeholder="••••••••"
          className={inputClass}
        />
      </Field>

      <Submit label="Set new password" pendingLabel="Saving…" />
    </form>
  );
}
