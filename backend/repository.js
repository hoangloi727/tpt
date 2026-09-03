import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import {
  EXTERNAL_BACKUP_EXCLUDED_STORES,
  HARD_DELETE_STORES,
  STORES,
} from "./stores.js";

const now = () => new Date().toISOString();
const ALLOW_CLASS_DELETION = Symbol("allowClassDeletion");

const revisionConflict = (message) => {
  const error = new Error(message);
  error.name = "RevisionConflictError";
  error.status = 409;
  return error;
};

export class SqliteRepository {
  constructor(database, legacyFilePath, schema = 15) {
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
      if (this.previousSchema < this.schema) {
        if (this.previousSchema < 12)
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
              summary: `Đã xóa ${removedRecords} bản ghi điểm thử nghiệm và ${scoreAuditCount} bản ghi nhật ký kiểm tra điểm trước khi bật chức năng nhập điểm hằng ngày.`,
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
      const error = new Error(`Kho dữ liệu không xác định: ${store}`);
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

  assertDynamicCriterion(draft, store, row, existing = null) {
    if (store === "criteria_sets") {
      if (
        existing &&
        draft.stores.weekly_score_sheets.some(
          (sheet) =>
            sheet.school_profile_id === row.school_profile_id &&
            sheet.criteria_set_id === existing.id,
        )
      ) {
        const error = new Error("Không thể thay đổi bộ tiêu chí đã được sử dụng trong bảng thi đua tuần.");
        error.status = 409;
        throw error;
      }
      return;
    }
    if (store === "criteria") {
      const protectedSetIds = new Set(
        [row.criteria_set_id, existing?.criteria_set_id].filter(Boolean),
      );
      if (
        draft.stores.weekly_score_sheets.some(
          (sheet) =>
            sheet.school_profile_id === row.school_profile_id &&
            protectedSetIds.has(sheet.criteria_set_id),
        )
      ) {
        const error = new Error("Không thể thay đổi bộ tiêu chí đã được sử dụng trong bảng thi đua tuần.");
        error.status = 409;
        throw error;
      }
    }
    const groupedCriterion =
      store === "criteria" &&
      (Boolean(row.criteria_group_id) || Boolean(existing?.criteria_group_id));
    if (store !== "criteria_groups" && !groupedCriterion) return;

    const setId = row.criteria_set_id;
    const criteriaSet = this.findIn(
      draft,
      "criteria_sets",
      setId,
      row.school_profile_id,
    );
    if (!criteriaSet || criteriaSet.deleted_at) {
      const error = new Error("Nhóm tiêu chí và tiêu chí theo nhóm phải thuộc một bộ tiêu chí hợp lệ trong cùng trường.");
      error.status = 400;
      throw error;
    }
    const protectedSetIds = new Set(
      [setId, existing?.criteria_set_id].filter(Boolean),
    );
    if (
      draft.stores.weekly_score_sheets.some(
        (sheet) =>
          sheet.school_profile_id === row.school_profile_id &&
          protectedSetIds.has(sheet.criteria_set_id),
      )
    ) {
      const error = new Error("Không thể thay đổi bộ tiêu chí đã được sử dụng trong bảng thi đua tuần.");
      error.status = 409;
      throw error;
    }

    row.code = String(row.code || "").trim();
    row.name = String(row.name || "").trim();
    if (!row.code || !row.name) {
      const error = new Error("Mã và tên của nhóm tiêu chí hoặc tiêu chí không được để trống.");
      error.status = 400;
      throw error;
    }

    if (store === "criteria_groups") {
      const duplicate = !row.deleted_at && draft.stores.criteria_groups.find(
        (group) =>
          group.id !== row.id &&
          !group.deleted_at &&
          group.school_profile_id === row.school_profile_id &&
          group.criteria_set_id === setId &&
          String(group.code).toLowerCase() === row.code.toLowerCase(),
      );
      if (duplicate) {
        const error = new Error("Mã nhóm tiêu chí không được trùng trong cùng bộ tiêu chí.");
        error.status = 409;
        throw error;
      }
      return;
    }

    const groupId = row.criteria_group_id;
    const group = this.findIn(
      draft,
      "criteria_groups",
      groupId,
      row.school_profile_id,
    );
    if (
      !group ||
      group.deleted_at ||
      group.criteria_set_id !== setId
    ) {
      const error = new Error("Tiêu chí theo nhóm phải thuộc một nhóm tiêu chí trong cùng bộ tiêu chí và cùng trường.");
      error.status = 400;
      throw error;
    }
    if (typeof row.points !== "number" || !Number.isFinite(row.points)) {
      const error = new Error("Điểm của tiêu chí theo nhóm phải là một số hữu hạn.");
      error.status = 400;
      throw error;
    }
    const duplicate = !row.deleted_at && draft.stores.criteria.find(
      (criterion) =>
        criterion.id !== row.id &&
        !criterion.deleted_at &&
        criterion.school_profile_id === row.school_profile_id &&
        criterion.criteria_group_id === groupId &&
        String(criterion.code).toLowerCase() === row.code.toLowerCase(),
    );
    if (duplicate) {
      const error = new Error("Mã tiêu chí không được trùng trong cùng nhóm tiêu chí.");
      error.status = 409;
      throw error;
    }
  }

  assertClassGroup(draft, row) {
    row.name = String(row.name || "").trim();
    row.code = String(row.code || "").trim();
    if (!row.school_year_id) {
      const error = new Error("Nhóm lớp phải thuộc một năm học.");
      error.status = 400;
      throw error;
    }
    if (!row.name || row.name.length > 120) {
      const error = new Error("Tên nhóm lớp là bắt buộc và không được quá 120 ký tự.");
      error.status = 400;
      throw error;
    }
    if (row.code.length > 40) {
      const error = new Error("Mã nhóm lớp không được quá 40 ký tự.");
      error.status = 400;
      throw error;
    }
    if (!Array.isArray(row.class_ids)) {
      const error = new Error("Danh sách lớp của nhóm lớp không hợp lệ.");
      error.status = 400;
      throw error;
    }
    row.class_ids = [...new Set(row.class_ids.filter(Boolean))];
    if (row.deleted_at) return;

    const year = this.findIn(
      draft,
      "school_years",
      row.school_year_id,
      row.school_profile_id,
    );
    if (!year || year.deleted_at) {
      const error = new Error("Nhóm lớp phải thuộc một năm học hợp lệ trong cùng trường.");
      error.status = 400;
      throw error;
    }
    const invalidClass = row.class_ids.find((classId) => {
      const schoolClass = this.findIn(
        draft,
        "classes",
        classId,
        row.school_profile_id,
      );
      return (
        !schoolClass ||
        schoolClass.deleted_at ||
        (schoolClass.school_year_id || schoolClass.academic_year_id) !==
          row.school_year_id
      );
    });
    if (invalidClass) {
      const error = new Error("Nhóm lớp chứa lớp không tồn tại hoặc không thuộc cùng năm học.");
      error.status = 400;
      throw error;
    }

    const normalizedName = row.name.toLocaleLowerCase("vi"),
      normalizedCode = row.code.toLocaleLowerCase("vi"),
      duplicate = draft.stores.class_groups.find(
        (group) =>
          group.id !== row.id &&
          !group.deleted_at &&
          group.school_profile_id === row.school_profile_id &&
          group.school_year_id === row.school_year_id &&
          String(group.name || "").trim().toLocaleLowerCase("vi") ===
            normalizedName,
      );
    if (duplicate) {
      const error = new Error("Tên nhóm lớp đã tồn tại trong năm học này.");
      error.status = 409;
      throw error;
    }
    if (
      normalizedCode &&
      draft.stores.class_groups.some(
        (group) =>
          group.id !== row.id &&
          !group.deleted_at &&
          group.school_profile_id === row.school_profile_id &&
          group.school_year_id === row.school_year_id &&
          String(group.code || "").trim().toLocaleLowerCase("vi") ===
            normalizedCode,
      )
    ) {
      const error = new Error("Mã nhóm lớp đã tồn tại trong năm học này.");
      error.status = 409;
      throw error;
    }
    if (
      row.class_ids.length &&
      draft.stores.class_groups.some(
        (group) =>
          group.id !== row.id &&
          !group.deleted_at &&
          group.school_profile_id === row.school_profile_id &&
          group.school_year_id === row.school_year_id &&
          group.class_ids?.some((classId) => row.class_ids.includes(classId)),
      )
    ) {
      const error = new Error("Một hoặc nhiều lớp đã thuộc nhóm lớp khác trong năm học này.");
      error.status = 409;
      throw error;
    }
  }

  assertDailyScoreEntry(draft, row) {
    const yearId = row.school_year_id || row.academic_year_id,
      schoolClass = this.findIn(
        draft,
        "classes",
        row.class_id,
        row.school_profile_id,
      );
    if (
      !schoolClass ||
      schoolClass.deleted_at ||
      !yearId ||
      (schoolClass.school_year_id || schoolClass.academic_year_id) !== yearId
    ) {
      const error = new Error("Điểm thi đua phải thuộc một lớp tồn tại trong cùng năm học.");
      error.status = 400;
      throw error;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(row.entry_date || "")) {
      const error = new Error("Điểm thi đua hằng ngày phải có entry_date hợp lệ.");
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
      const error = new Error("entry_date của điểm thi đua phải là ngày từ thứ Hai đến thứ Sáu.");
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
      const error = new Error("entry_date của điểm thi đua phải thuộc tuần học tương ứng.");
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
      const error = new Error("Điểm thi đua hằng ngày phải có bảng thi đua tuần tương ứng.");
      error.status = 400;
      throw error;
    }
    if (["approved", "locked"].includes(sheet.status)) {
      const error = new Error("Bảng thi đua đã duyệt hoặc khóa và không thể sửa điểm.");
      error.status = 409;
      throw error;
    }
    const grouped = Boolean(row.criteria_group_id);
    if (grouped) {
      const group = this.findIn(
        draft,
        "criteria_groups",
        row.criteria_group_id,
        row.school_profile_id,
      );
      if (
        !group ||
        group.deleted_at ||
        group.active === false ||
        group.criteria_set_id !== sheet.criteria_set_id
      ) {
        const error = new Error("Nhóm tiêu chí phải thuộc bộ tiêu chí của bảng thi đua tuần.");
        error.status = 400;
        throw error;
      }
      if (!Array.isArray(row.incidents)) {
        const error = new Error("Điểm theo nhóm tiêu chí phải có mảng incidents.");
        error.status = 400;
        throw error;
      }
      if (!["value", "na", "exempt"].includes(row.entry_state)) {
        const error = new Error("entry_state của điểm phải là value, na hoặc exempt.");
        error.status = 400;
        throw error;
      }
      if (row.entry_state !== "value") {
        if (row.incidents.length) {
          const error = new Error("Điểm có trạng thái N/A hoặc exempt không được chứa sự việc trong incidents.");
          error.status = 400;
          throw error;
        }
        row.value = null;
      } else {
        const incidentIds = new Set();
        row.incidents = row.incidents.map((incident) => {
          const incidentId = String(incident?.id || "").trim();
          if (!incidentId || incidentIds.has(incidentId)) {
            const error = new Error("Mỗi sự việc trong incidents phải có ID duy nhất.");
            error.status = 400;
            throw error;
          }
          incidentIds.add(incidentId);
          const personName = String(incident.person_name || "").trim();
          if (!personName || personName.length > 120) {
            const error = new Error("person_name của mỗi sự việc là bắt buộc và không được quá 120 ký tự.");
            error.status = 400;
            throw error;
          }
          const criterion = this.findIn(
            draft,
            "criteria",
            incident.criteria_id,
            row.school_profile_id,
          );
          if (
            !criterion ||
            criterion.deleted_at ||
            criterion.active === false ||
            typeof criterion.points !== "number" ||
            !Number.isFinite(criterion.points) ||
            criterion.criteria_group_id !== row.criteria_group_id ||
            criterion.criteria_set_id !== sheet.criteria_set_id
          ) {
            const error = new Error("Mỗi sự việc phải tham chiếu đến một quy định đang hoạt động trong nhóm tiêu chí.");
            error.status = 400;
            throw error;
          }
          if (incident.points !== criterion.points) {
            const error = new Error("Điểm được lưu trong mỗi sự việc phải khớp với điểm hiện tại của quy định.");
            error.status = 400;
            throw error;
          }
          return {
            ...incident,
            id: incidentId,
            person_name: personName,
            rule_code: criterion.code,
            rule_name: criterion.name,
            points: criterion.points,
          };
        });
        row.value = row.incidents.reduce(
          (total, incident) => total + incident.points,
          0,
        );
      }
    } else {
      const criterion = this.findIn(
        draft,
        "criteria",
        row.criteria_id,
        row.school_profile_id,
      );
      if (
        !criterion ||
        criterion.deleted_at ||
        criterion.active === false ||
        criterion.criteria_group_id ||
        criterion.criteria_set_id !== sheet.criteria_set_id
      ) {
        const error = new Error("Tiêu chí chấm điểm phải thuộc bộ tiêu chí của bảng thi đua tuần.");
        error.status = 400;
        throw error;
      }
      if (!["value", "na", "exempt"].includes(row.entry_state)) {
        const error = new Error("entry_state của điểm phải là value, na hoặc exempt.");
        error.status = 400;
        throw error;
      }
      if (row.entry_state !== "value") row.value = null;
      else {
        const value = Number(row.value);
        if (
          !Number.isFinite(value) ||
          (criterion.data_type === "boolean" && ![0, 1].includes(value)) ||
          (criterion.min !== undefined && value < Number(criterion.min)) ||
          (criterion.max !== undefined && value > Number(criterion.max))
        ) {
          const error = new Error("Giá trị điểm không hợp lệ đối với tiêu chí này.");
          error.status = 400;
          throw error;
        }
        row.value = value;
      }
    }
    const duplicate = draft.stores.score_entries.find(
      (entry) =>
        entry.id !== row.id &&
        entry.school_profile_id === row.school_profile_id &&
        !entry.deleted_at &&
        entry.sheet_id === row.sheet_id &&
        entry.entry_date === row.entry_date &&
        entry.class_id === row.class_id &&
        (grouped
          ? Boolean(entry.criteria_group_id) &&
            entry.criteria_group_id === row.criteria_group_id
          : !entry.criteria_group_id && entry.criteria_id === row.criteria_id),
    );
    if (duplicate) {
      const error = new Error("Đã có điểm cho lớp, tiêu chí và ngày này.");
      error.status = 409;
      throw error;
    }
  }

  assertScoreGraderAssignment(draft, row) {
    if (
      !row.user_id ||
      !row.school_year_id ||
      !Array.isArray(row.class_ids)
    ) {
      const error = new Error("Phân công chấm điểm thiếu người dùng, năm học hoặc danh sách lớp.");
      error.status = 400;
      throw error;
    }
    row.class_ids = [...new Set(row.class_ids.filter(Boolean))];
    if (row.deleted_at) return;
    const duplicate = draft.stores.score_grader_assignments.find(
      (assignment) =>
        assignment.id !== row.id &&
        !assignment.deleted_at &&
        assignment.school_profile_id === row.school_profile_id &&
        assignment.school_year_id === row.school_year_id &&
        assignment.user_id === row.user_id,
    );
    if (duplicate) {
      const error = new Error("Người dùng đã có phân công trong năm học này.");
      error.status = 409;
      throw error;
    }
    const assignedElsewhere = draft.stores.score_grader_assignments.find(
      (assignment) =>
        assignment.id !== row.id &&
        !assignment.deleted_at &&
        assignment.school_profile_id === row.school_profile_id &&
        assignment.school_year_id === row.school_year_id &&
        assignment.class_ids?.some((classId) => row.class_ids.includes(classId)),
    );
    if (assignedElsewhere) {
      const error = new Error("Một hoặc nhiều lớp đã được phân công cho người dùng khác.");
      error.status = 409;
      throw error;
    }
    const invalidClass = row.class_ids.find((classId) => {
      const schoolClass = this.findIn(
        draft,
        "classes",
        classId,
        row.school_profile_id,
      );
      return (
        !schoolClass ||
        schoolClass.deleted_at ||
        (schoolClass.school_year_id || schoolClass.academic_year_id) !==
          row.school_year_id
      );
    });
    if (invalidClass) {
      const error = new Error("Phân công chứa lớp không thuộc năm học hiện tại.");
      error.status = 400;
      throw error;
    }
  }

  putInto(draft, store, row, options = {}) {
    if (options.schoolId)
      row = { ...row, school_profile_id: options.schoolId };
    const current = row.id
      ? this.findIn(draft, store, row.id, options.schoolId || null)
      : null;
    if (
      store === "classes" &&
      row.deleted_at &&
      !current?.deleted_at &&
      !options[ALLOW_CLASS_DELETION] &&
      (current || !options.preserveMetadata)
    ) {
      const error = new Error("Hãy dùng thao tác xóa lớp để kiểm tra và bảo vệ dữ liệu lịch sử.");
      error.status = 400;
      throw error;
    }
    this.assertWritable(draft, store, row, options);
    this.assertDynamicCriterion(draft, store, row, current);
    if (store === "class_groups") this.assertClassGroup(draft, row);
    if (store === "score_grader_assignments")
      this.assertScoreGraderAssignment(draft, row);
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
            reason: options.reason || undefined,
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
            reason: options.reason || undefined,
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
            reason: options.reason || undefined,
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
      if (store === "score_entries") {
        const entry = rows[index],
          sheet = this.findIn(
            draft,
            "weekly_score_sheets",
            entry.sheet_id,
            entry.school_profile_id,
          );
        if (["approved", "locked"].includes(sheet?.status)) {
          const error = new Error(
            "Bảng thi đua đã duyệt hoặc khóa và không thể xóa điểm.",
          );
          error.status = 409;
          throw error;
        }
      }
      if (store === "classes") {
        const schoolClass = rows[index],
          schoolId = schoolClass.school_profile_id,
          hasScoreHistory = draft.stores.score_entries.some(
            (entry) =>
              entry.school_profile_id === schoolId && entry.class_id === id,
          ),
          hasRankingHistory = draft.stores.ranking_snapshots.some(
            (snapshot) =>
              snapshot.school_profile_id === schoolId &&
              Array.isArray(snapshot.rows) &&
              snapshot.rows.some(
                (rankingRow) =>
                  rankingRow?.id === id || rankingRow?.class_id === id,
              ),
          );
        if (hasScoreHistory || hasRankingHistory) {
          const error = new Error(
            "Lớp đã có dữ liệu điểm hoặc xếp hạng lịch sử. Quản trị viên hãy ngừng kích hoạt lớp thay vì xóa.",
          );
          error.status = 409;
          throw error;
        }
        for (const assignment of draft.stores.score_grader_assignments.filter(
          (row) =>
            row.school_profile_id === schoolId && row.class_ids?.includes(id),
        ))
          this.putInto(
            draft,
            "score_grader_assignments",
            {
              ...assignment,
              class_ids: assignment.class_ids.filter((classId) => classId !== id),
            },
            { ...options, schoolId, allowArchivedYear: true },
          );
        for (const group of draft.stores.class_groups.filter(
          (row) =>
            row.school_profile_id === schoolId && row.class_ids?.includes(id),
        ))
          this.putInto(
            draft,
            "class_groups",
            {
              ...group,
              class_ids: group.class_ids.filter((classId) => classId !== id),
            },
            { ...options, schoolId, allowArchivedYear: true },
          );
        const activityClasses = draft.stores.activity_classes.filter(
          (row) => row.school_profile_id === schoolId && row.class_id === id,
        );
        if (hard) {
          const activityClassIds = new Set(activityClasses.map((row) => row.id));
          draft.stores.activity_classes = draft.stores.activity_classes.filter(
            (row) =>
              row.school_profile_id !== schoolId ||
              !activityClassIds.has(row.id),
          );
        } else {
          for (const activityClass of activityClasses.filter(
            (row) => !row.deleted_at,
          ))
            this.putInto(
              draft,
              "activity_classes",
              { ...activityClass, deleted_at: now() },
              { ...options, schoolId, allowArchivedYear: true },
            );
        }
      }
      if (hard || HARD_DELETE_STORES.has(store)) {
        if (["criteria_sets", "criteria_groups", "criteria"].includes(store))
          this.assertDynamicCriterion(
            draft,
            store,
            { ...rows[index], deleted_at: now() },
            rows[index],
          );
        rows.splice(index, 1);
        return true;
      }
      return structuredClone(
        this.putInto(
          draft,
          store,
          { ...rows[index], deleted_at: now() },
          { ...options, [ALLOW_CLASS_DELETION]: store === "classes" },
        ),
      );
    });
  }

