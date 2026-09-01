import { createRequire } from "node:module";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import initSqlJs from "sql.js";

const require = createRequire(import.meta.url);
const wasmPath = require.resolve("sql.js/dist/sql-wasm.wasm");

export class SqliteDatabase {
  constructor(filePath) {
    this.filePath = filePath;
    this.database = null;
    this.queue = Promise.resolve();
  }

  async open() {
    await mkdir(dirname(this.filePath), { recursive: true });
    const SQL = await initSqlJs({ locateFile: () => wasmPath });
    this.SQL = SQL;
    let bytes = null;
    try {
      bytes = await readFile(this.filePath);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    this.database = bytes ? new SQL.Database(bytes) : new SQL.Database();
    this.database.run("PRAGMA foreign_keys = ON");
    this.database.run(`
      CREATE TABLE IF NOT EXISTS metadata (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS records (
        store TEXT NOT NULL,
        id TEXT NOT NULL,
        school_id TEXT NOT NULL,
        deleted_at TEXT,
        data TEXT NOT NULL,
        PRIMARY KEY (store, school_id, id)
      );
      CREATE INDEX IF NOT EXISTS records_school_store
        ON records (school_id, store, deleted_at);
      CREATE TABLE IF NOT EXISTS auth_users (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL COLLATE NOCASE UNIQUE,
        school_id TEXT,
        role TEXT NOT NULL,
        data TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS auth_users_school
        ON auth_users (school_id, role);
    `);
    if (!bytes) await this.persist();
    return this;
  }

  metadata(key) {
    const statement = this.database.prepare(
      "SELECT value FROM metadata WHERE key = ?",
    );
    statement.bind([key]);
    const value = statement.step() ? statement.getAsObject().value : null;
    statement.free();
    return value;
  }

  recordCount() {
    return Number(
      this.database.exec("SELECT COUNT(*) AS count FROM records")[0]?.values[0][0] ||
        0,
    );
  }

  userCount() {
    return Number(
      this.database.exec("SELECT COUNT(*) AS count FROM auth_users")[0]?.values[0][0] ||
        0,
    );
  }

  loadRecords(stores) {
    const state = Object.fromEntries(stores.map((store) => [store, []]));
    const statement = this.database.prepare("SELECT store, data FROM records");
    while (statement.step()) {
      const row = statement.getAsObject();
      if (state[row.store]) state[row.store].push(JSON.parse(row.data));
    }
    statement.free();
    return state;
  }

  loadUsers() {
    const users = [];
    const statement = this.database.prepare("SELECT data FROM auth_users");
    while (statement.step()) users.push(JSON.parse(statement.getAsObject().data));
    statement.free();
    return users;
  }

  replaceRecords(state, metadata = {}) {
    return this.write(() => {
      this.database.run("DELETE FROM records");
      const insert = this.database.prepare(
        "INSERT INTO records (store, id, school_id, deleted_at, data) VALUES (?, ?, ?, ?, ?)",
      );
      for (const [store, rows] of Object.entries(state.stores)) {
        for (const row of rows) {
          insert.run([
            store,
            row.id,
            row.school_profile_id || "thcs-local-profile-001",
            row.deleted_at || null,
            JSON.stringify(row),
          ]);
        }
      }
      insert.free();
      for (const [key, value] of Object.entries(metadata))
        this.setMetadata(key, value);
    });
  }

  replaceUsers(users, metadata = {}) {
    return this.write(() => {
      this.database.run("DELETE FROM auth_users");
      const insert = this.database.prepare(
        "INSERT INTO auth_users (id, username, school_id, role, data) VALUES (?, ?, ?, ?, ?)",
      );
      for (const user of users)
        insert.run([
          user.id,
          user.username,
          user.schoolId || null,
          user.role,
          JSON.stringify(user),
        ]);
      insert.free();
      for (const [key, value] of Object.entries(metadata))
        this.setMetadata(key, value);
    });
  }

  setMetadata(key, value) {
    this.database.run(
      "INSERT INTO metadata (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      [key, String(value)],
    );
  }

  write(task) {
    const run = async () => {
      const backup = this.database.export();
      let committed = false;
      this.database.run("BEGIN IMMEDIATE");
      try {
        const result = task();
        this.database.run("COMMIT");
        committed = true;
        await this.persist();
        return result;
      } catch (error) {
        if (committed) {
          this.database.close();
          this.database = new this.SQL.Database(backup);
          this.database.run("PRAGMA foreign_keys = ON");
        } else this.database.run("ROLLBACK");
        throw error;
      }
    };
    this.queue = this.queue.then(run, run);
    return this.queue;
  }

  async persist() {
    const temporary = `${this.filePath}.${process.pid}.tmp`;
    await writeFile(temporary, this.database.export(), { mode: 0o600 });
    await rename(temporary, this.filePath);
  }
}
