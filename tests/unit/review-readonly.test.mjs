import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { createApiHandler } from "../../backend/api.js";
import { SessionManager } from "../../backend/auth.js";
import { SqliteDatabase } from "../../backend/sqlite-database.js";
import { SqliteRepository } from "../../backend/repository.js";

const options = { schoolId: "school" };
async function fixture(users = {}) {
  const directory = await mkdtemp(join(tmpdir(), "tpt-review-readonly-"));
  const database = await new SqliteDatabase(join(directory, "test.sqlite")).open();
  const repository = await new SqliteRepository(database, join(directory, "absent.json")).open();
  for (const [store, row] of [
    ["school_years", { id: "year" }],
    ["classes", { id: "class", school_year_id: "year" }],
    ["criteria_sets", { id: "set" }],
    ["criteria_sets", { id: "replacement" }],
    ["criteria", { id: "criterion", criteria_set_id: "set" }],
    ["school_weeks", { id: "week", school_year_id: "year", start_date: "2026-09-14", end_date: "2026-09-20" }],
    ["weekly_score_sheets", { id: "sheet", school_year_id: "year", week_id: "week", criteria_set_id: "set", status: "draft" }],
    ["score_entries", { id: "entry", school_year_id: "year", sheet_id: "sheet", week_id: "week", class_id: "class", criteria_id: "criterion", entry_date: "2026-09-14", entry_state: "value", value: 1 }],
    ["score_evidence", { id: "evidence", entry_id: "entry", description: "Original" }],
    ["score_grader_assignments", { user_id: "user", school_year_id: "year", class_ids: ["class"] }],
  ]) await repository.put(store, row, options);
  await repository.put("weekly_score_sheets", { id: "sheet", status: "review" }, options);
  const sessions = new SessionManager();
  const handler = createApiHandler({ repository, sessions, users });
  const request = async (role, method, path, body) => {
    const { token } = sessions.create({ id: role, role, root: role === "superadmin", selectedSchoolId: "school" });
    const incoming = Readable.from(body ? [Buffer.from(JSON.stringify(body))] : []);
    incoming.method = method;
    incoming.headers = { authorization: `Bearer ${token}`, "x-destructive-authorization": sessions.authorizeDestructive(token) };
    let status, result;
    await handler(incoming, {
      writeHead(value) { status = value; },
      end(value) { result = JSON.parse(value); },
    }, new URL(`http://localhost/api${path}`));
    return { status, result };
  };
  return { repository, request };
}

test("Review denies score creation, editing, bulk filling and deletion for every writer, including root", async (t) => {
  t.mock.method(console, "error", () => {});
  const { repository, request } = await fixture();
  const entry = repository.get("score_entries", "entry", "school");
  const before = structuredClone(repository.state);
  for (const role of ["user", "admin", "superadmin"]) {
    for (const row of [{ ...entry, value: 9 }, { ...entry, id: "new", entry_date: "2026-09-15", value: 0, incidents: [] }, { ...entry, deleted_at: new Date().toISOString() }]) {
      for (const bulk of [false, true]) {
        const response = await request(role, "POST", `/stores/score_entries${bulk ? "/bulk" : ""}`, bulk ? { rows: [row] } : { row });
        assert.equal(response.status, 409, `${role} ${bulk ? "bulk" : "single"} write`);
      }
    }
    assert.equal((await request(role, "DELETE", "/stores/score_entries/entry")).status, 409);
    if (role !== "user")
      assert.equal((await request(role, "DELETE", "/stores/score_entries/entry?hard=1")).status, 409);
  }
  assert.deepEqual(repository.state, before);
});

test("Review cannot be bypassed by sheet edits, evidence, destructive operations or imports", async (t) => {
  t.mock.method(console, "error", () => {});
  const { repository, request } = await fixture();
  const sheet = repository.get("weekly_score_sheets", "sheet", "school");
  const evidence = repository.get("score_evidence", "evidence", "school");
  const before = structuredClone(repository.state);
  for (const row of [
    { ...sheet, include_saturday: true },
    { ...sheet, status: "complete" },
    { ...sheet, status: "unlocked" },
    { ...sheet, status: "draft", include_saturday: true },
    { ...sheet, status: "approved", deleted_at: new Date().toISOString() },
  ]) assert.equal((await request("superadmin", "POST", "/stores/weekly_score_sheets", { row })).status, 409);
  for (const [method, path, body] of [
    ["POST", "/stores/score_evidence", { row: { ...evidence, description: "Changed" } }],
    ["POST", "/stores/score_evidence/bulk", { rows: [{ ...evidence, id: "new-evidence" }] }],
    ["DELETE", "/stores/score_evidence/evidence?hard=1"],
    ["DELETE", "/stores/weekly_score_sheets/sheet?hard=1"],
    ["DELETE", "/stores/weekly_score_sheets/sheet"],
    ["DELETE", "/stores/score_entries"],
    ["DELETE", "/stores/score_evidence"],
    ["DELETE", "/stores/weekly_score_sheets"],
    ["DELETE", "/score-sheets/sheet"],
    ["DELETE", "/criteria-sets/set"],
    ["PATCH", "/score-sheets/sheet/criteria-set", { criteriaSetId: "replacement" }],
  ]) assert.equal((await request("superadmin", method, path, body)).status, 409, `${method} ${path}`);
  const payload = repository.exportAll("school");
  for (const mode of ["replace", "merge"])
    assert.equal((await request("superadmin", "POST", `/import/${mode}`, { payload })).status, 409);
  assert.deepEqual(repository.state, before);
});

