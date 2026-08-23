import Link from "next/link";

export default function AppNotFound() {
  return (
    <div className="mx-auto flex max-w-[520px] flex-col items-center px-4 py-24 text-center">
      <div className="mb-5 grid size-14 place-items-center rounded-2xl bg-canvas text-body ring-1 ring-inset ring-line">
        <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden>
          <circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
          <path
            d="m16 16 4.5 4.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
      </div>

      <h1 className="text-[24px] text-ink">We couldn&apos;t find that</h1>
      <p className="mt-2 max-w-[44ch] text-[13.5px] leading-relaxed text-slate text-pretty">
        The event may have been archived or deleted, or the link might be out of
        date. Everything currently on the board is one click away.
      </p>

      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <Link
          href="/events"
          className="rounded-xl bg-brand-600 px-5 py-2.5 text-[14px] font-semibold text-white transition-colors hover:bg-brand-400"
        >
          Browse events
        </Link>
        <Link
          href="/dashboard"
          className="rounded-xl bg-canvas px-5 py-2.5 text-[14px] font-semibold text-ink ring-1 ring-inset ring-line transition-colors hover:bg-line-strong"
        >
          Dashboard
        </Link>
      </div>
    </div>
  );
}
