import Link from "next/link";
import { ResetForm } from "../auth-form";

export const metadata = { title: "Set a new password" };

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  if (!token) {
    return (
      <>
        <h1 className="text-[30px] text-ink">Link not valid</h1>
        <p className="mt-2 text-[14px] text-slate">
          This password reset link is missing its token. Request a new one and
          use the most recent link.
        </p>
        <Link
          href="/forgot-password"
          className="mt-6 inline-flex h-11 items-center justify-center rounded-xl bg-canvas px-5 text-[14px] font-semibold text-ink ring-1 ring-inset ring-line hover:bg-line-strong"
        >
          Request a new link
        </Link>
      </>
    );
  }

  return (
    <>
      <h1 className="text-[30px] text-ink">Set a new password</h1>
      <p className="mt-2 text-[14px] text-slate">
        Choose something you haven&apos;t used before. This signs out your other devices.
      </p>
      <ResetForm token={token} />
    </>
  );
}
