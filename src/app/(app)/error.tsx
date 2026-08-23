"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto flex max-w-[520px] flex-col items-center px-4 py-24 text-center">
      <div className="mb-5 grid size-14 place-items-center rounded-2xl bg-red-50 text-red-600 ring-1 ring-inset ring-red-200">
        <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden>
          <path
            d="M12 8v5M12 16.5h.01M10.3 3.9 2.5 17.5A2 2 0 0 0 4.2 20.5h15.6a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>

      <h1 className="text-[24px] text-ink text-balance">
        Something broke on our end
      </h1>
      <p className="mt-2 max-w-[44ch] text-[13.5px] leading-relaxed text-slate text-pretty">
        This page didn&apos;t load. Nothing you did caused it, and no coverage
        data was changed. Try again, or head back to the dashboard.
      </p>
      {error.digest && (
        <p className="mt-2 font-mono text-[12px] text-slate/60">
          Reference: {error.digest}
        </p>
      )}

      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <button
          onClick={reset}
          className="rounded-xl bg-brand-600 px-5 py-2.5 text-[14px] font-semibold text-white transition-colors hover:bg-brand-400"
        >
          Try again
        </button>
        <Link
          href="/dashboard"
          className="rounded-xl bg-canvas px-5 py-2.5 text-[14px] font-semibold text-ink ring-1 ring-inset ring-line transition-colors hover:bg-line-strong"
        >
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}
