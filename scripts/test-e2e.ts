/**
 * End-to-end walkthrough of the coverage workflow, printed as a readable
 * transcript so you can see exactly what the app does at each step.
 *
 *   npx tsx --conditions=react-server scripts/test-e2e.ts
 *
 * It drives the real service layer — the same functions the UI calls — against
 * a scratch event and scratch accounts, then deletes everything it created.
 * Nothing it does touches real events or real contributors.
 */

import { getDb, setSetting, getSetting } from "../src/lib/db";
import { hashPassword } from "../src/lib/password";
import {
  submitRequest,
  decideRequest,
  assignDirectly,
  removeAssignment,
  setCapacity,
  addInternalNote,
  withdrawRequest,
} from "../src/lib/workflow";
import { capacityFor, getEvent, viewerStateFor, eventRequests } from "../src/lib/events";
import { canFinalizeDecision } from "../src/lib/rbac";
import { REQUEST_STATUS_MESSAGE, COVERAGE_TYPE_LABEL } from "../src/lib/constants";

const db = getDb();

let step = 0;
let passed = 0;
let failed = 0;

const B = (s: string) => `\x1b[1m${s}\x1b[0m`;
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
const cyan = (s: string) => `\x1b[36m${s}\x1b[0m`;

function heading(title: string) {
  console.log(`\n${B(`── ${++step}. ${title} ${"─".repeat(Math.max(0, 58 - title.length))}`)}`);
}

function check(label: string, ok: boolean, detail?: unknown) {
  const d =
    detail === undefined || detail === null
      ? ""
      : typeof detail === "string"
        ? detail
        : JSON.stringify(detail);
  if (ok) {
    passed++;
    console.log(`   ${green("✓")} ${label}${d ? dim(`  ${d}`) : ""}`);
  } else {
    failed++;
    console.log(`   ${red("✗")} ${label}${d ? red(`  ${d}`) : ""}`);
  }
}

function note(text: string) {
  console.log(`     ${dim(text)}`);
}

/* ------------------------------- scratch data ------------------------------ */

function mkUser(email: string, name: string, role: string, specialties: string[]) {
  db.prepare("DELETE FROM users WHERE email = ?").run(email);
  const info = db
    .prepare(
      `INSERT INTO users (email, name, password_hash, role, status, source, specialties, coverage_area)
       VALUES (?, ?, ?, ?, 'active', 'e2e', ?, 'South Florida')`,
    )
    .run(email, name, hashPassword("e2e-scratch"), role, JSON.stringify(specialties));
  const id = Number(info.lastInsertRowid);
  return db
    .prepare(
      `SELECT id, email, name, role, profile_photo, phone, bio, coverage_area,
              specialties, social_links, status FROM users WHERE id = ?`,
    )
    .get(id) as never;
}

function u(user: never) {
  return user as unknown as { id: number; name: string; role: string };
}

