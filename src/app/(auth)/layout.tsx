import Link from "next/link";
import { getDb } from "@/lib/db";

/**
 * Split-screen auth shell: the marquee on the left is built from real upcoming
 * events in the database, so the sign-in page reflects what the desk is
 * actually working on rather than stock filler.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  let marquee: { title: string; venue: string | null; city: string | null }[] = [];
  let counts = { events: 0, open: 0 };
  try {
    const db = getDb();
    marquee = db
      .prepare(
        `SELECT title, venue, city FROM events
          WHERE date(coalesce(multi_day_end, start_datetime)) >= date('now')
            AND status NOT IN ('draft','archived','cancelled')
          ORDER BY start_datetime ASC LIMIT 14`,
      )
      .all() as typeof marquee;
    counts = {
      events: (
        db
          .prepare(
            `SELECT COUNT(*) n FROM events WHERE date(coalesce(multi_day_end, start_datetime)) >= date('now') AND status != 'draft'`,
          )
          .get() as { n: number }
      ).n,
      open: (
        db
          .prepare(
            `SELECT COUNT(*) n FROM events WHERE requests_closed = 0 AND status IN ('open','requests_pending','assigned')`,
          )
          .get() as { n: number }
      ).n,
    };
  } catch {
    // Database not seeded yet — the panel simply renders without the marquee.
  }

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[1.05fr_1fr]">
      {/* Editorial panel */}
      <aside className="relative hidden lg:flex flex-col justify-between overflow-hidden border-r border-line p-10 xl:p-14">
        <div
          aria-hidden
          className="absolute inset-0 -z-10"
          style={{
            background:
              "radial-gradient(760px 520px at 18% 10%, #d9f0fb, transparent 62%)," +
              "radial-gradient(640px 540px at 92% 82%, #d8f6ee, transparent 60%)," +
              "radial-gradient(520px 400px at 62% 100%, #ffe6e0, transparent 62%)," +
              "linear-gradient(180deg, #ffffff, #f1f5fa)",
          }}
        />
        <Brand />

        <div className="max-w-[30ch]">
          <h1 className="text-[46px] xl:text-[58px] leading-[0.95] text-ink text-balance">
            Every show.
            <br />
            <span className="bg-gradient-to-r from-brand-600 to-teal-600 bg-clip-text text-transparent">One desk.</span>
          </h1>
          <p className="mt-5 text-[15px] leading-relaxed text-body max-w-[38ch] text-pretty">
            Concerts, openings, festivals and games across South Florida — with
            coverage requests, approvals and assignments in one place instead of
            a shared doc.
          </p>
          {counts.events > 0 && (
            <div className="mt-8 flex gap-8">
              <Stat n={counts.events} label="Upcoming events" />
              <Stat n={counts.open} label="Open for coverage" />
            </div>
          )}
        </div>

        {marquee.length > 0 ? (
          <div className="relative">
            <div className="eyebrow mb-3">On the board</div>
            <ul className="space-y-1.5 text-[13px] text-body">
              {marquee.slice(0, 7).map((m, i) => (
                <li key={i} className="flex gap-2.5 truncate">
                  <span className="text-coral-700">/</span>
                  <span className="truncate">
                    {m.title}
                    {m.venue && <span className="text-slate"> — {m.venue}</span>}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div />
        )}
      </aside>

      {/* Form side */}
      <main className="flex min-h-dvh flex-col justify-center bg-card px-5 py-10 sm:px-10">
        <div className="mx-auto w-full max-w-[400px]">
          <div className="lg:hidden mb-10">
            <Brand />
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <div>
      <div className="tnum text-[30px] font-bold leading-none text-ink font-[family-name:var(--font-display)]">
        {n}
      </div>
      <div className="mt-1.5 text-[12px] text-slate">{label}</div>
    </div>
  );
}

function Brand() {
  return (
    <Link href="/" className="inline-flex items-center gap-3">
      <span className="grid size-10 place-items-center rounded-xl bg-brand-50 text-[15px] font-extrabold text-brand-700 ring-1 ring-inset ring-brand-100">
        SF
      </span>
      <span className="leading-tight">
        <span className="block text-[14.5px] font-semibold tracking-tight text-ink">
          South Florida Insider
        </span>
        <span className="block text-[12.5px] tracking-[0.12em] uppercase text-slate">
          Coverage Desk
        </span>
      </span>
    </Link>
  );
}
