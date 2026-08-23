"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useState } from "react";
import { cx } from "@/lib/ui";

/**
 * Centered modal on desktop, bottom sheet on phones — the approval and request
 * actions are used on mobile constantly, and a centered dialog with a keyboard
 * open is unusable there.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
}) {
  const [mounted, setMounted] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // Move focus into the dialog so keyboard and screen-reader users land here.
    const t = setTimeout(() => {
      const focusable = panelRef.current?.querySelector<HTMLElement>(
        'input,select,textarea,button,[href],[tabindex]:not([tabindex="-1"])',
      );
      focusable?.focus();
    }, 40);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
      clearTimeout(t);
    };
  }, [open, onClose]);

  if (!mounted || !open) return null;

  const maxW = { sm: "max-w-md", md: "max-w-lg", lg: "max-w-3xl" }[size];

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center sm:p-4">
      <button
        className="absolute inset-0 bg-ink/60 backdrop-blur-sm animate-[fade_0.18s_ease]"
        onClick={onClose}
        aria-label="Close dialog"
        tabIndex={-1}
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cx(
          "surface-raised relative flex max-h-[92dvh] w-full flex-col overflow-hidden",
          "rounded-b-none rounded-t-3xl sm:rounded-3xl",
          "animate-[rise_0.28s_cubic-bezier(0.22,1,0.36,1)]",
          maxW,
        )}
      >
        {/* Grab handle, mobile only */}
        <div className="flex justify-center pt-2.5 sm:hidden" aria-hidden>
          <span className="h-1 w-10 rounded-full bg-line-strong" />
        </div>

        <div className="flex items-start justify-between gap-4 px-5 pb-3 pt-4 sm:px-6 sm:pt-5">
          <div className="min-w-0">
            <h2 className="text-[19px] text-ink text-balance">{title}</h2>
            {description && (
              <div className="mt-1 text-[13px] text-slate text-pretty">{description}</div>
            )}
          </div>
          <button
            onClick={onClose}
            className="-mr-1 grid size-8 shrink-0 place-items-center rounded-lg text-slate transition-colors hover:bg-canvas hover:text-ink"
            aria-label="Close"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden>
              <path
                d="M6 6l12 12M18 6 6 18"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-4 sm:px-6">{children}</div>

        {footer && (
          <div
            className="border-t border-line bg-canvas px-5 py-3.5 sm:px-6"
            style={{ paddingBottom: "max(0.875rem, env(safe-area-inset-bottom))" }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

/** Inline success/error strip used inside dialogs and admin panels. */
export function Notice({
  kind,
  children,
}: {
  kind: "error" | "ok" | "info";
  children: ReactNode;
}) {
  const tones = {
    error: "bg-red-50 text-red-700 ring-red-200",
    ok: "bg-teal-50 text-teal-700 ring-teal-200",
    info: "bg-sky-50 text-sky-700 ring-sky-200",
  };
  return (
    <div
      role="status"
      className={cx(
        "rounded-xl px-3.5 py-2.5 text-[13px] leading-snug ring-1 ring-inset",
        tones[kind],
      )}
    >
      {children}
    </div>
  );
}