test("Review still permits approval or rejection; only rejection reopens editing", async (t) => {
  t.mock.method(console, "error", () => {});
  const { repository, request } = await fixture();
  assert.equal((await request("user", "POST", "/stores/weekly_score_sheets", { row: { id: "sheet", status: "draft" } })).status, 403);
  assert.equal((await request("superadmin", "POST", "/stores/weekly_score_sheets", { row: { id: "sheet", status: "draft" } })).status, 200);
  assert.equal((await request("superadmin", "POST", "/stores/score_entries", { row: { id: "entry", value: 2 } })).status, 200);
  await repository.put("weekly_score_sheets", { id: "sheet", status: "complete" }, options);
  await repository.put("weekly_score_sheets", { id: "sheet", status: "review" }, options);
  assert.equal((await request("admin", "POST", "/stores/weekly_score_sheets", {
    row: { ...repository.get("weekly_score_sheets", "sheet", "school"), status: "approved", approved_at: new Date().toISOString() },
  })).status, 200);
  assert.equal((await request("superadmin", "POST", "/stores/score_entries", { row: { id: "entry", value: 3 } })).status, 409);
});

test("Review backups can still be restored into another school, including evidence", async () => {
  const { repository } = await fixture();
  const payload = repository.exportAll("school");
  for (const [method, schoolId] of [["mergeAll", "merged-school"], ["replaceAll", "restored-school"]]) {
    await repository[method](payload, { schoolId });
    assert.equal(repository.get("weekly_score_sheets", "sheet", schoolId).status, "review");
    assert.equal(repository.get("score_evidence", "evidence", schoolId).description, "Original");
    await assert.rejects(repository.put("score_entries", { id: "entry", value: 9 }, { schoolId }), { status: 409 });
  }
});


test("Unlock requires manager password, reason and current revision, for approved and locked tables", async (t) => {
  t.mock.method(console, "error", () => {});
  const { repository, request } = await fixture({ verifyPassword: async (id, password) => password === "test-password" });
  await repository.put("weekly_score_sheets", { id: "sheet", status: "approved" }, options);
  for (const status of ["approved", "locked"]) {
    if (status === "locked") await repository.put("weekly_score_sheets", { id: "sheet", status }, options);
    const sheet = repository.get("weekly_score_sheets", "sheet", "school");
    const body = { reason: "Correct recorded scores", currentPassword: "test-password", revision: sheet.revision };
    const before = structuredClone(repository.state);
    for (const [role, changes, expected] of [
      ["user", {}, 403], ["superadmin", { currentPassword: "wrong" }, 403],
      ["superadmin", { currentPassword: "" }, 403], ["superadmin", { reason: "  " }, 400],
      ["superadmin", { reason: "a".repeat(501) }, 400], ["superadmin", { revision: sheet.revision - 1 }, 409],
    ]) assert.equal((await request(role, "POST", "/score-sheets/sheet/unlock", { ...body, ...changes })).status, expected);
    for (const next of ["draft", "complete", "review", "unlocked"]) {
      for (const bulk of [false, true]) {
        const row = { id: "sheet", status: next };
        assert.equal((await request("superadmin", "POST", `/stores/weekly_score_sheets${bulk ? "/bulk" : ""}`, bulk ? { rows: [row] } : { row })).status, 403);
      }
    }
    assert.deepEqual(repository.state, before);
    assert.equal((await request("superadmin", "POST", "/score-sheets/sheet/unlock", body)).status, 200);
    const unlocked = repository.get("weekly_score_sheets", "sheet", "school");
    assert.equal(unlocked.status, "unlocked");
    assert.equal(unlocked.unlock_reason, body.reason);
    assert.equal(unlocked.reports_stale, true);
    assert.ok(unlocked.unlocked_at);
    assert.ok(repository.all("audit_logs", false, "school").some(row => row.entity_id === "sheet" && row.reason === body.reason && row.actor_id === "superadmin"));
    assert.equal((await request("superadmin", "POST", "/stores/score_entries", { row: { id: "entry", value: 5 } })).status, 200);
  }
  await repository.put("weekly_score_sheets", { id: "sheet", status: "review" }, options);
  assert.equal((await request("superadmin", "POST", "/score-sheets/sheet/unlock", {
    reason: "Cannot unlock review", currentPassword: "test-password", revision: repository.get("weekly_score_sheets", "sheet", "school").revision,
  })).status, 409);
});
