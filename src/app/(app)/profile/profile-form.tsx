"use client";

import { useActionState } from "react";
import { Notice } from "@/components/dialog";
import { Button, Field, inputClass, Avatar, IconCheck } from "@/components/ui";
import { updateProfileAction, type AdminResult } from "@/app/actions/admin";
import { changePasswordAction, type FormState } from "@/app/actions/auth";
import { SPECIALTIES, SPECIALTY_LABEL } from "@/lib/constants";
import { cx } from "@/lib/ui";
import { useState } from "react";

export function ProfileForm({
  user,
  specialties,
  social,
}: {
  user: {
    id: number;
    name: string;
    email: string;
    phone: string | null;
    bio: string | null;
    coverage_area: string | null;
    profile_photo: string | null;
    email_notifications: number;
  };
  specialties: string[];
  social: Record<string, string>;
}) {
  const [state, action, isPending] = useActionState<AdminResult, FormData>(
    updateProfileAction,
    {},
  );
  const [picked, setPicked] = useState<string[]>(specialties);
  const [photo, setPhoto] = useState(user.profile_photo ?? "");
  const [name, setName] = useState(user.name);

  function toggle(s: string) {
    setPicked((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]));
  }

  return (
    <form action={action} className="space-y-6">
      {state.error && <Notice kind="error">{state.error}</Notice>}
      {state.ok && <Notice kind="ok">{state.ok}</Notice>}

      {/* Identity */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="flex flex-col items-center gap-2">
          <Avatar name={name || user.name} src={photo || null} size={80} />
          <span className="text-[12px] text-slate">Preview</span>
        </div>

        <div className="flex-1 space-y-4">
          <Field label="Full name" required>
            <input
              name="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className={inputClass}
            />
          </Field>

          <Field
            label="Profile photo URL"
            hint="Paste a link to a hosted image. Leave blank to use your initials."
          >
            <input
              name="profilePhoto"
              value={photo}
              onChange={(e) => setPhoto(e.target.value)}
              placeholder="https://…"
              className={inputClass}
            />
          </Field>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Email" hint="Contact an administrator to change this.">
          <input
            value={user.email}
            disabled
            className={cx(inputClass, "cursor-not-allowed opacity-60")}
          />
        </Field>

        <Field label="Phone">
          <input
            name="phone"
            type="tel"
            defaultValue={user.phone ?? ""}
            placeholder="(954) 555-0142"
            className={inputClass}
          />
        </Field>
      </div>

      <Field
        label="Primary coverage area"
        hint="Where you're usually able to get to — helps the desk match you to events."
      >
        <input
          name="coverageArea"
          defaultValue={user.coverage_area ?? ""}
          placeholder="Broward &amp; Palm Beach"
          className={inputClass}
        />
      </Field>

      {/* Specialties */}
      <div>
        <span className="mb-2 block text-[12.5px] font-semibold text-body">
          Specialties
        </span>
        <div className="grid gap-2 sm:grid-cols-3">
          {SPECIALTIES.map((s) => {
            const on = picked.includes(s);
            return (
              <button
                key={s}
                type="button"
                onClick={() => toggle(s)}
                aria-pressed={on}
                className={cx(
                  "flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-left ring-1 ring-inset transition-all",
                  on
                    ? "bg-brand-50 ring-brand-200"
                    : "bg-canvas ring-line hover:bg-line",
                )}
              >
                <span
                  className={cx(
                    "grid size-4 shrink-0 place-items-center rounded-[5px] ring-1 transition-colors",
                    on ? "bg-brand-500 ring-brand-500 text-white" : "ring-line-strong",
                  )}
                  aria-hidden
                >
                  {on && <IconCheck size={11} />}
                </span>
                <span className={cx("text-[13.5px]", on ? "text-ink" : "text-body")}>
                  {SPECIALTY_LABEL[s]}
                </span>
              </button>
            );
          })}
        </div>
        {picked.map((s) => (
          <input key={s} type="hidden" name="specialties" value={s} />
        ))}
      </div>

      <Field label="Bio" hint="A couple of lines the desk sees when weighing your requests.">
        <textarea
          name="bio"
          rows={4}
          defaultValue={user.bio ?? ""}
          placeholder="Concert photographer covering South Florida since 2022. Fast turnaround on same-night galleries."
          className={cx(inputClass, "resize-y")}
        />
      </Field>

      {/* Social */}
      <div>
        <span className="mb-2 block text-[12.5px] font-semibold text-body">
          Links <span className="font-normal text-slate">(optional)</span>
        </span>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Instagram">
            <input
              name="instagram"
              defaultValue={social.instagram ?? ""}
              placeholder="@yourhandle"
              className={inputClass}
            />
          </Field>
          <Field label="X / Twitter">
            <input
              name="x"
              defaultValue={social.x ?? ""}
              placeholder="@yourhandle"
              className={inputClass}
            />
          </Field>
          <Field label="Website / portfolio">
            <input
              name="website"
              defaultValue={social.website ?? ""}
              placeholder="https://…"
              className={inputClass}
            />
          </Field>
          <Field label="LinkedIn">
            <input
              name="linkedin"
              defaultValue={social.linkedin ?? ""}
              placeholder="linkedin.com/in/…"
              className={inputClass}
            />
          </Field>
        </div>
      </div>

      <div className="border-t border-line pt-5">
        <label className="flex cursor-pointer items-start gap-3 rounded-xl bg-canvas px-3.5 py-3 ring-1 ring-inset ring-line transition-colors hover:bg-sunken">
          <input
            type="checkbox"
            name="emailNotifications"
            defaultChecked={user.email_notifications !== 0}
            className="mt-0.5 size-4 shrink-0 accent-brand-500"
          />
          <span className="min-w-0">
            <span className="block text-[14px] font-semibold text-ink">
              Email me about coverage decisions
            </span>
            <span className="mt-0.5 block text-[12.5px] leading-relaxed text-slate">
              Approvals, rejections, waitlists and assignment changes. Everything
              still shows up in the app either way.
            </span>
          </span>
        </label>
      </div>

      <div className="flex justify-end border-t border-line pt-5">
        <Button type="submit" variant="primary" size="md" disabled={isPending}>
          {isPending ? "Saving…" : "Save profile"}
        </Button>
      </div>
    </form>
  );
}

export function PasswordForm() {
  const [state, action, isPending] = useActionState<FormState, FormData>(
    changePasswordAction,
    {},
  );

  return (
    <form action={action} className="space-y-4">
      {state.error && <Notice kind="error">{state.error}</Notice>}
      {state.ok && <Notice kind="ok">{state.ok}</Notice>}

      <Field label="Current password" required>
        <input
          name="current"
          type="password"
          required
          autoComplete="current-password"
          className={inputClass}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="New password" required hint="At least 8 characters.">
          <input
            name="password"
            type="password"
            required
            autoComplete="new-password"
            className={inputClass}
          />
        </Field>
        <Field label="Confirm new password" required>
          <input
            name="confirm"
            type="password"
            required
            autoComplete="new-password"
            className={inputClass}
          />
        </Field>
      </div>

      <div className="flex justify-end">
        <Button type="submit" variant="secondary" size="md" disabled={isPending}>
          {isPending ? "Updating…" : "Change password"}
        </Button>
      </div>
    </form>
  );
}
