import Link from "next/link";
import { requireAdmin } from "@/lib/rbac";
import { listImports } from "@/lib/import";
import { parseJson } from "@/lib/db";
import {
  Card,
  Badge,
  EmptyState,
  IconUpload,
  IconChevron,
  IconArchive,
} from "@/components/ui";
import { ImportStarter } from "./import-starter";
import { fmtAgo, cx } from "@/lib/ui";

export const metadata = { title: "Import Events" };
export const dynamic = "force-dynamic";

const DEFAULT_DOC =
  "https://docs.google.com/document/d/1LU3kAQ663vOztHUdA5yQV6PVxsvkCIi7Kg6hAlG4gHg/edit";

export default async function ImportPage() {
  await requireAdmin();
  const history = listImports(12);

  return (
    <div className="mx-auto max-w-[900px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <header className="mb-6">
        <h1 className="text-[30px] sm:text-[36px] text-ink">Import events</h1>
        <p className="mt-1.5 max-w-[62ch] text-[14px] text-slate text-pretty">
          Bring the upcoming-events list in from the coverage doc instead of
          retyping it. The parser understands the format the desk already
          uses — date headers, <code className="text-body">@ venue</code> lines,
          venue shorthand like CR and HR, and the assignment notes in parentheses.
        </p>
      </header>

      <Card className="p-5 sm:p-6">
        <ImportStarter defaultUrl={DEFAULT_DOC} />
      </Card>

      {/* What the parser handles */}
      <Card className="mt-5 p-5 sm:p-6">
        <h2 className="mb-3 text-[16px] text-ink">What gets picked up</h2>
        <ul className="grid gap-2.5 text-[13px] text-body sm:grid-cols-2">
          {[
            ["Dates and ranges", "9/13 and 10/16 - 10/18 for multi-day runs"],
            ["Year and month headers", "2026 / SEPTEMBER, including the roll into 2027"],
            ["Venue shorthand", "CR, HR, REV, FB, MCC expand to full venue names"],
            ["Cities", "Filled in from the venue directory — the doc never states them"],
            ["Showtimes", "“, 6 - 10pm” becomes a start time; the rest are marked Time TBD"],
            ["Categories", "Inferred from the title and venue, flagged when unclear"],
            ["Existing assignments", "“(Reporter/Photo: Gleb)” is kept verbatim on the event"],
            ["Reporter-needed flag", "A trailing * is recorded in the event's source note"],
          ].map(([title, detail]) => (
            <li key={title} className="flex gap-2.5">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-brand-500" aria-hidden />
              <span>
                <strong className="text-ink">{title}</strong>
                <span className="block text-[12px] text-slate">{detail}</span>
              </span>
            </li>
          ))}
        </ul>
      </Card>

      {/* Past imports */}
      <section className="mt-8">
        <h2 className="mb-3 text-[17px] text-ink">Import history</h2>

        {history.length === 0 ? (
          <Card>
            <EmptyState
              className="!py-10"
              icon={<IconArchive />}
              title="No imports yet"
              body="Every import is recorded here with its source and what it created, so you can always trace where an event came from."
            />
          </Card>
        ) : (
          <Card className="divide-y divide-line">
            {history.map((h) => {
              const stats = parseJson<Record<string, number | string>>(
                h.stats as string,
                {},
              );
              const staged = h.import_status === "staged";
              return (
                <div key={h.id} className="flex items-center gap-3 p-3.5">
                  <span
                    className={cx(
                      "grid size-9 shrink-0 place-items-center rounded-xl ring-1 ring-inset",
                      staged
                        ? "bg-amber-50 text-amber-700 ring-amber-200"
                        : h.import_status === "completed"
                          ? "bg-teal-50 text-teal-700 ring-teal-200"
                          : "bg-canvas text-slate ring-line",
                    )}
                  >
                    <IconUpload size={16} />
                  </span>

                  <div className="min-w-0 flex-1">
                    <p className="text-[13.5px] text-ink">
                      {h.source_type === "gdoc" ? "Google Doc" : h.source_type} ·{" "}
                      <span className="tnum">{String(stats.parsed ?? 0)}</span> events
                      found
                      {Number(stats.duplicates ?? 0) > 0 && (
                        <span className="text-slate">
                          {" "}
                          · {String(stats.duplicates)} possible duplicates
                        </span>
                      )}
                    </p>
                    <p className="truncate text-[12.5px] text-slate">
                      {h.imported_by_name ?? "Unknown"} · {fmtAgo(h.imported_at)}
                      {h.source_reference && ` · ${h.source_reference.slice(0, 52)}…`}
                    </p>
                  </div>

                  <Badge
                    tone={
                      staged
                        ? "bg-amber-50 text-amber-700 ring-amber-200"
                        : h.import_status === "completed"
                          ? "bg-teal-50 text-teal-700 ring-teal-200"
                          : "bg-canvas text-slate ring-line"
                    }
                  >
                    {staged ? "Needs review" : h.import_status}
                  </Badge>

                  {staged && (
                    <Link
                      href={`/admin/import/${h.id}`}
                      className="flex shrink-0 items-center gap-1 rounded-lg bg-canvas px-2.5 py-1.5 text-[12.5px] font-semibold text-ink transition-colors hover:bg-line-strong"
                    >
                      Review <IconChevron size={12} />
                    </Link>
                  )}
                </div>
              );
            })}
          </Card>
        )}
      </section>
    </div>
  );
}
