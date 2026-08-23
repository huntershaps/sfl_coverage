# South Florida Insider — Coverage Desk

An internal platform for coordinating who covers which events. It replaces the
shared Google Doc with a real event database, a coverage-request workflow, and a
Super Admin approval center.

The core rule the whole app is built around: **contributors can request to cover
an event, but they cannot assign themselves. `shaps@sflinsider.com` has final
authority over every coverage decision and can override anything.**

---

## Running it

```bash
npm install
```

```bash
npm run seed:demo
```

```bash
npm run dev
```

Then open <http://localhost:4310> and create the Super Admin account.

### Claiming the Super Admin account

The seed reserves `shaps@sflinsider.com` as a **provisional** account with no
password — nobody can sign in as it until it is claimed. Go to `/signup`, sign up
with that exact email, and the account is claimed and elevated to Super Admin
automatically.

No other route grants that role. A new sign-up is always a Contributor, the role
field is never read from the form, and only an existing Super Admin can promote
anyone. The primary Super Admin cannot be demoted or disabled through the app.

### Seed commands

| Command | What it does |
| --- | --- |
| `npm run seed` | Events + venue directory + Super Admin + the contributor roster from the doc |
| `npm run seed:demo` | The above, plus 5 sample contributors and ~17 pending requests so the Approval Center has something in it |
| `npm run seed:clear-demo` | Removes only the sample accounts and their requests |
| `npm run seed:reset` | Wipes all data and re-seeds from scratch |

Event data is fetched live from the coverage doc at seed time, falling back to
the cached copy in `data/source-doc.txt`. Nothing in the seed invents an event.

### Trying it before handing it over

```bash
npm run test:accounts
```

Creates four sign-in-ready accounts (Super Admin, Editor, and two Contributors)
on `@test.local` emails, all with the password `TestDesk2026!`, so you can walk
both sides of the workflow yourself. It also resets `shaps@sflinsider.com` to
unclaimed, so the real Super Admin account is waiting for Scott to claim.

Remove them with `npm run test:accounts:remove` before going live.

### Checks

```bash
npm test
```

Runs the whole suite: typecheck, the parser against the real doc, the end-to-end
workflow walkthrough, and the authorization matrix.

| Script | What it proves |
| --- | --- |
| `npm run test:e2e` | The full workflow — capacity, competing requests, recommendation vs. final approval, overrides, removals, notes, withdrawal, audit trail. Prints a readable transcript and deletes its own scratch data. |
| `npm run test:authz` | Signed-out, contributor and Super Admin against every admin route plus direct calls into the service layer. Needs the dev server running. |
| `npm run test:parser` | Parses the real coverage doc and reports what it extracted. |
| `npm run test:prose` | The prose importer, including the exact paste that used to return nothing. |
| `npm run test:filters` | The Today / This week / This weekend / Next week / This month windows, evaluated from every day of the week. |

---

## Stack

| | |
| --- | --- |
| Framework | Next.js 16 (App Router, React 19, Server Actions) |
| Language | TypeScript, strict |
| Database | SQLite via `better-sqlite3`, WAL mode |
| Styling | Tailwind CSS v4 |
| Auth | scrypt password hashing, DB-backed sessions in httpOnly cookies |

SQLite keeps the whole thing self-contained — no external service to stand up.
The data layer is plain SQL behind a small service module, so moving to Postgres
later means rewriting `src/lib/db.ts` and the query modules, not the UI.

---

## Design system

Tokens live in `src/app/globals.css`; badge and category tones in `src/lib/ui.ts`.
Nothing hardcodes a hex outside those two files.

| Role | Token | Hex |
| --- | --- | --- |
| Primary / brand | `brand-500` | `#009BD6` |
| Secondary | `teal-400` | `#00C9A7` |
| Accent | `coral-400` | `#FF6B6B` |
| Highlight | `sunshine-400` | `#FFC107` |
| Page background | `canvas` | `#F1F5FA` |
| Card | `card` | `#FFFFFF` |
| Text primary / secondary / tertiary | `ink` / `body` / `slate` | `#0F172A` / `#475569` / `#5A6B81` |

Badges follow one scheme: a `-50` fill, `-700` text and a `-200` hairline ring.
Waiting is amber, needs-coverage coral, open green, informational sky.

