import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { AuthForm } from "../auth-form";

export const metadata = { title: "Create account" };

export default async function SignUpPage() {
  if (await getCurrentUser()) redirect("/dashboard");

  return (
    <>
      <h1 className="text-[30px] text-ink">Join the desk</h1>
      <p className="mt-2 text-[14px] text-slate">
        Create your contributor account to start requesting coverage.
      </p>

      <AuthForm mode="signup" />

      <p className="mt-7 text-[13.5px] text-slate">
        Already have an account?{" "}
        <Link href="/login" className="font-semibold text-brand-700 hover:text-brand-600">
          Sign in
        </Link>
      </p>
    </>
  );
}
