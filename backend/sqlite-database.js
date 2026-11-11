import { mkdir, open, chmod } from "node:fs/promises";
import { dirname } from "node:path";
import Database from "better-sqlite3";
import { isDeepStrictEqual } from "node:util";

export class SqliteDatabase {
  constructor(filePath) {
    this.filePath = filePath;
    this.database = null;
    this.queue = Promise.resolve();
  }

  async open() {
    await mkdir(dirname(this.filePath), { recursive: true });
    const file = await open(this.filePath, "a", 0o600);
    await file.close();
    await chmod(this.filePath, 0o600);
    this.database = new Database(this.filePath);
    this.database.pragma("foreign_keys = ON");
    this.database.pragma("synchronous = FULL");
    this.database.exec(`
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
    return this;
  }

  metadata(key) {
    const statement = this.database.prepare(
      "SELECT value FROM metadata WHERE key = ?",
    );
    const value = statement.get(key)?.value ?? null;
    return value;
  }

  recordCount() {
    return this.database.prepare("SELECT COUNT(*) AS count FROM records").get().count;
  }

  userCount() {
    return this.database.prepare("SELECT COUNT(*) AS count FROM auth_users").get().count;
  }

  loadRecords(stores) {
    const state = Object.fromEntries(stores.map((store) => [store, []]));
    for (const row of this.database.prepare("SELECT store, data FROM records").iterate())
      if (state[row.store]) state[row.store].push(JSON.parse(row.data));
    return state;
  }

  loadUsers() {
    return this.database.prepare("SELECT data FROM auth_users").all().map((row) => JSON.parse(row.data));
  }

  replaceRecords(state, metadata = {}) {
    return this.write(() => {
      this.database.exec("DELETE FROM records");
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
      for (const [key, value] of Object.entries(metadata))
        this.setMetadata(key, value);
    });
  }

  updateRecords(previous, next) {
    const changes = [], removals = [];
    for (const [store, rows] of Object.entries(next.stores)) {
      if (rows === previous.stores[store]) continue;
      const key = (row) => JSON.stringify([row.school_profile_id || "thcs-local-profile-001", row.id]);
      const existing = new Map(previous.stores[store].map((row) => [key(row), row]));
      for (const row of rows) {
        const id = key(row);
        if (!isDeepStrictEqual(existing.get(id), row)) changes.push([store, row]);
        existing.delete(id);
      }
      for (const row of existing.values()) removals.push([store, row]);
    }
    if (!changes.length && !removals.length) return Promise.resolve();
    return this.write(() => {
      for (const [store, row] of removals)
        this.database.prepare("DELETE FROM records WHERE store = ? AND school_id = ? AND id = ?").run([
          store, row.school_profile_id || "thcs-local-profile-001", row.id,
        ]);
      const upsert = this.database.prepare(
        "INSERT INTO records (store, id, school_id, deleted_at, data) VALUES (?, ?, ?, ?, ?) " +
        "ON CONFLICT(store, school_id, id) DO UPDATE SET deleted_at = excluded.deleted_at, data = excluded.data",
      );
      for (const [store, row] of changes)
          upsert.run([store, row.id, row.school_profile_id || "thcs-local-profile-001", row.deleted_at || null, JSON.stringify(row)]);
    });
  }

  replaceUsers(users, metadata = {}) {
    return this.write(() => {
      this.database.exec("DELETE FROM auth_users");
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
      for (const [key, value] of Object.entries(metadata))
        this.setMetadata(key, value);
    });
  }

  setMetadata(key, value) {
    this.database.prepare(
      "INSERT INTO metadata (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    ).run(key, String(value));
  }

  write(task) {
    const run = () => this.database.transaction(task).immediate();
    this.queue = this.queue.then(run, run);
    return this.queue;
  }
}