  clear(store, schoolId = null) {
    this.assertStore(store);
    return this.mutate((draft) => {
      if (store === "classes") {
        const classIds = new Set(
          draft.stores.classes
            .filter((row) => !schoolId || row.school_profile_id === schoolId)
            .map((row) => row.id),
        );
        const hasHistory =
          draft.stores.score_entries.some(
            (entry) =>
              (!schoolId || entry.school_profile_id === schoolId) &&
              classIds.has(entry.class_id),
          ) ||
          draft.stores.ranking_snapshots.some(
            (snapshot) =>
              (!schoolId || snapshot.school_profile_id === schoolId) &&
              snapshot.rows?.some((row) =>
                classIds.has(row?.id || row?.class_id),
              ),
          );
        if (hasHistory) {
          const error = new Error(
            "Không thể xóa toàn bộ lớp khi còn dữ liệu điểm hoặc xếp hạng lịch sử.",
          );
          error.status = 409;
          throw error;
        }
        for (const relationStore of [
          "score_grader_assignments",
          "class_groups",
        ])
          for (const row of draft.stores[relationStore])
            if (!schoolId || row.school_profile_id === schoolId)
              row.class_ids = (row.class_ids || []).filter(
                (classId) => !classIds.has(classId),
              );
        draft.stores.activity_classes = draft.stores.activity_classes.filter(
          (row) =>
            (schoolId && row.school_profile_id !== schoolId) ||
            !classIds.has(row.class_id),
        );
      }
      if (
        ["criteria_sets", "criteria_groups", "criteria"].includes(store) &&
        draft.stores.weekly_score_sheets.some(
          (sheet) => !schoolId || sheet.school_profile_id === schoolId,
        )
      ) {
        const error = new Error("Không thể xóa các bộ tiêu chí đã được sử dụng trong bảng thi đua tuần.");
        error.status = 409;
        throw error;
      }
      draft.stores[store] = schoolId
        ? draft.stores[store].filter(
            (row) => row.school_profile_id !== schoolId,
          )
        : [];
      return true;
    });
  }

