import { IconTicket, IconChevron } from "@/components/ui";
import { cx } from "@/lib/ui";

/**
 * The links an event carries, given real estate rather than being tucked away.
 *
 * Festivals get their own treatment: their site is usually where the lineup,
 * set times and the media-credential form live, so for a festival that link is
 * the headline rather than one row among several.
 */

export type EventLinkFields = {
  event_url?: string | null;
  ticket_url?: string | null;
  festival_url?: string | null;
  press_url?: string | null;
  is_festival?: number | null;
  venue?: string | null;
  venue_slug?: string | null;
};

type Row = { href: string; label: string; hint?: string; icon: string };

export function hasAnyLink(ev: EventLinkFields): boolean {
  return !!(ev.event_url || ev.ticket_url || ev.festival_url || ev.press_url);
}

export function EventLinks({ ev }: { ev: EventLinkFields }) {
  const festival = !!ev.is_festival && !!ev.festival_url;

  const rows: Row[] = [];
  if (ev.event_url)
    rows.push({ href: ev.event_url, label: "Official website", icon: "🌐" });
  if (ev.ticket_url)
    rows.push({ href: ev.ticket_url, label: "Tickets", icon: "🎟" });
  if (ev.press_url)
    rows.push({
      href: ev.press_url,
      label: "Press / media credentials",
      hint: "Where credential requests go",
      icon: "📰",
    });

  if (!festival && !rows.length) return null;

  return (
    <section>
      <h2 className="mb-3 text-[17px] text-ink">
        {festival ? "Festival information" : "Event links"}
      </h2>

      {/* A festival's own site is the one that matters — lineup, set times and
          the credential form all live there. */}
      {festival && (
        <a
          href={ev.festival_url!}
          target="_blank"
          rel="noopener noreferrer"
          className="mb-2.5 flex items-center justify-between gap-3 rounded-xl bg-brand-500 px-4 py-3.5 text-white shadow-sm transition-colors hover:bg-brand-600"
        >
          <span className="min-w-0">
            <span className="block text-[15px] font-semibold">
              🌐 Official festival website
            </span>
            <span className="mt-0.5 block text-[12.5px] text-white/85">
              Lineup, schedule, tickets and press information
            </span>
          </span>
          <IconChevron size={16} className="shrink-0" />
        </a>
      )}

      <ul className="space-y-2">
        {rows.map((r) => (
          <li key={r.href + r.label}>
            <a
              href={r.href}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-center justify-between gap-3 rounded-xl bg-card px-4 py-3 ring-1 ring-inset ring-line transition-all hover:bg-brand-50 hover:ring-brand-200"
            >
              <span className="min-w-0">
                <span className="flex items-center gap-2 text-[14px] font-semibold text-ink">
                  <span aria-hidden>{r.icon}</span>
                  {r.label}
                </span>
                {r.hint && (
                  <span className="mt-0.5 block pl-6 text-[12px] text-slate">
                    {r.hint}
                  </span>
                )}
                <span className="mt-0.5 block truncate pl-6 text-[11.5px] text-slate">
                  {hostOf(r.href)}
                </span>
              </span>
              <IconChevron
                size={15}
                className="shrink-0 text-slate transition-colors group-hover:text-brand-600"
              />
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Compact single-line version for cards. */
export function TicketLink({
  href,
  className,
}: {
  href: string;
  className?: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cx(
        "flex w-full items-center justify-center gap-2 rounded-xl bg-card px-4 py-2.5 text-[13.5px] font-semibold text-brand-700 ring-1 ring-inset ring-brand-200 transition-colors hover:bg-brand-50",
        className,
      )}
    >
      <IconTicket size={16} /> Tickets &amp; info
    </a>
  );
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
