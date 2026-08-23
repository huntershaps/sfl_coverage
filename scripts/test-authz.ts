/**
 * Authorization checks against the running dev server.
 *
 *   npx tsx scripts/test-authz.ts
 *
 * Creates a throwaway contributor, gives it a real session, and confirms the
 * server refuses admin surfaces and privileged workflow calls. Cleans up after
 * itself.
 */

import crypto from "node:crypto";
import { getDb } from "../src/lib/db";
import { hashPassword } from "../src/lib/password";

const BASE = process.env.BASE_URL || "http://localhost:4310";
const db = getDb();

let pass = 0;
let fail = 0;

function check(name: string, ok: boolean, detail = "") {
  if (ok) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function makeSession(userId: number) {
  const token = crypto.randomBytes(32).toString("base64url");
  const id = crypto.createHash("sha256").update(token).digest("hex");
  db.prepare(
    "INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)",
  ).run(id, userId, new Date(Date.now() + 864e5).toISOString());
  return { token, id };
}

async function get(path: string, token?: string) {
  return fetch(`${BASE}${path}`, {
    redirect: "manual",
    headers: {
      accept: "text/html",
      ...(token ? { cookie: `sfi_session=${token}` } : {}),
    },
  });
}

async function main() {
  // --- throwaway contributor ---
  db.prepare("DELETE FROM users WHERE email = 'authz.probe@example.com'").run();
  const info = db
    .prepare(
      `INSERT INTO users (email, name, password_hash, role, status, source)
       VALUES ('authz.probe@example.com', 'Authz Probe', ?, 'contributor', 'active', 'test')`,
    )
    .run(hashPassword("probe-password-123"));
  const contributorId = Number(info.lastInsertRowid);
  const contributor = makeSession(contributorId);

  const superAdmin = db
    .prepare("SELECT id FROM users WHERE role = 'super_admin' LIMIT 1")
    .get() as { id: number };
  const admin = makeSession(superAdmin.id);

  console.log("\nRoute access — signed out (expect redirect to /login)");
  for (const p of ["/dashboard", "/events", "/admin/approvals", "/admin/settings", "/profile"]) {
    const r = await get(p);
    check(`${p} blocked`, r.status === 307 || r.status === 302, `got ${r.status}`);
  }

  console.log("\nRoute access — contributor (expect app pages OK, admin denied)");
  for (const p of ["/dashboard", "/events", "/requests", "/schedule", "/profile"]) {
    const r = await get(p, contributor.token);
    check(`${p} allowed`, r.status === 200, `got ${r.status}`);
  }
  for (const p of [
    "/admin/approvals",
    "/admin/approvals/4",
    "/admin/events",
    "/admin/events/new",
    "/admin/import",
    "/admin/contributors",
    "/admin/analytics",
    "/admin/activity",
    "/admin/settings",
  ]) {
    const r = await get(p, contributor.token);
    const redirected = r.status === 307 || r.status === 302;
    const location = r.headers.get("location") ?? "";
    check(
      `${p} denied`,
      redirected && !location.includes("/admin"),
      `got ${r.status} -> ${location}`,
    );
  }

  console.log("\nRoute access — super admin (expect all OK)");
  for (const p of ["/admin/approvals", "/admin/settings", "/admin/contributors"]) {
    const r = await get(p, admin.token);
    check(`${p} allowed`, r.status === 200, `got ${r.status}`);
  }

  console.log("\nWorkflow guards (direct calls into the service layer)");
  const { decideRequest, assignDirectly, removeAssignment, addInternalNote } =
    await import("../src/lib/workflow");

  const contributorUser = db
    .prepare(
      `SELECT id, email, name, role, profile_photo, phone, bio, coverage_area,
              specialties, social_links, status FROM users WHERE id = ?`,
    )
    .get(contributorId) as never;

  const anyRequest = db
    .prepare("SELECT id, event_id FROM coverage_requests LIMIT 1")
    .get() as { id: number; event_id: number } | undefined;

  if (anyRequest) {
    try {
      decideRequest(contributorUser, {
        requestId: anyRequest.id,
        decision: "approve",
      });
      check("contributor cannot approve a request", false, "no error thrown");
    } catch (e) {
      check(
        "contributor cannot approve a request",
        e instanceof Error && /administrator/i.test(e.message),
        e instanceof Error ? e.message : String(e),
      );
    }

    try {
      assignDirectly(contributorUser, {
        eventId: anyRequest.event_id,
        userId: contributorId,
        coverageType: "photography",
      });
      check("contributor cannot self-assign", false, "no error thrown");
    } catch (e) {
      check(
        "contributor cannot self-assign",
        e instanceof Error && /administrator/i.test(e.message),
        e instanceof Error ? e.message : String(e),
      );
    }
  }

  const anyAssignment = db.prepare("SELECT id FROM assignments LIMIT 1").get() as
    | { id: number }
    | undefined;
  if (anyAssignment) {
    try {
      removeAssignment(contributorUser, anyAssignment.id);
      check("contributor cannot remove an assignment", false, "no error thrown");
    } catch (e) {
      check(
        "contributor cannot remove an assignment",
        e instanceof Error && /administrator/i.test(e.message),
        e instanceof Error ? e.message : String(e),
      );
    }
  }

  try {
    addInternalNote(contributorUser, { note: "probe", eventId: 4 });
    check("contributor cannot write internal notes", false, "no error thrown");
  } catch (e) {
    check(
      "contributor cannot write internal notes",
      e instanceof Error && /administrator/i.test(e.message),
      e instanceof Error ? e.message : String(e),
    );
  }

  console.log("\nRole-escalation guards");
  const { assertCanChangeRole } = await import("../src/lib/rbac");
  const superAdminUser = db
    .prepare(
      `SELECT id, email, name, role, profile_photo, phone, bio, coverage_area,
              specialties, social_links, status FROM users WHERE id = ?`,
    )
    .get(superAdmin.id) as never;

  try {
    assertCanChangeRole(
      contributorUser,
      { id: contributorId, email: "authz.probe@example.com", role: "contributor" },
      "super_admin",
    );
    check("contributor cannot promote themselves", false, "no error thrown");
  } catch (e) {
    check(
      "contributor cannot promote themselves",
      e instanceof Error && /Super Admin/i.test(e.message),
    );
  }

  const primary = db
    .prepare("SELECT id, email, role FROM users WHERE email = ?")
    .get(
      (process.env.SUPER_ADMIN_EMAIL || "shaps@sflinsider.com").toLowerCase(),
    ) as { id: number; email: string; role: string } | undefined;

  if (primary) {
    try {
      assertCanChangeRole(superAdminUser, primary, "contributor");
      check("primary Super Admin cannot be demoted", false, "no error thrown");
    } catch (e) {
      check(
        "primary Super Admin cannot be demoted",
        e instanceof Error && /cannot be demoted/i.test(e.message),
      );
    }
  }

  console.log("\nCapacity enforcement");
  const { capacityFor } = await import("../src/lib/events");
  const capEvent = db.prepare("SELECT id, coverage_limit FROM events LIMIT 1").get() as {
    id: number;
    coverage_limit: number | null;
  };
  const cap = capacityFor(capEvent);
  check(
    "capacity computed without throwing",
    typeof cap.approved === "number" && "isFull" in cap,
  );

  // --- cleanup ---
  db.prepare("DELETE FROM sessions WHERE id = ?").run(contributor.id);
  db.prepare("DELETE FROM sessions WHERE id = ?").run(admin.id);
  db.prepare("DELETE FROM users WHERE id = ?").run(contributorId);

  console.log(`\n${pass} passed, ${fail} failed\n`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
