(function (window) {
  "use strict";

  function captureFormState(form) {
    return [...form.elements]
      .filter((el) => el.name || el.id)
      .map((el) => ({
        key: el.name || el.id,
        type: el.type,
        value: el.value,
        checked: !!el.checked,
        selected: el.multiple
          ? [...el.options]
              .filter((option) => option.selected)
              .map((option) => option.value)
          : null,
      }));
  }

  function applyFormState(form, fields) {
    for (const saved of fields || []) {
      const elements = [
        ...form.querySelectorAll(
          `[name="${CSS.escape(saved.key)}"],#${CSS.escape(saved.key)}`,
        ),
      ];
      for (const el of elements) {
        if (["checkbox", "radio"].includes(el.type))
          el.checked = saved.checked;
        else if (el.multiple && Array.isArray(saved.selected))
          [...el.options].forEach(
            (option) =>
              (option.selected = saved.selected.includes(option.value)),
          );
        else el.value = saved.value ?? "";
      }
    }
  }

  function createController(deps) {
    const {
      db,
      state,
      tabCoordinator,
      $,
      debounce,
      normalizeText,
      now,
      fmtDateTime,
      setSave,
      toast,
    } = deps;

    async function clearFormDraft(key) {
      try {
        const row = await db.get("form_drafts", key);
        if (row) await db.hardDelete("form_drafts", key);
      } catch (_) {}
    }

    function setupModalDraft(title) {
      const form = $("#modalBody form");
      if (!form || tabCoordinator.readOnly) return;
      const key = `draft:${state.page}:${form.id || normalizeText(title).replace(/\s+/g, "-")}`;
      state.modalDraftKey = key;
      const persist = debounce(async () => {
        if (!$("#modalLayer").classList.contains("open")) return;
        try {
          await db.put("form_drafts", {
            id: key,
            page: state.page,
            form_id: form.id || "",
            title,
            fields: captureFormState(form),
            saved_at: now(),
          });
          state.hasPendingDraft = true;
          setSave(
            `Đã lưu nháp lúc ${new Date().toLocaleTimeString("vi-VN")}`,
            "draft",
          );
        } catch (error) {
          setSave("Lưu nháp thất bại – thử lại", "error");
        }
      }, 500);
      form.addEventListener("input", persist);
      form.addEventListener("change", persist);
      db.get("form_drafts", key)
        .then((draft) => {
          if (
            !draft ||
            state.modalDraftKey !== key ||
            Date.now() - Date.parse(draft.saved_at) > 30 * 86400000
          )
            return;
          const notice = document.createElement("div");
          notice.className = "notice warn mb";
          notice.innerHTML = `<strong>Có bản nháp tự lưu lúc ${fmtDateTime(draft.saved_at)}.</strong> <button class="link-btn" type="button" data-draft-restore>Khôi phục nháp</button> <button class="link-btn" type="button" data-draft-discard>Bỏ nháp</button>`;
          form.before(notice);
          notice.querySelector("[data-draft-restore]").onclick = () => {
            applyFormState(form, draft.fields);
            state.hasPendingDraft = true;
            notice.remove();
            toast(
              "Đã khôi phục bản nháp vào biểu mẫu; chưa ghi vào dữ liệu chính.",
            );
          };
          notice.querySelector("[data-draft-discard]").onclick = async () => {
            await clearFormDraft(key);
            notice.remove();
            toast("Đã bỏ bản nháp cục bộ.");
          };
        })
        .catch(() => {});
    }

    return { clearFormDraft, setupModalDraft };
  }

  window.TPTAppModules = window.TPTAppModules || {};
  window.TPTAppModules.formDrafts = Object.freeze({
    captureFormState,
    applyFormState,
    createController,
  });
})(window);
