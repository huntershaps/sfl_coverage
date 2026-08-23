import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { AuthForm } from "../auth-form";

export const metadata = { title: "Sign in" };

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/dashboard");

  return (
    <>
      <h1 className="text-[30px] text-ink">Welcome back</h1>
      <p className="mt-2 text-[14px] text-slate">
        Sign in to browse events and manage your coverage.
      </p>

      <AuthForm mode="signin" />

      <p className="mt-7 text-[13.5px] text-slate">
        New to the desk?{" "}
        <Link href="/signup" className="font-semibold text-brand-700 hover:text-brand-600">
          Create an account
        </Link>
      </p>
    </>
  );
}
