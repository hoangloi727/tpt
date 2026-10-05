(function (window) {
  "use strict";

  function createController(deps) {
    const {
      esc,
      fmtDate,
      fmtDateTime,
      statusLabel,
      simpleTable,
      groupRankings,
      csvSafe,
      scoped,
      campusName,
      state,
      now,
      today,
      download,
    } = deps;

    function faultTable(type, d) {
      const classes = new Map(d.ctx.classes.map((row) => [row.id, row]));
      const faults = d.ctx.entries.flatMap((entry) => {
        const schoolClass = classes.get(entry.class_id);
        if (!schoolClass || entry.entry_state !== "value") return [];
        return (entry.incidents || []).filter((item) => Number(item.points) < 0)
          .map((item) => ({ ...item, schoolClass, date: entry.entry_date }));
      });
      if (type === "fault-frequency") {
        const counts = new Map();
        for (const fault of faults) {
          const key = fault.criteria_id || fault.rule_code || fault.rule_name;
          if (!counts.has(key)) counts.set(key, { code: fault.rule_code || "", name: fault.rule_name || "Chưa rõ nội dung", count: 0 });
          counts.get(key).count++;
        }
        return {
          head: ["Mã lỗi", "Nội dung lỗi", "Số lần xảy ra"],
          rows: [...counts.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "vi"))
            .map((row) => [row.code, row.name, row.count]),
        };
      }
      faults.sort((a, b) => String(a.schoolClass.class_name).localeCompare(String(b.schoolClass.class_name), "vi", { numeric: true }) ||
        a.schoolClass.id.localeCompare(b.schoolClass.id) || a.date.localeCompare(b.date));
      const groups = new Map();
      const rows = faults.map((row) => {
        const values = [row.schoolClass.class_name, campusName(row.schoolClass.campus_id), row.date,
          row.person_name || "", row.rule_code || "", row.rule_name || "Chưa rõ nội dung", Number(row.points)];
        if (!groups.has(row.schoolClass.id)) groups.set(row.schoolClass.id, {
          name: row.schoolClass.class_name, campus: values[1], rows: [],
        });
        groups.get(row.schoolClass.id).rows.push(values);
        return values;
      });
      return {
        head: ["Lớp", "Cơ sở", "Ngày", "Họ và tên", "Mã lỗi", "Nội dung lỗi", "Điểm"],
        rows,
        groups: [...groups.values()],
      };
    }

    async function reportHTML(type, d) {
      const title = {
        week: "BÁO CÁO CÔNG TÁC TUẦN",
        scores: "TỔNG HỢP THI ĐUA LỚP",
        faults: "CHI TIẾT LỖI THEO LỚP",
        "fault-frequency": "THỐNG KÊ TẦN SUẤT LỖI",
        tasks: "BÁO CÁO TIẾN ĐỘ CÔNG VIỆC",
        activities: "BÁO CÁO HOẠT ĐỘNG ĐỘI",
        equipment: "BÁO CÁO THIẾT BỊ ĐỘI",
      }[type];
      let body = "";
      if (type === "faults" || type === "fault-frequency") {
        const table = faultTable(type, d);
        body = '<p>Mỗi ghi nhận trừ điểm được tính là một lần xảy ra, trong tuần và cơ sở đã chọn.</p>' +
          (!["approved", "locked"].includes(d.ctx.sheet?.status) ? '<div class="notice warn">Bảng tuần chưa duyệt; số liệu tạm thời.</div>' : "") +
          (table.rows.length ? (type === "faults"
            ? table.groups.map((group) => `<section><h3>Lớp ${esc(group.name)} • ${esc(group.campus)}</h3>${simpleTable(table.head.slice(2), group.rows.map((row) => row.slice(2)))}</section>`).join("")
            : simpleTable(table.head, table.rows)) : '<p class="muted">Chưa có lỗi trong phạm vi đã chọn.</p>');
      }
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
          : groupRankings(d.rank).map((group) => `<section><h3>${esc(group.name)}</h3>${simpleTable(
              [
                "Hạng trong nhóm",
                "Lớp",
                "Cơ sở",
                ...d.ctx.days.map((day) => day.label),
                "Tổng tuần",
              ],
              group.rows.map((x) => [
                x.rank,
                x.class_name,
                campusName(x.campus_id),
                ...d.ctx.days.map((day) =>
                  Number(x.daily[day.date] || 0).toFixed(1),
                ),
                x.total.toFixed(1),
              ]),
            )}</section>`).join("") || '<p class="muted">Chưa có dữ liệu xếp hạng.</p>';
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
      if (type === "faults" || type === "fault-frequency") {
        const table = faultTable(type, d);
        ({ head, rows } = table);
        if (type === "faults" && table.groups.length) {
          const sections = table.groups.flatMap((group, index) => [
            ...(index ? [[]] : []),
            ["Lớp", group.name, "Cơ sở", group.campus], head,
            ...group.rows,
          ]);
          [head, ...rows] = sections;
        }
      } else if (type === "scores") {
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
      } else if (type === "activities") {
        head = ["Hoạt động", "Nhóm", "Ngày", "Địa điểm", "Trạng thái"];
        rows = d.activities.map((x) => [
          x.name,
          x.category,
          x.date,
          x.location,
          statusLabel(x.status),
        ]);
      } else if (type === "equipment") {
        head = ["Mã", "Thiết bị", "Số lượng", "Tình trạng", "Nơi lưu"];
        rows = (d.equipment || []).map((x) => [
          x.code,
          x.name,
          `${x.quantity} ${x.unit || ""}`,
          x.condition,
          x.location,
        ]);
      } else if (type === "week") {
        head = ["Công việc", "Nhóm", "Cơ sở", "Hạn", "Trạng thái", "Tiến độ"];
        rows = d.tasks.map((x) => [
          x.title,
          x.group,
          campusName(x.campus_id),
          x.due_date,
          statusLabel(x.status),
          x.progress,
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