**One deliberate deviation from the brief.** White text on `#009BD6` measures
3.15:1, below the 4.5:1 WCAG AA floor for body-sized text, so text-bearing fills
use `brand-600` (`#0079AB`, 4.86:1) while `brand-500` stays the accent for icons,
rings and tints. Coral behaves the same way: `coral-400` for tints, `coral-600`
under white labels. Every other palette value is exactly as specified.

A contrast audit over 2,735 text nodes across 22 routes reports zero failures.

---

## How permissions are enforced

Nothing relies on hidden buttons. Every request passes three independent checks:

1. **`src/proxy.ts`** runs before any rendering. No session → `/login`. Non-admin
   hitting `/admin/*` → redirected out with a real 307, before the admin tree is
   ever reached.
2. **Page guards** — every admin page calls `requireAdmin()` or
   `requireSuperAdmin()`, which throw if the check fails.
3. **Service layer** — `submitRequest`, `decideRequest`, `assignDirectly`,
   `removeAssignment`, `setCapacity` and `addInternalNote` each re-check the
   actor's role. A forged request that skipped the UI entirely still fails here.

Role changes are Super-Admin-only, nobody can promote themselves, and the
configured bootstrap email can never lose the role.

### The approval model

`require_super_admin_approval` (on by default, in Settings) decides whether an
Admin/Editor can finalize a decision:

- **On** — an Admin/Editor's approve/reject/waitlist is recorded as a
  *recommendation*. The request moves to Under Review, the Super Admins are
  notified, and no assignment exists until one of them signs off. Direct
  assignment is reserved for the Super Admin.
- **Off** — Admin/Editors can approve outright. The Super Admin can still
  override any decision they make.

Either way the Super Admin can approve past a coverage limit, remove someone from
an event, and reverse a decision an Admin already made. An Admin/Editor cannot
undo an assignment the Super Admin created.

### Covering an event yourself

Admins get **Cover this myself** on any event page. It runs through the same
direct-assignment path as assigning anyone else — same capacity and guest rules —
so there is no request to approve and no self-notification. The activity log
records it as "put themselves on", distinct from assigning someone else.

Contributors never get this button, and the service layer refuses the call even
if the request is forged.

### Plus-ones

The coverage doc already tracks guests per person ("Charity +3", "Sebastian +1")
and bans them at some rooms, so the model follows that:

- **Per event** — *Set coverage capacity* has a guest allowance and a free-text
  note (e.g. "No +1s for photographers at this venue"). `0` means none.
- **On a request** — a contributor picks how many they need, capped at the
  event's allowance. Asking for more is refused up front rather than silently
  trimmed, so nobody turns up with an uninvited guest.
- **On approval** — the Super Admin sets the final number, which defaults to what
  was asked for but can be raised or lowered independently.
- **When the policy drops** — lowering an event's allowance trims anyone already
  approved above it, so the limit and the assignments can never disagree.

Approved guests show as a `+2` badge next to the name on the event page, the
approval center and the contributor's own schedule.

---

## Importing from the coverage doc

`/admin/import` parses the existing doc format rather than asking anyone to retype
it. Against the real document it reads **208 events across 2026–2027 with zero
unparseable entries**.

It understands the conventions already in use:

- Year and month headers (`2026`, `SEPTEMBER`), including the roll into 2027
- Date lines and ranges (`9/13`, `10/16 - 10/18` for festivals)
- `Title @ Venue` lines, splitting on the last `@` so `The Casino @ Dania Beach`
  survives intact
- The venue legend — `CR`, `HR`, `REV`, `FB`, `MCC`, `SCCC` expand to full names
- **Cities**, which the doc never states, filled in from an 87-venue directory
- Trailing times (`, 6 - 10pm` → 6:00 PM); everything else is marked Time TBD
- Assignment notes — `(Reporter/Photo: Gleb)` is kept verbatim on the event, and
  distinguished from descriptive parentheticals like `(Iron Maiden cover band)`
- A trailing `*` (Scott attending, reporter still needed) recorded in the source note
- Category inference from title and venue, flagged for review when uncertain

### Prose also works

Not everything arrives in the doc's format. Press releases, emails and search
results come as plain sentences, so the importer detects the shape of the content
and switches parsers rather than asking anyone to reformat it:

> The Fairgrounds Card Expo is scheduled for Saturday, 10/31, and Sunday, 11/1,
> 2026, at the South Florida Fair Expo Center East (9067 Southern Blvd, West Palm
> Beach, FL 33411).

