/**
 * Test accounts for trying the app before it goes to the real Super Admin.
 *
 *   npx tsx scripts/test-accounts.ts          — create them
 *   npx tsx scripts/test-accounts.ts --remove — delete them and their data
 *
 * Every account created here uses an @test.local email so it is obvious at a
 * glance which accounts are real and which are for kicking the tyres.
 *
 * This also resets the real Super Admin account to unclaimed, so Scott can
 * claim shaps@sflinsider.com himself by signing up with it.
 */

import { getDb, audit } from "../src/lib/db";
import { hashPassword } from "../src/lib/password";

const db = getDb();
const remove = process.argv.includes("--remove");

const PASSWORD = "TestDesk2026!";
const SUPER_ADMIN_EMAIL = (
  process.env.SUPER_ADMIN_EMAIL || "shaps@sflinsider.com"
).toLowerCase();

const ACCOUNTS = [
  {
    email: "test.superadmin@test.local",
    name: "Test Super Admin",
    role: "super_admin",
    coverage_area: "South Florida",
    specialties: ["photography", "writing"],
    bio: "Test account for trying the Super Admin approval flow.",
  },
  {
    email: "test.editor@test.local",
    name: "Test Editor",
    role: "admin",
    coverage_area: "Broward",
    specialties: ["writing"],
    bio: "Test account for trying the Admin/Editor recommendation flow.",
  },
  {
    email: "test.photographer@test.local",
    name: "Test Photographer",
    role: "contributor",
    coverage_area: "Miami-Dade",
    specialties: ["photography", "social"],
    bio: "Test contributor account — concert photography.",
  },
  {
    email: "test.writer@test.local",
    name: "Test Writer",
    role: "contributor",
    coverage_area: "Palm Beach",
    specialties: ["writing", "interviews"],
    bio: "Test contributor account — reviews and interviews.",
  },
] as const;

/* --------------------------------- remove --------------------------------- */

if (remove) {
  const ids = (
    db
      .prepare("SELECT id FROM users WHERE email LIKE '%@test.local'")
      .all() as { id: number }[]
  ).map((r) => r.id);

  if (ids.length) {
    const list = ids.join(",");
    db.exec(`DELETE FROM assignments WHERE user_id IN (${list})`);
    db.exec(`DELETE FROM coverage_requests WHERE user_id IN (${list})`);
    db.exec(`DELETE FROM notifications WHERE user_id IN (${list})`);
    db.exec(`DELETE FROM internal_notes WHERE author_id IN (${list})`);
    db.exec(`DELETE FROM sessions WHERE user_id IN (${list})`);
    db.exec(`DELETE FROM users WHERE id IN (${list})`);
  }

  console.log(`Removed ${ids.length} test account${ids.length === 1 ? "" : "s"}.`);
  process.exit(0);
}

/* --------------------------------- create --------------------------------- */

const insert = db.prepare(
  `INSERT INTO users (email, name, password_hash, role, status, source, specialties, coverage_area, bio)
   VALUES (?, ?, ?, ?, 'active', 'test-accounts', ?, ?, ?)
   ON CONFLICT(email) DO UPDATE SET
     password_hash = excluded.password_hash,
     role = excluded.role,
     status = 'active'`,
);

db.transaction(() => {
  for (const a of ACCOUNTS) {
    insert.run(
      a.email,
      a.name,
      hashPassword(PASSWORD),
      a.role,
      JSON.stringify(a.specialties),
      a.coverage_area,
      a.bio,
    );
  }
})();

// Hand the real Super Admin account back so Scott can claim it himself.
const real = db
  .prepare("SELECT id, password_hash FROM users WHERE email = ?")
  .get(SUPER_ADMIN_EMAIL) as { id: number; password_hash: string | null } | undefined;

if (real?.password_hash) {
  db.prepare(
    `UPDATE users SET password_hash = NULL, status = 'provisional', updated_at = datetime('now')
      WHERE id = ?`,
  ).run(real.id);
  db.prepare("DELETE FROM sessions WHERE user_id = ?").run(real.id);
  audit({
    actorId: null,
    action: "user.unclaimed",
    entityType: "user",
    entityId: real.id,
    summary: `${SUPER_ADMIN_EMAIL} reset to unclaimed so the account can be claimed at sign-up`,
  });
  console.log(`Reset ${SUPER_ADMIN_EMAIL} to unclaimed — ready for Scott to claim.\n`);
}

console.log("Test accounts ready. Password for all of them:\n");
console.log(`    ${PASSWORD}\n`);
for (const a of ACCOUNTS) {
  console.log(`  ${a.role.replace("_", " ").padEnd(12)}  ${a.email}`);
}
console.log(`
Sign in at http://localhost:4310/login

When you're done:  npx tsx scripts/test-accounts.ts --remove
`);
