import "server-only";
import fs from "node:fs";
import path from "node:path";
import { getDb, audit } from "./db";
import type { SessionUser } from "./auth";
import { HttpError, isSuperAdmin } from "./rbac";

/**
 * Backups and exports.
 *
 * Two different needs, deliberately kept separate:
 *
 *   - A **backup** is a byte-exact copy of the database, taken through SQLite's
 *     online backup API so a live WAL cannot produce a torn file. It is what
 *     you restore from.
 *   - An **export** is JSON or CSV for reading elsewhere. It is not a restore
 *     path, and is not presented as one.
 */

export const BACKUP_DIR = process.env.BACKUP_DIR || "./backups";

export type BackupFile = {
  name: string;
  bytes: number;
  createdAt: string;
};

export type BackupStatus = {
  lastBackup: BackupFile | null;
  backupCount: number;
  totalBytes: number;
  counts: {
    events: number;
    users: number;
    requests: number;
    assignments: number;
    venues: number;
    notes: number;
    notifications: number;
    imports: number;
    auditEntries: number;
  };
  /** Size of the live database on disk. */
  databaseBytes: number;
};

function backupDir(): string {
  const dir = path.resolve(BACKUP_DIR);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function listBackups(): BackupFile[] {
  const dir = backupDir();
  return fs
    .readdirSync(dir)
    .filter((f) => /^sfi-.*\.db$/.test(f))
    .map((name) => {
      const st = fs.statSync(path.join(dir, name));
      return { name, bytes: st.size, createdAt: st.mtime.toISOString() };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function count(table: string, where = ""): number {
  return (
    getDb().prepare(`SELECT COUNT(*) n FROM ${table} ${where}`).get() as { n: number }
  ).n;
}

export function backupStatus(): BackupStatus {
  const files = listBackups();
  const dbFile = process.env.DATABASE_PATH || "./data/sfi.db";
  let databaseBytes = 0;
  try {
    databaseBytes = fs.statSync(path.resolve(dbFile)).size;
  } catch {
    databaseBytes = 0;
  }

  return {
    lastBackup: files[0] ?? null,
    backupCount: files.length,
    totalBytes: files.reduce((a, f) => a + f.bytes, 0),
    databaseBytes,
    counts: {
      events: count("events"),
      users: count("users"),
      requests: count("coverage_requests"),
      assignments: count("assignments", "WHERE status = 'active'"),
      venues: count("venues"),
      notes: count("internal_notes"),
      notifications: count("notifications"),
      imports: count("imports"),
      auditEntries: count("audit_log"),
    },
  };
}

/**
 * Takes a consistent copy of the database. Uses SQLite's own backup API rather
 * than copying the file, which with WAL enabled can capture a torn database.
 */
export async function createBackup(actor: SessionUser): Promise<BackupFile> {
  if (!isSuperAdmin(actor))
    throw new HttpError(403, "Only the Super Admin can take a backup.");

  const dir = backupDir();
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const dest = path.join(dir, `sfi-${stamp}.db`);

  await getDb().backup(dest);

  const st = fs.statSync(dest);

  audit({
    actorId: actor.id,
    action: "backup.created",
    entityType: "backup",
    summary: `${actor.name} took a backup (${(st.size / 1024 / 1024).toFixed(2)} MB)`,
    meta: { file: path.basename(dest), bytes: st.size },
  });

  // Keep the last 14 so the directory cannot grow without bound.
  const old = listBackups().slice(14);
  for (const f of old) {
    try {
      fs.unlinkSync(path.join(dir, f.name));
    } catch {
      /* already gone */
    }
  }

  return { name: path.basename(dest), bytes: st.size, createdAt: st.mtime.toISOString() };
}

/* --------------------------------- exports -------------------------------- */

/** Tables included in a full export, in dependency order. */
export const EXPORT_TABLES = [
  "users",
  "venues",
  "events",
  "event_slots",
  "coverage_requests",
  "assignments",
  "internal_notes",
  "notifications",
  "imports",
  "import_items",
  "audit_log",
  "settings",
] as const;

export type ExportTable = (typeof EXPORT_TABLES)[number];

/** Columns never included in an export — secrets and session material. */
const REDACTED: Record<string, string[]> = {
  users: ["password_hash"],
  imports: ["raw_content"],
};

function rowsFor(table: string): Record<string, unknown>[] {
  const rows = getDb().prepare(`SELECT * FROM ${table}`).all() as Record<string, unknown>[];
  const drop = REDACTED[table];
  if (!drop) return rows;
  return rows.map((r) => {
    const copy = { ...r };
    for (const k of drop) delete copy[k];
    return copy;
  });
}

export function exportJson(): string {
  const data: Record<string, unknown> = {
    exportedAt: new Date().toISOString(),
    note: "Password hashes and raw import payloads are omitted. This is a data export, not a restore point — use a backup file to restore.",
    tables: {},
  };
  const tables: Record<string, unknown[]> = {};
  for (const t of EXPORT_TABLES) tables[t] = rowsFor(t);
  data.tables = tables;
  return JSON.stringify(data, null, 2);
}

function csvCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  // Quote when the value contains a delimiter, quote or newline.
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function exportCsv(table: ExportTable): string {
  const rows = rowsFor(table);
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(",")];
  for (const r of rows) lines.push(headers.map((h) => csvCell(r[h])).join(","));
  // CRLF so Excel on Windows reads it without a fuss.
  return lines.join("\r\n");
}

/**
 * The export people actually want to read: one row per event with its coverage
 * flattened, rather than a table dump they would have to join themselves.
 */
export function exportEventsCsv(): string {
  const rows = getDb()
    .prepare(
      `SELECT e.id, e.title, e.category, e.start_datetime, e.doors_time, e.end_time,
              e.time_tbd, e.multi_day_end, e.venue, e.city, e.address, e.status,
              e.needs_reporter, e.is_festival, e.coverage_limit, e.guest_limit,
              e.event_url, e.ticket_url, e.festival_url, e.press_url,
              e.legacy_assignees,
              (SELECT group_concat(u.name || CASE WHEN a.guests > 0 THEN ' +' || a.guests ELSE '' END, '; ')
                 FROM assignments a JOIN users u ON u.id = a.user_id
                WHERE a.event_id = e.id AND a.status = 'active') assigned_to,
              (SELECT COUNT(*) FROM coverage_requests r
                WHERE r.event_id = e.id AND r.status IN ('pending','under_review')) pending_requests
         FROM events e
        ORDER BY e.start_datetime`,
    )
    .all() as Record<string, unknown>[];

  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(",")];
  for (const r of rows) lines.push(headers.map((h) => csvCell(r[h])).join(","));
  return lines.join("\r\n");
}
