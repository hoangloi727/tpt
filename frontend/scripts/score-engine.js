"use strict";

(function () {
  const modules = window.TPTAppModules;
  if (!modules || !modules.utils || typeof modules.utils.localISO !== "function") {
    throw new Error(
      "score-engine.js requires window.TPTAppModules.utils.localISO",
    );
  }

  const { localISO } = modules.utils;

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

  modules.score = Object.freeze({
    criterionScore,
    scoreWeekdays,
    scoreAdjustment,
    classScoreSummary,
    scoreEntryCriterionId,
    entryMap,
  });
})();
