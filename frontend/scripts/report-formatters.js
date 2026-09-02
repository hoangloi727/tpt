(function (window) {
  "use strict";

  function createController(deps) {
    const {
      esc,
      fmtDate,
      fmtDateTime,
      statusLabel,
      simpleTable,
      csvSafe,
      scoped,
      campusName,
      state,
      now,
      today,
      download,
    } = deps;

    async function reportHTML(type, d) {
      const title = {
        week: "BÁO CÁO CÔNG TÁC TUẦN",
        scores: "TỔNG HỢP THI ĐUA LỚP",
        tasks: "BÁO CÁO TIẾN ĐỘ CÔNG VIỆC",
        activities: "BÁO CÁO HOẠT ĐỘNG ĐỘI",
        equipment: "BÁO CÁO THIẾT BỊ ĐỘI",
      }[type];
      let body = "";
      if (type === "week")
        body = `<h3>I. Kết quả thực hiện</h3><p>Đã hoàn thành <strong>${d.completed.length}</strong>/${d.tasks.length} công việc; còn <strong>${d.overdue.length}</strong> việc quá hạn.</p>${simpleTable(
          ["Công việc", "Trạng thái", "Hạn"],
          d.tasks.map((x) => [
            x.title,
            statusLabel(x.status),
            fmtDate(x.due_date),
          ]),
        )}<h3>II. Hoạt động và lịch sắp tới</h3>${simpleTable(
          ["Hoạt động", "Thời gian", "Địa điểm"],
          d.upcoming.map((x) => [
            x.title,
            fmtDate(x.date),
            x.location || "Chưa cập nhật",
          ]),
        )}<h3>III. Kế hoạch tuần sau</h3><p class="muted">Phần nhận xét/kế hoạch có thể bổ sung khi in; hệ thống không tự tạo số liệu ngoài dữ liệu nguồn.</p>`;
      if (type === "scores")
        body = !["approved", "locked"].includes(d.ctx.sheet?.status)
          ? '<div class="notice warn">Bảng tuần chưa được duyệt nên chưa có xếp hạng chính thức.</div>'
          : simpleTable(
              [
                "Hạng trong nhóm",
                "Lớp",
                "Nhóm lớp",
                "Cơ sở",
                ...d.ctx.days.map((day) => day.label),
                "Tổng tuần",
              ],
              d.rank.map((x) => [
                x.rank,
                x.class_name,
                x.class_group_name,
                campusName(x.campus_id),
                ...d.ctx.days.map((day) =>
                  Number(x.daily[day.date] || 0).toFixed(1),
                ),
                x.total.toFixed(1),
              ]),
            );
      if (type === "tasks")
        body = simpleTable(
          ["Công việc", "Nhóm", "Cơ sở", "Hạn", "Trạng thái", "Tiến độ"],
          d.tasks.map((x) => [
            x.title,
            x.group || "",
            campusName(x.campus_id),
            fmtDate(x.due_date),
            statusLabel(x.status),
            (x.progress || 0) + "%",
          ]),
        );
      if (type === "activities")
        body = simpleTable(
          ["Hoạt động", "Nhóm", "Ngày", "Địa điểm", "Trạng thái"],
          d.activities.map((x) => [
            x.name,
            x.category,
            fmtDate(x.date),
            x.location,
            statusLabel(x.status),
          ]),
        );
      if (type === "equipment") {
        const eq = await scoped("equipment");
        body = simpleTable(
          ["Mã", "Thiết bị", "Số lượng", "Tình trạng", "Nơi lưu"],
          eq.map((x) => [
            x.code,
            x.name,
            `${x.quantity} ${x.unit || ""}`,
            x.condition,
            x.location,
          ]),
        );
      }
      return `<div class="center"><small>${esc(d.school?.name || "TRƯỜNG TH-THCS")}</small><h2 style="margin:8px 0">${title}</h2><p>${esc(d.week?.name || "")} • ${esc(campusName(state.campusId))}</p></div><div class="split"><small>Tạo lúc: ${fmtDateTime(now())}</small><small>Phạm vi dữ liệu: ${esc(d.week?.name || "Năm học")} / ${esc(campusName(state.campusId))}</small></div><hr style="border:0;border-top:1px solid var(--line)">${body}<div style="display:grid;grid-template-columns:1fr 1fr;text-align:center;margin-top:35px"><div><strong>Người lập báo cáo</strong></div><div><strong>Xác nhận của nhà trường</strong></div></div>`;
    }
    function exportReportCSV(type, d) {
      let head = [],
        rows = [];
      if (type === "scores") {
        head = [
          "Hạng trong nhóm",
          "Lớp",
          "Nhóm lớp",
          "Cơ sở",
          ...d.ctx.days.map((day) => `${day.label} (${day.date})`),
          "Tổng tuần",
        ];
        rows = d.rank.map((x) => [
          x.rank,
          x.class_name,
          x.class_group_name,
          campusName(x.campus_id),
          ...d.ctx.days.map((day) => x.daily[day.date] || 0),
          x.total,
        ]);
      } else {
        head = [
          "Công việc",
          "Nhóm",
          "Cơ sở",
          "Hạn",
          "Trạng thái",
          "Tiến độ",
        ];
        rows = d.tasks.map((x) => [
          x.title,
          x.group,
          campusName(x.campus_id),
          x.due_date,
          statusLabel(x.status),
          x.progress,
        ]);
      }
      download(
        "\ufeff" +
          [head, ...rows].map((r) => r.map(csvSafe).join(",")).join("\r\n"),
        `bao-cao-${type}-${today()}.csv`,
        "text/csv;charset=utf-8",
      );
    }

    return { reportHTML, exportReportCSV };
  }

  window.TPTAppModules = window.TPTAppModules || {};
  window.TPTAppModules.reportFormatters = Object.freeze({ createController });
})(window);
