import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

let _db: Database.Database | null = null;

function resolveDbPath() {
  const p = process.env.DATABASE_PATH || "./data/sfi.db";
  // The path is deliberately configurable, which the bundler cannot statically
  // analyse. Without the opt-out it traces the entire project into the server
  // bundle, so the ignore comment keeps deployments lean.
  const abs = path.isAbsolute(p)
    ? p
    : path.join(/* turbopackIgnore: true */ process.cwd(), p);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  return abs;
}

export function getDb(): Database.Database {
  if (_db) return _db;
  const db = new Database(resolveDbPath());
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  migrate(db);
  _db = db;
  return db;
}

function migrate(db: Database.Database) {
  db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    name TEXT NOT NULL,
    password_hash TEXT,
    role TEXT NOT NULL DEFAULT 'contributor',
    profile_photo TEXT,
    phone TEXT,
    bio TEXT,
    coverage_area TEXT,
    specialties TEXT NOT NULL DEFAULT '[]',
    social_links TEXT NOT NULL DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'active',
    source TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at TEXT NOT NULL,
    user_agent TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

  CREATE TABLE IF NOT EXISTS password_resets (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL,
    used_at TEXT
  );

  CREATE TABLE IF NOT EXISTS venues (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE COLLATE NOCASE,
    aka TEXT,
    address TEXT,
    city TEXT,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS imports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_type TEXT NOT NULL,
    source_reference TEXT,
    raw_content TEXT,
    imported_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    imported_at TEXT NOT NULL DEFAULT (datetime('now')),
    import_status TEXT NOT NULL DEFAULT 'staged',
    stats TEXT NOT NULL DEFAULT '{}'
  );

  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    subtitle TEXT,
    description TEXT,
    category TEXT NOT NULL DEFAULT 'Other',
    start_datetime TEXT NOT NULL,
    end_datetime TEXT,
    time_tbd INTEGER NOT NULL DEFAULT 1,
    multi_day_end TEXT,
    venue TEXT,
    address TEXT,
    city TEXT,
    organizer TEXT,
    ticket_url TEXT,
    image_url TEXT,
    extra_images TEXT NOT NULL DEFAULT '[]',
    status TEXT NOT NULL DEFAULT 'open',
    coverage_limit INTEGER,
    allow_waitlist INTEGER NOT NULL DEFAULT 1,
    requests_closed INTEGER NOT NULL DEFAULT 0,
    legacy_assignees TEXT,
    source_note TEXT,
    import_id INTEGER REFERENCES imports(id) ON DELETE SET NULL,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_events_start ON events(start_datetime);
  CREATE INDEX IF NOT EXISTS idx_events_status ON events(status);

  CREATE TABLE IF NOT EXISTS event_slots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    coverage_type TEXT NOT NULL,
    capacity INTEGER NOT NULL,
    UNIQUE(event_id, coverage_type)
  );

  CREATE TABLE IF NOT EXISTS coverage_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    coverage_types TEXT NOT NULL DEFAULT '[]',
    message TEXT,
    reason TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    decision_note TEXT,
    recommended_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    recommendation TEXT,
    submitted_at TEXT NOT NULL DEFAULT (datetime('now')),
    reviewed_at TEXT,
    reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL
  );
  CREATE INDEX IF NOT EXISTS idx_req_event ON coverage_requests(event_id);
  CREATE INDEX IF NOT EXISTS idx_req_user ON coverage_requests(user_id);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_req_unique_open
    ON coverage_requests(event_id, user_id)
    WHERE status IN ('pending','under_review','approved','waitlisted');

  CREATE TABLE IF NOT EXISTS assignments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    coverage_type TEXT NOT NULL DEFAULT 'other',
    request_id INTEGER REFERENCES coverage_requests(id) ON DELETE SET NULL,
    assigned_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    assigned_at TEXT NOT NULL DEFAULT (datetime('now')),
    status TEXT NOT NULL DEFAULT 'active',
    removed_reason TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_asg_event ON assignments(event_id);
  CREATE INDEX IF NOT EXISTS idx_asg_user ON assignments(user_id);

  CREATE TABLE IF NOT EXISTS internal_notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id INTEGER REFERENCES events(id) ON DELETE CASCADE,
    request_id INTEGER REFERENCES coverage_requests(id) ON DELETE CASCADE,
    subject_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    author_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    note TEXT NOT NULL,
    visibility TEXT NOT NULL DEFAULT 'admins',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_notes_event ON internal_notes(event_id);

  CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT,
    href TEXT,
    event_id INTEGER REFERENCES events(id) ON DELETE CASCADE,
    read_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id, read_at);

  CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id INTEGER,
    event_id INTEGER REFERENCES events(id) ON DELETE CASCADE,
    summary TEXT NOT NULL,
    meta TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_audit_event ON audit_log(event_id);
  CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at);

  CREATE TABLE IF NOT EXISTS import_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    import_id INTEGER NOT NULL REFERENCES imports(id) ON DELETE CASCADE,
    line_no INTEGER,
    raw_line TEXT,
    parsed TEXT NOT NULL DEFAULT '{}',
    issues TEXT NOT NULL DEFAULT '[]',
    duplicate_of INTEGER REFERENCES events(id) ON DELETE SET NULL,
    duplicate_score REAL DEFAULT 0,
    decision TEXT NOT NULL DEFAULT 'import',
    selected INTEGER NOT NULL DEFAULT 1,
    result_event_id INTEGER REFERENCES events(id) ON DELETE SET NULL,
    committed_at TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_import_items ON import_items(import_id);

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  `);

  addColumns(db);

  // Indexes over columns that addColumns creates, so they come after it.
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_venue_slug ON venues(slug) WHERE slug IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_events_venue_id ON events(venue_id);
  `);
}