  removeScoreSheetsFromDraft(draft, sheetIds, schoolId) {
    const ids = new Set(sheetIds);
    const entryIds = new Set(
      draft.stores.score_entries
        .filter(
          (row) => row.school_profile_id === schoolId && ids.has(row.sheet_id),
        )
        .map((row) => row.id),
    );
    const counts = {
      sheets: ids.size,
      entries: entryIds.size,
      snapshots: 0,
      evidence: 0,
    };
    draft.stores.weekly_score_sheets = draft.stores.weekly_score_sheets.filter(
      (row) => row.school_profile_id !== schoolId || !ids.has(row.id),
    );
    draft.stores.score_entries = draft.stores.score_entries.filter(
      (row) => row.school_profile_id !== schoolId || !ids.has(row.sheet_id),
    );
    draft.stores.ranking_snapshots = draft.stores.ranking_snapshots.filter(
      (row) => {
        const remove = row.school_profile_id === schoolId && ids.has(row.sheet_id);
        if (remove) counts.snapshots++;
        return !remove;
      },
    );
    draft.stores.score_evidence = draft.stores.score_evidence.filter((row) => {
      const remove = row.school_profile_id === schoolId && entryIds.has(row.entry_id);
      if (remove) counts.evidence++;
      return !remove;
    });
    return counts;
  }

