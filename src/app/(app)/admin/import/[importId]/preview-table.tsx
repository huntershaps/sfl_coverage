"use client";

import Link from "next/link";
import { useActionState, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog, Notice } from "@/components/dialog";
import {
  Button,
  Badge,
  Card,
  Field,
  inputClass,
  selectClass,
  EmptyState,
  IconCheck,
  IconX,
  IconEdit,
  IconSearch,
  IconTicket,
} from "@/components/ui";
import { CategoryBadge } from "@/components/events/badges";
import {
  updateImportItemAction,
  selectAllImportAction,
  commitImportAction,
  discardImportAction,
  type AdminResult,
} from "@/app/actions/admin";
import { EVENT_CATEGORIES } from "@/lib/constants";
import { fmtDate, fmtTime, cx } from "@/lib/ui";

export type Item = {
  id: number;
  line_no: number | null;
  raw_line: string | null;
  parsed: {
    title: string;
    subtitle: string | null;
    category: string;
    start_datetime: string;
    multi_day_end: string | null;
    time_tbd: number;
    venue: string;
    city: string | null;
    legacy_assignees: string | null;
    needs_reporter: boolean;
  };
  issues: { field: string; level: "info" | "warning" | "error"; message: string }[];
  duplicate_of: number | null;
  duplicate_score: number;
  duplicate_reasons: string[];
  duplicate_existing: {
    id: number;
    title: string;
    start_datetime: string;
    venue: string | null;
    city: string | null;
    status: string;
  } | null;
  decision: string;
  selected: number;
};

const DECISIONS: Record<string, { label: string; hint: string }> = {
  import: { label: "Import", hint: "Create it as a new event." },
  skip: { label: "Skip", hint: "Leave it out of this import." },
  keep_existing: { label: "Keep existing", hint: "Leave the event already in the database untouched." },
  update_existing: { label: "Update existing", hint: "Overwrite the existing event with these details." },
  merge: { label: "Merge", hint: "Only fill in blanks on the existing event." },
};

type Filter = "all" | "ready" | "duplicates" | "issues" | "selected";