async function main() {
  console.log(B("\nSFI Coverage Desk — end-to-end workflow test"));
  console.log(dim("Driving the real service layer. Everything created here is deleted at the end.\n"));

  const originalSetting = getSetting("require_super_admin_approval");

  // --- scratch accounts ---
  const superAdmin = mkUser("e2e.super@test.local", "E2E Super Admin", "super_admin", ["photography"]);
  const editor = mkUser("e2e.editor@test.local", "E2E Editor", "admin", ["writing"]);
  const photog = mkUser("e2e.photog@test.local", "E2E Photographer", "contributor", ["photography"]);
  const writer = mkUser("e2e.writer@test.local", "E2E Writer", "contributor", ["writing"]);
  const videographer = mkUser("e2e.video@test.local", "E2E Videographer", "contributor", ["videography"]);

  // --- scratch event, dated well in the future so it never collides ---
  db.prepare("DELETE FROM events WHERE title = 'E2E Test Show'").run();
  const evInfo = db
    .prepare(
      `INSERT INTO events (title, category, start_datetime, time_tbd, venue, city, status, created_by, source_note)
       VALUES ('E2E Test Show', 'Concert', '2029-12-31T20:00', 0, 'Hard Rock Live', 'Hollywood', 'open', ?, 'Created by the end-to-end test')`,
    )
    .run(u(superAdmin).id);
  const eventId = Number(evInfo.lastInsertRowid);
  console.log(dim(`   Scratch event #${eventId}: "E2E Test Show" @ Hard Rock Live, 31 Dec 2029\n`));

  /* ----------------------------------------------------------------------- */

  heading("Super Admin sets coverage capacity");
  setCapacity(u(superAdmin) as never, eventId, {
    coverageLimit: 2,
    slots: [
      { coverage_type: "photography", capacity: 1 },
      { coverage_type: "article", capacity: 1 },
    ],
    allowWaitlist: true,
  });
  let cap = capacityFor(getEvent(eventId)!);
  check("capacity saved", cap.limit === 2, `limit ${cap.limit}, ${cap.byType.length} typed slots`);
  note("Photography: 1 · Article/Review: 1 · waitlist enabled");

  /* ----------------------------------------------------------------------- */

  heading("Three contributors request the same event");
  const reqPhoto = submitRequest(u(photog) as never, {
    eventId,
    coverageTypes: ["photography"],
    message: "I shoot this room often, same-night turnaround.",
  });
  const reqWrite = submitRequest(u(writer) as never, {
    eventId,
    coverageTypes: ["article"],
    message: "Would like to write the review.",
  });
  const reqVideo = submitRequest(u(videographer) as never, {
    eventId,
    coverageTypes: ["video"],
  });

  const open = eventRequests(eventId, ["pending"]);
  check("all three requests are Pending", open.length === 3, `${open.length} pending`);
  check(
    "nobody was auto-assigned",
    capacityFor(getEvent(eventId)!).approved === 0,
    "0 assignments",
  );
  note(`Contributor sees: "${REQUEST_STATUS_MESSAGE.pending}"`);

  const saNotified = db
    .prepare(
      "SELECT COUNT(*) n FROM notifications WHERE user_id = ? AND type = 'request.new'",
    )
    .get(u(superAdmin).id) as { n: number };
  check("Super Admin was notified of each one", saNotified.n === 3, `${saNotified.n} notifications`);

  const evStatus = getEvent(eventId)!.status;
  check("event status derived to Requests Pending", evStatus === "requests_pending", evStatus);

  /* ----------------------------------------------------------------------- */

  heading("A contributor cannot approve themselves");
  try {
    decideRequest(u(photog) as never, { requestId: reqPhoto, decision: "approve" });
    check("contributor blocked from approving", false, "no error thrown");
  } catch (e) {
    check(
      "contributor blocked from approving",
      e instanceof Error && /administrator/i.test(e.message),
      e instanceof Error ? `"${e.message}"` : "",
    );
  }
  try {
    assignDirectly(u(photog) as never, {
      eventId,
      userId: u(photog).id,
      coverageType: "photography",
    });
    check("contributor blocked from self-assigning", false, "no error thrown");
  } catch (e) {
    check(
      "contributor blocked from self-assigning",
      e instanceof Error && /administrator/i.test(e.message),
      e instanceof Error ? `"${e.message}"` : "",
    );
  }

  /* ----------------------------------------------------------------------- */

  heading("Editor decides while final-approval mode is ON");
  setSetting("require_super_admin_approval", "true");
  check(
    "editor cannot finalize in this mode",
    canFinalizeDecision(editor as never) === false,
  );

  const rec = decideRequest(u(editor) as never, {
    requestId: reqPhoto,
    decision: "approve",
    decisionNote: "Strong fit for this room.",
  });
  check("editor's approval logged as a recommendation", rec.final === false, `status: ${rec.status}`);
  check(
    "no assignment created yet",
    capacityFor(getEvent(eventId)!).approved === 0,
    "still 0 assigned",
  );
  note("Request moved to Under Review and the Super Admin was asked to sign off.");

  const awaiting = db
    .prepare(
      "SELECT COUNT(*) n FROM notifications WHERE user_id = ? AND type = 'request.awaiting_super_admin'",
    )
    .get(u(superAdmin).id) as { n: number };
  check("Super Admin pinged for sign-off", awaiting.n === 1);

  /* ----------------------------------------------------------------------- */

  heading("Super Admin signs off — assignment becomes real");
  const final = decideRequest(u(superAdmin) as never, {
    requestId: reqPhoto,
    decision: "approve",
    coverageType: "photography",
    decisionNote: "Approved. Photo pit opens 45 min before doors.",
  });
  check("Super Admin decision is final", final.final === true, `status: ${final.status}`);
  cap = capacityFor(getEvent(eventId)!);
  check("assignment created", cap.approved === 1, `${cap.approved} of ${cap.limit} filled`);

  const mine = viewerStateFor(eventId, u(photog).id);
  check(
    "contributor now shows as approved",
    mine.myAssignmentId !== null && mine.myCoverageType === "photography",
    `responsibility: ${COVERAGE_TYPE_LABEL[mine.myCoverageType as "photography"]}`,
  );
  note(`Contributor sees: "${REQUEST_STATUS_MESSAGE.approved}"`);

  const approvedNote = db
    .prepare(
      "SELECT body FROM notifications WHERE user_id = ? AND type = 'request.approved' ORDER BY id DESC LIMIT 1",
    )
    .get(u(photog).id) as { body: string } | undefined;
  check("contributor notified with the note", !!approvedNote?.body.includes("Photo pit"));

  /* ----------------------------------------------------------------------- */

  heading("Second approval fills the last spot");
  decideRequest(u(superAdmin) as never, {
    requestId: reqWrite,
    decision: "approve",
    coverageType: "article",
  });
  cap = capacityFor(getEvent(eventId)!);
  check("event is now full", cap.isFull, `${cap.approved} of ${cap.limit}`);
  check("status derived to Fully Covered", getEvent(eventId)!.status === "full");

  /* ----------------------------------------------------------------------- */

  heading("Capacity is enforced, and only the Super Admin can override it");

  // An editor's call in final-approval mode is only a recommendation, so it
  // never reaches the capacity gate — the gate guards assignment, not advice.
  const overCap = decideRequest(u(editor) as never, {
    requestId: reqVideo,
    decision: "approve",
  });
  check(
    "editor's call on a full event is still only advice",
    overCap.final === false && capacityFor(getEvent(eventId)!).approved === 2,
    "no assignment created",
  );

  // The gate itself: finalizing on a full event requires an explicit override.
  try {
    decideRequest(u(superAdmin) as never, {
      requestId: reqVideo,
      decision: "approve",
      coverageType: "video",
    });
    check("approving past the limit needs an override", false, "no error thrown");
  } catch (e) {
    check(
      "approving past the limit needs an override",
      e instanceof Error && /full|override/i.test(e.message),
      e instanceof Error ? `"${e.message}"` : "",
    );
  }

  decideRequest(u(superAdmin) as never, {
    requestId: reqVideo,
    decision: "waitlist",
    decisionNote: "Keeping you in mind if the promoter opens another slot.",
  });
  const waitlisted = eventRequests(eventId, ["waitlisted"]);
  check("third contributor waitlisted instead", waitlisted.length === 1);
  note(`Contributor sees: "${REQUEST_STATUS_MESSAGE.waitlisted}"`);

  const overridden = decideRequest(u(superAdmin) as never, {
    requestId: reqVideo,
    decision: "approve",
    coverageType: "video",
    overrideCapacity: true,
  });
  cap = capacityFor(getEvent(eventId)!);
  check(
    "Super Admin can override the limit",
    overridden.final && cap.approved === 3,
    `${cap.approved} assigned, limit was ${cap.limit}`,
  );

  /* ----------------------------------------------------------------------- */

  heading("Super Admin overrides an earlier decision");
  const asg = db
    .prepare(
      "SELECT id FROM assignments WHERE event_id = ? AND user_id = ? AND status = 'active'",
    )
    .get(eventId, u(writer).id) as { id: number };

  removeAssignment(u(superAdmin) as never, asg.id, "Promoter cut the list to two.");
  check(
    "assignment removed",
    capacityFor(getEvent(eventId)!).approved === 2,
    "2 remaining",
  );

  const removedNote = db
    .prepare(
      "SELECT body FROM notifications WHERE user_id = ? AND type = 'assignment.removed' ORDER BY id DESC LIMIT 1",
    )
    .get(u(writer).id) as { body: string } | undefined;
  check("removed contributor was told why", !!removedNote?.body.includes("Promoter cut"));

  /* ----------------------------------------------------------------------- */

  heading("Editor cannot undo the Super Admin's work");
  const saAssignment = db
    .prepare(
      "SELECT id FROM assignments WHERE event_id = ? AND user_id = ? AND status = 'active'",
    )
    .get(eventId, u(photog).id) as { id: number };
  try {
    removeAssignment(u(editor) as never, saAssignment.id);
    check("editor blocked from undoing a Super Admin assignment", false, "no error thrown");
  } catch (e) {
    check(
      "editor blocked from undoing a Super Admin assignment",
      e instanceof Error && /Super Admin/i.test(e.message),
      e instanceof Error ? `"${e.message}"` : "",
    );
  }

  /* ----------------------------------------------------------------------- */

  heading("Internal notes stay internal");
  addInternalNote(u(superAdmin) as never, {
    eventId,
    note: "Waiting on credentials from the promoter.",
    visibility: "super_admin_only",
  });
  try {
    addInternalNote(u(photog) as never, { eventId, note: "should fail" });
    check("contributor blocked from writing notes", false, "no error thrown");
  } catch (e) {
    check(
      "contributor blocked from writing notes",
      e instanceof Error && /administrator/i.test(e.message),
    );
  }
  const { canViewNote } = await import("../src/lib/rbac");
  check(
    "editor cannot read a Super-Admin-only note",
    canViewNote(editor as never, "super_admin_only") === false,
  );
  check(
    "Super Admin can read it",
    canViewNote(superAdmin as never, "super_admin_only") === true,
  );

  /* ----------------------------------------------------------------------- */

  heading("Withdrawing a request");
  db.prepare("DELETE FROM coverage_requests WHERE event_id = ? AND user_id = ?").run(
    eventId,
    u(writer).id,
  );
  const reqAgain = submitRequest(u(writer) as never, {
    eventId,
    coverageTypes: ["article"],
  });
  withdrawRequest(u(writer) as never, reqAgain);
  const wd = db
    .prepare("SELECT status FROM coverage_requests WHERE id = ?")
    .get(reqAgain) as { status: string };
  check("contributor can withdraw their own request", wd.status === "withdrawn");

  // Writer has no open request now, so this one is genuinely someone else's.
  const someoneElses = submitRequest(u(writer) as never, {
    eventId,
    coverageTypes: ["article"],
  });
  try {
    withdrawRequest(u(photog) as never, someoneElses);
    check("cannot withdraw someone else's request", false, "no error thrown");
  } catch (e) {
    check(
      "cannot withdraw someone else's request",
      e instanceof Error && /your own/i.test(e.message),
      e instanceof Error ? `"${e.message}"` : "",
    );
  }

  /* ----------------------------------------------------------------------- */

  heading("Plus-ones follow the event's policy");

  // A fresh contributor, so the earlier requests in this run don't collide.
  const guestTester = mkUser("e2e.guest@test.local", "E2E Guest Tester", "contributor", ["writing"]);

  // Nobody may bring a guest until the event says so.
  try {
    submitRequest(u(guestTester) as never, {
      eventId,
      coverageTypes: ["article"],
      guestsRequested: 2,
    });
    check("guests refused while the event allows none", false, "no error thrown");
  } catch (e) {
    check(
      "guests refused while the event allows none",
      e instanceof Error && /aren't allowed/i.test(e.message),
      e instanceof Error ? `"${e.message}"` : "",
    );
  }

  setCapacity(u(superAdmin) as never, eventId, {
    coverageLimit: 6,
    allowWaitlist: true,
    guestLimit: 2,
    guestNote: "Two per person, name them at will-call.",
  });
  check("guest allowance saved", (getEvent(eventId)!.guest_limit ?? 0) === 2, getEvent(eventId)!.guest_limit);

  const guestReq = submitRequest(u(guestTester) as never, {
    eventId,
    coverageTypes: ["article"],
    guestsRequested: 2,
  });
  check("contributor can now ask for +2", !!guestReq);

  const overAsker = mkUser("e2e.over@test.local", "E2E Over Asker", "contributor", ["videography"]);
  try {
    submitRequest(u(overAsker) as never, {
      eventId,
      coverageTypes: ["video"],
      guestsRequested: 5,
    });
    check("asking past the allowance is refused", false, "no error thrown");
  } catch (e) {
    check(
      "asking past the allowance is refused",
      e instanceof Error && /Only 2 guests/i.test(e.message),
      e instanceof Error ? `"${e.message}"` : "",
    );
  }

  // The Super Admin decides the final number, not the requester.
  decideRequest(u(superAdmin) as never, {
    requestId: guestReq,
    decision: "approve",
    coverageType: "article",
    guests: 1,
  });
  const guestAsg = db
    .prepare("SELECT guests FROM assignments WHERE event_id = ? AND user_id = ? AND status = 'active'")
    .get(eventId, u(guestTester).id) as { guests: number };
  check("Super Admin can trim the request to +1", guestAsg.guests === 1, guestAsg);
  note("They asked for +2 and were approved for +1.");

  const guestNote = db
    .prepare(
      "SELECT body FROM notifications WHERE user_id = ? AND type = 'request.approved' ORDER BY id DESC LIMIT 1",
    )
    .get(u(guestTester).id) as { body: string } | undefined;
  check("approval notification states the guest count", !!guestNote?.body.includes("1 guest"), guestNote?.body);

  // Lowering the policy must not leave anyone over the new limit.
  setCapacity(u(superAdmin) as never, eventId, {
    coverageLimit: 6,
    allowWaitlist: true,
    guestLimit: 0,
  });
  const afterTrim = db
    .prepare("SELECT guests FROM assignments WHERE event_id = ? AND user_id = ?")
    .get(eventId, u(guestTester).id) as { guests: number };
  check("existing guests are trimmed when the policy drops", afterTrim.guests === 0, afterTrim);

  /* ----------------------------------------------------------------------- */

  heading("The Super Admin can put themselves on an event");

  setCapacity(u(superAdmin) as never, eventId, {
    coverageLimit: 8,
    allowWaitlist: true,
    guestLimit: 2,
  });

  assignDirectly(u(superAdmin) as never, {
    eventId,
    userId: u(superAdmin).id,
    coverageType: "photography",
    guests: 2,
  });

  const selfState = viewerStateFor(eventId, u(superAdmin).id);
  check("Super Admin is now assigned", selfState.myAssignmentId !== null, selfState.myCoverageType);

  const selfAsg = db
    .prepare("SELECT guests FROM assignments WHERE event_id = ? AND user_id = ? AND status = 'active'")
    .get(eventId, u(superAdmin).id) as { guests: number };
  check("with their own +2", selfAsg.guests === 2, selfAsg);

  const selfNotified = db
    .prepare(
      "SELECT COUNT(*) n FROM notifications WHERE user_id = ? AND type = 'assignment.created'",
    )
    .get(u(superAdmin).id) as { n: number };
  check("no pointless self-notification", selfNotified.n === 0, selfNotified);

  const selfAudit = db
    .prepare(
      "SELECT summary FROM audit_log WHERE event_id = ? AND action = 'assignment.created' ORDER BY id DESC LIMIT 1",
    )
    .get(eventId) as { summary: string };
  check(
    "audit records it as self-assignment",
    /put themselves on/i.test(selfAudit.summary),
    selfAudit.summary,
  );

  try {
    assignDirectly(u(photog) as never, {
      eventId,
      userId: u(photog).id,
      coverageType: "photography",
    });
    check("a contributor still cannot self-assign", false, "no error thrown");
  } catch (e) {
    check(
      "a contributor still cannot self-assign",
      e instanceof Error && /administrator/i.test(e.message),
      e instanceof Error ? `"${e.message}"` : "",
    );
  }

  heading("Everything was written to the audit trail");
  const trail = db
    .prepare(
      `SELECT a.action, a.summary FROM audit_log a
        WHERE a.event_id = ? ORDER BY a.id ASC`,
    )
    .all(eventId) as { action: string; summary: string }[];
  check("decisions recorded", trail.length >= 8, `${trail.length} entries`);
  console.log();
  for (const t of trail) console.log(`     ${dim(t.action.padEnd(26))} ${t.summary}`);

  /* --------------------------------- teardown ------------------------------- */

  setSetting("require_super_admin_approval", originalSetting);

  db.prepare("DELETE FROM events WHERE id = ?").run(eventId);
  db.exec("DELETE FROM notifications WHERE user_id IN (SELECT id FROM users WHERE source = 'e2e')");
  db.exec("DELETE FROM users WHERE source = 'e2e'");

  const leftoverEvents = db
    .prepare("SELECT COUNT(*) n FROM events WHERE title = 'E2E Test Show'")
    .get() as { n: number };
  const leftoverUsers = db
    .prepare("SELECT COUNT(*) n FROM users WHERE source = 'e2e'")
    .get() as { n: number };

  console.log();
  heading("Cleanup");
  check("scratch event deleted", leftoverEvents.n === 0);
  check("scratch accounts deleted", leftoverUsers.n === 0);
  check("approval setting restored", getSetting("require_super_admin_approval") === originalSetting);

  console.log(
    `\n${B(failed === 0 ? green(`All ${passed} checks passed.`) : red(`${passed} passed, ${failed} failed.`))}\n`,
  );
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
