import { NextResponse, type NextRequest } from "next/server";
import crypto from "node:crypto";
import { getDb } from "@/lib/db";

/**
 * First line of defence, running before any rendering starts.
 *
 * The layout and page guards further down would also block an unauthorized
 * request, but they only fire once the app shell has begun streaming, which
 * forces Next to fall back to a client-side redirect with a 200 status.
 * Deciding here means a denied request gets a real redirect and never reaches
 * the admin tree at all.
 *
 * This is defence in depth, not the only check: every admin page calls
 * requireAdmin() and every mutation re-checks permissions server-side.
 */
export const config = {
  matcher: [
    "/dashboard/:path*",
    "/events/:path*",
    "/calendar/:path*",
    "/requests/:path*",
    "/schedule/:path*",
    "/history/:path*",
    "/profile/:path*",
    "/admin/:path*",
  ]
};

const SESSION_COOKIE = "sfi_session";

function roleForToken(token: string): { role: string; status: string } | null {
  try {
    const id = crypto.createHash("sha256").update(token).digest("hex");
    const row = getDb()
      .prepare(
        `SELECT u.role, u.status FROM sessions s JOIN users u ON u.id = s.user_id
          WHERE s.id = ? AND datetime(s.expires_at) > datetime('now')`,
      )
      .get(id) as { role: string; status: string } | undefined;
    return row ?? null;
  } catch {
    // If the lookup fails, fall through to the layout/page guards rather than
    // locking everyone out of the app.
    return null;
  }
}

export function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const token = req.cookies.get(SESSION_COOKIE)?.value;

  if (!token) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    if (pathname !== "/dashboard")
      url.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(url, 307);
  }

  const session = roleForToken(token);
  if (!session || session.status === "disabled") {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    const res = NextResponse.redirect(url, 307);
    res.cookies.delete(SESSION_COOKIE);
    return res;
  }

  if (pathname.startsWith("/admin")) {
    const isAdmin = session.role === "admin" || session.role === "super_admin";
    if (!isAdmin) {
      const url = req.nextUrl.clone();
      url.pathname = "/dashboard";
      url.search = "?denied=admin";
      return NextResponse.redirect(url, 307);
    }
  }

  return NextResponse.next();
}
