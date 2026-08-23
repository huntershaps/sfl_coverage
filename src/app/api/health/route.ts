import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Liveness probe for the hosting platform. It touches the database rather than
 * returning a bare 200, so a container with a missing or unwritable volume is
 * reported as unhealthy instead of quietly serving errors.
 */
export async function GET() {
  try {
    const db = getDb();
    const { n } = db.prepare("SELECT COUNT(*) n FROM users").get() as { n: number };
    return Response.json(
      { ok: true, users: n, time: new Date().toISOString() },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (e) {
    return Response.json(
      { ok: false, error: e instanceof Error ? e.message : "unavailable" },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
}
