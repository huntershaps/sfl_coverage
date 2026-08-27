import { requireSuperAdmin } from "@/lib/rbac";
import {
  exportJson,
  exportCsv,
  exportEventsCsv,
  EXPORT_TABLES,
  type ExportTable,
} from "@/lib/backup";

export const dynamic = "force-dynamic";

/**
 * Structured export of the application's data.
 *
 * Super Admin only: it contains every contributor's contact details and the
 * internal notes behind coverage decisions.
 */
export async function GET(req: Request) {
  await requireSuperAdmin();

  const url = new URL(req.url);
  const format = url.searchParams.get("format") ?? "json";
  const table = url.searchParams.get("table");
  const stamp = new Date().toISOString().slice(0, 10);

  const download = (body: string, filename: string, type: string) =>
    new Response(body, {
      headers: {
        "content-type": `${type}; charset=utf-8`,
        "content-disposition": `attachment; filename="${filename}"`,
        "cache-control": "no-store",
      },
    });

  if (format === "csv") {
    // The default CSV is the readable one: a row per event with its coverage
    // flattened, rather than a table dump needing joins to make sense of.
    if (!table || table === "events") {
      return download(exportEventsCsv(), `sfi-events-${stamp}.csv`, "text/csv");
    }
    if (!(EXPORT_TABLES as readonly string[]).includes(table)) {
      return Response.json({ error: `Unknown table "${table}".` }, { status: 400 });
    }
    return download(
      exportCsv(table as ExportTable),
      `sfi-${table}-${stamp}.csv`,
      "text/csv",
    );
  }

  return download(exportJson(), `sfi-export-${stamp}.json`, "application/json");
}
