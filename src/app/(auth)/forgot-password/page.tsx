import Link from "next/link";
import { ForgotForm } from "../auth-form";

export const metadata = { title: "Reset password" };

export default function ForgotPasswordPage() {
  return (
    <>
      <h1 className="text-[30px] text-ink">Reset your password</h1>
      <p className="mt-2 text-[14px] text-slate">
        Enter your email and we&apos;ll send you a link to set a new one.
      </p>

      <ForgotForm />

      <p className="mt-7 text-[13.5px] text-slate">
        Remembered it?{" "}
        <Link href="/login" className="font-semibold text-brand-700 hover:text-brand-600">
          Back to sign in
        </Link>
      </p>
    </>
  );
}
