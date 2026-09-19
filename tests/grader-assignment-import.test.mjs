import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import vm from "node:vm";
import { SqliteDatabase } from "../backend/sqlite-database.js";
import { SqliteRepository } from "../backend/repository.js";

const context = vm.createContext({ window: {} });
vm.runInContext(await readFile(new URL("../frontend/scripts/app-utils.js", import.meta.url), "utf8"), context);
const prepare = (...args) => JSON.parse(JSON.stringify(context.window.TPTAppModules.utils.prepareGraderAssignmentImport(...args)));

test("grader import replaces assignments, transfers ownership and commits swaps atomically", async () => {
  const directory = await mkdtemp(join(tmpdir(), "grader-import-"));
  const database = await new SqliteDatabase(join(directory, "test.sqlite")).open();
  const repository = await new SqliteRepository(database, join(directory, "absent.json")).open();
  const options = { schoolId: "school" }, store = "score_grader_assignments";
  const classes = ["a", "b", "c", "d", "e"].map((id) => ({ id, class_name: id, school_year_id: "year" }));
  const users = ["a", "b", "c"].map((id) => ({ id: `user-${id}`, role: "user", graderClassId: id }));
  await repository.bulkPut("classes", classes, options);
  await repository.bulkPut(store, [
    { id: "assignment-a", user_id: "user-a", school_year_id: "year", class_ids: ["b", "d"] },
    { id: "assignment-b", user_id: "user-b", school_year_id: "year", class_ids: ["a", "e"] },
    { id: "assignment-c", user_id: "user-c", school_year_id: "year", class_ids: ["c"] },
    { id: "other-year", user_id: "user-a", school_year_id: "other", class_ids: [] },
  ], options);
  const importRows = (rows) => prepare(rows, { classes, users, assignments: repository.all(store), schoolYearId: "year" });
  const original = repository.all(store);
  const transfer = importRows([["a", "a"]]);
  assert.equal(transfer.parsed[0].errors.length, 0);
  assert.deepEqual(transfer.changes.map((row) => [row.id, row.class_ids]), [["assignment-a", ["a"]], ["assignment-b", ["e"]]]);
  await repository.bulkPut(store, transfer.changes, options);
  assert.deepEqual(repository.all(store).find((row) => row.id === "assignment-c"), original[2]);
  assert.deepEqual(repository.all(store).find((row) => row.id === "other-year"), original[3]);
  const swap = importRows([["a", "e"], ["b", "a"], ["a", "d"]]);
  await repository.bulkPut(store, swap.changes, options);
  assert.deepEqual(repository.all(store).find((row) => row.id === "assignment-a").class_ids, ["e", "d"]);
  assert.deepEqual(repository.all(store).find((row) => row.id === "assignment-b").class_ids, ["a"]);
  assert.deepEqual(importRows([["a", "d"], ["b", "d"]]).changes, []);
  assert.deepEqual(importRows([["missing", "d"]]).changes, []);
  const beforeFailure = structuredClone(repository.state);
  const owner = repository.all(store).find((row) => row.id === "assignment-a");
  await assert.rejects(repository.bulkPut(store, [{ ...owner, class_ids: ["a"] }], options), { status: 409 });
  assert.deepEqual(repository.state, beforeFailure);
  await assert.rejects(repository.bulkPut(store, [{ ...owner, class_ids: ["missing"] }], options), { status: 400 });
  await assert.rejects(repository.bulkPut(store, [{ ...owner, revision: owner.revision - 1 }], options), { status: 409 });
  assert.deepEqual(repository.state, beforeFailure);
  const reopened = await new SqliteRepository(await new SqliteDatabase(join(directory, "test.sqlite")).open(), join(directory, "absent.json")).open();
  assert.deepEqual(reopened.all(store), repository.all(store));
});
