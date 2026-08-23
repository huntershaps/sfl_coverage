"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import {
  IconSearch,
  IconGrid,
  IconList,
  IconCalendar,
  IconX,
  Button,
} from "@/components/ui";
import { cx } from "@/lib/ui";
import { EVENT_CATEGORIES, EVENT_STATUS_LABEL, EVENT_STATUSES } from "@/lib/constants";

const QUICK = [
  { key: "", label: "All upcoming" },
  { key: "today", label: "Today" },
  { key: "week", label: "This week" },
  { key: "weekend", label: "This weekend" },
  { key: "nextweek", label: "Next week" },
  { key: "month", label: "This month" },
];

const SCOPES = [
  { key: "", label: "Everything" },
  { key: "requested", label: "My requests" },
  { key: "mine", label: "My assignments" },
  { key: "past", label: "Past events" },
];

export type FilterValues = {
  q: string;
  quick: string;
  category: string;
  city: string;
  status: string;
  availability: string;
  scope: string;
  from: string;
  to: string;
  view: string;
};

export function FilterBar({
  cities,
  values,
  total,
  showViewSwitch = true,
}: {
  cities: string[];
  values: FilterValues;
  total: number;
  showViewSwitch?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  const [q, setQ] = useState(values.q);
  const [advanced, setAdvanced] = useState(
    !!(values.category || values.city || values.status || values.from || values.to),
  );

  useEffect(() => setQ(values.q), [values.q]);

  function apply(patch: Partial<FilterValues>, opts?: { resetPage?: boolean }) {
    const sp = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === "" || v == null) sp.delete(k);
      else sp.set(k, String(v));
    }
    if (opts?.resetPage !== false) sp.delete("page");
    startTransition(() => router.push(`${pathname}?${sp.toString()}`, { scroll: false }));
  }

  // Debounced search so typing doesn't fire a navigation per keystroke.
  useEffect(() => {
    if (q === values.q) return;
    const t = setTimeout(() => apply({ q }), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const activeCount = [
    values.category,
    values.city,
    values.status,
    values.availability,
    values.from,
    values.to,
  ].filter(Boolean).length;

  const anyFilter = activeCount > 0 || !!values.q || !!values.quick || !!values.scope;

  return (
    <div className="space-y-3">
      {/* Row 1 — search + view switch */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <IconSearch
            size={16}
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate"
          />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search events, artists, venues, cities…"
            aria-label="Search events"
            className="h-11 w-full rounded-xl bg-canvas pl-10 pr-9 text-[14px] text-ink ring-1 ring-inset ring-line
                       transition-colors placeholder:text-slate hover:ring-line focus:ring-2 focus:ring-teal-400 focus:outline-none"
          />
          {q && (
            <button
              onClick={() => {
                setQ("");
                apply({ q: "" });
              }}
              className="absolute right-2.5 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded-md text-slate hover:bg-canvas hover:text-ink"
              aria-label="Clear search"
            >
              <IconX size={14} />
            </button>
          )}
        </div>

        {showViewSwitch && (
          <div className="flex shrink-0 rounded-xl bg-sunken p-1 ring-1 ring-inset ring-line">
            {[
              { key: "grid", icon: <IconGrid size={17} />, label: "Card view" },
              { key: "list", icon: <IconList size={17} />, label: "List view" },
              { key: "calendar", icon: <IconCalendar size={17} />, label: "Calendar view" },
            ].map((v) => {
              const active = (values.view || "grid") === v.key;
              return (
                <button
                  key={v.key}
                  onClick={() => apply({ view: v.key === "grid" ? "" : v.key })}
                  aria-label={v.label}
                  aria-pressed={active}
                  title={v.label}
                  className={cx(
                    "grid size-9 place-items-center rounded-lg transition-colors",
                    active
                      ? "bg-card text-brand-700 shadow-sm"
                      : "text-slate hover:bg-canvas hover:text-body",
                  )}
                >
                  {v.icon}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Row 2 — quick date chips, horizontally scrollable on mobile */}
      <div className="-mx-4 px-4 sm:mx-0 sm:px-0">
        <div className="no-scrollbar mask-fade-r flex gap-1.5 overflow-x-auto pb-0.5 sm:mask-none sm:flex-wrap">
          {QUICK.map((f) => {
            const active = (values.quick || "") === f.key && values.scope !== "past";
            return (
              <Chip
                key={f.key || "all"}
                active={active}
                onClick={() => apply({ quick: f.key, scope: "", from: "", to: "" })}
              >
                {f.label}
              </Chip>
            );
          })}

          <span className="mx-1 w-px shrink-0 self-stretch bg-line-strong/60" aria-hidden />

          <Chip
            active={values.availability === "open"}
            onClick={() =>
              apply({ availability: values.availability === "open" ? "" : "open" })
            }
            tone="teal"
          >
            Open for coverage
          </Chip>
          <Chip
            active={values.availability === "needs"}
            onClick={() =>
              apply({ availability: values.availability === "needs" ? "" : "needs" })
            }
            tone="amber"
          >
            Needs coverage
          </Chip>

          <span className="mx-1 w-px shrink-0 self-stretch bg-line-strong/60" aria-hidden />

          {SCOPES.filter((s) => s.key).map((s) => (
            <Chip
              key={s.key}
              active={values.scope === s.key}
              onClick={() =>
                apply({
                  scope: values.scope === s.key ? "" : s.key,
                  quick: "",
                })
              }
              tone="violet"
            >
              {s.label}
            </Chip>
          ))}

          <button
            onClick={() => setAdvanced((v) => !v)}
            className={cx(
              "ml-auto shrink-0 rounded-full border px-3.5 py-1.5 text-[12.5px] font-semibold transition-all",
              advanced || activeCount
                ? "border-brand-200 bg-brand-50 text-brand-700"
                : "border-line bg-card text-body hover:bg-canvas hover:text-ink",
            )}
            aria-expanded={advanced}
          >
            Filters
            {activeCount > 0 && (
              <span className="ml-1.5 rounded-full bg-brand-600 px-1.5 text-[11.5px] font-bold text-white">
                {activeCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Row 3 — advanced filters */}
      {advanced && (
        <div className="grid gap-2.5 rounded-xl bg-sunken p-3.5 ring-1 ring-inset ring-line animate-[fade_0.2s_ease] sm:grid-cols-2 lg:grid-cols-5">
          <Select
            label="Category"
            value={values.category}
            onChange={(v) => apply({ category: v })}
            options={[
              { value: "", label: "All categories" },
              ...EVENT_CATEGORIES.map((c) => ({ value: c, label: c })),
            ]}
          />
          <Select
            label="City"
            value={values.city}
            onChange={(v) => apply({ city: v })}
            options={[
              { value: "", label: "All cities" },
              ...cities.map((c) => ({ value: c, label: c })),
            ]}
          />
          <Select
            label="Coverage status"
            value={values.status}
            onChange={(v) => apply({ status: v })}
            options={[
              { value: "", label: "Any status" },
              ...EVENT_STATUSES.filter((s) => s !== "draft").map((s) => ({
                value: s,
                label: EVENT_STATUS_LABEL[s],
              })),
            ]}
          />
          <DateInput
            label="From"
            value={values.from}
            onChange={(v) => apply({ from: v, quick: "" })}
          />
          <DateInput
            label="To"
            value={values.to}
            onChange={(v) => apply({ to: v, quick: "" })}
          />
        </div>
      )}

      {/* Result summary */}
      <div className="flex items-center justify-between gap-3 pt-0.5">
        <p
          className={cx(
            "text-[12.5px] text-slate transition-opacity",
            pending && "opacity-50",
          )}
          aria-live="polite"
        >
          <span className="tnum font-semibold text-body">{total}</span>{" "}
          {total === 1 ? "event" : "events"}
          {values.scope === "past" && " in the archive"}
        </p>
        {anyFilter && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              startTransition(() => router.push(pathname, { scroll: false }))
            }
          >
            <IconX size={14} /> Clear all
          </Button>
        )}
      </div>
    </div>
  );
}

function Chip({
  children,
  active,
  onClick,
  tone = "brand",
}: {
  children: React.ReactNode;
  active: boolean;
  onClick: () => void;
  tone?: "brand" | "teal" | "amber" | "violet";
}) {
  // Active chips take a solid fill so the current filter is unmistakable;
  // resting chips still get a white pill and hairline so the row reads as a
  // set of controls rather than loose text.
  const on: Record<string, string> = {
    brand: "bg-brand-600 text-white ring-brand-600 shadow-sm",
    teal: "bg-teal-600 text-white ring-teal-600 shadow-sm",
    amber: "bg-amber-600 text-white ring-amber-600 shadow-sm",
    violet: "bg-violet-600 text-white ring-violet-600 shadow-sm",
  };
  const hover: Record<string, string> = {
    brand: "hover:border-brand-300 hover:text-brand-700",
    teal: "hover:border-teal-300 hover:text-teal-700",
    amber: "hover:border-amber-300 hover:text-amber-700",
    violet: "hover:border-violet-300 hover:text-violet-700",
  };

  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={cx(
        "shrink-0 whitespace-nowrap rounded-full border px-3.5 py-1.5 text-[12.5px] font-semibold transition-all",
        active
          ? cx("border-transparent ring-1 ring-inset", on[tone])
          : cx("border-line bg-card text-body hover:bg-canvas", hover[tone]),
      )}
    >
      {children}
    </button>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[12.5px] font-semibold text-slate">{label}</span>
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-full cursor-pointer appearance-none rounded-lg bg-card pl-3 pr-8 text-[13px] text-ink ring-1 ring-inset ring-line
                     transition-colors hover:ring-line focus:ring-2 focus:ring-teal-400 focus:outline-none"
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <svg
          className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate"
          width="12"
          height="12"
          viewBox="0 0 24 24"
          aria-hidden
        >
          <path d="m6 9 6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </div>
    </label>
  );
}

function DateInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[12.5px] font-semibold text-slate">{label}</span>
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-full rounded-lg bg-card px-3 text-[13px] text-ink ring-1 ring-inset ring-line
                   transition-colors hover:ring-line focus:ring-2 focus:ring-teal-400 focus:outline-none
                   [color-scheme:dark]"
      />
    </label>
  );
}
