# Running the Coverage Desk 24/7

The app is a single Node process plus one SQLite file. That shapes every choice
below: it needs **one always-on instance with a persistent disk** — not a
serverless platform, and never more than one instance at a time.

---

## Why not Vercel

Vercel is the obvious guess for a Next.js app, and it will not work here without
a rewrite. Its filesystem is ephemeral and read-only, so the SQLite database
would be wiped on every deploy and every cold start. Moving to Vercel means
moving to hosted Postgres, which means rewriting every query in `src/lib/` —
they are synchronous `better-sqlite3` calls throughout.

That is a real option later if the team outgrows this. It is not a small change,
and nothing about the current usage demands it: a few dozen contributors and a
few hundred events a year is comfortably inside what SQLite on a small VM
handles without noticing.

---

## Recommended: Fly.io

Closest region to the team (Miami), a real disk, roughly **$3–5/month**.

```bash
fly launch --no-deploy
fly volumes create sfi_data --size 1 --region mia
fly secrets set \
  SUPER_ADMIN_EMAIL=shaps@sflinsider.com \
  APP_URL=https://sfi-coverage-desk.fly.dev
fly deploy
```

`fly.toml` is already configured — volume mounted at `/data`, health check on
`/api/health`, `min_machines_running = 1` so it never sleeps, and
`auto_stop_machines = false`.

**Do not scale past one machine.** SQLite allows a single writer; a second
instance would corrupt data. The config pins it to one deliberately.

## Alternative: Render

`render.yaml` is included. Same shape, slightly simpler UI, ~$7/month on the
Starter plan. The free plan will not do — it has no persistent disk and sleeps
after inactivity.

## Alternative: any VPS

A $6 DigitalOcean or Hetzner box running the Docker image behind Caddy works
fine and is the cheapest at scale. More control, more maintenance — you own OS
patching and TLS renewal.

---

## Required settings

| Variable | Needed | What it does |
|---|---|---|
| `DATABASE_PATH` | Yes | Must point at the mounted volume (`/data/sfi.db`). Getting this wrong means the database resets on each deploy. |
| `SUPER_ADMIN_EMAIL` | Yes | The address that gets Super Admin on sign-up. Defaults to `shaps@sflinsider.com`. |
| `APP_URL` | Yes | Public URL. Used for links inside emails. |
| `RESEND_API_KEY` | For email | Password resets and decision emails. |
| `MAIL_FROM` | For email | e.g. `SFI Coverage Desk <desk@sflinsider.com>` |
| `MAIL_NOTIFICATIONS` | No | `off` disables decision emails org-wide. |

See `.env.example`.

---

## Email

Without `RESEND_API_KEY` and `MAIL_FROM` the app runs fine, but **password
resets cannot complete** — the link is written to the server log instead of
being sent, and is deliberately never shown in the browser in production.

Resend's free tier (3,000/month) is far more than this needs. Sending from
`@sflinsider.com` requires adding their DNS records to the domain.

Contributors can opt out of decision emails from their profile. Password resets
ignore that preference.

---

## First run

1. Deploy, then open `https://<your-url>/signup`.
2. Scott signs up with **shaps@sflinsider.com** — that address is recognised and
   the account is created as Super Admin. Nobody else can claim it, and no other
   account can elevate itself.
3. Import events, then add contributors from **Contributors → Invite**.

The database migrates itself on boot, so the first deploy needs no manual step.

### Before handing it over

```bash
npx tsx scripts/test-accounts.ts --remove
```

Removes the `@test.local` accounts. Worth doing so the contributor list is real.

---

## Backups

The database is one file, so backups are cheap and restores are trivial.

```bash
npm run backup            # writes ./backups, keeps the last 14
```

It uses SQLite's online backup API and verifies the copy with an integrity check
before reporting success. Do not back up by copying the `.db` file directly —
with WAL enabled, a plain copy of a live database can be torn.

On Fly, run it on a schedule and ship the output off the machine:

```bash
fly ssh console -C "npm run backup"
fly ssh sftp get /app/backups/<file>.db
```

A volume is not a backup. It survives deploys, not an accidental delete or a
region failure.

**Restoring** is putting the file back at `DATABASE_PATH` and restarting.

---

## Health and monitoring

`GET /api/health` returns `200` with a user count, or `503` if the database is
unreachable. It queries the database rather than returning a bare `200`, so a
container with a missing or unwritable volume reports as unhealthy instead of
quietly serving errors. Both platform configs already point their checks at it.

Free uptime monitoring (UptimeRobot, Better Stack) pointed at that path will
tell you it is down before Scott does.

---

## A domain

Any subdomain works — `coverage.sflinsider.com` is the natural one. Add a CNAME
to the platform host, then:

```bash
fly certs add coverage.sflinsider.com
```

TLS is issued automatically. Set `APP_URL` to the final URL so email links point
at the right place.

---

## Local development

Nothing here changes that:

```bash
npm run dev
```

Uses `./data/sfi.db`, no email transport, and the reset link is shown in the
browser for convenience — which is exactly what `canRevealResetLink()` prevents
in production.
