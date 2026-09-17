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
  function academicWeekOptions(startYear) {
    if (!Number.isInteger(startYear) || startYear < 1900 || startYear > 9998)
      return [];
    const date = new Date(`${startYear}-08-01T00:00:00`),
      limit = `${startYear + 1}-08-01`,
      weeks = [];
    date.setDate(date.getDate() + ((8 - date.getDay()) % 7));
    while (localISO(date) < limit) {
      const start = localISO(date);
      weeks.push({ start_date: start, end_date: addDays(start, 6) });
      date.setDate(date.getDate() + 7);
    }
    return weeks;
  }
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
  function normalizeSchoolYearName(value) {
    return String(value ?? "").trim().replace(/[\u2010-\u2015\u2212]/g, "-").replace(/\s*-\s*/g, "-");
  }
  function parseAccountImportText(value) {
    const text = String(value).replace(/^\uFEFF/, ""),
      firstLine = text.split(/\r?\n/).find((line) => line.trim()) || "",
      delimiter = firstLine.includes("\t") ? "\t" : firstLine.includes(";") && !firstLine.includes(",") ? ";" : ",",
      rows = [];
    let row = [], cell = "", quoted = false;
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      if (char === '"') {
        if (quoted && text[i + 1] === '"') { cell += '"'; i++; }
        else if (quoted || !cell) quoted = !quoted;
        else throw new Error("Dấu ngoặc kép trong CSV không hợp lệ.");
      } else if (!quoted && (char === delimiter || char === "\r" || char === "\n")) {
        row.push(cell);
        cell = "";
        if (char !== delimiter) {
          rows.push(row);
          row = [];
          if (char === "\r" && text[i + 1] === "\n") i++;
        }
      } else cell += char;
    }
    if (quoted) throw new Error("CSV có ô chưa đóng dấu ngoặc kép.");
    row.push(cell);
    rows.push(row);
    return rows;
  }
  function validateAccountImportRows(rows, { role, years, classes, users, schoolYearId }) {
    if (!["user", "teacher"].includes(role)) throw new Error("Loại tài khoản nhập không hợp lệ.");
    const textKey = (value) => normalizeText(String(value ?? "").trim()),
      yearKey = (value) => textKey(normalizeSchoolYearName(value)),
      lines = rows.map((cells, index) => ({ cells: cells || [], row: index + 1 }))
        .filter(({ cells }) => cells.some((cell) => String(cell ?? "").trim()));
    if (["username", "ten dang nhap"].includes(textKey(lines[0]?.cells[0])) &&
        ["display name", "displayname", "ten hien thi"].includes(textKey(lines[0]?.cells[1]))) lines.shift();
    if (!lines.length) throw new Error("Chưa có tài khoản để nhập.");
    if (lines.length > 2000) throw new Error("Chỉ nhập tối đa 2.000 tài khoản mỗi lần.");
    const existingNames = new Set(users.map((user) => textKey(user.username))),
      boundClasses = new Set(users.filter((user) => user.role === "user" && user.graderClassId).map((user) => user.graderClassId)),
      parsed = lines.map(({ cells, row }) => {
        const username = String(cells[0] ?? "").trim().toLowerCase(),
          displayName = String(cells[1] ?? "").trim(),
          password = String(cells[2] ?? ""),
          yearInput = role === "teacher" ? String(cells[3] ?? "").trim() : schoolYearId,
          classInput = String(cells[role === "teacher" ? 4 : 3] ?? "").trim(),
          matchingYears = role === "teacher"
            ? years.filter((year) => year.id === yearInput || yearKey(year.name) === yearKey(yearInput))
            : years.filter((year) => year.id === schoolYearId),
          year = matchingYears.length === 1 ? matchingYears[0] : null,
          errors = [];
        if (!/^[a-z0-9][a-z0-9._-]{2,31}$/.test(username)) errors.push("Tên đăng nhập không hợp lệ");
        if (!displayName) errors.push("Thiếu tên hiển thị");
        if (password.length < 10) errors.push("Mật khẩu dưới 10 ký tự");
        if (cells.slice(role === "teacher" ? 5 : 4).some((cell) => String(cell ?? "").trim())) errors.push("Thừa cột; hãy dùng đúng mẫu của loại tài khoản này");
        if (existingNames.has(username)) errors.push("Tên đăng nhập đã tồn tại");
        if ((role === "teacher" || classInput) && !year)
          errors.push(matchingYears.length > 1 ? "Tên năm học không duy nhất; dùng ID năm học" : "Không tìm thấy năm học");
        if (role === "teacher" && !classInput) errors.push("Thiếu lớp chủ nhiệm");
        const eligible = year ? classes.filter((schoolClass) => schoolClass.active !== false && !schoolClass.deleted_at &&
            (schoolClass.school_year_id || schoolClass.academic_year_id) === year.id) : [],
          exactId = eligible.find((schoolClass) => schoolClass.id === classInput),
          matches = classInput ? exactId ? [exactId] : eligible.filter((schoolClass) =>
            [schoolClass.code, schoolClass.class_name].some((value) => value && textKey(value) === textKey(classInput))) : [],
          schoolClass = matches.length === 1 ? matches[0] : null;
        if (classInput && year && !schoolClass)
          errors.push(matches.length > 1 ? "Tên lớp không duy nhất; dùng mã lớp hoặc ID" : "Không tìm thấy lớp đang hoạt động trong năm học");
        if (role === "user" && schoolClass && boundClasses.has(schoolClass.id)) errors.push("Lớp đã gắn với tài khoản Sao đỏ khác");
        return {
          row, username, displayName, password, role, errors,
          yearName: year ? normalizeSchoolYearName(year.name) : normalizeSchoolYearName(yearInput),
          className: schoolClass?.class_name || classInput,
          graderClassId: role === "user" ? schoolClass?.id || null : null,
          teacherAssignment: role === "teacher" && year && schoolClass ? { schoolYearId: year.id, classId: schoolClass.id } : null,
        };
      });
    const usernames = new Map(), bindings = new Map();
    for (const item of parsed) {
      if (!usernames.has(item.username)) usernames.set(item.username, []);
      usernames.get(item.username).push(item);
      if (item.graderClassId) {
        if (!bindings.has(item.graderClassId)) bindings.set(item.graderClassId, []);
        bindings.get(item.graderClassId).push(item);
      }
    }
    for (const duplicates of usernames.values())
      if (duplicates.length > 1) duplicates.forEach((item) => item.errors.push("Trùng tên đăng nhập trong tệp"));
    for (const duplicates of bindings.values())
      if (duplicates.length > 1) duplicates.forEach((item) => item.errors.push("Một lớp chỉ được gắn một Sao đỏ; lớp bị trùng trong tệp"));
    return parsed;
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
    academicWeekOptions,
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
    normalizeSchoolYearName,
    parseAccountImportText,
    validateAccountImportRows,
    defaultConfigColor,
  });
})(window);
