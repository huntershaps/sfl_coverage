import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/rbac";

/**
 * Route-level guard for the whole /admin tree. Each page and server action
 * re-checks permissions independently; this just avoids rendering an admin
 * shell for someone who has no business seeing it.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!isAdmin(user)) redirect("/dashboard?denied=admin");
  return <>{children}</>;
}
