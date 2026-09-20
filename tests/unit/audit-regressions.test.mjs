import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import vm from "node:vm";
import { createApiHandler } from "../../backend/api.js";
import { SessionManager } from "../../backend/auth.js";
import { SqliteDatabase } from "../../backend/sqlite-database.js";
import { SqliteRepository } from "../../backend/repository.js";

async function openRepository() {
  const directory = await mkdtemp(join(tmpdir(), "tpt-audit-regression-"));
  const database = await new SqliteDatabase(join(directory, "test.sqlite")).open();
  return new SqliteRepository(database, join(directory, "absent.json")).open();
}

async function apiRequest(repository, user, path, body, method = body ? "POST" : "GET") {
  const sessions = new SessionManager();
  const { token } = sessions.create({ selectedSchoolId: "school", ...user });
  const request = Readable.from(body ? [Buffer.from(JSON.stringify(body))] : []);
  request.method = method;
  request.headers = { authorization: `Bearer ${token}` };
  let status, result;
  await createApiHandler({ repository, sessions, users: {} })(request, {
    writeHead(value) { status = value; },
    end(value) { result = JSON.parse(value); },
  }, new URL(`http://localhost/api${path}`));
  return { status, result };
}

const options = { schoolId: "school" };

async function seedScores(repository) {
  for (const [store, row] of [
    ["school_years", { id: "year", name: "2026-2027" }],
    ["classes", { id: "class", school_year_id: "year" }],
    ["criteria_sets", { id: "set" }],
    ["criteria", { id: "criterion", criteria_set_id: "set" }],
    ["school_weeks", { id: "week", school_year_id: "year", start_date: "2026-09-14", end_date: "2026-09-20" }],
    ["school_weeks", { id: "next-week", school_year_id: "year", start_date: "2026-09-21", end_date: "2026-09-27" }],
    ["weekly_score_sheets", { id: "sheet", school_year_id: "year", week_id: "week", criteria_set_id: "set", status: "draft" }],
    ["weekly_score_sheets", { id: "next-sheet", school_year_id: "year", week_id: "next-week", criteria_set_id: "set", status: "draft" }],
    ["score_entries", { id: "entry", school_year_id: "year", week_id: "week", sheet_id: "sheet", class_id: "class", criteria_id: "criterion", entry_date: "2026-09-14", entry_state: "value", value: 1 }],
  ]) await repository.put(store, row, options);
}

test("teacher and grader roles cannot export or replace school data through retained permissions", async () => {
  const repository = await openRepository();
  for (const role of ["teacher", "user"]) {
    for (const permissions of [["*"], ["data:export", "data:import"]]) {
      const user = { id: role, role, permissions };
      assert.equal((await apiRequest(repository, user, "/export")).status, 403);
      for (const mode of ["replace", "merge"])
        assert.equal((await apiRequest(repository, user, `/import/${mode}`, {
          payload: { schema: repository.schema, data: {} },
        })).status, 403);
    }
  }
  assert.equal((await apiRequest(repository, { role: "admin" }, "/export")).status, 200);
});

test("graders can append score audit details but cannot overwrite existing audit records or impersonate actors", async () => {
  const repository = await openRepository();
  await seedScores(repository);
  await repository.put("score_grader_assignments", {
    id: "assignment", user_id: "grader", school_year_id: "year", class_ids: ["class"],
  }, options);
  const original = await repository.put("audit_logs", {
    id: "admin-log", entity: "classes", actor_id: "admin", summary: "Original history",
  }, options);
  const user = { id: "grader", role: "user", displayName: "Grader" };
  for (const bulk of [false, true]) {
    const row = { ...original, entity: "score_entries", summary: "Rewritten history" };
    const response = await apiRequest(repository, user, `/stores/audit_logs${bulk ? "/bulk" : ""}`, bulk ? { rows: [row] } : { row });
    assert.equal(response.status, 403);
    assert.deepEqual(repository.get("audit_logs", original.id, "school"), original);
  }
  const appended = await apiRequest(repository, user, "/stores/audit_logs", {
    row: { entity: "score_entries", entity_id: "entry", actor_id: "admin", actor_name: "Admin", summary: "New score detail" },
  });
  assert.equal(appended.status, 200);
  assert.equal(appended.result.actor_id, "grader");
  assert.equal(appended.result.actor_name, "Grader");
});

