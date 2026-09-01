import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import {
  EXTERNAL_BACKUP_EXCLUDED_STORES,
  HARD_DELETE_STORES,
  STORES,
} from "./stores.js";

const now = () => new Date().toISOString();

const revisionConflict = (message) => {
  const error = new Error(message);
  error.name = "RevisionConflictError";
  error.status = 409;
  return error;
};

export class SqliteRepository {
  constructor(database, legacyFilePath, schema = 12) {
    this.database = database;
    this.legacyFilePath = legacyFilePath;
    this.schema = schema;
    this.previousSchema = schema;
    this.state = null;
    this.queue = Promise.resolve();
  }

  async open() {
    if (this.database.metadata("business_initialized") === "true") {
      this.previousSchema = Number(
        this.database.metadata("business_schema") || this.schema,
      );
      this.state = {
        schema: this.schema,
        stores: this.database.loadRecords(STORES),
      };
      if (this.previousSchema < 12) {
        for (const rows of Object.values(this.state.stores))
          for (const row of rows) delete row.sync_status;
        await this.persist(this.state, { business_schema: this.schema });
      }
      return this;
    }
    let stored = null;
    try {
      stored = JSON.parse(await readFile(this.legacyFilePath, "utf8"));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    if (stored) {
      this.previousSchema = Number(stored.schema || this.schema);
      this.state = {
        schema: this.schema,
        stores: Object.fromEntries(
          STORES.map((store) => [store, Array.isArray(stored.stores?.[store]) ? stored.stores[store] : []]),
        ),
      };
      if (this.previousSchema < 10) {
        const scoreStores = [
          "score_entries",
          "score_evidence",
          "weekly_score_sheets",
          "ranking_snapshots",
        ];
        const removedRecords = scoreStores.reduce(
          (total, store) => total + this.state.stores[store].length,
          0,
        );
        for (const store of scoreStores) this.state.stores[store] = [];
        const scoreAuditCount = this.state.stores.audit_logs.filter((row) =>
          scoreStores.includes(row.entity),
        ).length;
        this.state.stores.audit_logs = this.state.stores.audit_logs.filter(
          (row) => !scoreStores.includes(row.entity),
        );
        this.state.stores.migration_logs.push(
          this.normalize(
            {
              id: randomUUID(),
              from_schema: this.previousSchema,
              to_schema: this.schema,
              status: "success",
              removed_records: removedRecords + scoreAuditCount,
              summary: `Cleared ${removedRecords} test score records and ${scoreAuditCount} score audit records before enabling daily score entry.`,
              source: "migration-v10",
            },
            null,
            { preserveMetadata: true },
          ),
        );
      }
    } else {
      this.state = {
        schema: this.schema,
        stores: Object.fromEntries(STORES.map((store) => [store, []])),
      };
    }
    for (const rows of Object.values(this.state.stores))
      for (const row of rows) {
        delete row.sync_status;
        row.school_profile_id =
          row.school_profile_id || "thcs-local-profile-001";
      }
    if (stored && !this.state.stores.schools.length) {
      const recoveredSchoolId =
        Object.values(this.state.stores)
          .flat()
          .find((row) => row.school_profile_id)?.school_profile_id ||
        "thcs-local-profile-001";
      this.state.stores.schools.push({
        id: "school-main",
        school_profile_id: recoveredSchoolId,
        name: "TRƯỜNG (CHƯA CẤU HÌNH)",
        created_at: now(),
        updated_at: now(),
        revision: 1,
        source: "legacy-school-recovery",
        device_id: "server",
      });
    }
    await this.persist(this.state, {
      business_initialized: true,
      business_schema: this.schema,
      legacy_business_imported_at: stored ? now() : "none",
      legacy_business_record_count: Object.values(this.state.stores).reduce(
        (total, rows) => total + rows.length,
        0,
      ),
    });
    const importedCount = Object.values(
      this.database.loadRecords(STORES),
    ).reduce((total, rows) => total + rows.length, 0);
    const expectedCount = Object.values(this.state.stores).reduce(
      (total, rows) => total + rows.length,
      0,
    );
    if (importedCount !== expectedCount)
      throw new Error("SQLite business-data migration verification failed.");
    return this;
  }

  assertStore(store) {
    if (!STORES.includes(store)) {
      const error = new Error(`Unknown store: ${store}`);
      error.status = 404;
      throw error;
    }
  }

  persist(state, metadata = { business_schema: this.schema }) {
    return this.database.replaceRecords(state, metadata);
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

  all(store, includeDeleted = false, schoolId = null) {
    this.assertStore(store);
    const rows = this.state.stores[store].filter(
      (row) => !schoolId || row.school_profile_id === schoolId,
    );
    return structuredClone(includeDeleted ? rows : rows.filter((row) => !row.deleted_at));
  }

  get(store, id, schoolId = null) {
    this.assertStore(store);
    const row = this.state.stores[store].find(
      (item) =>
        item.id === id &&
        (!schoolId || item.school_profile_id === schoolId),
    );
    return row ? structuredClone(row) : null;
  }

  listSchools() {
    return this.all("schools")
      .map((school) => ({
        id: school.school_profile_id,
        name: school.name || "Trường chưa đặt tên",
      }))
      .sort((a, b) => a.name.localeCompare(b.name, "vi"));
  }

  school(id) {
    return this.listSchools().find((school) => school.id === id) || null;
  }

  defaultSchoolId() {
    return this.listSchools()[0]?.id || "thcs-local-profile-001";
  }

  async ensureSchool(name) {
    const existing = this.listSchools()[0];
    if (existing) return existing;
    return this.createSchool(name, "thcs-local-profile-001");
  }

  async createSchool(name, requestedId = "") {
    const schoolName = String(name || "").trim().slice(0, 200);
    if (!schoolName) {
      const error = new Error("Tên trường không được để trống.");
      error.status = 400;
      throw error;
    }
    if (
      this.listSchools().some(
        (school) =>
          school.name.localeCompare(schoolName, "vi", {
            sensitivity: "base",
          }) === 0,
      )
    ) {
      const error = new Error("Tên trường đã tồn tại.");
      error.status = 409;
      throw error;
    }
    const schoolId = requestedId || `school-${randomUUID()}`;
    await this.put(
      "schools",
      { id: schoolId, name: schoolName },
      { schoolId, audit: false, journal: false },
    );
    return this.school(schoolId);
  }

  findIn(draft, store, id, schoolId = null) {
    return (
      draft.stores[store].find(
        (item) =>
          item.id === id &&
          (!schoolId || item.school_profile_id === schoolId),
      ) || null
    );
  }

  normalize(row, existing, options = {}) {
    const stamp = now();
    const { sync_status: _syncStatus, ...cleanRow } = row,
      yearId = row.school_year_id || row.academic_year_id || null;
    return {
      ...cleanRow,
      id: row.id || randomUUID(),
      school_profile_id:
        options.schoolId ||
        row.school_profile_id ||
        existing?.school_profile_id ||
        "thcs-local-profile-001",
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
    const year = this.findIn(
      draft,
      "school_years",
      yearId,
      row.school_profile_id,
    );
    if (year?.read_only || year?.status === "archived") {
      const error = new Error("Năm học đã đóng và đang ở chế độ chỉ đọc.");
      error.status = 409;
      throw error;
    }
  }

  assertDailyScoreEntry(draft, row) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(row.entry_date || "")) {
      const error = new Error("Daily score entries require a valid entry_date.");
      error.status = 400;
      throw error;
    }
    const date = new Date(`${row.entry_date}T00:00:00Z`);
    if (
      Number.isNaN(date.getTime()) ||
      date.toISOString().slice(0, 10) !== row.entry_date ||
      date.getUTCDay() === 0 ||
      date.getUTCDay() === 6
    ) {
      const error = new Error("Score entry_date must be a Monday-Friday date.");
      error.status = 400;
      throw error;
    }
    const week = this.findIn(
      draft,
      "school_weeks",
      row.week_id,
      row.school_profile_id,
    );
    if (
      !week ||
      row.entry_date < week.start_date ||
      row.entry_date > week.end_date
    ) {
      const error = new Error("Score entry_date must belong to its school week.");
      error.status = 400;
      throw error;
    }
    const sheet = this.findIn(
      draft,
      "weekly_score_sheets",
      row.sheet_id,
      row.school_profile_id,
    );
    if (!sheet || sheet.week_id !== row.week_id) {
      const error = new Error("Daily score entries require a matching weekly sheet.");
      error.status = 400;
      throw error;
    }
    if (sheet.status === "locked") {
      const error = new Error("Bảng thi đua đã khóa và không thể sửa điểm.");
      error.status = 409;
      throw error;
    }
    const duplicate = draft.stores.score_entries.find(
      (entry) =>
        entry.id !== row.id &&
        entry.school_profile_id === row.school_profile_id &&
        !entry.deleted_at &&
        entry.sheet_id === row.sheet_id &&
        entry.entry_date === row.entry_date &&
        entry.class_id === row.class_id &&
        entry.criteria_id === row.criteria_id,
    );
    if (duplicate) {
      const error = new Error("A score already exists for this class, criterion, and date.");
      error.status = 409;
      throw error;
    }
  }

  putInto(draft, store, row, options = {}) {
    if (options.schoolId)
      row = { ...row, school_profile_id: options.schoolId };
    this.assertWritable(draft, store, row, options);
    if (store === "score_entries") this.assertDailyScoreEntry(draft, row);
    const rows = draft.stores[store];
    if (store === "schools" && options.schoolId) {
      const tenantSchool = rows.find(
        (item) => item.school_profile_id === options.schoolId,
      );
      if (tenantSchool) row = { ...row, id: tenantSchool.id };
    }
    const index = rows.findIndex(
      (item) =>
        item.id === row.id &&
        (!options.schoolId || item.school_profile_id === options.schoolId),
    );
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
          { preserveMetadata: true, schoolId: record.school_profile_id },
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
          { preserveMetadata: true, schoolId: record.school_profile_id },
        ),
      );
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
          {
            preserveMetadata: true,
            schoolId: options.schoolId || rows[0]?.school_profile_id,
          },
        ),
      );
      return rows.length;
    });
  }

  remove(store, id, hard = false, options = {}) {
    this.assertStore(store);
    return this.mutate((draft) => {
      const rows = draft.stores[store];
      const index = rows.findIndex(
        (row) =>
          row.id === id &&
          (!options.schoolId || row.school_profile_id === options.schoolId),
      );
      if (index < 0) return null;
      if (
        options.schoolId &&
        rows[index].school_profile_id !== options.schoolId
      )
        return null;
      if (hard || HARD_DELETE_STORES.has(store)) {
        rows.splice(index, 1);
        return true;
      }
      return structuredClone(
        this.putInto(
          draft,
          store,
          { ...rows[index], deleted_at: now() },
          options,
        ),
      );
    });
  }

  clear(store, schoolId = null) {
    this.assertStore(store);
    return this.mutate((draft) => {
      draft.stores[store] = schoolId
        ? draft.stores[store].filter(
            (row) => row.school_profile_id !== schoolId,
          )
        : [];
      return true;
    });
  }

  exportAll(schoolId = null) {
    const data = Object.fromEntries(
      STORES.map((store) => [
        store,
        this.all(store, true, schoolId),
      ]),
    );
    return {
      app: "Trợ lý Tổng phụ trách Đội",
      version: "3.1.0-rc.1",
      schema: this.schema,
      exported_at: now(),
      school_profile_id: schoolId,
      data,
    };
  }

  replaceAll(payload, options = {}) {
    if (!payload?.data || !Number.isInteger(payload.schema) || payload.schema > this.schema) {
      const error = new Error("Tệp sai định dạng hoặc dùng phiên bản dữ liệu mới hơn ứng dụng.");
      error.status = 400;
      throw error;
    }
    return this.mutate((draft) => {
      const schoolId = options.schoolId || null;
      for (const store of STORES) {
        if (
          EXTERNAL_BACKUP_EXCLUDED_STORES.has(store) ||
          !Array.isArray(payload.data[store])
        ) {
          continue;
        }
        if (store === "schools" && schoolId) {
          const current = draft.stores.schools.find(
              (row) => row.school_profile_id === schoolId,
            ),
            source = payload.data.schools[0];
          if (current && source) {
            const restored = this.normalize(
              { ...source, id: current.id, school_profile_id: schoolId },
              current,
              {
                preserveMetadata: options.preserveMetadata === true,
                resolveConflict: options.resolveConflict !== false,
                schoolId,
              },
            );
            draft.stores.schools = [
              ...draft.stores.schools.filter(
                (row) => row.school_profile_id !== schoolId,
              ),
              restored,
            ];
          }
          continue;
        }
        const rows =
          payload.schema < 10 &&
          [
            "score_entries",
            "score_evidence",
            "weekly_score_sheets",
            "ranking_snapshots",
          ].includes(store)
            ? []
            : payload.data[store];
        const incoming = rows.map((row) =>
          this.normalize(row, null, {
            preserveMetadata: options.preserveMetadata === true,
            resolveConflict: options.resolveConflict !== false,
            schoolId,
          }),
        );
        draft.stores[store] = schoolId
          ? [
              ...draft.stores[store].filter(
                (row) => row.school_profile_id !== schoolId,
              ),
              ...incoming,
            ]
          : incoming;
      }
      return true;
    });
  }
}
