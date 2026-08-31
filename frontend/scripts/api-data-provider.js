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
      this.allowArchivedYear = options.allowArchivedYear;
      this.onSave = options.onSave;
      this.onChange = options.onChange;
      this.onSyncNeeded = options.onSyncNeeded;
      this.baseUrl = "/api";
      this.token = "";
      this.currentUser = null;
      this.db = null;
    }

    async authStatus() {
      const response = await fetch(`${this.baseUrl}/auth/status`, {
        headers: { Accept: "application/json" },
      });
      if (!response.ok) throw new Error("Không thể kiểm tra trạng thái đăng nhập.");
      return response.json();
    }

    async setupRoot(details) {
      const response = await fetch(`${this.baseUrl}/auth/setup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(details),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Không thể tạo tài khoản root.");
      this.token = result.token;
      this.currentUser = result.user;
      return result.user;
    }

    async authenticate(username, password) {
      const response = await fetch(`${this.baseUrl}/session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (!response.ok) return null;
      const result = await response.json();
      this.token = result.token;
      this.currentUser = result.user;
      return result.user;
    }

    disconnectMemory() {
      if (this.token) {
        fetch(`${this.baseUrl}/session`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${this.token}` },
        }).catch(() => {});
      }
      this.token = "";
      this.currentUser = null;
    }

    async request(path, options = {}) {
      const headers = new Headers(options.headers || {});
      if (this.token) headers.set("Authorization", `Bearer ${this.token}`);
      if (options.body !== undefined && !headers.has("Content-Type")) {
        headers.set("Content-Type", "application/json");
      }
      const response = await fetch(`${this.baseUrl}${path}`, { ...options, headers });
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

    deleteUser(id) {
      return this.request(`/admin/users/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
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

    async write(path, body, { silent = false, sync = true, change } = {}) {
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
        if (sync) this.onSyncNeeded();
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
      return this.write(
        `/stores/${encodeURIComponent(store)}`,
        {
          row,
          options: {
            ...options,
            allowArchivedYear: this.allowArchivedYear(row),
          },
        },
        {
          silent: options.silent,
          sync: options.sync !== false,
          change: { store, id: row.id || "new" },
        },
      );
    }

    bulkPut(store, rows, options = {}) {
      return this.write(
        `/stores/${encodeURIComponent(store)}/bulk`,
        {
          rows,
          options: {
            ...options,
            allowArchivedYear: rows.every((row) => this.allowArchivedYear(row)),
          },
        },
        {
          silent: options.silent,
          sync: options.sync !== false,
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
      this.onSyncNeeded();
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

    replaceAll(payload, options = {}) {
      return this.write("/import/replace", { payload, options }, {
        silent: true,
        sync: options.sync !== false,
      });
    }

    async mergeAll(payload) {
      this.beforeWrite();
      const stats = { inserted: 0, updated: 0, kept_current: 0, stores: {} };
      for (const store of this.stores) {
        if (!Array.isArray(payload.data?.[store])) continue;
        const current = new Map(
          (await this.allIncludingDeleted(store)).map((row) => [row.id, row]),
        );
        const changes = [];
        const local = { inserted: 0, updated: 0, kept_current: 0 };
        for (const incoming of payload.data[store]) {
          const existing = current.get(incoming.id);
          const newer =
            !existing ||
            Number(incoming.revision || 0) > Number(existing.revision || 0) ||
            (Number(incoming.revision || 0) === Number(existing.revision || 0) &&
              Date.parse(incoming.updated_at || 0) > Date.parse(existing.updated_at || 0));
          if (newer) {
            changes.push(incoming);
            const key = existing ? "updated" : "inserted";
            local[key]++;
            stats[key]++;
          } else {
            local.kept_current++;
            stats.kept_current++;
          }
        }
        if (changes.length) {
          await this.bulkPut(store, changes, { preserveMetadata: true, silent: true });
        }
        stats.stores[store] = local;
      }
      this.onSyncNeeded(100);
      return stats;
    }
  }

  global.ApiDataProvider = ApiDataProvider;
})(window);
