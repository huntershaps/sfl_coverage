"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { navFor, mobileNavFor, type NavItem } from "./nav-config";
import { Avatar, IconChevron, IconShield } from "@/components/ui";
import { cx } from "@/lib/ui";
import { ROLE_TONE } from "@/lib/ui";
import { ROLE_LABEL, type Role } from "@/lib/constants";

export type ShellUser = {
  id: number;
  name: string;
  email: string;
  role: Role;
  profile_photo: string | null;
};

export type NavCounts = { pendingRequests: number; myPending: number };

function isActive(pathname: string, item: NavItem) {
  if (item.match) return pathname === item.match || pathname.startsWith(item.match + "/");
  return pathname === item.href;
}

/* -------------------------------- desktop -------------------------------- */

export function Sidebar({
  user,
  counts,
}: {
  user: ShellUser;
  counts: NavCounts;
}) {
  const pathname = usePathname();
  const sections = navFor(user.role);

  return (
    <nav className="hidden lg:flex h-dvh w-[248px] shrink-0 flex-col border-r border-line bg-card sticky top-0">
      <Link href="/dashboard" className="flex items-center gap-2.5 px-5 py-5">
        <span className="grid size-9 place-items-center rounded-xl bg-brand-50 text-[13px] font-extrabold text-brand-700 ring-1 ring-inset ring-brand-100">
          SF
        </span>
        <span className="leading-tight">
          <span className="block text-[13.5px] font-semibold tracking-tight text-ink">
            SFI Coverage
          </span>
          <span className="block text-[11.5px] uppercase tracking-[0.13em] text-slate">
            Desk
          </span>
        </span>
      </Link>

      <div className="flex-1 overflow-y-auto px-3 pb-4">
        {sections.map((section, si) => (
          <div key={si} className={si > 0 ? "mt-6" : ""}>
            {section.label && (
              <div className="eyebrow px-2.5 pb-2">{section.label}</div>
            )}
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const active = isActive(pathname, item);
                const count = item.badgeKey ? counts[item.badgeKey] : 0;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={cx(
                        "group relative flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-[13.5px] transition-colors",
                        active
                          ? "bg-brand-50 font-semibold text-brand-700"
                          : "text-body hover:bg-canvas hover:text-ink",
                      )}
                    >
                      {active && (
                        <span className="absolute left-0 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-r-full bg-brand-500" />
                      )}
                      <span className={active ? "text-brand-500" : "text-slate group-hover:text-body"}>
                        {item.icon}
                      </span>
                      <span className="flex-1 truncate">{item.label}</span>
                      {count > 0 && (
                        <span className="tnum rounded-full bg-coral-600 px-1.5 py-0.5 text-[11.5px] font-bold text-white">
                          {count}
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>

      <UserCard user={user} />
    </nav>
  );
}

function UserCard({ user }: { user: ShellUser }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative border-t border-line p-3">
      {open && (
        <>
          <button
            className="fixed inset-0 z-30 cursor-default"
            onClick={() => setOpen(false)}
            aria-label="Close menu"
          />
          <div className="absolute bottom-[72px] left-3 right-3 z-40 overflow-hidden rounded-xl border border-line bg-card shadow-2xl animate-[fade_0.15s_ease]">
            <Link
              href="/profile"
              onClick={() => setOpen(false)}
              className="block px-3.5 py-2.5 text-[13.5px] text-body hover:bg-canvas hover:text-ink"
            >
              Profile &amp; settings
            </Link>
            <Link
              href="/history"
              onClick={() => setOpen(false)}
              className="block px-3.5 py-2.5 text-[13.5px] text-body hover:bg-canvas hover:text-ink"
            >
              My coverage history
            </Link>
            <form action="/api/auth/signout" method="post" className="border-t border-line">
              <button
                type="submit"
                className="w-full px-3.5 py-2.5 text-left text-[13.5px] text-body hover:bg-canvas hover:text-ink"
              >
                Sign out
              </button>
            </form>
          </div>
        </>
      )}

      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left transition-colors hover:bg-canvas"
      >
        <Avatar name={user.name} src={user.profile_photo} size={34} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-semibold text-ink">
            {user.name}
          </span>
          <span className="flex items-center gap-1 text-[12px] text-slate">
            {user.role === "super_admin" && (
              <IconShield size={11} className="text-brand-600" />
            )}
            {ROLE_LABEL[user.role]}
          </span>
        </span>
        <IconChevron
          size={14}
          className={cx("text-slate transition-transform", open ? "-rotate-90" : "rotate-90")}
        />
      </button>
    </div>
  );
}

/* --------------------------------- mobile -------------------------------- */

export function MobileTabBar({
  user,
  counts,
}: {
  user: ShellUser;
  counts: NavCounts;
}) {
  const pathname = usePathname();
  const items = mobileNavFor(user.role);

  return (
    <nav
      className="lg:hidden fixed bottom-0 inset-x-0 z-40 border-t border-line bg-card"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="grid grid-cols-5">
        {items.map((item) => {
          const active = isActive(pathname, item);
          const count = item.badgeKey ? counts[item.badgeKey] : 0;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cx(
                  "relative flex flex-col items-center gap-1 py-2.5 text-[11.5px] font-medium transition-colors",
                  active ? "text-brand-600" : "text-slate",
                )}
              >
                <span className="relative">
                  {item.icon}
                  {count > 0 && (
                    <span className="absolute -right-2 -top-1 grid min-w-[15px] place-items-center rounded-full bg-coral-600 px-1 text-[11px] font-bold text-white">
                      {count > 9 ? "9+" : count}
                    </span>
                  )}
                </span>
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Full-screen drawer for the nav items that don't fit the mobile tab bar. */
export function MobileMenu({ user }: { user: ShellUser }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const sections = navFor(user.role);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="lg:hidden grid size-9 place-items-center rounded-xl text-body hover:bg-canvas hover:text-ink"
        aria-label="Open menu"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden>
          <path
            d="M4 7h16M4 12h16M4 17h16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
          />
        </svg>
      </button>

      {open && (
        <div className="lg:hidden fixed inset-0 z-50 animate-[fade_0.18s_ease]">
          <button
            className="absolute inset-0 bg-ink/40 backdrop-blur-sm"
            onClick={() => setOpen(false)}
            aria-label="Close menu"
          />
          <div className="absolute inset-y-0 left-0 flex w-[80%] max-w-[300px] flex-col border-r border-line bg-card shadow-xl">
            <div className="flex items-center justify-between px-5 py-4">
              <span className="text-[14px] font-semibold text-ink">Menu</span>
              <button
                onClick={() => setOpen(false)}
                className="grid size-8 place-items-center rounded-lg text-slate hover:bg-canvas hover:text-ink"
                aria-label="Close menu"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
                  <path d="M6 6l12 12M18 6 6 18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-3 pb-6">
              {sections.map((section, si) => (
                <div key={si} className={si > 0 ? "mt-6" : ""}>
                  {section.label && <div className="eyebrow px-2.5 pb-2">{section.label}</div>}
                  <ul className="space-y-0.5">
                    {section.items.map((item) => {
                      const active = isActive(pathname, item);
                      return (
                        <li key={item.href}>
                          <Link
                            href={item.href}
                            onClick={() => setOpen(false)}
                            className={cx(
                              "flex items-center gap-3 rounded-xl px-3 py-2.5 text-[14px]",
                              active
                                ? "bg-brand-50 font-semibold text-brand-700"
                                : "text-body hover:bg-canvas",
                            )}
                          >
                            <span className={active ? "text-brand-500" : "text-slate"}>
                              {item.icon}
                            </span>
                            {item.label}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>

            <div className="border-t border-line p-3">
              <Link
                href="/profile"
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 rounded-xl px-3 py-2.5"
              >
                <Avatar name={user.name} src={user.profile_photo} size={36} />
                <span className="min-w-0">
                  <span className="block truncate text-[13.5px] font-semibold text-ink">
                    {user.name}
                  </span>
                  <span className="block text-[12.5px] text-slate">
                    {ROLE_LABEL[user.role]}
                  </span>
                </span>
              </Link>
              <form action="/api/auth/signout" method="post">
                <button
                  type="submit"
                  className="mt-1 w-full rounded-xl px-3 py-2.5 text-left text-[13.5px] text-body hover:bg-canvas"
                >
                  Sign out
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export function RoleBadge({ role }: { role: Role }) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold ring-1 ring-inset",
        ROLE_TONE[role],
      )}
    >
      {role === "super_admin" && <IconShield size={12} />}
      {ROLE_LABEL[role]}
    </span>
  );
}
