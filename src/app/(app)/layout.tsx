import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { isAdmin } from "@/lib/rbac";
import { Sidebar, MobileTabBar, type ShellUser } from "@/components/shell/sidebar";
import { TopBar } from "@/components/shell/topbar";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const shellUser: ShellUser = {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    profile_photo: user.profile_photo,
  };

  const db = getDb();
  const unread = (
    db
      .prepare(
        "SELECT COUNT(*) n FROM notifications WHERE user_id = ? AND read_at IS NULL",
      )
      .get(user.id) as { n: number }
  ).n;

  const myPending = (
    db
      .prepare(
        `SELECT COUNT(*) n FROM coverage_requests
          WHERE user_id = ? AND status IN ('pending','under_review','waitlisted')`,
      )
      .get(user.id) as { n: number }
  ).n;

  const pendingRequests = isAdmin(user)
    ? (
        db
          .prepare(
            `SELECT COUNT(*) n FROM coverage_requests
              WHERE status IN ('pending','under_review')`,
          )
          .get() as { n: number }
      ).n
    : 0;

  const counts = { pendingRequests, myPending };

  return (
    <div className="flex min-h-dvh">
      <Sidebar user={shellUser} counts={counts} />

      <div className="flex min-w-0 flex-1 flex-col">
        <Suspense fallback={<div className="h-14 border-b border-line" />}>
          <TopBar user={shellUser} unread={unread} />
        </Suspense>

        <main className="flex-1 pb-24 lg:pb-10">{children}</main>
      </div>

      <MobileTabBar user={shellUser} counts={counts} />
    </div>
  );
}
