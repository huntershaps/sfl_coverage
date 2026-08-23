"use client";

import { cx } from "@/lib/ui";
import { IconUsers } from "@/components/ui";

/**
 * Plus-one picker. The coverage doc writes these as "Charity +3", so the
 * control speaks the same language: "Just me", "+1", "+2"…
 */
export function GuestPicker({
  value,
  onChange,
  max,
  label = "Bringing anyone?",
  hint,
  name,
}: {
  value: number;
  onChange: (n: number) => void;
  max: number;
  label?: string;
  hint?: string;
  name?: string;
}) {
  if (max <= 0) return null;

  const options = Array.from({ length: max + 1 }, (_, i) => i);

  return (
    <div>
      <p className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold text-body">
        <IconUsers size={15} className="text-slate" />
        {label}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {options.map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            aria-pressed={value === n}
            className={cx(
              "rounded-full border px-3.5 py-1.5 text-[12.5px] font-semibold transition-all",
              value === n
                ? "border-transparent bg-brand-600 text-white shadow-sm"
                : "border-line bg-card text-body hover:border-brand-300 hover:text-brand-700",
            )}
          >
            {n === 0 ? "Just me" : `+${n}`}
          </button>
        ))}
      </div>
      <p className="mt-1.5 text-[12px] text-slate">
        {hint ??
          `Up to ${max} guest${max === 1 ? "" : "s"} allowed per person on this event.`}
      </p>
      {name && <input type="hidden" name={name} value={value} />}
    </div>
  );
}

/** Read-only "+2" marker shown next to an assignee's name. */
export function GuestBadge({ guests }: { guests: number }) {
  if (!guests) return null;
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1 rounded-full bg-sunshine-50 px-2 py-0.5 text-[11.5px] font-bold text-sunshine-700 ring-1 ring-inset ring-sunshine-200"
      title={`Bringing ${guests} guest${guests === 1 ? "" : "s"}`}
    >
      +{guests}
    </span>
  );
}
