(function (window) {
  "use strict";

  function createController({ db, esc }) {
    async function customFieldDefs(entity, includeInactive = false) {
      return (await db.all("custom_field_definitions"))
        .filter(
          (x) =>
            x.entity_type === entity &&
            (includeInactive || x.active !== false),
        )
        .sort((a, b) => (a.order || 0) - (b.order || 0));
    }

    function renderCustomInputs(defs, values = {}) {
      return defs
        .map((f) => {
          const value = values?.[f.id] ?? "",
            name = `cf_${f.id}`,
            options = String(f.options || "")
              .split("|")
              .filter(Boolean);
          let input = "";
          if (f.field_type === "long_text")
            input = `<textarea name="${name}" ${f.required ? "required" : ""}>${esc(value)}</textarea>`;
          else if (f.field_type === "single_choice")
            input = `<select name="${name}" ${f.required ? "required" : ""}><option value="">— Chọn —</option>${options.map((x) => `<option ${value === x ? "selected" : ""}>${esc(x)}</option>`).join("")}</select>`;
          else if (f.field_type === "multi_choice")
            input = `<select name="${name}" multiple ${f.required ? "required" : ""}>${options.map((x) => `<option ${Array.isArray(value) && value.includes(x) ? "selected" : ""}>${esc(x)}</option>`).join("")}</select>`;
          else if (f.field_type === "boolean")
            input = `<select name="${name}"><option value="">— Chưa chọn —</option><option value="yes" ${value === "yes" ? "selected" : ""}>Có</option><option value="no" ${value === "no" ? "selected" : ""}>Không</option></select>`;
          else
            input = `<input name="${name}" type="${f.field_type === "number" ? "number" : f.field_type === "date" ? "date" : f.field_type === "link" ? "url" : f.field_type === "file" ? "text" : "text"}" value="${esc(value)}" ${f.required ? "required" : ""}>`;
          return `<div class="field ${["long_text", "multi_choice"].includes(f.field_type) ? "full" : ""}"><label class="${f.required ? "required" : ""}">${esc(f.name)}</label>${input}${f.description ? `<small class="hint">${esc(f.description)}</small>` : ""}</div>`;
        })
        .join("");
    }

    function collectCustomValues(fd, defs) {
      const out = {};
      for (const f of defs) {
        const name = `cf_${f.id}`;
        out[f.id] =
          f.field_type === "multi_choice"
            ? fd.getAll(name)
            : (fd.get(name) ?? "");
      }
      return out;
    }

    return { customFieldDefs, renderCustomInputs, collectCustomValues };
  }

  window.TPTAppModules = window.TPTAppModules || {};
  window.TPTAppModules.customFields = Object.freeze({ createController });
})(window);
