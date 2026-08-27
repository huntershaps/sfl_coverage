import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/rbac";
import { getImport } from "@/lib/import";
import { nameCandidates, getStarredUserId } from "@/lib/import-coverage";
import { getDb } from "@/lib/db";
import { NameMapPanel } from "./name-map";
import { Card, EmptyState, LinkButton, IconUpload } from "@/components/ui";
import { PreviewTable, type Item } from "./preview-table";
import { fmtAgo, cx } from "@/lib/ui";

export const metadata = { title: "Review import" };
export const dynamic = "force-dynamic";

export default async function ImportPreviewPage({
  params,
}: {
  params: Promise<{ importId: string }>;
}) {
  const { importId } = await params;
  await requireAdmin();

  const imp = getImport(Number(importId));
  if (!imp) notFound();

  const items = imp.items as unknown as Item[];

  // Everyone named in the doc, plus the accounts they could map to.
  const candidates = nameCandidates(Number(importId));
  const accounts = getDb()
    .prepare(
      `SELECT id, name, email, role FROM users
        WHERE status != 'disabled' ORDER BY name COLLATE NOCASE`,
    )
    .all() as { id: number; name: string; email: string; role: string }[];
  const starredCount = items.filter((i) => i.parsed?.needs_reporter).length;
  const stats = imp.stats;
  const formatNote = typeof stats.formatNote === "string" ? stats.formatNote : null;
  const isProse = stats.format === "prose";

  const dupes = items.filter((i) => i.duplicate_of).length;
  const incomplete = items.filter((i) =>
    i.issues.some((x) => x.level === "error"),
  ).length;
  // Duplicates get their own column, so they are not counted again here —
  // otherwise a clean re-import of the same doc reads as 208 problems.
  const attention = items.filter((i) =>
    i.issues.some(
      (x) => x.level === "error" || (x.level === "warning" && x.field !== "duplicate"),
    ),
  ).length;

  return (
    <div className="mx-auto max-w-[1300px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <Link
        href="/admin/import"
        className="inline-flex items-center gap-1.5 text-[13px] text-body transition-colors hover:text-ink"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden>
          <path d="m14 6-6 6 6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Import events
      </Link>

      <header className="mb-6 mt-4">
        <h1 className="text-[28px] sm:text-[34px] text-ink">
          {items.length} {items.length === 1 ? "event" : "events"} found
        </h1>
        <p className="mt-1.5 max-w-[64ch] text-[14px] text-slate text-pretty">
          Nothing has been added to the database yet. Check the rows below, fix
          anything the parser flagged, then choose whether to import as drafts or
          publish straight away.
          {imp.source_reference && (
            <>
              {" "}
              Source:{" "}
              <a
                href={imp.source_reference}
                target="_blank"
                rel="noopener noreferrer"
                className="text-body underline underline-offset-2"
              >
                the coverage doc
              </a>
              , staged {fmtAgo(imp.imported_at)}.
            </>
          )}
        </p>
      </header>

      {formatNote && (
        <div
          className={cx(
            "mb-5 rounded-xl px-4 py-3 text-[13px] leading-relaxed ring-1 ring-inset",
            isProse
              ? "bg-sky-50 text-sky-700 ring-sky-200"
              : "bg-teal-50 text-teal-700 ring-teal-200",
          )}
        >
          {formatNote}
        </div>
      )}

      {/* At-a-glance summary */}
      <div className="mb-5 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <Summary value={items.length} label="events parsed" />
        <Summary
          value={items.length - dupes - incomplete}
          label="ready to import"
          tone="surf"
        />
        <Summary value={dupes} label="possible duplicates" tone={dupes ? "dusk" : undefined} />
        <Summary
          value={attention}
          label="need a look"
          tone={incomplete ? "red" : attention ? "gold" : undefined}
        />
      </div>

      {Number(stats.skipped ?? 0) > 0 && (
        <p className="mb-4 text-[12.5px] text-slate">
          {String(stats.skipped)} line
          {Number(stats.skipped) === 1 ? " was" : "s were"} skipped — they had no
          event content the parser could use.
        </p>
      )}

      {items.length === 0 ? (
        <Card>
          <EmptyState
            icon={<IconUpload />}
            title="No events found in that content"
            body="The parser looks for date lines (like 9/13 or 10/16 - 10/18) followed by event lines containing “@ venue”. Check that the pasted text includes those, then try again."
            action={
              <LinkButton href="/admin/import" variant="primary">
                Back to import
              </LinkButton>
            }
          />
        </Card>
      ) : (
        <>
        <NameMapPanel
          importId={Number(importId)}
          candidates={candidates}
          accounts={accounts}
          starredUserId={getStarredUserId(Number(importId))}
          starredCount={starredCount}
          committed={items.some((i) => i.result_event_id || i.duplicate_of)}
        />
        <PreviewTable
          importId={Number(importId)}
          items={items}
          committed={imp.import_status !== "staged"}
        />
        </>
      )}
    </div>
  );
}

function Summary({
  value,
  label,
  tone,
}: {
  value: number;
  label: string;
  tone?: "surf" | "dusk" | "gold" | "red";
}) {
  const tones = {
    surf: "text-teal-700",
    dusk: "text-sky-700",
    gold: "text-amber-700",
    red: "text-red-600",
  };
  return (
    <div className="surface p-4">
      <div
        className={cx(
          "tnum font-[family-name:var(--font-display)] text-[26px] font-bold leading-none",
          tone ? tones[tone] : "text-ink",
        )}
      >
        {value}
      </div>
      <div className="mt-1.5 text-[12.5px] leading-tight text-slate">{label}</div>
    </div>
  );
}