/**
 * Columns added after the first release. SQLite has no ADD COLUMN IF NOT
 * EXISTS, so each one is checked against the table's own schema first — this
 * runs on every boot and must stay a no-op once applied.
 */
function addColumns(db: Database.Database) {
  const additions: [table: string, column: string, ddl: string][] = [
    // Guests ("+1s"): how many people a contributor may bring. The source doc
    // tracks this per assignment ("Charity +3") and restricts it per venue.
    ["events", "guest_limit", "INTEGER NOT NULL DEFAULT 0"],
    ["events", "guest_note", "TEXT"],
    ["assignments", "guests", "INTEGER NOT NULL DEFAULT 0"],
    ["coverage_requests", "guests_requested", "INTEGER NOT NULL DEFAULT 0"],
    // Per-person opt-out for decision emails. In-app notifications always fire.
    ["users", "email_notifications", "INTEGER NOT NULL DEFAULT 1"],

    // --- Phase 2: times kept as separate fields -----------------------------
    // start_datetime stays the canonical sort key and carries the show time;
    // doors and end sit alongside it so nothing existing has to be rewritten.
    ["events", "doors_time", "TEXT"],
    ["events", "end_time", "TEXT"],

    // --- Phase 2: the links the Google Doc carries --------------------------
    ["events", "event_url", "TEXT"],
    ["events", "festival_url", "TEXT"],
    ["events", "press_url", "TEXT"],
    ["events", "is_festival", "INTEGER NOT NULL DEFAULT 0"],

    // Scott attending but a reporter still needed — the doc's trailing "*".
    ["events", "needs_reporter", "INTEGER NOT NULL DEFAULT 0"],
    ["events", "venue_id", "INTEGER REFERENCES venues(id) ON DELETE SET NULL"],

    // --- Phase 2: venue directory ------------------------------------------
    ["venues", "slug", "TEXT"],
    ["venues", "website", "TEXT"],
    ["venues", "events_url", "TEXT"],
    ["venues", "press_url", "TEXT"],
    ["venues", "maps_url", "TEXT"],
    ["venues", "image_url", "TEXT"],
    ["venues", "updated_at", "TEXT"],

    // Where an assignment came from: a decided request, a direct assignment,
    // or migration of existing coverage out of the Google Doc.
    ["assignments", "source", "TEXT NOT NULL DEFAULT 'request'"],

    // Unresolved contributor names from the doc, pending a mapping to accounts.
    ["import_items", "detected_assignees", "TEXT NOT NULL DEFAULT '[]'"],
  ];

  for (const [table, column, ddl] of additions) {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
    if (cols.some((c) => c.name === column)) continue;
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
  }
}

