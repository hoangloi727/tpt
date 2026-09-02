"use strict";

(function () {
  const modules = window.TPTAppModules;
  if (!modules || !modules.utils || typeof modules.utils.localISO !== "function") {
    throw new Error(
      "score-engine.js requires window.TPTAppModules.utils.localISO",
    );
  }

  const { localISO } = modules.utils;

  function workflowLabel(sheet) {
    if (!sheet) return "Khởi tạo bảng tuần";
    return (
      {
        draft: "Đánh dấu đã nhập đủ",
        complete: "Gửi kiểm tra",
        review: "Duyệt bảng",
        approved: "Khóa bảng",
        locked: "Mở khóa có lý do",
        unlocked: "Gửi kiểm tra lại",
      }[sheet.status] || "Quản lý trạng thái"
    );
  }

  function parseScoreInput(input, criterion, options = {}) {
    const mode =
        typeof options === "string" ? options : options.mode || "direct",
      raw = String(input ?? "").trim().toUpperCase();

    if (raw === "" && mode !== "paste") {
      return { valid: true, action: "clear", entry_state: null, value: null };
    }
    if (raw === "KAD" || raw === "N/A") {
      return { valid: true, action: "save", entry_state: "na", value: null };
    }
    if (raw === "MIỄN" || raw === "MIEN") {
      return {
        valid: true,
        action: "save",
        entry_state: "exempt",
        value: null,
      };
    }

    let value;
    if (
      criterion?.data_type === "boolean" &&
      ["ĐẠT", "DAT", "CÓ", "CO"].includes(raw)
    ) {
      value = 1;
    } else if (
      criterion?.data_type === "boolean" &&
      ["KHÔNG ĐẠT", "KHONG DAT", "KHÔNG", "KHONG"].includes(raw)
    ) {
      value = 0;
    } else {
      // score, count, choice, boolean numeric input, and note currently share
      // the app's numeric conversion behavior.
      value = Number(raw.replace(",", "."));
    }

    if (!Number.isFinite(value)) {
      return {
        valid: false,
        action: "invalid",
        reason: "number",
        entry_state: "value",
        value: null,
      };
    }
    if (
      value < Number(criterion?.min ?? -Infinity) ||
      value > Number(criterion?.max ?? Infinity)
    ) {
      return {
        valid: false,
        action: "invalid",
        reason: "range",
        entry_state: "value",
        value,
      };
    }
    return {
      valid: true,
      action: "save",
      entry_state: "value",
      value,
    };
  }

  function criterionScore(entry, criterion, set) {
    let score = Number(entry?.value || 0);
    if (entry?.criteria_group_id) return score;
    if (criterion.data_type === "count")
      score *= Number(criterion.points || 0);
    if (criterion.data_type === "boolean")
      score = entry?.value ? Number(criterion.points || 0) : 0;
    if (criterion.data_type === "note") score = 0;
    if (set?.formula === "weighted")
      score *= Number(criterion.weight || 1);
    return score;
  }

  function scoreWeekdays(week) {
    if (!week?.start_date) return [];
    const labels = ["Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu"],
      start = new Date(`${week.start_date}T00:00:00`),
      days = [];
    for (let offset = 0; offset < 7 && days.length < 5; offset++) {
      const date = new Date(start);
      date.setDate(start.getDate() + offset);
      if (date.getDay() >= 1 && date.getDay() <= 5)
        days.push({ date: localISO(date), label: labels[date.getDay() - 1] });
    }
    return days;
  }

  function scoreAdjustment(entries, criteria, set) {
    return entries.reduce((total, entry) => {
      const criterion = criteria.find(
        (row) => row.id === scoreEntryCriterionId(entry),
      );
      return total +
        (criterion && entry.entry_state === "value"
          ? criterionScore(entry, criterion, set)
          : 0);
    }, 0);
  }

  function classScoreSummary(ctx, classId, selectedDate) {
    const entries = ctx.entries.filter((entry) => entry.class_id === classId),
      selectedEntries = entries.filter(
        (entry) => entry.entry_date === selectedDate,
      );
    return {
      dayAdjustment: scoreAdjustment(selectedEntries, ctx.criteria, ctx.set),
      weeklyTotal:
        (ctx.set?.formula === "base" ? Number(ctx.set.base_score || 0) : 0) +
        scoreAdjustment(entries, ctx.criteria, ctx.set),
    };
  }

  const scoreEntryCriterionId = (entry) =>
    entry.criteria_group_id || entry.criteria_id;

  function entryMap(entries) {
    return new Map(
      entries.map((e) => [e.class_id + "|" + scoreEntryCriterionId(e), e]),
    );
  }

  function rankClasses(ctx) {
    const ranked = ctx.classes
      .map((schoolClass) => {
        const entries = ctx.entries.filter(
            (entry) => entry.class_id === schoolClass.id,
          ),
          total =
            (ctx.set?.formula === "base"
              ? Number(ctx.set.base_score || 0)
              : 0) + scoreAdjustment(entries, ctx.criteria, ctx.set),
          filled = new Set(
            entries.map(
              (entry) =>
                `${entry.entry_date}|${scoreEntryCriterionId(entry)}`,
            ),
          ).size,
          daily = Object.fromEntries(
            ctx.days.map((day) => [
              day.date,
              scoreAdjustment(
                entries.filter((entry) => entry.entry_date === day.date),
                ctx.criteria,
                ctx.set,
              ),
            ]),
          );
        return {
          id: schoolClass.id,
          class_name: schoolClass.class_name,
          campus_id: schoolClass.campus_id,
          class_group_id: schoolClass.class_group_id,
          class_group_name: schoolClass.class_group_name,
          class_group_order: schoolClass.class_group_order,
          total,
          daily,
          filled,
          complete: filled === ctx.criteria.length * ctx.days.length,
        };
      })
      .filter((row) => row.filled > 0)
      .sort(
        (a, b) =>
          a.class_group_order - b.class_group_order ||
          a.class_group_name.localeCompare(b.class_group_name, "vi") ||
          b.total - a.total ||
          a.class_name.localeCompare(b.class_name, "vi", { numeric: true }) ||
          String(a.id).localeCompare(String(b.id)),
      );
    const groupPositions = new Map();
    for (const row of ranked) {
      const position = groupPositions.get(row.class_group_id) || {
        index: 0,
        previousTotal: null,
        previousRank: 0,
      };
      position.index += 1;
      row.rank =
        position.index > 1 &&
        Math.abs(row.total - position.previousTotal) < 1e-9
          ? position.previousRank
          : position.index;
      position.previousTotal = row.total;
      position.previousRank = row.rank;
      groupPositions.set(row.class_group_id, position);
    }
    return ranked;
  }

  function scoreAnomalyItems(ctx) {
    const items = [],
      expected = ctx.criteria.length * ctx.days.length,
      classesById = new Map(ctx.classes.map((row) => [row.id, row])),
      criteriaById = new Map(ctx.criteria.map((row) => [row.id, row]));

    ctx.classes.forEach((schoolClass) => {
      const count = new Set(
        ctx.entries
          .filter((entry) => entry.class_id === schoolClass.id)
          .map(
            (entry) =>
              `${entry.entry_date}|${scoreEntryCriterionId(entry)}`,
          ),
      ).size;
      if (!count) {
        items.push({
          kind: "missing_class_data",
          level: "red",
          class_id: schoolClass.id,
          missing: expected,
          text: `Lớp ${schoolClass.class_name} chưa có dữ liệu.`,
        });
      } else if (count < expected) {
        items.push({
          kind: "incomplete_class_data",
          level: "yellow",
          class_id: schoolClass.id,
          missing: expected - count,
          text: `Lớp ${schoolClass.class_name} còn thiếu ${expected - count} ô điểm ngày.`,
        });
      }
    });

    ctx.entries.forEach((entry) => {
      const criterion = criteriaById.get(scoreEntryCriterionId(entry)),
        schoolClass = classesById.get(entry.class_id);
      if (criterion?.evidence_required && !entry.evidence_id) {
        const entryDate = new Intl.DateTimeFormat("vi-VN").format(
          new Date(`${entry.entry_date}T00:00:00`),
        );
        items.push({
          kind: "missing_evidence",
          level: "yellow",
          entry_id: entry.id,
          class_id: entry.class_id,
          criterion_id: scoreEntryCriterionId(entry),
          entry_date: entry.entry_date,
          text: `Thiếu minh chứng bắt buộc ngày ${entryDate}, lớp ${schoolClass?.class_name}, tiêu chí ${criterion.code}.`,
        });
      }
      if (
        entry.entry_state === "value" &&
        (entry.value < criterion?.min || entry.value > criterion?.max)
      ) {
        items.push({
          kind: "value_out_of_range",
          level: "red",
          entry_id: entry.id,
          class_id: entry.class_id,
          criterion_id: scoreEntryCriterionId(entry),
          entry_date: entry.entry_date,
          value: entry.value,
          text: `Giá trị vượt giới hạn ở tiêu chí ${criterion?.code}.`,
        });
      }
    });
    return items;
  }

  modules.score = Object.freeze({
    workflowLabel,
    parseScoreInput,
    criterionScore,
    scoreWeekdays,
    scoreAdjustment,
    classScoreSummary,
    scoreEntryCriterionId,
    entryMap,
    rankClasses,
    scoreAnomalyItems,
  });
})();
