(function (window) {
  "use strict";

  const getDeviceId = (appId, uid) => {
    const key = `${appId}:device-id`;
    try {
      let value = localStorage.getItem(key);
      if (!value) {
        value = `web-${uid()}`;
        localStorage.setItem(key, value);
      }
      return value;
    } catch (_) {
      return `session-${uid()}`;
    }
  };

  class TabCoordinator {
    constructor(appId, uid, onRemoteChange) {
      this.appId = appId;
      this.onRemoteChange = onRemoteChange;
      this.tabId = uid();
      this.readOnly = false;
      this.lockHeld = false;
      this.releaseLock = null;
      this.leaseKey = `${appId}:writer-lease`;
      this.channel = null;
      this.heartbeat = null;
    }
    async start() {
      if (this.started) return;
      this.started = true;
      if (navigator.locks?.request) {
        await new Promise((ready) => {
          navigator.locks
            .request(
              `${this.appId}:writer`,
              { mode: "exclusive", ifAvailable: true },
              async (lock) => {
                if (!lock) {
                  this.readOnly = true;
                  ready();
                  return;
                }
                this.lockHeld = true;
                this.readOnly = false;
                ready();
                await new Promise((resolve) => {
                  this.releaseLock = resolve;
                });
              },
            )
            .catch(() => {
              this.startLeaseFallback();
              ready();
            });
        });
      } else this.startLeaseFallback();
      if ("BroadcastChannel" in window) {
        this.channel = new BroadcastChannel(`${this.appId}:tabs`);
        this.channel.onmessage = (event) => {
          if (event.data?.type === "data-changed" && this.readOnly)
            this.onRemoteChange();
        };
      }
      window.addEventListener("beforeunload", () => this.release());
    }
    startLeaseFallback() {
      try {
        const lease = JSON.parse(localStorage.getItem(this.leaseKey));
        const active =
          lease?.tabId !== this.tabId && lease?.expiresAt > Date.now();
        this.readOnly = !!active;
        if (!active) {
          this.writeLease();
          this.heartbeat = setInterval(() => this.writeLease(), 5000);
        }
      } catch (_) {
        this.readOnly = false;
      }
    }
    writeLease() {
      try {
        localStorage.setItem(
          this.leaseKey,
          JSON.stringify({
            tabId: this.tabId,
            expiresAt: Date.now() + 15000,
          }),
        );
      } catch (_) {}
    }
    assertWritable() {
      if (this.readOnly)
        throw new Error(
          "Thẻ này đang ở chế độ chỉ đọc vì một thẻ khác đang có quyền ghi.",
        );
    }
    announceChange(store, id) {
      this.channel?.postMessage({ type: "data-changed", store, id });
    }
    release() {
      if (this.releaseLock) this.releaseLock();
      clearInterval(this.heartbeat);
      if (!this.readOnly) {
        try {
          const lease = JSON.parse(localStorage.getItem(this.leaseKey));
          if (lease?.tabId === this.tabId)
            localStorage.removeItem(this.leaseKey);
        } catch (_) {}
      }
      this.channel?.close();
    }
  }

  class BrowserPlatformAdapter {
    constructor() {
      this.kind = "browser";
      this.contractVersion = "1.0";
    }
    capabilities() {
      return {
        runtime: "browser-pwa",
        filesystem_directory: "showDirectoryPicker" in window,
        secure_keystore: false,
        native_scheduler: false,
        atomic_file_replace: false,
      };
    }
    download(blob, name) {
      const url = URL.createObjectURL(blob),
        anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = name;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    async chooseDirectory() {
      if (!("showDirectoryPicker" in window))
        throw new Error(
          "Trình duyệt này không hỗ trợ chọn thư mục. Hãy dùng tệp tải xuống.",
        );
      return window.showDirectoryPicker({ mode: "readwrite" });
    }
    async permission(handle, request = false) {
      if (!handle?.queryPermission) return false;
      let result = await handle.queryPermission({ mode: "readwrite" });
      if (result !== "granted" && request && handle.requestPermission)
        result = await handle.requestPermission({ mode: "readwrite" });
      return result === "granted";
    }
    async writeFile(handle, name, blob, requestPermission = false) {
      if (!(await this.permission(handle, requestPermission)))
        throw new Error("Chưa có quyền ghi vào thư mục sao lưu.");
      const fileHandle = await handle.getFileHandle(name, {
          create: true,
        }),
        writable = await fileHandle.createWritable();
      try {
        await writable.write(blob);
        await writable.close();
      } catch (error) {
        await writable.abort?.();
        throw error;
      }
      return true;
    }
  }

  window.TPTAppModules = window.TPTAppModules || {};
  window.TPTAppModules.browserRuntime = Object.freeze({
    getDeviceId,
    TabCoordinator,
    BrowserPlatformAdapter,
  });
})(window);