reads as **The Fairgrounds Card Expo**, 31 Oct 2026 running through 1 Nov, at the
South Florida Fair Expo Center East in West Palm Beach, with the street address
captured. It handles `Month D, YYYY` and `M/D` dates, ranges written as "from X
to Y" or "X and Y", times like "at 6:30 PM", venues after "at the …", addresses in
brackets or after "Address:"/"located at", and strips `[1]`-style citation markers
from pasted research. Anything it cannot work out is flagged rather than guessed.

The preview says which parser ran, so it is never ambiguous what it understood.

Three ways in: fetch the Google Doc directly (works while link sharing is on),
paste the text, or upload a `.txt`/`.csv`. All three feed the same pipeline.

**Nothing is written to the database until you commit.** The preview flags
duplicates and incomplete rows, lets you edit any field inline, and each row gets
its own decision: Import, Skip, Keep existing, Update existing, or Merge (fill
gaps only, never overwrite curated data). You can import as drafts or publish.

Duplicate detection scores title similarity, date, venue and city. Same venue on
the same night counts as a duplicate regardless of how the title is written.
Re-importing the doc unchanged correctly matched all 208 events, defaulted every
row to "keep existing", and created nothing.

### About the contributor roster

The seed creates **provisional accounts** for the names appearing in the doc's
assignment notes (Gleb, Charity, Sebastian, Piper…). These are real teammates, so
the accounts carry a placeholder `@pending.sflinsider.local` email and **cannot
sign in**. Set a real address on each from their contributor page, and they can
claim the account by signing up with it.

Existing assignment text stays on each event as "From the source doc", clearly
labelled as a carried-over note rather than a platform assignment — it does not
put anyone on a schedule until someone is actually approved or assigned.

---

## Layout

```
src/
  proxy.ts                  Pre-render auth + admin gate
  app/
    (auth)/                 Sign in, sign up, forgot/reset password
    (app)/                  Everything behind auth
      dashboard/            Role-aware: contributor summary + desk overview
      events/               Grid / list / calendar browsing, filters, detail page
      calendar/  requests/  schedule/  history/  profile/
      admin/
        approvals/          Approval Center — requests grouped by event
        events/             CRUD, archive, delete
        import/             Two-step import with preview
        contributors/       Roster, roles, account status
        analytics/  activity/  settings/
    actions/                Server actions (auth, coverage, events, admin)
  lib/
    db.ts                   Schema, migrations, audit + notification helpers
    auth.ts / password.ts   Sessions, scrypt hashing, Super Admin bootstrap
    rbac.ts                 Permission predicates and guards
    events.ts               Queries, capacity maths, derived status
    workflow.ts             Request → decision → assignment, with audit trail
    import.ts               Google Docs fetch, staging, duplicate detection
    parse/                  Format detection, coverage-doc + prose parsers, venue directory
  components/               UI primitives, event cards, shell, dialogs
```

### A few decisions worth knowing

**Event status is derived, not stored by hand.** `deriveStatus()` recomputes from
live assignment and request counts after every mutation, so the badge can't drift
from reality. Statuses a human sets deliberately — cancelled, postponed, archived,
draft — always win.

**Datetimes are wall-clock strings** (`2026-09-13T19:00`) in South Florida local
time, parsed field-by-field rather than through `new Date(string)`. Letting the
viewer's timezone apply would slide events across midnight.

**Events are archived, never bulk-deleted.** Hard delete is Super-Admin-only and
refuses to run while anyone is assigned unless explicitly confirmed, so nobody's
coverage history disappears underneath them.

**Event artwork is generated when no poster is supplied** — a deterministic mesh
gradient keyed to the title and category, so the grid looks intentional instead of
full of grey placeholders, without inventing photography.

---

## Not wired up yet

- **Email.** Notifications are in-app only. Password reset generates a real,
  single-use, one-hour token but shows the link on screen instead of mailing it —
  clearly marked as development-mode. `notify()` in `src/lib/db.ts` is the single
  place to add a mail transport.
- **Image uploads.** Event posters and profile photos take a URL. There's a
  `public/uploads/` directory ready if you want to add file handling.
- **CSV / Sheets import.** The pipeline is source-agnostic and the DB records a
  `source_type`, but only the doc-format parser exists today.

## Deploying

Set these in the environment:

```bash
SESSION_SECRET=<long random string>
SUPER_ADMIN_EMAIL=shaps@sflinsider.com
DATABASE_PATH=/absolute/path/to/sfi.db
```

Session cookies are automatically `secure` when `NODE_ENV=production`, so serve
it over HTTPS. Back up the SQLite file — it is the whole database.