export function PreviewTable({
  importId,
  items,
  committed,
}: {
  importId: number;
  items: Item[];
  committed: boolean;
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<Item | null>(null);

  const [, selectAllAction] = useActionState<AdminResult, FormData>(
    selectAllImportAction,
    {},
  );
  const [commitState, commitAction, committing] = useActionState<AdminResult, FormData>(
    commitImportAction,
    {},
  );
  const [, discardAction] = useActionState<AdminResult, FormData>(
    discardImportAction,
    {},
  );

  useEffect(() => {
    if (commitState.ok) router.refresh();
  }, [commitState.ok, router]);

  const counts = useMemo(() => {
    let dupes = 0,
      issues = 0,
      selected = 0,
      ready = 0;
    for (const i of items) {
      if (i.duplicate_of) dupes++;
      if (
        i.issues.some(
          (x) =>
            x.level === "error" || (x.level === "warning" && x.field !== "duplicate"),
        )
      )
        issues++;
      if (i.selected) selected++;
      if (!i.duplicate_of && !i.issues.some((x) => x.level === "error")) ready++;
    }
    return { dupes, issues, selected, ready };
  }, [items]);

  const visible = items.filter((i) => {
    if (q) {
      const hay = `${i.parsed.title} ${i.parsed.venue} ${i.parsed.city ?? ""}`.toLowerCase();
      if (!hay.includes(q.toLowerCase())) return false;
    }
    if (filter === "duplicates") return !!i.duplicate_of;
    if (filter === "issues")
      return i.issues.some(
        (x) => x.level === "error" || (x.level === "warning" && x.field !== "duplicate"),
      );
    if (filter === "selected") return !!i.selected;
    if (filter === "ready")
      return !i.duplicate_of && !i.issues.some((x) => x.level === "error");
    return true;
  });

  const willCreate = items.filter(
    (i) => i.selected && (i.decision === "import"),
  ).length;
  const willUpdate = items.filter(
    (i) => i.selected && (i.decision === "update_existing" || i.decision === "merge"),
  ).length;

  if (committed)
    return (
      <Card>
        <EmptyState
          icon={<IconCheck />}
          title="This import is already committed"
          body="Its events are live in the database. Start a fresh import to bring in newer entries from the doc."
          action={
            <Link
              href="/admin/import"
              className="inline-flex h-10 items-center rounded-xl bg-brand-600 px-4 text-[14px] font-semibold text-white hover:bg-brand-400"
            >
              New import
            </Link>
          }
        />
      </Card>
    );

  return (
    <div className="space-y-4">
      {commitState.error && <Notice kind="error">{commitState.error}</Notice>}
      {commitState.ok && <Notice kind="ok">{commitState.ok}</Notice>}

      {/* Summary chips */}
      <div className="flex flex-wrap items-center gap-2">
        {(
          [
            ["all", `All ${items.length}`],
            ["ready", `Ready ${counts.ready}`],
            ["duplicates", `Possible duplicates ${counts.dupes}`],
            ["issues", `Needs a look ${counts.issues}`],
            ["selected", `Selected ${counts.selected}`],
          ] as [Filter, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            aria-pressed={filter === key}
            className={cx(
              "rounded-full px-3 py-1.5 text-[12.5px] font-medium ring-1 ring-inset transition-colors",
              filter === key
                ? "bg-line text-ink ring-line"
                : "text-slate ring-transparent hover:bg-canvas hover:text-body",
            )}
          >
            {label}
          </button>
        ))}

        <div className="relative ml-auto">
          <IconSearch
            size={15}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate"
          />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Filter rows…"
            className="h-9 w-[190px] rounded-xl bg-canvas pl-9 pr-3 text-[13px] text-ink ring-1 ring-inset ring-line placeholder:text-slate focus:ring-2 focus:ring-teal-400 focus:outline-none"
          />
        </div>
      </div>

      {/* Bulk selection */}
      <div className="flex flex-wrap items-center gap-2">
        <form action={selectAllAction}>
          <input type="hidden" name="importId" value={importId} />
          <input type="hidden" name="selected" value="true" />
          <Button type="submit" variant="secondary" size="sm">
            Select all
          </Button>
        </form>
        <form action={selectAllAction}>
          <input type="hidden" name="importId" value={importId} />
          <input type="hidden" name="selected" value="false" />
          <Button type="submit" variant="ghost" size="sm">
            Deselect all
          </Button>
        </form>
        <span className="text-[12.5px] text-slate">
          {counts.selected} of {items.length} selected
        </span>
      </div>

      {/* The preview table */}
      {visible.length === 0 ? (
        <Card>
          <EmptyState
            icon={<IconSearch />}
            title="No rows match"
            body="Try a different filter or clear the search to see everything the parser found."
          />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          {/* Desktop header */}
          <div className="hidden border-b border-line bg-canvas px-4 py-2.5 text-[12px] font-semibold uppercase tracking-[0.08em] text-slate lg:grid lg:grid-cols-[36px_1fr_120px_150px_130px_170px_84px] lg:gap-3">
            <span />
            <span>Event</span>
            <span>Date</span>
            <span>Venue</span>
            <span>Category</span>
            <span>Status</span>
            <span className="text-right">Edit</span>
          </div>

          <div className="divide-y divide-line">
            {visible.map((item) => (
              <Row
                key={item.id}
                item={item}
                importId={importId}
                onEdit={() => setEditing(item)}
              />
            ))}
          </div>
        </Card>
      )}

      {/* Commit bar */}
      <Card raised className="sticky bottom-4 z-20 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[14px] font-semibold text-ink">
              {willCreate} new {willCreate === 1 ? "event" : "events"}
              {willUpdate > 0 && `, ${willUpdate} updated`}
            </p>
            <p className="mt-0.5 text-[12.5px] text-slate">
              {counts.selected - willCreate - willUpdate > 0
                ? `${counts.selected - willCreate - willUpdate} selected rows are set to skip or keep existing.`
                : "Review the rows above before committing."}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <form action={discardAction}>
              <input type="hidden" name="importId" value={importId} />
              <Button type="submit" variant="ghost" size="md">
                Discard
              </Button>
            </form>
            <form action={commitAction}>
              <input type="hidden" name="importId" value={importId} />
              <input type="hidden" name="publish" value="false" />
              <Button
                type="submit"
                variant="secondary"
                size="md"
                disabled={committing || counts.selected === 0}
              >
                Import as drafts
              </Button>
            </form>
            <form action={commitAction}>
              <input type="hidden" name="importId" value={importId} />
              <input type="hidden" name="publish" value="true" />
              <Button
                type="submit"
                variant="primary"
                size="md"
                disabled={committing || counts.selected === 0}
              >
                {committing ? "Importing…" : "Import and publish"}
              </Button>
            </form>
          </div>
        </div>
      </Card>

      {editing && (
        <EditDialog
          item={editing}
          importId={importId}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

/* ---------------------------------- row ----------------------------------- */

function Row({
  item,
  importId,
  onEdit,
}: {
  item: Item;
  importId: number;
  onEdit: () => void;
}) {
  const [, action] = useActionState<AdminResult, FormData>(
    updateImportItemAction,
    {},
  );
  const errors = item.issues.filter((i) => i.level === "error");
  const warnings = item.issues.filter(
    (i) => i.level === "warning" && i.field !== "duplicate",
  );
  const p = item.parsed;

  return (
    <div
      className={cx(
        "px-4 py-3 transition-colors lg:grid lg:grid-cols-[36px_1fr_120px_150px_130px_170px_84px] lg:items-center lg:gap-3",
        !!item.duplicate_of && "bg-sky-500/[0.055]",
        errors.length > 0 && "bg-red-500/[0.05]",
        !item.selected && "opacity-55",
      )}
    >
      {/* Select */}
      <form action={action} className="mb-2 flex items-center gap-2 lg:mb-0">
        <input type="hidden" name="itemId" value={item.id} />
        <input type="hidden" name="importId" value={importId} />
        <input type="hidden" name="selected" value={item.selected ? "false" : "true"} />
        <button
          type="submit"
          aria-label={item.selected ? "Deselect this event" : "Select this event"}
          aria-pressed={!!item.selected}
          className={cx(
            "grid size-5 place-items-center rounded-[6px] ring-1 transition-colors",
            item.selected
              ? "bg-brand-600 text-white ring-brand-500"
              : "ring-line-strong hover:ring-line-strong",
          )}
        >
          {!!item.selected && <IconCheck size={13} />}
        </button>
        <span className="text-[12px] text-slate lg:hidden">
          {item.selected ? "Selected" : "Not selected"}
        </span>
      </form>

      {/* Title */}
      <div className="min-w-0">
        <p className="line-clamp-1 text-[14px] font-semibold text-ink">{p.title}</p>
        {p.subtitle && (
          <p className="line-clamp-1 text-[12.5px] text-slate">{p.subtitle}</p>
        )}
        {p.legacy_assignees && (
          <p className="mt-0.5 line-clamp-1 text-[12.5px] text-sky-700">
            Doc note: {p.legacy_assignees}
          </p>
        )}
        {p.needs_reporter && (
          <span className="mt-1 inline-block text-[12px] text-amber-700">
            Flagged as needing a reporter
          </span>
        )}
      </div>

      {/* Date */}
      <div className="mt-2 lg:mt-0">
        <p className="tnum text-[13px] text-body">{fmtDate(p.start_datetime, "long")}</p>
        <p className="tnum text-[12.5px] text-slate">
          {fmtTime(p.start_datetime, p.time_tbd)}
        </p>
        {p.multi_day_end && (
          <p className="text-[12px] text-slate">thru {fmtDate(p.multi_day_end)}</p>
        )}
      </div>

      {/* Venue */}
      <div className="mt-1.5 min-w-0 lg:mt-0">
        <p className="line-clamp-1 text-[13px] text-body">{p.venue || "—"}</p>
        <p className="line-clamp-1 text-[12.5px] text-slate">{p.city || "City unknown"}</p>
      </div>

      {/* Category */}
      <div className="mt-1.5 lg:mt-0">
        <CategoryBadge category={p.category} />
      </div>

      {/* Status / decision */}
      <div className="mt-2 space-y-1.5 lg:mt-0">
        {item.duplicate_of && item.duplicate_existing ? (
          <div>
            <Badge tone="bg-sky-50 text-sky-700 ring-sky-200">
              Possible duplicate
            </Badge>
            <p className="mt-1 text-[12px] leading-snug text-slate">
              {item.duplicate_reasons.join(", ")} ·{" "}
              <Link
                href={`/events/${item.duplicate_existing.id}`}
                className="text-sky-700 underline-offset-2 hover:underline"
              >
                view existing
              </Link>
            </p>
          </div>
        ) : errors.length > 0 ? (
          <div>
            <Badge tone="bg-red-50 text-red-600 ring-red-200">Incomplete</Badge>
            <p className="mt-1 text-[12px] leading-snug text-red-700">
              {errors[0].message}
            </p>
          </div>
        ) : warnings.length > 0 ? (
          <div>
            <Badge tone="bg-amber-50 text-amber-700 ring-amber-200">
              {warnings.length} to check
            </Badge>
            <p className="mt-1 text-[12px] leading-snug text-slate">{warnings[0].message}</p>
          </div>
        ) : (
          <Badge tone="bg-teal-50 text-teal-700 ring-teal-200" dot>
            Ready
          </Badge>
        )}

        {/* Decision selector */}
        <form action={action}>
          <input type="hidden" name="itemId" value={item.id} />
          <input type="hidden" name="importId" value={importId} />
          <select
            name="decision"
            defaultValue={item.decision}
            onChange={(e) => e.currentTarget.form?.requestSubmit()}
            aria-label="What to do with this row"
            className="h-7 w-full max-w-[165px] cursor-pointer appearance-none rounded-md bg-card px-2 text-[12.5px] text-body ring-1 ring-inset ring-line hover:ring-line focus:ring-2 focus:ring-teal-400 focus:outline-none"
          >
            {Object.entries(DECISIONS)
              .filter(([k]) =>
                item.duplicate_of
                  ? true
                  : !["keep_existing", "update_existing", "merge"].includes(k),
              )
              .map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label}
                </option>
              ))}
          </select>
        </form>
      </div>

      {/* Edit */}
      <div className="mt-2 flex justify-start lg:mt-0 lg:justify-end">
        <button
          onClick={onEdit}
          className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[12.5px] font-medium text-body transition-colors hover:bg-canvas hover:text-ink"
        >
          <IconEdit size={14} /> Edit
        </button>
      </div>
    </div>
  );
}

/* -------------------------------- edit row -------------------------------- */

function EditDialog({
  item,
  importId,
  onClose,
}: {
  item: Item;
  importId: number;
  onClose: () => void;
}) {
  const [state, action, isPending] = useActionState<AdminResult, FormData>(
    updateImportItemAction,
    {},
  );
  const router = useRouter();
  const p = item.parsed;
  const [date, time] = p.start_datetime.split("T");

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
      title="Edit before importing"
      description={item.raw_line ? `Source line: ${item.raw_line}` : undefined}
      size="lg"
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="ghost" size="md" onClick={onClose} className="w-full sm:w-auto">
            Cancel
          </Button>
          <Button
            type="submit"
            form="edit-item-form"
            variant="primary"
            size="md"
            disabled={isPending}
            className="w-full sm:w-auto"
          >
            {isPending ? "Saving…" : "Save row"}
          </Button>
        </div>
      }
    >
      <form id="edit-item-form" action={action} className="space-y-4 pt-1">
        <input type="hidden" name="itemId" value={item.id} />
        <input type="hidden" name="importId" value={importId} />
        {state.error && <Notice kind="error">{state.error}</Notice>}

        {item.issues.length > 0 && (
          <div className="space-y-1.5 rounded-xl bg-amber-50 px-3.5 py-3 ring-1 ring-inset ring-amber-200">
            <p className="text-[12px] font-semibold text-amber-700">
              What the parser flagged
            </p>
            <ul className="space-y-1">
              {item.issues.map((i, n) => (
                <li key={n} className="flex gap-2 text-[12px] leading-snug text-body">
                  <span
                    className={cx(
                      "mt-1 size-1.5 shrink-0 rounded-full",
                      i.level === "error" ? "bg-red-400" : "bg-amber-500",
                    )}
                    aria-hidden
                  />
                  {i.message}
                </li>
              ))}
            </ul>
          </div>
        )}

        <Field label="Event title" required>
          <input name="title" defaultValue={p.title} required className={inputClass} />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Date" required>
            <input
              name="date"
              type="date"
              defaultValue={date}
              required
              className={cx(inputClass, "[color-scheme:dark]")}
            />
          </Field>
          <Field label="Start time" hint="Leave blank to mark it Time TBD.">
            <input
              name="time"
              type="time"
              defaultValue={p.time_tbd ? "" : time}
              className={cx(inputClass, "[color-scheme:dark]")}
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Venue">
            <input name="venue" defaultValue={p.venue} className={inputClass} />
          </Field>
          <Field label="City">
            <input
              name="city"
              defaultValue={p.city ?? ""}
              placeholder="Fort Lauderdale"
              className={inputClass}
            />
          </Field>
        </div>

        <Field label="Category">
          <select name="category" defaultValue={p.category} className={selectClass}>
            {EVENT_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Field>

        {item.duplicate_existing && (
          <div className="rounded-xl bg-sky-50 px-3.5 py-3 ring-1 ring-inset ring-sky-200">
            <p className="text-[12.5px] font-semibold text-sky-700">
              Possible existing event found
            </p>
            <p className="mt-1 text-[12.5px] text-body">
              <Link
                href={`/events/${item.duplicate_existing.id}`}
                className="underline underline-offset-2"
              >
                {item.duplicate_existing.title}
              </Link>{" "}
              — {fmtDate(item.duplicate_existing.start_datetime, "long")}
              {item.duplicate_existing.venue && ` at ${item.duplicate_existing.venue}`}
            </p>
            <p className="mt-1.5 text-[12.5px] leading-snug text-slate">
              Matched on {item.duplicate_reasons.join(", ").toLowerCase()}. Use the
              decision dropdown on the row to keep, update, merge, or import anyway.
            </p>
          </div>
        )}
      </form>
    </Dialog>
  );
}

export { IconX, IconTicket };