  deleteWeeklyScoreSheet(sheetId, schoolId, actorId) {
    return this.mutate((draft) => {
      const sheet = draft.stores.weekly_score_sheets.find(
        (row) => row.id === sheetId && row.school_profile_id === schoolId,
      );
      if (!sheet) {
        const error = new Error("Không tìm thấy bảng thi đua tuần.");
        error.status = 404;
        throw error;
      }
      const counts = this.removeScoreSheetsFromDraft(draft, [sheet.id], schoolId);
      draft.stores.audit_logs.push(
        this.normalize(
          {
            id: randomUUID(),
            action: "score_sheet_delete",
            entity: "weekly_score_sheets",
            entity_id: sheet.id,
            summary: `Xóa bảng tuần ${sheet.week_id}: ${counts.entries} dòng điểm, ${counts.snapshots} snapshot xếp hạng.`,
            reason: `Người thực hiện: ${actorId}; trạng thái trước khi xóa: ${sheet.status || "draft"}.`,
          },
          null,
          { preserveMetadata: true, schoolId },
        ),
      );
      return { sheet: { id: sheet.id, week_id: sheet.week_id, status: sheet.status }, ...counts };
    });
  }

  forceDeleteCriteriaSet(criteriaSetId, schoolId, actorId) {
    return this.mutate((draft) => {
      const criteriaSet = draft.stores.criteria_sets.find(
        (row) => row.id === criteriaSetId && row.school_profile_id === schoolId,
      );
      if (!criteriaSet) {
        const error = new Error("Không tìm thấy bộ tiêu chí.");
        error.status = 404;
        throw error;
      }
      const sheetIds = draft.stores.weekly_score_sheets
        .filter(
          (row) =>
            row.school_profile_id === schoolId &&
            row.criteria_set_id === criteriaSet.id,
        )
        .map((row) => row.id);
      const groupIds = new Set(
        draft.stores.criteria_groups
          .filter(
            (row) =>
              row.school_profile_id === schoolId &&
              row.criteria_set_id === criteriaSet.id,
          )
          .map((row) => row.id),
      );
      const criteriaCount = draft.stores.criteria.filter(
        (row) =>
          row.school_profile_id === schoolId && row.criteria_set_id === criteriaSet.id,
      ).length;
      const scoreCounts = this.removeScoreSheetsFromDraft(draft, sheetIds, schoolId);
      draft.stores.criteria = draft.stores.criteria.filter(
        (row) =>
          row.school_profile_id !== schoolId || row.criteria_set_id !== criteriaSet.id,
      );
      draft.stores.criteria_groups = draft.stores.criteria_groups.filter(
        (row) => !groupIds.has(row.id) || row.school_profile_id !== schoolId,
      );
      draft.stores.score_component_versions = draft.stores.score_component_versions.filter(
        (row) =>
          row.school_profile_id !== schoolId || row.criteria_set_id !== criteriaSet.id,
      );
      draft.stores.criteria_sets = draft.stores.criteria_sets.filter(
        (row) => row.id !== criteriaSet.id || row.school_profile_id !== schoolId,
      );
      draft.stores.audit_logs.push(
        this.normalize(
          {
            id: randomUUID(),
            action: "criteria_set_force_delete",
            entity: "criteria_sets",
            entity_id: criteriaSet.id,
            summary: `Xóa bộ tiêu chí ${criteriaSet.name || criteriaSet.id}: ${scoreCounts.sheets} bảng tuần, ${scoreCounts.entries} dòng điểm, ${scoreCounts.snapshots} snapshot.`,
            reason: `Người thực hiện: ${actorId}; xóa cưỡng bức dữ liệu liên quan.`,
          },
          null,
          { preserveMetadata: true, schoolId },
        ),
      );
      return {
        criteria_set: { id: criteriaSet.id, name: criteriaSet.name || "" },
        criteria_groups: groupIds.size,
        criteria: criteriaCount,
        ...scoreCounts,
      };
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

  mergeAll(payload, options = {}) {
    if (!payload?.data || !Number.isInteger(payload.schema) || payload.schema > this.schema) {
      const error = new Error("Tệp sai định dạng hoặc dùng phiên bản dữ liệu mới hơn ứng dụng.");
      error.status = 400;
      throw error;
    }
    return this.mutate((draft) => {
      const schoolId = options.schoolId || null,
        stats = { inserted: 0, updated: 0, kept_current: 0, stores: {} },
        legacyScoreStores = new Set([
          "score_entries",
          "score_evidence",
          "weekly_score_sheets",
          "ranking_snapshots",
        ]);
      for (const store of STORES) {
        if (
          EXTERNAL_BACKUP_EXCLUDED_STORES.has(store) ||
          !Array.isArray(payload.data[store]) ||
          (payload.schema < 10 && legacyScoreStores.has(store))
        )
          continue;
        const current = new Map(
            draft.stores[store]
              .filter((row) => !schoolId || row.school_profile_id === schoolId)
              .map((row) => [row.id, row]),
          ),
          local = { inserted: 0, updated: 0, kept_current: 0 };
        for (const incoming of payload.data[store]) {
          const existing = current.get(incoming.id),
            newer =
              !existing ||
              Number(incoming.revision || 0) > Number(existing.revision || 0) ||
              (Number(incoming.revision || 0) === Number(existing.revision || 0) &&
                Date.parse(incoming.updated_at || 0) >
                  Date.parse(existing.updated_at || 0));
          if (!newer) {
            local.kept_current++;
            stats.kept_current++;
            continue;
          }
          this.putInto(draft, store, incoming, {
            schoolId,
            preserveMetadata: true,
            allowArchivedYear: true,
            audit: false,
            journal: false,
          });
          const key = existing ? "updated" : "inserted";
          local[key]++;
          stats[key]++;
        }
        stats.stores[store] = local;
      }
      draft.stores.operation_journal.push(
        this.normalize(
          {
            id: randomUUID(),
            operation_id: randomUUID(),
            operation: "merge_import",
            entity: "external_backup",
            item_count: stats.inserted + stats.updated,
            status: "committed",
            committed_at: now(),
          },
          null,
          { preserveMetadata: true, schoolId },
        ),
      );
      return stats;
    });
  }

  normalizeEnhancedData(schoolId) {
    return this.mutate((draft) => {
      let count = 0;
      const excluded = new Set([
        "internal_snapshots",
        "operation_journal",
        "form_drafts",
        "restore_staging",
      ]);
      for (const store of STORES) {
        if (excluded.has(store)) continue;
        for (let index = 0; index < draft.stores[store].length; index++) {
          const row = draft.stores[store][index];
          if (schoolId && row.school_profile_id !== schoolId) continue;
          const yearId = row.school_year_id || row.academic_year_id;
          if (
            row.school_profile_id &&
            (!yearId || (row.school_year_id && row.academic_year_id)) &&
            row.created_at &&
            row.updated_at &&
            Number(row.revision) &&
            row.device_id
          )
            continue;
          draft.stores[store][index] = this.normalize(
            {
              ...row,
              school_profile_id: row.school_profile_id || schoolId,
              ...(yearId
                ? { school_year_id: yearId, academic_year_id: yearId }
                : {}),
              created_at: row.created_at || row.updated_at || now(),
              updated_at: row.updated_at || row.created_at || now(),
              revision: Number(row.revision || 1),
              source: row.source || "migration-v8",
            },
            row,
            { preserveMetadata: true, schoolId },
          );
          count++;
        }
      }
      return count;
    });
  }
}
