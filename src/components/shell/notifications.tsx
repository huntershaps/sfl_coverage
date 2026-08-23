"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { IconBell, IconCheck, EmptyState } from "@/components/ui";
import { cx, fmtAgo } from "@/lib/ui";

type Notification = {
  id: number;
  type: string;
  title: string;
  body: string | null;
  href: string | null;
  read_at: string | null;
  created_at: string;
};

const TONE_FOR_TYPE = (type: string) => {
  if (type.includes("approved") || type.includes("assignment.created"))
    return "bg-teal-400";
  if (type.includes("rejected") || type.includes("removed") || type.includes("cancelled"))
    return "bg-red-400";
  if (type.includes("waitlist")) return "bg-violet-500";
  if (type.includes("awaiting") || type.includes("new")) return "bg-amber-500";
  return "bg-fog";
};

export function NotificationBell({ initialUnread }: { initialUnread: number }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notification[] | null>(null);
  const [unread, setUnread] = useState(initialUnread);
  const [, startTransition] = useTransition();
  const router = useRouter();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => setUnread(initialUnread), [initialUnread]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setItems(null);
    fetch("/api/notifications")
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setItems(d.notifications ?? []);
      })
      .catch(() => !cancelled && setItems([]));
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  async function markAllRead() {
    setUnread(0);
    setItems((cur) =>
      cur ? cur.map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })) : cur,
    );
    await fetch("/api/notifications", { method: "POST" });
    startTransition(() => router.refresh());
  }

  async function openItem(n: Notification) {
    setOpen(false);
    if (!n.read_at) {
      setUnread((u) => Math.max(0, u - 1));
      await fetch("/api/notifications", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: n.id }),
      });
      startTransition(() => router.refresh());
    }
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
        aria-expanded={open}
        className={cx(
          "relative grid size-9 place-items-center rounded-xl transition-colors",
          open ? "bg-card text-brand-700 shadow-sm" : "text-body hover:bg-canvas hover:text-ink",
        )}
      >
        <IconBell />
        {unread > 0 && (
          <span className="absolute right-1 top-1 grid min-w-[16px] place-items-center rounded-full bg-coral-600 px-1 text-[11px] font-bold text-white ring-2 ring-card">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          <button
            className="fixed inset-0 z-40 cursor-default"
            onClick={() => setOpen(false)}
            aria-label="Close notifications"
          />
          <div
            ref={panelRef}
            className="absolute right-0 z-50 mt-2 w-[min(92vw,380px)] overflow-hidden rounded-2xl border border-line bg-card shadow-2xl animate-[rise_0.2s_cubic-bezier(0.22,1,0.36,1)]"
          >
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <span className="text-[13.5px] font-semibold text-ink">
                Notifications
              </span>
              {unread > 0 && (
                <button
                  onClick={markAllRead}
                  className="inline-flex items-center gap-1 text-[12px] text-slate transition-colors hover:text-teal-700"
                >
                  <IconCheck size={13} /> Mark all read
                </button>
              )}
            </div>

            <div className="max-h-[min(70vh,460px)] overflow-y-auto">
              {items === null && (
                <div className="space-y-3 p-4">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="flex gap-3">
                      <div className="skeleton size-2 shrink-0 rounded-full" />
                      <div className="flex-1 space-y-1.5">
                        <div className="skeleton h-3 w-2/3" />
                        <div className="skeleton h-2.5 w-full" />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {items?.length === 0 && (
                <EmptyState
                  className="!py-10"
                  icon={<IconBell />}
                  title="You're all caught up"
                  body="Updates on your coverage requests and assignments will show up here."
                />
              )}

              {items?.map((n) => {
                const inner = (
                  <div
                    className={cx(
                      "flex gap-3 px-4 py-3 transition-colors hover:bg-canvas",
                      !n.read_at && "bg-canvas",
                    )}
                  >
                    <span
                      className={cx(
                        "mt-1.5 size-2 shrink-0 rounded-full",
                        n.read_at ? "bg-line-strong" : TONE_FOR_TYPE(n.type),
                      )}
                    />
                    <div className="min-w-0 flex-1">
                      <p
                        className={cx(
                          "text-[13px] leading-snug",
                          n.read_at ? "text-body" : "font-semibold text-ink",
                        )}
                      >
                        {n.title}
                      </p>
                      {n.body && (
                        <p className="mt-0.5 line-clamp-2 text-[12.5px] leading-snug text-slate">
                          {n.body}
                        </p>
                      )}
                      <p className="mt-1 text-[12px] text-slate">
                        {fmtAgo(n.created_at)}
                      </p>
                    </div>
                  </div>
                );

                return n.href ? (
                  <Link key={n.id} href={n.href} onClick={() => openItem(n)} className="block">
                    {inner}
                  </Link>
                ) : (
                  <button
                    key={n.id}
                    onClick={() => openItem(n)}
                    className="block w-full text-left"
                  >
                    {inner}
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
