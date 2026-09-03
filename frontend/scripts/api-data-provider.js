(function exposeApiDataProvider(global) {
  "use strict";

  const encodeBinary = async (value) => {
    if (value instanceof Blob) {
      const bytes = new Uint8Array(await value.arrayBuffer());
      let binary = "";
      for (let offset = 0; offset < bytes.length; offset += 32768) {
        binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
      }
      return {
        __type: "Blob",
        type: value.type || "application/octet-stream",
        name: value.name || "",
        data: btoa(binary),
      };
    }
    if (Array.isArray(value)) return Promise.all(value.map(encodeBinary));
    if (value && typeof value === "object") {
      if (typeof FileSystemHandle !== "undefined" && value instanceof FileSystemHandle) {
        return null;
      }
      const entries = await Promise.all(
        Object.entries(value).map(async ([key, item]) => [key, await encodeBinary(item)]),
      );
      return Object.fromEntries(entries);
    }
    return value;
  };

  const decodeBinary = (value) => {
    if (value?.__type === "Blob" && typeof value.data === "string") {
      const binary = atob(value.data);
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index++) {
        bytes[index] = binary.charCodeAt(index);
      }
      return new Blob([bytes], { type: value.type || "application/octet-stream" });
    }
    if (Array.isArray(value)) return value.map(decodeBinary);
    if (value && typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value).map(([key, item]) => [key, decodeBinary(item)]),
      );
    }
    return value;
  };

  class ApiDataProvider {
    constructor(options) {
      this.schema = options.schema;
      this.stores = options.stores;
      this.beforeWrite = options.beforeWrite;
      this.archivedYearEditReason =
        options.archivedYearEditReason || (() => "");
      this.onSave = options.onSave;
      this.onChange = options.onChange;
      this.baseUrl = "/api";
      this.currentUser = null;
      this.db = null;
    }

    async authStatus() {
      const response = await fetch(`${this.baseUrl}/auth/status`, {
        headers: { Accept: "application/json" },
        credentials: "same-origin",
      });
      if (!response.ok) throw new Error("Không thể kiểm tra trạng thái đăng nhập.");
      return response.json();
    }

    async setupRoot(details) {
      const response = await fetch(`${this.baseUrl}/auth/setup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(details),
        credentials: "same-origin",
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Không thể tạo tài khoản root.");
      this.currentUser = result.user;
      return result.user;
    }

    async authenticate(username, password, schoolId) {
      const response = await fetch(`${this.baseUrl}/session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password, schoolId }),
        credentials: "same-origin",
      });
      if (!response.ok) return null;
      const result = await response.json();
      this.currentUser = result.user;
      return result.user;
    }

    async restoreSession() {
      const response = await fetch(`${this.baseUrl}/session`, {
        headers: { Accept: "application/json" },
        credentials: "same-origin",
      });
      if (response.status === 401) return null;
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "Không thể khôi phục phiên đăng nhập.");
      this.currentUser = result.user;
      return result.user;
    }

    async switchSchool(schoolId) {
      const result = await this.request("/session/school", {
        method: "POST",
        body: JSON.stringify({ schoolId }),
      });
      this.currentUser = result.user;
      return result.user;
    }

    disconnectMemory() {
      fetch(`${this.baseUrl}/session`, {
        method: "DELETE",
        credentials: "same-origin",
      }).catch(() => {});
      this.currentUser = null;
    }

    async request(path, options = {}) {
      const headers = new Headers(options.headers || {});
      if (options.body !== undefined && !headers.has("Content-Type")) {
        headers.set("Content-Type", "application/json");
      }
      const response = await fetch(`${this.baseUrl}${path}`, {
        ...options,
        headers,
        credentials: "same-origin",
      });
      if (response.status === 404 && options.allowMissing) return null;
      let payload = null;
      try {
        payload = await response.json();
      } catch (_) {}
      if (!response.ok) {
        const error = new Error(payload?.error || `Yêu cầu máy chủ thất bại (${response.status}).`);
        error.name = payload?.name || "ApiError";
        error.status = response.status;
        throw error;
      }
      return decodeBinary(payload);
    }

    listUsers() {
      return this.request("/admin/users");
    }

    createSchool(name) {
      return this.request("/admin/schools", {
        method: "POST",
        body: JSON.stringify({ name }),
      });
    }

    createUser(details) {
      return this.request("/admin/users", {
        method: "POST",
        body: JSON.stringify(details),
      });
    }

    updateUser(id, changes) {
      return this.request(`/admin/users/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify(changes),
      });
    }

    updateOwnAccount(changes) {
      return this.request("/account", {
        method: "PATCH",
        body: JSON.stringify(changes),
      });
    }

    deleteUser(id) {
      return this.request(`/admin/users/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
    }

    deleteWeeklyScoreSheet(id, confirmation) {
      this.beforeWrite();
      return this.request(`/score-sheets/${encodeURIComponent(id)}`, {
        method: "DELETE",
        body: JSON.stringify({ confirmation }),
      });
    }

    forceDeleteCriteriaSet(id, confirmation, finalConfirmation) {
      this.beforeWrite();
      return this.request(`/criteria-sets/${encodeURIComponent(id)}`, {
        method: "DELETE",
        body: JSON.stringify({ confirmation, finalConfirmation }),
      });
    }

    teacherClassWeek(schoolYearId = "", weekId = "") {
      const query = new URLSearchParams();
      if (schoolYearId) query.set("schoolYearId", schoolYearId);
      if (weekId) query.set("weekId", weekId);
      return this.request(`/teacher/class-week?${query}`);
    }

    async open() {
      const result = await this.request("/health");
      this.upgradedFrom = Number(result.previousSchema ?? result.schema ?? this.schema);
      this.upgradedTo = Number(result.schema ?? this.schema);
      this.db = { remote: true };
      return this;
    }

    all(store) {
      return this.request(`/stores/${encodeURIComponent(store)}`);
    }

    allIncludingDeleted(store) {
      return this.request(`/stores/${encodeURIComponent(store)}?includeDeleted=1`);
    }

    get(store, id) {
      return this.request(
        `/stores/${encodeURIComponent(store)}/${encodeURIComponent(id)}?optional=1`,
        { allowMissing: true },
      );
    }

    async write(path, body, { silent = false, change } = {}) {
      this.beforeWrite();
      if (!silent) this.onSave("Đang lưu trên máy chủ…", "saving");
      try {
        const result = await this.request(path, {
          method: "POST",
          body: JSON.stringify(await encodeBinary(body)),
        });
        if (!silent) {
          this.onSave(`Đã lưu trên máy chủ lúc ${new Date().toLocaleTimeString("vi-VN")}`);
        }
        if (change) this.onChange(change.store, change.id);
        return result;
      } catch (error) {
        this.onSave(
          error.name === "RevisionConflictError"
            ? "Xung đột dữ liệu – cần xem lại"
            : "Lưu máy chủ thất bại – thử lại",
          "error",
        );
        throw error;
      }
    }

    put(store, row, options = {}) {
      const archivedYearReason = this.archivedYearEditReason(row);
      return this.write(
        `/stores/${encodeURIComponent(store)}`,
        { row, ...(archivedYearReason ? { archivedYearReason } : {}) },
        {
          silent: options.silent,
          change: { store, id: row.id || "new" },
        },
      );
    }

    bulkPut(store, rows, options = {}) {
      const reasons = [
        ...new Set(rows.map((row) => this.archivedYearEditReason(row)).filter(Boolean)),
      ];
      if (reasons.length > 1)
        throw new Error("Một lô ghi không thể hiệu chỉnh nhiều năm học với các lý do khác nhau.");
      return this.write(
        `/stores/${encodeURIComponent(store)}/bulk`,
        { rows, ...(reasons[0] ? { archivedYearReason: reasons[0] } : {}) },
        {
          silent: options.silent,
          change: { store, id: "bulk" },
        },
      );
    }

    async remove(store, id) {
      this.beforeWrite();
      const result = await this.request(
        `/stores/${encodeURIComponent(store)}/${encodeURIComponent(id)}`,
        { method: "DELETE" },
      );
      this.onChange(store, id);
      return result;
    }

    async hardDelete(store, id, force = false) {
      this.beforeWrite();
      const query = force ? "?hard=1" : "";
      return this.request(
        `/stores/${encodeURIComponent(store)}/${encodeURIComponent(id)}${query}`,
        { method: "DELETE" },
      );
    }

    async hardClear(store) {
      this.beforeWrite();
      await this.request(`/stores/${encodeURIComponent(store)}`, { method: "DELETE" });
    }

    exportAll() {
      return this.request("/export");
    }

    replaceAll(payload) {
      return this.write("/import/replace", { payload }, { silent: true });
    }

    mergeAll(payload) {
      return this.write("/import/merge", { payload }, { silent: true });
    }

    normalizeEnhancedData() {
      return this.write("/migrations/enhanced-data", {}, { silent: true });
    }
  }

  global.ApiDataProvider = ApiDataProvider;
})(window);
