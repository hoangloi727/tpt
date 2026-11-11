import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import Database from "better-sqlite3";
const script = new URL("../../scripts/clear-backups.mjs", import.meta.url);

test("backup cleanup previews, requires stopped-server acknowledgement, and preserves business data", async () => {
  const dir = await mkdtemp(join(tmpdir(), "clear-backups-"));
  const path = join(dir, "test.sqlite");
  const db = new Database(path);
  db.exec("CREATE TABLE records (store TEXT, id TEXT); CREATE TABLE auth_users (id TEXT); INSERT INTO auth_users VALUES ('account')");
  for (const store of ["internal_snapshots", "backup_records", "tasks", "attachments", "operation_journal"])
    db.prepare("INSERT INTO records VALUES (?, ?)").run(store, store);
  const run = (...args) => spawnSync(process.execPath, [script.pathname, "--file", path, ...args], { encoding: "utf8" });
  assert.equal(run().status, 0);
  assert.equal(db.prepare("SELECT count(*) AS n FROM records").get().n, 5);
  assert.notEqual(run("--apply").status, 0);
  const applied = run("--apply", "--server-stopped");
  assert.equal(applied.status, 0, applied.stderr);
  assert.equal(db.prepare("SELECT count(*) AS n FROM records").get().n, 3);
  assert.equal(db.prepare("SELECT count(*) AS n FROM auth_users").get().n, 1);
  assert.equal(run("--apply", "--server-stopped").status, 0);
  assert.equal(db.prepare("SELECT count(*) AS n FROM records").get().n, 3);
  db.close();
});
