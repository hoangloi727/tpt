import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import {
  EXTERNAL_BACKUP_EXCLUDED_STORES,
  STORES,
  SYNC_EXCLUDED_STORES,
} from "./stores.js";

const now = () => new Date().toISOString();

const withoutBinary = (record) =>
  Object.fromEntries(
    Object.entries(record).filter(([, value]) => value?.__type !== "Blob"),
  );

const revisionConflict = (message) => {
  const error = new Error(message);
  error.name = "RevisionConflictError";
  error.status = 409;
  return error;
};

export class JsonRepository {
  constructor(filePath, schema = 9) {
    this.filePath = filePath;
    this.schema = schema;
    this.previousSchema = schema;
    this.state = null;
    this.queue = Promise.resolve();
  }

  async open() {
    await mkdir(dirname(this.filePath), { recursive: true });
    try {
      const stored = JSON.parse(await readFile(this.filePath, "utf8"));
      this.previousSchema = Number(stored.schema || this.schema);
      this.state = {
        schema: this.schema,
        stores: Object.fromEntries(
          STORES.map((store) => [store, Array.isArray(stored.stores?.[store]) ? stored.stores[store] : []]),
        ),
      };
      if (this.previousSchema !== this.schema) await this.persist(this.state);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      this.state = {
        schema: this.schema,
        stores: Object.fromEntries(STORES.map((store) => [store, []])),
      };
      await this.persist(this.state);
    }
    return this;
  }

  assertStore(store) {
    if (!STORES.includes(store)) {
      const error = new Error(`Unknown store: ${store}`);
      error.status = 404;
      throw error;
    }
  }

  async persist(state) {
    const temporary = `${this.filePath}.${process.pid}.tmp`;
    await writeFile(temporary, `${JSON.stringify(state)}\n`, { mode: 0o600 });
    await rename(temporary, this.filePath);
  }

  mutate(task) {
    const run = async () => {
      const draft = structuredClone(this.state);
      const result = await task(draft);
      await this.persist(draft);
      this.state = draft;
      return result;
    };
    this.queue = this.queue.then(run, run);
    return this.queue;
  }

  all(store, includeDeleted = false) {
    this.assertStore(store);
    const rows = this.state.stores[store];
    return structuredClone(includeDeleted ? rows : rows.filter((row) => !row.deleted_at));
  }

  get(store, id) {
    this.assertStore(store);
    const row = this.state.stores[store].find((item) => item.id === id);
    return row ? structuredClone(row) : null;
  }

  findIn(draft, store, id) {
    return draft.stores[store].find((item) => item.id === id) || null;
  }

  normalize(row, existing, options = {}) {
    const stamp = now();
    const yearId = row.school_year_id || row.academic_year_id || null;
    return {
      ...row,
      id: row.id || randomUUID(),
      school_profile_id: row.school_profile_id || "thcs-local-profile-001",
      ...(yearId
        ? {
            school_year_id: row.school_year_id || yearId,
            academic_year_id: row.academic_year_id || yearId,
          }
        : {}),
      created_at: row.created_at || existing?.created_at || stamp,
      updated_at: options.preserveMetadata
        ? row.updated_at || existing?.updated_at || stamp
        : stamp,
      revision: options.preserveMetadata
        ? Number(row.revision || existing?.revision || 1)
        : Math.max(
            Number(existing?.revision || 0),
            options.resolveConflict ? Number(row.revision || 0) : 0,
          ) + 1,
      source: row.source || existing?.source || "node-server",
      device_id: row.device_id || existing?.device_id || "server",
      sync_status: options.preserveMetadata
        ? row.sync_status || existing?.sync_status || "synced"
        : "pending",
    };
  }

  assertWritable(draft, store, row, options) {
    const yearId = row.school_year_id || row.academic_year_id;
    if (
      !yearId ||
      options.allowArchivedYear ||
      [
        "school_years",
        "year_transition_logs",
        "audit_logs",
        "operation_journal",
        "internal_snapshots",
        "backup_records",
        "report_packages",
      ].includes(store)
    ) {
      return;
    }
    const year = this.findIn(draft, "school_years", yearId);
    if (year?.read_only || year?.status === "archived") {
      const error = new Error("Năm học đã đóng và đang ở chế độ chỉ đọc.");
      error.status = 409;
      throw error;
    }
  }

