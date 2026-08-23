import { getDb } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const notifications = getDb()
    .prepare(
      `SELECT id, type, title, body, href, read_at, created_at
         FROM notifications WHERE user_id = ?
        ORDER BY created_at DESC LIMIT 40`,
    )
    .all(user.id);

  return Response.json({ notifications });
}

/** No body marks everything read; { id } marks a single notification read. */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let id: number | undefined;
  try {
    const body = await req.json();
    id = typeof body?.id === "number" ? body.id : undefined;
  } catch {
    /* no body — mark all */
  }

  const db = getDb();
  if (id) {
    // Scoped to the caller so one user can never mark another's notifications.
    db.prepare(
      "UPDATE notifications SET read_at = datetime('now') WHERE id = ? AND user_id = ? AND read_at IS NULL",
    ).run(id, user.id);
  } else {
    db.prepare(
      "UPDATE notifications SET read_at = datetime('now') WHERE user_id = ? AND read_at IS NULL",
    ).run(user.id);
  }

  return Response.json({ ok: true });
}