test("locked score rows cannot be moved into an editable sheet", async () => {
  const repository = await openRepository();
  await seedScores(repository);
  await repository.put("weekly_score_sheets", { id: "sheet", status: "locked" }, options);
  const original = repository.get("score_entries", "entry", "school");
  for (const bulk of [false, true]) {
    const row = { ...original, sheet_id: "next-sheet", week_id: "next-week", entry_date: "2026-09-21" };
    await assert.rejects(bulk ? repository.bulkPut("score_entries", [row], options) : repository.put("score_entries", row, options), { status: 409 });
    assert.deepEqual(repository.get("score_entries", "entry", "school"), original);
  }
});

test("archived records cannot escape write protection by moving to another year", async () => {
  const repository = await openRepository();
  await repository.put("school_years", { id: "archived", status: "archived" }, options);
  await repository.put("school_years", { id: "current", is_current: true }, options);
  const original = await repository.put("tasks", { id: "task", school_year_id: "archived" }, { ...options, allowArchivedYear: true });
  await assert.rejects(repository.put("tasks", { ...original, school_year_id: "current", academic_year_id: "current" }, options), { status: 409 });
  assert.deepEqual(repository.get("tasks", "task", "school"), original);
});

test("teachers default to their current-year assignment and receive its year metadata", async () => {
  const repository = await openRepository();
  for (const year of [{ id: "old", name: "2025-2026" }, { id: "current", name: "2026-2027", is_current: true }]) {
    await repository.put("school_years", year, options);
    await repository.put("classes", { id: `class-${year.id}`, school_year_id: year.id }, options);
    await repository.put("teacher_class_assignments", { user_id: "teacher", school_year_id: year.id, class_id: `class-${year.id}` }, options);
  }
  const user = { id: "teacher", role: "teacher" };
  const response = await apiRequest(repository, user, "/teacher/class-week");
  assert.equal(response.status, 200);
  assert.equal(response.result.assignment.school_year_id, "current");
  assert.equal(response.result.year.name, "2026-2027");
  assert.equal((await apiRequest(repository, user, "/teacher/class-week?schoolYearId=old")).result.assignment.school_year_id, "old");
});

test("snapshot retention runs without destructive confirmation and preserves protected, manual and other-school snapshots", async () => {
  const repository = await openRepository();
  await repository.put("app_settings", { id: "seed_state", snapshot_daily: 2 }, options);
  for (let day = 1; day <= 4; day++)
    await repository.put("internal_snapshots", { id: `daily-${day}`, tier: "daily", created_at: `2026-09-0${day}T00:00:00.000Z` }, options);
  for (const row of [{ id: "protected", tier: "daily", protected: true }, { id: "manual", tier: "manual" }])
    await repository.put("internal_snapshots", row, options);
  await repository.put("internal_snapshots", { id: "other", tier: "daily" }, { schoolId: "other-school" });
  for (const role of ["teacher", "user"])
    assert.equal((await apiRequest(repository, { role, permissions: ["*"] }, "/snapshots/prune", {})).status, 403);
  assert.equal((await apiRequest(repository, { role: "admin" }, "/snapshots/prune", {})).status, 200);
  assert.deepEqual(repository.all("internal_snapshots").map(row => row.id).sort(), ["daily-3", "daily-4", "manual", "other", "protected"]);
  assert.equal((await apiRequest(repository, { role: "admin" }, "/stores/internal_snapshots/protected", undefined, "DELETE")).status, 403);
});

const appSource = await readFile(new URL("../../frontend/scripts/app.js", import.meta.url), "utf8");
const pasteSource = appSource.slice(appSource.indexOf("async function scorePaste("), appSource.indexOf("async function undoScore("));

test("pasting scores keeps leading empty rows and columns aligned", async () => {
  for (const [text, expected] of [["\t5\n", [["a", "second", 5]]], ["\n\t5\n", [["b", "second", 5]]]]) {
    let saved = [];
    const context = vm.createContext({
      scoreContext: async () => ({ classes: [{ id: "a" }, { id: "b" }], criteria: [{ id: "first" }, { id: "second" }], selectedEntries: [], sheet: { id: "sheet" } }),
      entryMap: () => new Map(),
      parseScoreInput: (raw) => raw.trim() ? { valid: true, action: "save", entry_state: "value", value: Number(raw) } : { valid: true, action: "skip" },
      uid: () => "new", state: { yearId: "year", weekId: "week", scoreDate: "2026-09-14" },
      db: { bulkPut: async (_store, rows) => { saved = rows; }, put: async () => {} },
      toast: () => {}, renderScores: () => {},
    });
    vm.runInContext(pasteSource, context);
    await context.scorePaste({ clipboardData: { getData: () => text }, preventDefault() {}, currentTarget: { dataset: { row: "0", col: "0" } } });
    assert.deepEqual(JSON.parse(JSON.stringify(saved.map(row => [row.class_id, row.criteria_id, row.value]))), expected);
  }
});

