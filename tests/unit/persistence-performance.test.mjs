import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SqliteDatabase } from "../../backend/sqlite-database.js";
import { SqliteRepository } from "../../backend/repository.js";
import { STORES } from "../../backend/stores.js";

async function openRepository() {
  const directory = await mkdtemp(join(tmpdir(), "tpt-incremental-"));
  const database = await new SqliteDatabase(join(directory, "test.sqlite")).open();
  const repository = await new SqliteRepository(database, join(directory, "absent.json")).open();
  return { database, repository };
}

test("task writes update only the task, audit and journal and survive reopening", async () => {
  const { database, repository } = await openRepository();
  await repository.bulkPut("tasks", Array.from({ length: 1000 }, (_, index) => ({
    id: `task-${index}`, title: `Task ${index}`,
  })), { schoolId: "school" });
  database.database.exec(`CREATE TABLE write_counts (value INTEGER);
    CREATE TRIGGER count_record_insert AFTER INSERT ON records BEGIN INSERT INTO write_counts VALUES (1); END;
    CREATE TRIGGER count_record_update AFTER UPDATE ON records BEGIN INSERT INTO write_counts VALUES (1); END;
    CREATE TRIGGER count_record_delete AFTER DELETE ON records BEGIN INSERT INTO write_counts VALUES (1); END;`);
  await repository.put("tasks", { id: "new-task", title: "New task" }, { schoolId: "school" });
  assert.equal(database.database.prepare("SELECT COUNT(*) AS count FROM write_counts").get().count, 3);
  const reopened = await new SqliteDatabase(database.filePath).open();
  assert.deepEqual(reopened.loadRecords(STORES), JSON.parse(JSON.stringify(repository.state.stores)));
  let writes = 0;
  const write = database.write.bind(database);
  database.write = (...args) => { writes++; return write(...args); };
  await repository.normalizeEnhancedData("school");
  assert.equal(writes, 0, "an unchanged migration must not export and rewrite the database");
});

test("incremental writes preserve tenant isolation and removals", async () => {
  const { database, repository } = await openRepository();
  await repository.put("tasks", { id: "shared", title: "First" }, { schoolId: "a" });
  await repository.put("tasks", { id: "shared", title: "Second" }, { schoolId: "b" });
  await repository.put("tasks", { id: "shared", title: "Changed" }, { schoolId: "a" });
  await repository.replaceAll({ schema: repository.schema, data: { tasks: [] } }, { schoolId: "a" });
  assert.equal(repository.get("tasks", "shared", "a"), null);
  assert.equal(repository.get("tasks", "shared", "b").title, "Second");
  assert.deepEqual(database.loadRecords(STORES), JSON.parse(JSON.stringify(repository.state.stores)));
});

test("a failed transaction rolls back SQL and memory and queued writes recover", async () => {
  const { database, repository } = await openRepository();
  const before = structuredClone(JSON.parse(JSON.stringify(repository.state.stores)));
  database.database.exec(`CREATE TRIGGER fail_journal BEFORE INSERT ON records
    WHEN NEW.store = 'operation_journal' BEGIN SELECT RAISE(ABORT, 'write failed'); END;`);
  await assert.rejects(repository.put("tasks", { id: "failed" }, { schoolId: "school" }), /write failed/);
  assert.deepEqual(repository.state.stores, before);
  assert.deepEqual(database.loadRecords(STORES), before);
  database.database.exec("DROP TRIGGER fail_journal");
  await Promise.all(["one", "two"].map((id) => repository.put("tasks", { id }, { schoolId: "school" })));
  assert.deepEqual(database.loadRecords(STORES), JSON.parse(JSON.stringify(repository.state.stores)));
  assert.equal(repository.all("tasks").length, 2);
});

test("native SQLite preserves sql.js files and remains readable by the old engine", async () => {
  const { default: initSqlJs } = await import("sql.js");
  const { writeFile, readFile } = await import("node:fs/promises");
  const SQL = await initSqlJs();
  const old = new SQL.Database();
  old.run(`CREATE TABLE metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    INSERT INTO metadata VALUES ('compatibility', 'preserved');`);
  const directory = await mkdtemp(join(tmpdir(), "tpt-native-compat-"));
  const path = join(directory, "old.sqlite");
  await writeFile(path, old.export());
  old.close();
  const native = await new SqliteDatabase(path).open();
  assert.equal(native.metadata("compatibility"), "preserved");
  await native.replaceUsers([{ id: "account", username: "test", role: "admin", schoolId: "school", passwordHash: "test-hash", passwordSalt: "test-salt" }]);
  await native.replaceRecords({ stores: { tasks: [{ id: "task", title: "Tiếng Việt", school_profile_id: "school" }] } });
  native.database.close();
  const rollback = new SQL.Database(await readFile(path));
  assert.equal(rollback.exec("SELECT value FROM metadata WHERE key = 'compatibility'")[0].values[0][0], "preserved");
  assert.equal(JSON.parse(rollback.exec("SELECT data FROM records")[0].values[0][0]).title, "Tiếng Việt");
  assert.equal(JSON.parse(rollback.exec("SELECT data FROM auth_users")[0].values[0][0]).passwordHash, "test-hash");
  assert.equal(rollback.exec("PRAGMA integrity_check")[0].values[0][0], "ok");
  rollback.close();
});
