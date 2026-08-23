"use client";

import Link from "next/link";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { NotificationBell } from "./notifications";
import { MobileMenu, type ShellUser } from "./sidebar";
import { Avatar, IconSearch } from "@/components/ui";

export function TopBar({
  user,
  unread,
}: {
  user: ShellUser;
  unread: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const inputRef = useRef<HTMLInputElement>(null);

  // Keep the field in sync when navigation changes the query.
  useEffect(() => {
    if (pathname === "/events") setQ(params.get("q") ?? "");
  }, [pathname, params]);

  // "/" focuses search, the way it works in the tools this team already uses.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement;
      const typing =
        el instanceof HTMLInputElement ||
        el instanceof HTMLTextAreaElement ||
        (el as HTMLElement)?.isContentEditable;
      if (e.key === "/" && !typing) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const sp = new URLSearchParams();
    if (q.trim()) sp.set("q", q.trim());
    router.push(`/events${sp.toString() ? `?${sp}` : ""}`);
  }

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-card/95 backdrop-blur-xl">
      <div className="flex h-14 items-center gap-2 px-3 sm:px-5 lg:px-8">
        <MobileMenu user={user} />

        <Link href="/dashboard" className="lg:hidden flex items-center gap-2">
          <span className="grid size-8 place-items-center rounded-lg bg-brand-50 text-[12px] font-extrabold text-brand-700 ring-1 ring-inset ring-brand-100">
            SF
          </span>
        </Link>

        <form onSubmit={submit} className="relative ml-1 hidden flex-1 sm:block max-w-[420px]">
          <IconSearch
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate"
          />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search events, venues, cities…"
            aria-label="Search events"
            className="h-9 w-full rounded-xl bg-canvas pl-9 pr-9 text-[13.5px] text-ink ring-1 ring-inset ring-line
                       transition-colors placeholder:text-slate hover:ring-line focus:ring-2 focus:ring-teal-400 focus:outline-none"
          />
          <kbd className="pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 rounded border border-line px-1.5 py-0.5 font-sans text-[11px] text-slate md:block">
            /
          </kbd>
        </form>

        <div className="flex-1 sm:hidden" />

        <div className="ml-auto flex items-center gap-1">
          <Link
            href="/events"
            className="sm:hidden grid size-9 place-items-center rounded-xl text-body hover:bg-canvas hover:text-ink"
            aria-label="Search events"
          >
            <IconSearch />
          </Link>
          <NotificationBell initialUnread={unread} />
          <Link href="/profile" className="ml-1 hidden lg:block" aria-label="Your profile">
            <Avatar name={user.name} src={user.profile_photo} size={32} />
          </Link>
        </div>
      </div>
    </header>
  );
}
