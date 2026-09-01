(function (window) {
  "use strict";

  const uid = () =>
    crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const now = () => new Date().toISOString();
  const localISO = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const today = () => localISO(new Date());
  const esc = (v) =>
    String(v ?? "").replace(
      /[&<>'"]/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          "'": "&#39;",
          '"': "&quot;",
        })[c],
    );
  const fmtDate = (v) =>
    v
      ? new Intl.DateTimeFormat("vi-VN").format(new Date(v + "T00:00:00"))
      : "—";
  const fmtDateTime = (v) =>
    v
      ? new Intl.DateTimeFormat("vi-VN", {
          dateStyle: "short",
          timeStyle: "short",
        }).format(new Date(v))
      : "—";
  const clamp = (n, a, b) => Math.min(b, Math.max(a, Number(n) || 0));
  const csvSafe = (v) => {
    let s = String(v ?? "").replace(/"/g, '""');
    if (/^[=+\-@]/.test(s)) s = "'" + s;
    return '"' + s + '"';
  };
  const statusLabel = (s) =>
    ({
      todo: "Chưa làm",
      doing: "Đang làm",
      waiting: "Chờ phối hợp",
      review: "Chờ duyệt",
      done: "Hoàn thành",
      paused: "Tạm dừng",
      draft: "Bản nháp",
      complete: "Đã nhập đủ",
      approved: "Đã duyệt",
      locked: "Đã khóa",
      unlocked: "Đã mở khóa",
      planned: "Dự kiến",
      active: "Đang thực hiện",
      finished: "Đã kết thúc",
      finalized: "Đã chốt",
      archived: "Đã lưu trữ",
      not_submitted: "Chưa gửi",
      submitted: "Đã gửi",
      accepted: "Đã tiếp nhận",
    })[s] ||
    s ||
    "—";
  const statusBadge = (s) =>
    `<span class="badge ${["done", "approved", "locked", "finished"].includes(s) ? "green" : ["overdue", "urgent"].includes(s) ? "red" : ["doing", "review", "active"].includes(s) ? "blue" : "yellow"}">${esc(statusLabel(s))}</span>`;
  const addDays = (iso, n) => {
    const d = new Date(iso + "T00:00:00");
    d.setDate(d.getDate() + n);
    return localISO(d);
  };
  function sortWeeksAscending(rows) {
    const getNumber = (row) => {
      const stored = Number(row?.number),
        fromName = Number(String(row?.name || "").match(/\d+/)?.[0]);
      if (Number.isFinite(stored) && stored > 0) return stored;
      if (Number.isFinite(fromName) && fromName > 0) return fromName;
      return Number.MAX_SAFE_INTEGER;
    };
    return [...rows].sort(
      (a, b) =>
        getNumber(a) - getNumber(b) ||
        String(a.start_date || "").localeCompare(String(b.start_date || "")) ||
        String(a.name || "").localeCompare(String(b.name || ""), "vi", {
          numeric: true,
          sensitivity: "base",
        }),
    );
  }
  const pageHead = (title, desc, actions = "") =>
    `<div class="page-head"><div><h1>${esc(title)}</h1><p>${esc(desc)}</p></div><div class="page-actions">${actions}</div></div>`;
  function debounce(fn, ms) {
    let t;
    return (...a) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...a), ms);
    };
  }
  function nextRepeatDate(value, rule) {
    if (!value || rule === "none") return null;
    const d = new Date(`${value}T12:00:00`);
    if (rule === "daily") d.setDate(d.getDate() + 1);
    if (rule === "weekly") d.setDate(d.getDate() + 7);
    if (rule === "monthly") d.setMonth(d.getMonth() + 1);
    if (rule === "yearly") d.setFullYear(d.getFullYear() + 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  function simpleTable(head, rows) {
    return `<div class="table-wrap" style="max-height:none"><table><thead><tr>${head.map((x) => `<th>${esc(x)}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((x, i) => `<td class="${i === 0 ? "wrap" : ""}">${esc(x)}</td>`).join("")}</tr>`).join("") || `<tr><td colspan="${head.length}" class="empty">Không có dữ liệu trong phạm vi đã chọn.</td></tr>`}</tbody></table></div>`;
  }
  function nextVersion(v) {
    const parts = String(v || "1.0").split("."),
      last = Number(parts.pop()) || 0;
    return [...parts, last + 1].join(".");
  }
  function parseDelimited(line, delim) {
    if (delim === "\t") return line.split("\t");
    const out = [];
    let cur = "",
      q = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        if (q && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else q = !q;
      } else if (c === "," && !q) {
        out.push(cur);
        cur = "";
      } else cur += c;
    }
    out.push(cur);
    return out;
  }
  const permissionList = (value) =>
    [
      ...new Set(
        String(value || "")
          .split(/[\s,]+/)
          .map((item) => item.trim().toLowerCase())
          .filter(Boolean),
      ),
    ];
  function formatBytes(n) {
    if (!n) return "0 B";
    const units = ["B", "KB", "MB", "GB"],
      i = Math.min(3, Math.floor(Math.log(n) / Math.log(1024)));
    return `${(n / 1024 ** i).toLocaleString("vi-VN", { maximumFractionDigits: 1 })} ${units[i]}`;
  }
  function fileIcon(ext = "") {
    return /^(png|jpg|jpeg|webp)$/.test(ext)
      ? "▣"
      : ext === "pdf"
        ? "▤"
        : /^(doc|docx)$/.test(ext)
          ? "W"
          : /^(xls|xlsx|csv)$/.test(ext)
            ? "X"
            : /^(ppt|pptx)$/.test(ext)
              ? "P"
              : ext === "zip"
                ? "▥"
                : "▧";
  }
  function normalizeText(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/đ/g, "d")
      .replace(/Đ/g, "D")
      .toLowerCase();
  }
  function defaultConfigColor(index) {
    return [
      "#0b6bcb",
      "#16845b",
      "#b77900",
      "#7c3aed",
      "#c93c3c",
      "#0f766e",
    ][index % 6];
  }

  window.TPTAppModules = window.TPTAppModules || {};
  window.TPTAppModules.utils = Object.freeze({
    uid,
    now,
    localISO,
    today,
    esc,
    fmtDate,
    fmtDateTime,
    clamp,
    csvSafe,
    statusLabel,
    statusBadge,
    addDays,
    sortWeeksAscending,
    pageHead,
    debounce,
    nextRepeatDate,
    simpleTable,
    nextVersion,
    parseDelimited,
    permissionList,
    formatBytes,
    fileIcon,
    normalizeText,
    defaultConfigColor,
  });
})(window);
