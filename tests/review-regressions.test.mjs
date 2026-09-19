import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { createApiHandler } from "../backend/api.js";
import { SessionManager } from "../backend/auth.js";
import { SqliteDatabase } from "../backend/sqlite-database.js";
import { SqliteRepository } from "../backend/repository.js";

test("daily scores allow Saturday only when enabled on the corresponding weekly sheet", async () => {
  const directory = await mkdtemp(join(tmpdir(), "saturday-scores-"));
  const database = await new SqliteDatabase(join(directory, "test.sqlite")).open();
  const repository = await new SqliteRepository(database, join(directory, "absent.json")).open();
  const options = { schoolId: "school" };
  for (const [store, row] of [
    ["classes", { id: "class", school_year_id: "year" }],
    ["school_weeks", { id: "week", school_year_id: "year", start_date: "2026-09-14", end_date: "2026-09-20" }],
    ["criteria_sets", { id: "set" }],
    ["criteria", { id: "criterion", criteria_set_id: "set" }],
    ["weekly_score_sheets", { id: "sheet", school_year_id: "year", week_id: "week", criteria_set_id: "set", status: "draft" }],
  ]) await repository.put(store, row, options);
  const entry = { id: "entry", school_year_id: "year", week_id: "week", sheet_id: "sheet", class_id: "class", criteria_id: "criterion", entry_state: "value", value: 1 };
  for (const enabled of [undefined, false, true]) {
    const sheet = repository.all("weekly_score_sheets")[0];
    await repository.put("weekly_score_sheets", { ...sheet, include_saturday: enabled }, options);
    for (const bulk of [false, true]) {
      const write = (entry_date) => bulk
        ? repository.bulkPut("score_entries", [{ ...entry, entry_date }], options)
        : repository.put("score_entries", { ...entry, entry_date }, options);
      for (const date of ["2026-09-14", "2026-09-18"]) await write(date);
      if (enabled === true) await write("2026-09-19");
      else await assert.rejects(write("2026-09-19"), { status: 400 });
      for (const date of ["2026-09-20", "2026-09-26", "2026-02-30", "invalid"])
        await assert.rejects(write(date), { status: 400 });
    }
  }
  const sheet = repository.all("weekly_score_sheets")[0];
  await repository.put("weekly_score_sheets", { ...sheet, status: "locked" }, options);
  await assert.rejects(repository.put("score_entries", { ...entry, entry_date: "2026-09-19" }, options), { status: 409 });
});

test("only managers can delete audit entries, even with destructive authorization", async () => {
  const sessions = new SessionManager();
  const removals = [];
  const handler = createApiHandler({
    sessions,
    users: {},
    repository: {
      all: () => [{ user_id: "grader", class_ids: ["class"] }],
      remove: async (...args) => { removals.push(args); return true; },
    },
  });
  for (const role of ["user", "admin", "superadmin"]) {
    const { token } = sessions.create({ id: "grader", role, selectedSchoolId: "school" });
    const request = Readable.from([]);
    request.method = "DELETE";
    request.headers = {
      authorization: `Bearer ${token}`,
      "x-destructive-authorization": sessions.authorizeDestructive(token),
    };
    let status;
    await handler(request, {
      writeHead(value) { status = value; },
      end() {},
    }, new URL("http://localhost/api/stores/audit_logs/admin-log"));
    assert.equal(status, role === "user" ? 403 : 200);
    if (role === "user") assert.equal(removals.length, 0);
  }
  assert.equal(removals.length, 2);
  assert.ok(removals.every(([store, id]) => store === "audit_logs" && id === "admin-log"));
});

test("criteria replacement isolates schools with identical sheet IDs", async () => {
  const directory = await mkdtemp(join(tmpdir(), "review-regressions-"));
  const database = await new SqliteDatabase(join(directory, "test.sqlite")).open();
  const repository = await new SqliteRepository(database, join(directory, "absent.json")).open();
  for (const schoolId of ["a", "b"]) {
    for (const [store, row] of [
      ["weekly_score_sheets", { id: "shared-sheet", criteria_set_id: "old", status: "locked" }],
      ["criteria_sets", { id: "new" }],
      ["score_entries", { id: "entry", sheet_id: "shared-sheet" }],
      ["score_evidence", { id: "evidence", entry_id: "entry" }],
      ["ranking_snapshots", { id: "ranking", sheet_id: "shared-sheet" }],
    ]) repository.state.stores[store].push({ ...row, school_profile_id: schoolId });
  }
  await repository.persist(repository.state);
  const before = repository.exportAll("a");
  const result = await repository.replaceWeeklyScoreSheetCriteria("shared-sheet", "new", "b", "admin");
  assert.equal(result.sheet.criteria_set_id, "new");
  assert.equal(result.sheet.status, "draft");
  assert.equal(result.entries, 1);
  assert.equal(result.evidence, 1);
  assert.equal(result.snapshots, 1);
  assert.deepEqual(repository.exportAll("a").data, before.data);
  for (const store of ["score_entries", "score_evidence", "ranking_snapshots"])
    assert.deepEqual(repository.all(store, true, "b"), []);
  assert.deepEqual(
    database.loadRecords(Object.keys(repository.state.stores)),
    JSON.parse(JSON.stringify(repository.state.stores)),
  );
});
