(function (window) {
  "use strict";

  function createService(deps) {
    const {
      db,
      APP,
      STORES,
      EXTERNAL_BACKUP_EXCLUDED_STORES,
      DEVICE_ID,
      tabCoordinator,
      platform,
      getDirectoryHandle = () => null,
      setting,
      now,
      today,
      stableJSON,
      sha256Text,
      sha256Blob,
      blobToBase64,
    } = deps;

    async function snapshotPayload(yearId = null) {
      return db.snapshotPayload(yearId);
    }
    async function createInternalSnapshot(
      name,
      {
        tier = "manual",
        protectedSnapshot = false,
        reason = "manual",
        yearId = null,
      } = {},
      preparedPayload = null,
    ) {
      tabCoordinator.assertWritable();
      const payload = preparedPayload || await snapshotPayload(yearId),
        serialized = stableJSON(payload.data),
        checksum = await sha256Text(serialized),
        snapshot = await db.put(
          "internal_snapshots",
          {
            name,
            tier,
            protected: protectedSnapshot,
            reason,
            school_year_id: yearId || null,
            schema: APP.schema,
            app_id: APP.appId,
            school_profile_id: APP.schoolProfileId,
            counts: payload.counts,
            record_count: Object.values(payload.counts).reduce(
              (sum, count) => sum + count,
              0,
            ),
            checksum,
            payload: payload.data,
            created_at: now(),
          },
        );
      await pruneSnapshots();
      return snapshot;
    }
    async function pruneSnapshots() {
      return db.pruneSnapshots();
    }
    async function ensureScheduledSnapshots() {
      const rows = await db.snapshotMetadata(),
        hasSince = (tier, days) =>
          rows.some(
            (row) =>
              row.tier === tier &&
              Date.now() - Date.parse(row.created_at) < days * 86400000,
          );
      const due = [
        ["daily", 1, "Tự động hằng ngày"],
        ["weekly", 7, "Tự động hằng tuần"],
        ["monthly", 28, "Tự động hằng tháng"],
      ].filter(([tier, days]) => !hasSince(tier, days));
      if (!due.length) return;
      const payload = await snapshotPayload();
      for (const [tier, , name] of due)
        await createInternalSnapshot(name, { tier, reason: "scheduled" }, payload);
    }
    async function ensureScheduledDirectoryBackup() {
      if (!(await setting("backup_directory_auto"))) return;
      const [directoryRecord] = await db.all("backup_handles"),
        directoryHandle = getDirectoryHandle() || directoryRecord?.handle || null,
        last = await setting("last_directory_backup_at");
      if (
        !directoryHandle ||
        (last && Date.now() - Date.parse(last) < 86400000) ||
        !(await platform.permission(directoryHandle, false))
      )
        return;
      try {
        const payload = await exportBusinessData(false),
          text = JSON.stringify(payload),
          blob = new Blob([text], { type: "application/json" }),
          fileName = `tro-ly-doi-tu-dong-${today()}.json`;
        await platform.writeFile(
          directoryHandle,
          fileName,
          blob,
          false,
        );
        await db.put(
          "backup_records",
          {
            name: fileName,
            scope: "quick",
            destination: "directory",
            scheduled_while_open: true,
            encrypted: false,
            size: blob.size,
            checksum: await sha256Text(text),
            status: "completed",
            completed_at: now(),
          },
        );
        await setting("last_directory_backup_at", now());
      } catch (error) {
        console.warn("Scheduled directory backup skipped:", error);
      }
    }
    async function exportBusinessData(
      includeFiles = false,
      yearId = null,
      signal = null,
      onProgress = () => {},
    ) {
      const data = {},
        files = [],
        fileMetadata = [],
        stores = STORES.filter(
          (store) => !EXTERNAL_BACKUP_EXCLUDED_STORES.has(store),
        );
      let storeIndex = 0;
      for (const store of stores) {
        if (signal?.aborted) throw new DOMException("Đã hủy", "AbortError");
        let rows = await db.allIncludingDeleted(store);
        if (yearId)
          rows = rows.filter(
            (row) =>
              !(row.school_year_id || row.academic_year_id) ||
              (row.school_year_id || row.academic_year_id) === yearId,
          );
        if (store === "attachments") {
          data[store] = rows.map(({ blob, ...meta }) => meta);
          if (includeFiles)
            for (let index = 0; index < rows.length; index++) {
              if (signal?.aborted)
                throw new DOMException("Đã hủy", "AbortError");
              const row = rows[index];
              if (row.blob instanceof Blob)
                files.push({
                  id: row.id,
                  name: row.original_name || row.name,
                  type: row.mime_type || row.blob.type,
                  size: row.blob.size,
                  sha256: row.sha256 || (await sha256Blob(row.blob)),
                  data: await blobToBase64(row.blob, signal, (ratio) =>
                    onProgress({
                      phase: "files",
                      ratio: rows.length ? (index + ratio) / rows.length : 1,
                    }),
                  ),
                });
              fileMetadata.push({
                id: row.id,
                name: row.original_name || row.name,
                type: row.mime_type || row.blob?.type || "",
                size: Number(row.size || row.blob?.size || 0),
                sha256: row.sha256 || "",
                included: includeFiles && row.blob instanceof Blob,
              });
            }
        } else data[store] = rows;
        storeIndex++;
        onProgress({ phase: "records", ratio: storeIndex / stores.length });
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      const payloadChecksum = await sha256Text(stableJSON(data)),
        exportedAt = now();
      return {
        app: APP.name,
        app_id: APP.appId,
        school_profile_id: APP.schoolProfileId,
        format: APP.backupFormat,
        scope: yearId ? "academic-year" : includeFiles ? "full" : "quick",
        version: APP.version,
        schema: APP.schema,
        build_id: APP.buildId,
        exported_at: exportedAt,
        includes_attachments: includeFiles,
        manifest: {
          app_id: APP.appId,
          school_profile_id: APP.schoolProfileId,
          device_id: DEVICE_ID,
          academic_year_id: yearId,
          exported_at: exportedAt,
          source_checksum: payloadChecksum,
          record_count: Object.values(data).reduce(
            (n, rows) => n + rows.length,
            0,
          ),
          file_count: files.length,
          total_file_bytes: files.reduce((n, x) => n + x.size, 0),
          file_metadata: fileMetadata,
        },
        data,
        files,
      };
    }

    return {
      snapshotPayload,
      createInternalSnapshot,
      pruneSnapshots,
      ensureScheduledSnapshots,
      ensureScheduledDirectoryBackup,
      exportBusinessData,
    };
  }

  window.TPTAppModules = window.TPTAppModules || {};
  window.TPTAppModules.backupService = Object.freeze({ createService });
})(window);
