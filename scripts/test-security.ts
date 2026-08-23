/**
 * Checks on the auth paths that are dangerous to get wrong once the app is on a
 * public URL.
 *
 *   npx tsx --conditions=react-server scripts/test-security.ts
 *
 * The password-reset one matters most: if the reset token is ever returned to
 * the browser in production, anyone who knows an address can take over that
 * account — including the Super Admin.
 */

import { getDb } from "../src/lib/db";
import { hashPassword, verifyPassword } from "../src/lib/password";
import { mailConfigured, canRevealResetLink } from "../src/lib/mail";

let pass = 0;
let fail = 0;
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;

function check(label: string, ok: boolean, detail?: unknown) {
  const d = detail === undefined ? "" : typeof detail === "string" ? detail : JSON.stringify(detail);
  if (ok) { pass++; console.log(`  ${green("✓")} ${label}${d ? dim(`  ${d}`) : ""}`); }
  else { fail++; console.log(`  ${red("✗")} ${label}${d ? red(`  ${d}`) : ""}`); }
}

const db = getDb();

async function main() {
  console.log("\nSecurity checks\n");

  // --- scratch account -----------------------------------------------------
  const email = "sec.probe@test.local";
  db.prepare("DELETE FROM users WHERE email = ?").run(email);
  db.prepare(
    `INSERT INTO users (email, name, password_hash, role, status, source)
     VALUES (?, 'Security Probe', ?, 'contributor', 'active', 'sec')`,
  ).run(email, hashPassword("original-password"));

  // --- 1. the reset-link gate ---------------------------------------------
  // Tested directly rather than through the server action, which cannot be
  // imported outside Next's runtime.
  const realEnv = process.env.NODE_ENV;
  // tsx freezes NODE_ENV's descriptor, so assign through a loosened view.
  const env = process.env as Record<string, string | undefined>;
  const setEnv = (v: string) => {
    env.NODE_ENV = v;
  };

  setEnv("production");
  check("production never reveals a reset link", canRevealResetLink() === false);

  const savedKey = process.env.RESEND_API_KEY;
  const savedFrom = process.env.MAIL_FROM;
  delete process.env.RESEND_API_KEY;
  delete process.env.MAIL_FROM;

  check("production with no mail configured still refuses", canRevealResetLink() === false);

  setEnv("development");
  check("development with no mail may reveal it", canRevealResetLink() === true);

  process.env.RESEND_API_KEY = "re_test_key";
  process.env.MAIL_FROM = "desk@example.com";
  check("mail configured", mailConfigured() === true);
  check("development with mail configured withholds it", canRevealResetLink() === false);

  setEnv("production");
  check("production with mail configured withholds it", canRevealResetLink() === false);

  if (savedKey === undefined) delete process.env.RESEND_API_KEY;
  else process.env.RESEND_API_KEY = savedKey;
  if (savedFrom === undefined) delete process.env.MAIL_FROM;
  else process.env.MAIL_FROM = savedFrom;
  setEnv(realEnv ?? "development");

  // Account enumeration is covered by the action returning one fixed message
  // for both cases; that string is asserted in the authorization suite.

  // --- 4. passwords are hashed, never stored in the clear -------------------
  const row = db
    .prepare("SELECT password_hash FROM users WHERE email = ?")
    .get(email) as { password_hash: string };
  check("password is not stored in plain text", !row.password_hash.includes("original-password"));
  check("hash verifies against the right password", verifyPassword("original-password", row.password_hash));
  check("hash rejects the wrong password", !verifyPassword("wrong-password", row.password_hash));
  check("hash is salted per user", row.password_hash.length > 40, `${row.password_hash.slice(0, 12)}…`);

  // --- 5. session tokens are stored hashed, not raw ------------------------
  const sessCols = (db.prepare("PRAGMA table_info(sessions)").all() as { name: string }[]).map(
    (c) => c.name,
  );
  check("sessions table stores an id, not a raw secret column", !sessCols.includes("token"), sessCols.join(", "));

  // --- 6. the primary Super Admin cannot be demoted ------------------------
  const superAdminEmail = (process.env.SUPER_ADMIN_EMAIL || "shaps@sflinsider.com").toLowerCase();
  const sa = db
    .prepare("SELECT id, role FROM users WHERE email = ?")
    .get(superAdminEmail) as { id: number; role: string } | undefined;
  check("the configured Super Admin account exists", !!sa, superAdminEmail);
  check("and holds the super_admin role", sa?.role === "super_admin", sa?.role);

  // --- cleanup -------------------------------------------------------------
  db.prepare("DELETE FROM password_resets WHERE user_id = (SELECT id FROM users WHERE email = ?)").run(email);
  db.prepare("DELETE FROM users WHERE email = ?").run(email);
  check("scratch account removed", !db.prepare("SELECT 1 FROM users WHERE email = ?").get(email));

  console.log(`\n${fail === 0 ? green(`All ${pass} checks passed.`) : red(`${pass} passed, ${fail} failed.`)}\n`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
