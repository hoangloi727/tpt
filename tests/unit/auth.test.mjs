import assert from "node:assert/strict";
import { test } from "node:test";
import { SessionManager, hasPermission } from "../../backend/auth.js";

test("sessions accept bearer tokens, reject unknown tokens, and expire", () => {
  const sessions = new SessionManager();
  const { token } = sessions.create({ id: "user" });
  assert.equal(sessions.verify(`Bearer ${token}`).user.id, "user");
  assert.equal(sessions.verify("unknown"), null);
  sessions.sessions.get(token).expiresAt = 0;
  assert.equal(sessions.verify(token), null);
  assert.equal(sessions.sessions.has(token), false);
});

test("destructive authorization is session-bound, replaceable and time-limited", () => {
  const sessions = new SessionManager();
  const first = sessions.create({ id: "user" }).token;
  const second = sessions.create({ id: "user" }).token;
  const authorization = sessions.authorizeDestructive(first);
  assert.equal(sessions.verifyDestructive(first, authorization), true);
  assert.equal(sessions.verifyDestructive(second, authorization), false);
  assert.equal(sessions.verifyDestructive(first, "incorrect"), false);
  const replacement = sessions.authorizeDestructive(first);
  assert.equal(sessions.verifyDestructive(first, authorization), false);
  sessions.sessions.get(first).destructiveAuthorization.expiresAt = 0;
  assert.equal(sessions.verifyDestructive(first, replacement), false);
});

test("user refresh preserves selected school and revocation removes all user sessions", () => {
  const sessions = new SessionManager();
  const first = sessions.create({ id: "one", selectedSchoolId: "a" }).token;
  const second = sessions.create({ id: "one", selectedSchoolId: "b" }).token;
  const other = sessions.create({ id: "two" }).token;
  sessions.refreshUser("one", { displayName: "Updated" });
  assert.equal(sessions.verify(first).user.displayName, "Updated");
  assert.equal(sessions.verify(first).user.selectedSchoolId, "a");
  assert.equal(sessions.verify(second).user.selectedSchoolId, "b");
  sessions.revokeUser("one");
  assert.equal(sessions.verify(first), null);
  assert.equal(sessions.verify(second), null);
  assert.equal(sessions.verify(other).user.id, "two");
  sessions.remove(other);
  assert.equal(sessions.verify(other), null);
});

test("permissions allow managers and explicit grants without matching partial names", () => {
  for (const role of ["admin", "superadmin"])
    assert.equal(hasPermission({ role }, "store:classes:write"), true);
  assert.equal(hasPermission({ permissions: ["*"] }, "dashboard"), true);
  assert.equal(hasPermission({ permissions: ["dashboard"] }, "dashboard"), true);
  assert.equal(!!hasPermission({ permissions: ["store:classes:read"] }, "store:classes:write"), false);
  assert.equal(!!hasPermission(null, "dashboard"), false);
});