  putInto(draft, store, row, options = {}) {
    this.assertWritable(draft, store, row, options);
    const rows = draft.stores[store];
    const index = rows.findIndex((item) => item.id === row.id);
    const existing = index >= 0 ? rows[index] : null;
    if (
      existing &&
      Number.isFinite(Number(row.revision)) &&
      Number(row.revision) !== Number(existing.revision || 0) &&
      !options.preserveMetadata &&
      !options.resolveConflict
    ) {
      throw revisionConflict("Bản ghi đã thay đổi ở nơi khác; dữ liệu chưa được ghi đè.");
    }
    const record = this.normalize(row, existing, options);
    if (options.preserveMetadata && options.sync === false) {
      record.sync_status = row.sync_status || "synced";
    }
    if (index >= 0) rows[index] = record;
    else rows.push(record);

    const action = existing ? "update" : "create";
    if (options.audit !== false && store !== "audit_logs") {
      draft.stores.audit_logs.push(
        this.normalize(
          {
            id: randomUUID(),
            action,
            entity: store,
            entity_id: record.id,
            summary: record.name || record.title || record.code || record.class_name || "",
          },
          null,
          { preserveMetadata: true },
        ),
      );
    }
    if (options.journal !== false && store !== "operation_journal") {
      draft.stores.operation_journal.push(
        this.normalize(
          {
            id: randomUUID(),
            operation_id: randomUUID(),
            operation: action,
            entity: store,
            entity_id: record.id,
            status: "committed",
            committed_at: now(),
          },
          null,
          { preserveMetadata: true },
        ),
      );
    }
    if (options.sync !== false && !SYNC_EXCLUDED_STORES.has(store)) {
      draft.stores.sync_outbox.push({
        id: randomUUID(),
        operation_id: randomUUID(),
        entity_type: store,
        entity_id: record.id,
        action: record.deleted_at ? "delete" : action,
        base_revision: Number(existing?.revision || 0),
        new_revision: Number(record.revision || 1),
        payload: withoutBinary(record),
        device_id: record.device_id,
        school_profile_id: record.school_profile_id,
        academic_year_id: record.academic_year_id || record.school_year_id || null,
        status: "pending",
        attempts: 0,
        created_at: now(),
        updated_at: now(),
      });
    }
    return record;
  }

  put(store, row, options = {}) {
    this.assertStore(store);
    return this.mutate((draft) => structuredClone(this.putInto(draft, store, row, options)));
  }

  bulkPut(store, rows, options = {}) {
    this.assertStore(store);
    const ids = new Set();
    for (const row of rows) {
      if (row.id && ids.has(row.id)) {
        const error = new Error(`Lô dữ liệu có ID trùng (${row.id}).`);
        error.status = 400;
        throw error;
      }
      if (row.id) ids.add(row.id);
    }
    return this.mutate((draft) => {
      for (const row of rows) {
        this.putInto(draft, store, row, { ...options, audit: false, journal: false });
      }
      draft.stores.operation_journal.push(
        this.normalize(
          {
            id: randomUUID(),
            operation_id: randomUUID(),
            operation: "bulk_put",
            entity: store,
            item_count: rows.length,
            status: "committed",
            committed_at: now(),
          },
          null,
          { preserveMetadata: true },
        ),
      );
      return rows.length;
    });
  }

  remove(store, id, hard = false) {
    this.assertStore(store);
    return this.mutate((draft) => {
      const rows = draft.stores[store];
      const index = rows.findIndex((row) => row.id === id);
      if (index < 0) return null;
      if (hard || SYNC_EXCLUDED_STORES.has(store)) {
        rows.splice(index, 1);
        return true;
      }
      return structuredClone(
        this.putInto(draft, store, { ...rows[index], deleted_at: now() }),
      );
    });
  }

  clear(store) {
    this.assertStore(store);
    return this.mutate((draft) => {
      draft.stores[store] = [];
      return true;
    });
  }

  exportAll() {
    return {
      app: "Trợ lý Tổng phụ trách Đội TẠ UYÊN",
      version: "3.1.0-rc.1",
      schema: this.schema,
      exported_at: now(),
      data: structuredClone(this.state.stores),
    };
  }

  replaceAll(payload, options = {}) {
    if (!payload?.data || !Number.isInteger(payload.schema) || payload.schema > this.schema) {
      const error = new Error("Tệp sai định dạng hoặc dùng phiên bản dữ liệu mới hơn ứng dụng.");
      error.status = 400;
      throw error;
    }
    return this.mutate((draft) => {
      for (const store of STORES) {
        if (
          EXTERNAL_BACKUP_EXCLUDED_STORES.has(store) ||
          ["sync_outbox", "sync_conflicts"].includes(store) ||
          !Array.isArray(payload.data[store])
        ) {
          continue;
        }
        draft.stores[store] = payload.data[store].map((row) =>
          this.normalize(row, null, {
            preserveMetadata: options.sync === false,
            resolveConflict: options.sync !== false,
          }),
        );
      }
      if (options.sync !== false) {
        draft.stores.sync_outbox = [];
        for (const store of STORES) {
          if (SYNC_EXCLUDED_STORES.has(store)) continue;
          for (const row of draft.stores[store]) {
            row.sync_status = "pending";
            draft.stores.sync_outbox.push({
              id: randomUUID(),
              operation_id: randomUUID(),
              entity_type: store,
              entity_id: row.id,
              action: row.deleted_at ? "delete" : "upsert",
              base_revision: Math.max(0, Number(row.revision || 1) - 1),
              new_revision: Number(row.revision || 1),
              payload: withoutBinary(row),
              status: "pending",
              attempts: 0,
              created_at: now(),
              updated_at: now(),
            });
          }
        }
      }
      return true;
    });
  }
}