/* ------------------------------ settings ------------------------------ */

export const DEFAULT_SETTINGS: Record<string, string> = {
  // When on, an Admin/Editor decision is a recommendation only; the Super Admin
  // must sign off before an assignment becomes official.
  require_super_admin_approval: "true",
  admins_can_approve: "true",
  org_name: "South Florida Insider",
  default_city: "Fort Lauderdale",
  auto_close_requests_when_full: "true",
};

export function getSetting(key: string): string {
  const db = getDb();
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? DEFAULT_SETTINGS[key] ?? "";
}

export function getSettings(): Record<string, string> {
  const db = getDb();
  const rows = db.prepare("SELECT key, value FROM settings").all() as {
    key: string;
    value: string;
  }[];
  const out = { ...DEFAULT_SETTINGS };
  for (const r of rows) out[r.key] = r.value;
  return out;
}

export function setSetting(key: string, value: string) {
  getDb()
    .prepare(
      `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`,
    )
    .run(key, value);
}

export function boolSetting(key: string) {
  return getSetting(key) === "true";
}

/* ------------------------------- audit -------------------------------- */

export function audit(entry: {
  actorId: number | null;
  action: string;
  entityType: string;
  entityId?: number | null;
  eventId?: number | null;
  summary: string;
  meta?: unknown;
}) {
  getDb()
    .prepare(
      `INSERT INTO audit_log (actor_id, action, entity_type, entity_id, event_id, summary, meta)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      entry.actorId,
      entry.action,
      entry.entityType,
      entry.entityId ?? null,
      entry.eventId ?? null,
      entry.summary,
      JSON.stringify(entry.meta ?? {}),
    );
}

export function notify(entry: {
  userId: number;
  type: string;
  title: string;
  body?: string | null;
  href?: string | null;
  eventId?: number | null;
}) {
  getDb()
    .prepare(
      `INSERT INTO notifications (user_id, type, title, body, href, event_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(
      entry.userId,
      entry.type,
      entry.title,
      entry.body ?? null,
      entry.href ?? null,
      entry.eventId ?? null,
    );

  maybeEmail(entry);
}

/**
 * Decisions worth an email. Everything else stays in-app only — a contributor
 * does not need mail confirming their own request was received.
 */
const EMAILED_TYPES = new Set([
  "request.approved",
  "request.rejected",
  "request.waitlisted",
  "request.new",
  "request.awaiting_super_admin",
  "assignment.created",
  "assignment.removed",
  "assignment.updated",
  "event.cancelled",
  "event.changed",
]);

/**
 * Fires the email without blocking the caller. `notify` runs inside synchronous
 * better-sqlite3 transactions, so mail must never be awaited here — a provider
 * timeout would otherwise stall an approval.
 */
function maybeEmail(entry: {
  userId: number;
  type: string;
  title: string;
  body?: string | null;
  href?: string | null;
}) {
  if (process.env.MAIL_NOTIFICATIONS === "off") return;
  if (!EMAILED_TYPES.has(entry.type)) return;

  const row = getDb()
    .prepare(
      "SELECT email, email_notifications FROM users WHERE id = ? AND status = 'active'",
    )
    .get(entry.userId) as
    | { email: string; email_notifications: number }
    | undefined;

  if (!row?.email || !row.email_notifications) return;
  // Placeholder addresses generated for imported contributors are not real.
  if (row.email.endsWith(".invalid") || row.email.endsWith("@test.local")) return;

  void import("./mail")
    .then(({ sendMail, notificationMail }) =>
      sendMail(
        notificationMail(row.email, {
          title: entry.title,
          body: entry.body ?? "",
          href: entry.href,
        }),
      ),
    )
    .catch((e) => console.error("[mail] notification failed:", e));
}

export function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}