const workflowSource = appSource.slice(appSource.indexOf("async function scoreWorkflow("), appSource.indexOf("function unlockSheet("));

test("complete and reviewed sheets return to incomplete and must pass completeness before another review", async () => {
  const repository = await openRepository();
  await seedScores(repository);
  let manager = true;
  const notices = [];
  const context = vm.createContext({
    canManageScores: () => manager,
    db: { put: (store, row) => repository.put(store, row, options) },
    state: { lastScoreUndo: { id: "old" } },
    toast: (message) => notices.push(message), renderScores() {},
  });
  vm.runInContext(workflowSource, context);
  const ctx = {
    allClasses: [{ id: "class" }], criteria: [{ id: "criterion" }],
    days: [{ date: "2026-09-14" }], allEntries: [],
  };
  context.scoreEntryCriterionId = row => row.criteria_id;
  for (const initialStatus of ["complete", "review"]) {
    await repository.put("weekly_score_sheets", { id: "sheet", status: initialStatus }, options);
    ctx.sheet = repository.get("weekly_score_sheets", "sheet", "school");
    await context.scoreWorkflow(ctx, true);
    assert.equal(repository.get("weekly_score_sheets", "sheet", "school").status, "draft");
    assert.equal(ctx.sheet.status, initialStatus, "rendered context is not changed before persistence");
    assert.equal(context.state.lastScoreUndo, null);
    ctx.sheet = repository.get("weekly_score_sheets", "sheet", "school");
    ctx.allEntries = [];
    await context.scoreWorkflow(ctx);
    assert.equal(repository.get("weekly_score_sheets", "sheet", "school").status, "draft");
    assert.match(notices.at(-1), /Chưa thể đánh dấu đủ/);
    ctx.allEntries = [repository.get("score_entries", "entry", "school")];
    await context.scoreWorkflow(ctx);
    assert.equal(repository.get("weekly_score_sheets", "sheet", "school").status, "complete");
    ctx.sheet = repository.get("weekly_score_sheets", "sheet", "school");
    await context.scoreWorkflow(ctx);
    assert.equal(repository.get("weekly_score_sheets", "sheet", "school").status, "review");
  }
  manager = false;
  ctx.sheet = repository.get("weekly_score_sheets", "sheet", "school");
  await context.scoreWorkflow(ctx, true);
  assert.equal(repository.get("weekly_score_sheets", "sheet", "school").status, "review");
});

test("a valid backup can merge locked scores into an empty school without unlocking normal writes", async () => {
  const source = await openRepository();
  await seedScores(source);
  await source.put("weekly_score_sheets", { id: "sheet", status: "locked" }, options);
  const payload = source.exportAll("school"), target = await openRepository();
  await target.mergeAll(payload, options);
  assert.equal(target.get("score_entries", "entry", "school").value, 1);
  assert.equal(target.get("weekly_score_sheets", "sheet", "school").status, "locked");
  await assert.rejects(target.put("score_entries", { id: "entry", value: 2 }, options), { status: 409 });
  assert.equal((await target.mergeAll(payload, options)).updated, 0);
});

const fillMissingSource = appSource.slice(appSource.indexOf("async function fillMissingScoreCells("), appSource.indexOf("async function openCategoryScoreEntry("));

