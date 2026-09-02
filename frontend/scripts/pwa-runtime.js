(function (window) {
  "use strict";

  function createController({ state, $, toast }) {
    function registerPWA() {
      if (
        !("serviceWorker" in navigator) ||
        !/^https?:$/.test(location.protocol)
      )
        return;
      navigator.serviceWorker
        .register("./sw.js")
        .then((registration) => {
          registration.addEventListener("updatefound", () => {
            const worker = registration.installing;
            worker?.addEventListener("statechange", () => {
              if (
                worker.state === "installed" &&
                navigator.serviceWorker.controller
              )
                showUpdateBanner(registration);
            });
          });
        })
        .catch(() =>
          toast(
            "Chưa thể bật chế độ cài đặt PWA; bản HTML ngoại tuyến vẫn dùng được.",
            "bad",
          ),
        );
    }

    function showUpdateBanner(registration) {
      if ($("#pwaUpdateBanner")) return;
      const banner = document.createElement("div");
      banner.id = "pwaUpdateBanner";
      banner.className = "update-banner";
      banner.innerHTML = `<span>Có phiên bản PWA mới đã tải xong.</span><button class="btn small" type="button">Cập nhật khi an toàn</button>`;
      banner.querySelector("button").onclick = async () => {
        if (
          state.hasPendingDraft ||
          $("#saveState")?.dataset.state === "saving"
        )
          return toast(
            "Hãy lưu hoặc đóng bản nháp đang mở trước khi cập nhật.",
            "bad",
          );
        let reloaded = false;
        navigator.serviceWorker.addEventListener(
          "controllerchange",
          () => {
            if (reloaded) return;
            reloaded = true;
            location.reload();
          },
          { once: true },
        );
        registration.waiting?.postMessage({ type: "SKIP_WAITING" });
        setTimeout(() => {
          if (!reloaded) location.reload();
        }, 2000);
      };
      document.body.append(banner);
    }

    return { registerPWA };
  }

  window.TPTAppModules = window.TPTAppModules || {};
  window.TPTAppModules.pwaRuntime = Object.freeze({ createController });
})(window);