test("fill missing cells records zero with no incidents across the week and preserves all existing entries", async () => {
  const repository = await openRepository();
  for (const [store, row] of [
    ["school_years", { id: "year" }],
    ["classes", { id: "a", school_year_id: "year", campus_id: "one" }],
    ["classes", { id: "b", school_year_id: "year", campus_id: "two" }],
    ["criteria_sets", { id: "set" }],
    ["criteria_groups", { id: "group", code: "G", name: "Incidents", criteria_set_id: "set" }],
    ["criteria", { id: "rule", code: "R", name: "Incident", criteria_set_id: "set", criteria_group_id: "group", points: -2 }],
    ["criteria", { id: "numeric", criteria_set_id: "set", min: 0, max: 10 }],
    ["school_weeks", { id: "week", school_year_id: "year", start_date: "2026-09-14", end_date: "2026-09-20" }],
    ["weekly_score_sheets", { id: "sheet", school_year_id: "year", week_id: "week", criteria_set_id: "set", status: "draft" }],
  ]) await repository.put(store, row, options);
  const base = { school_year_id: "year", week_id: "week", sheet_id: "sheet", entry_date: "2026-09-14" };
  for (const row of [
    { id: "incident", class_id: "a", criteria_group_id: "group", entry_state: "value", incidents: [{ id: "incident-detail", person_name: "Student", criteria_id: "rule", points: -2 }] },
    { id: "score", class_id: "a", criteria_id: "numeric", entry_state: "value", value: 7 },
    { id: "na", class_id: "b", criteria_group_id: "group", entry_state: "na", incidents: [] },
    { id: "exempt", class_id: "b", criteria_id: "numeric", entry_state: "exempt" },
    { id: "zero", class_id: "a", criteria_id: "numeric", entry_date: "2026-09-15", entry_state: "value", value: 0 },
    { id: "deleted", class_id: "a", criteria_group_id: "group", entry_date: "2026-09-15", entry_state: "value", incidents: [], deleted_at: "2026-09-15T12:00:00Z" },
  ]) await repository.put("score_entries", { ...base, ...row }, options);
  const original = repository.all("score_entries", true, "school");
  let manager = true, sequence = 0, writes = 0, includeSaturday = false, beforeWrite;
  const context = vm.createContext({
    canManageScores: () => manager,
    scoreContext: async () => ({
      sheet: repository.get("weekly_score_sheets", "sheet", "school"),
      allClasses: repository.all("classes", false, "school"),
      classes: [repository.get("classes", "a", "school")],
      criteria: [{ id: "group", is_category: true }, { id: "numeric" }],
      days: Array.from({ length: includeSaturday ? 6 : 5 }, (_, index) => ({ date: `2026-09-${14 + index}` })),
      allEntries: repository.all("score_entries", false, "school"),
    }),
    scoreEntryCriterionId: row => row.criteria_group_id || row.criteria_id,
    uid: () => `filled-${++sequence}`,
    db: { bulkPut: async (store, rows) => {
      writes++;
      if (beforeWrite) await beforeWrite(rows);
      return repository.bulkPut(store, rows, options);
    } },
    state: { lastScoreUndo: { id: "old" } }, toast() {}, renderScores: async () => {},
  });
  vm.runInContext(fillMissingSource, context);
  await context.fillMissingScoreCells();
  const entries = repository.all("score_entries", false, "school");
  assert.equal(entries.length, 20);
  assert.equal(writes, 1);
  for (const row of original) assert.deepEqual(repository.get("score_entries", row.id, "school"), row);
  const added = entries.filter(row => row.id.startsWith("filled-"));
  assert.equal(added.length, 15);
  for (const row of added) {
    assert.equal(row.entry_state, "value");
    assert.equal(row.value, 0);
    assert.deepEqual(row.incidents, []);
    assert.match(row.reason, /không có sự việc/);
  }
  assert.equal(context.state.lastScoreUndo, null);
  assert.equal(repository.get("weekly_score_sheets", "sheet", "school").status, "draft");
  await context.fillMissingScoreCells();
  assert.equal(writes, 1, "repeating the action is a no-op");
  await repository.put("weekly_score_sheets", { id: "sheet", include_saturday: true }, options);
  includeSaturday = true;
  manager = false;
  await context.fillMissingScoreCells();
  assert.equal(writes, 1, "only managers can run the bulk action");
  manager = true;
  beforeWrite = async (rows) => {
    // A grader fills one cell after the manager has loaded the missing-cell list.
    await repository.put("score_entries", { ...rows.at(-1), id: "concurrent", value: 9 }, options);
  };
  await assert.rejects(context.fillMissingScoreCells(), { status: 409 });
  assert.equal(repository.all("score_entries", false, "school").length, 21, "the conflicted batch rolls back");
  assert.equal(repository.get("score_entries", "concurrent", "school").value, 9);
  beforeWrite = undefined;
  await context.fillMissingScoreCells();
  assert.equal(repository.all("score_entries", false, "school").length, 24);
  for (const status of ["approved", "locked"]) {
    await repository.put("weekly_score_sheets", { id: "sheet", status }, options);
    const previousWrites = writes;
    await context.fillMissingScoreCells();
    assert.equal(writes, previousWrites);
  }
});
