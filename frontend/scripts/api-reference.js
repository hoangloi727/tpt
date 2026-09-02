(function (window) {
  "use strict";

  const STORES = [
    "profiles", "schools", "campuses", "school_years", "semesters", "school_weeks",
    "grades", "classes", "class_groups", "homeroom_teachers", "plans", "plan_targets",
    "tasks", "task_check_items", "task_dependencies", "calendar_events",
    "activity_categories", "activities", "activity_classes", "activity_check_items",
    "criteria_sets", "criteria_groups", "criteria", "weekly_score_sheets",
    "score_grader_assignments", "score_entries", "score_evidence", "ranking_snapshots",
    "team_units", "team_positions", "team_members", "training_records", "programs",
    "program_results", "commendations", "documents", "attachments", "equipment",
    "equipment_transactions", "report_templates", "generated_reports", "audit_logs",
    "app_settings", "config_categories", "config_items", "custom_field_definitions",
    "document_folders", "document_links", "file_versions", "migration_logs",
    "task_templates", "score_component_versions", "license_events", "operation_journal",
    "internal_snapshots", "form_drafts", "restore_staging", "backup_handles",
    "backup_records", "year_transition_logs", "report_packages",
  ];

  const GROUPS = {
    setup: ["Khởi tạo", "Setup"],
    session: ["Phiên", "Session"],
    account: ["Tài khoản", "Account"],
    admin: ["Quản trị", "Admin"],
    health: ["Trạng thái", "Health"],
    export: ["Xuất dữ liệu", "Export"],
    import: ["Nhập dữ liệu", "Import"],
    migrations: ["Migration nội bộ", "Internal migrations"],
    stores: ["Store tổng quát", "Generic stores"],
  };

  const ENDPOINTS = [
    ["GET", "/api/auth/status", "setup", "Trạng thái khởi tạo", "Setup status", "Công khai; trả setupRequired và danh sách trường.", "Public; returns setupRequired and the school list.", "200 JSON"],
    ["POST", "/api/auth/setup", "setup", "Tạo tài khoản root", "Create root account", "Chỉ khi chưa có tài khoản; tạo Superadmin root và phiên. Body gồm username, displayName, password và schoolId hoặc schoolName.", "First run only; creates the root Superadmin and a session. Body contains username, displayName, password, and schoolId or schoolName.", "201 / 409"],
    ["POST", "/api/session", "session", "Đăng nhập", "Sign in", "Công khai; body gồm username, password, schoolId. Cookie phiên được đặt khi thành công.", "Public; body contains username, password, and schoolId. Sets the session cookie on success.", "200 / 401 / 409"],
    ["GET", "/api/session", "session", "Đọc phiên hiện tại", "Read current session", "Cần phiên hợp lệ; trả { user }.", "Requires a valid session; returns { user }.", "200 / 401"],
    ["DELETE", "/api/session", "session", "Đăng xuất", "Sign out", "Thu hồi phiên hiện tại và xóa cookie; vẫn trả thành công nếu phiên đã hết hạn.", "Revokes the current session and clears its cookie; still succeeds after session expiry.", "200"],
    ["POST", "/api/session/school", "session", "Chuyển trường đang chọn", "Switch selected school", "Chỉ Superadmin; body { schoolId }. Cập nhật phạm vi trường của phiên.", "Superadmin only; body { schoolId }. Updates the session's school scope.", "200 / 400 / 403"],
    ["PATCH", "/api/account", "account", "Cập nhật tài khoản của tôi", "Update my account", "Chỉ nhận displayName, currentPassword, password. Đổi mật khẩu yêu cầu mật khẩu hiện tại và thu hồi các phiên.", "Accepts only displayName, currentPassword, and password. A password change requires the current password and revokes sessions.", "200 / 400"],
    ["GET", "/api/admin/schools", "admin", "Danh sách trường", "List schools", "Chỉ Superadmin; trả tất cả trường.", "Superadmin only; returns all schools.", "200 / 403"],
    ["POST", "/api/admin/schools", "admin", "Tạo trường", "Create school", "Chỉ Superadmin; body { name }.", "Superadmin only; body { name }.", "201 / 400 / 409"],
    ["GET", "/api/admin/users", "admin", "Danh sách người dùng", "List users", "Admin hoặc Superadmin; kết quả được giới hạn theo trường và vai trò.", "Admin or Superadmin; results are constrained by school and role.", "200 / 403"],
    ["POST", "/api/admin/users", "admin", "Tạo người dùng", "Create user", "Admin hoặc Superadmin; body có username, displayName, password, role, permissions. Máy chủ tự gán trường.", "Admin or Superadmin; body may contain username, displayName, password, role, and permissions. The server assigns the school.", "201 / 400 / 409"],
    ["PATCH", "/api/admin/users/:id", "admin", "Cập nhật người dùng", "Update user", "Admin hoặc Superadmin trong phạm vi cho phép. Không gửi schoolId; không thể sửa vai trò/trạng thái root.", "Admin or Superadmin within allowed scope. Do not send schoolId; root role/status cannot be changed.", "200 / 400 / 403 / 404"],
    ["DELETE", "/api/admin/users/:id", "admin", "Xóa người dùng", "Delete user", "Không thể xóa root hoặc tài khoản của phiên hiện tại. Thu hồi phiên và dọn phân công khi phù hợp.", "Cannot delete root or the current session's account. Revokes sessions and clears assignments where applicable.", "200 / 400 / 403 / 404"],
    ["GET", "/api/health", "health", "Sức khỏe có xác thực", "Authenticated health", "Không phải health check công khai; trả schema, previousSchema và user của phiên.", "Not a public health check; returns schema, previousSchema, and the session user.", "200 / 401"],
    ["GET", "/api/export", "export", "Xuất backup của trường", "Export school backup", "Cần data:export; gồm mọi store và bản ghi soft-delete trong trường đang chọn. Kết quả là dữ liệu riêng tư.", "Requires data:export; includes every store and soft-deleted record in the selected school. The result is private data.", "200 / 403"],
    ["POST", "/api/import/replace", "import", "Thay thế từ backup", "Replace from backup", "Cần data:import; body chỉ có { payload }. Máy chủ sở hữu phạm vi, metadata và ngữ nghĩa restore; tạo backup và xác nhận trước.", "Requires data:import; body is only { payload }. The server owns scope, metadata, and restore semantics; back up and confirm first.", "200 / 400 / 403"],
    ["POST", "/api/import/merge", "import", "Merge backup trên máy chủ", "Server-side backup merge", "Cần data:import; body chỉ có { payload }. Máy chủ so revision rồi updated_at, bỏ qua store backup bị loại, merge theo transaction và trả thống kê inserted/updated/kept_current theo store.", "Requires data:import; body is only { payload }. The server compares revision then updated_at, skips excluded backup stores, merges transactionally, and returns per-store inserted/updated/kept_current statistics.", "200 / 400 / 403"],
    ["POST", "/api/migrations/enhanced-data", "migrations", "Chuẩn hóa dữ liệu nội bộ", "Normalize internal data", "Chỉ Admin hoặc Superadmin; chuẩn hóa metadata nâng cao trong trường đang chọn và trả { normalized }.", "Admin or Superadmin only; normalizes enhanced metadata in the selected school and returns { normalized }.", "200 / 400 / 403"],
    ["GET", "/api/stores/:store", "stores", "Liệt kê bản ghi", "List records", "Mặc định bỏ bản ghi soft-delete; ?includeDeleted=1 gồm cả bản ghi đã xóa.", "Excludes soft-deleted records by default; ?includeDeleted=1 includes them.", "200 / 403 / 404"],
    ["GET", "/api/stores/:store/:id", "stores", "Đọc một bản ghi", "Read one record", "ID phải URL-encode. ?optional=1 trả 200 null thay cho 404 khi không tìm thấy.", "The ID must be URL-encoded. ?optional=1 returns 200 null instead of 404 when absent.", "200 / 403 / 404"],
    ["POST", "/api/stores/:store", "stores", "Tạo hoặc cập nhật", "Create or update", "Body { row, archivedYearReason? }. Lý do chỉ dành cho manager hiệu chỉnh năm đã lưu trữ, tối thiểu 10 ký tự và được máy chủ audit; cập nhật cần revision mới nhất.", "Body { row, archivedYearReason? }. The reason is manager-only for correcting an archived year, requires at least 10 characters, and is server-audited; updates need the latest revision.", "200 / 400 / 403 / 409"],
    ["POST", "/api/stores/:store/bulk", "stores", "Ghi nhiều bản ghi", "Bulk write", "Body { rows, archivedYearReason? }. Lý do có cùng giới hạn manager, năm đã lưu trữ, 10 ký tự và audit; ID trùng trong batch bị từ chối.", "Body { rows, archivedYearReason? }. The reason has the same manager, archived-year, 10-character, and audit restrictions; duplicate batch IDs are rejected.", "200 / 400 / 403 / 409"],
    ["DELETE", "/api/stores/:store/:id", "stores", "Xóa một bản ghi", "Delete one record", "Mặc định soft-delete; ?hard=1 chỉ dành cho Admin/Superadmin và xóa vật lý. Một số store luôn hard-delete theo chính sách máy chủ.", "Soft-deletes by default; ?hard=1 is restricted to Admin/Superadmin and deletes physically. Some stores always hard-delete by server policy.", "200 / 400 / 403 / 409"],
    ["DELETE", "/api/stores/:store", "stores", "Xóa toàn bộ store", "Clear an entire store", "Chỉ Admin/Superadmin; xóa vật lý mọi bản ghi của store trong trường đang chọn, nguy hiểm và không có body xác nhận.", "Admin/Superadmin only; physically deletes every record in the store for the selected school, dangerous and has no confirmation body.", "200 / 403"],
  ];

  const COPY = {
    vi: {
      title: "Tham chiếu API nội bộ",
      subtitle: "Tài liệu chỉ đọc cho manager về API riêng tư, cùng origin hiện tại.",
      language: "Ngôn ngữ",
      warningTitle: "API riêng tư, không phải hợp đồng tích hợp công khai",
      warning: "Chỉ gọi từ frontend do máy chủ ứng dụng phục vụ cùng origin. Không bật CORS, không đưa cookie hoặc token vào URL, log, Git hay localStorage. Trang này không có trình thực thi request.",
      overview: "Kết nối và phiên",
      base: "Base URL",
      transport: "Giao thức",
      transportValue: "JSON UTF-8; phản hồi no-store; body tối đa 100 MiB",
      auth: "Xác thực",
      authValue: "Cookie HttpOnly tpt_session, Path=/api, SameSite=Strict",
      lifetime: "Vòng đời phiên",
      lifetimeValue: "TTL trượt 12 giờ; mất khi tiến trình máy chủ khởi động lại",
      scope: "Phạm vi",
      scopeValue: "Mọi dữ liệu store bị giới hạn bởi selectedSchoolId của phiên",
      filters: "Bộ lọc endpoint",
      search: "Tìm endpoint, đường dẫn hoặc mô tả",
      method: "Tất cả method",
      group: "Tất cả nhóm",
      result: (shown, total) => `${shown}/${total} endpoint`,
      noResult: "Không có endpoint khớp bộ lọc.",
      access: "Truy cập / kết quả",
      examples: "Ví dụ an toàn",
      curlTitle: "curl với cookie jar riêng tư",
      curlNote: "Đặt quyền 600 cho tệp JSON đăng nhập và cookie jar; không commit hoặc chia sẻ chúng. Ví dụ chỉ đọc dưới đây giả định login.private.json chứa username, password và schoolId.",
      fetchTitle: "fetch cùng origin",
      fetchNote: "Cookie HttpOnly được trình duyệt quản lý. Luôn đặt credentials: same-origin; đừng cố đọc token bằng JavaScript.",
      contract: "Quy tắc dữ liệu",
      permissionsTitle: "Quyền và vai trò",
      permissions: "Admin và Superadmin vượt qua quyền store thông thường. User cần store:<store>:read/write; dashboard chỉ mở quyền đọc một tập store giao diện. data:export và data:import là quyền riêng. Ẩn route ở UI không thay thế kiểm tra 403 phía máy chủ.",
      revisionTitle: "Revision và metadata",
      revision: "Đọc bản ghi mới nhất rồi gửi lại revision khi cập nhật. 409 RevisionConflictError yêu cầu tải lại và đối chiếu, không retry bằng cách bỏ revision. Máy chủ sở hữu id mặc định, school_profile_id, timestamps, revision, source, device_id, audit và operation journal.",
      archivedTitle: "Hiệu chỉnh năm học đã lưu trữ",
      archived: "Generic single/bulk write nhận archivedYearReason tùy chọn ở cấp cao nhất. Chỉ manager dùng khi năm đã lưu trữ được mở để hiệu chỉnh; lý do sau trim phải có ít nhất 10 ký tự và được máy chủ ghi vào dấu vết audit.",
      reservedTitle: "Tùy chọn nội bộ bị từ chối / dành riêng",
      reserved: "audit, journal, allowArchivedYear, preserveMetadata và resolveConflict trong options bị máy chủ từ chối với 400 trên generic write và import. Tùy chọn import không được chuyển tiếp. archivedYearReason là trường top-level riêng, không phải options bypass. Không ghi trực tiếp operation_journal hoặc dùng audit_logs như store nghiệp vụ.",
      blobTitle: "Blob envelope",
      blob: "Không có multipart/form-data. Dữ liệu nhị phân đi qua JSON envelope bên dưới và có thể lồng trong object/array. Ưu tiên window.ApiDataProvider để mã hóa/giải mã. FileSystemHandle trở thành null.",
      errorsTitle: "Lỗi cần xử lý",
      errors: "Dựa vào HTTP status và name, không parse câu thông báo: 400 dữ liệu/ràng buộc; 401 phiên; 403 quyền/phạm vi; 404 route/store/bản ghi; 405 method; 409 xung đột; 413 quá 100 MiB; 500 lỗi nội bộ. Thành công có thể là null, true, số, mảng hoặc object.",
      storesTitle: "Danh mục store",
      storesNote: "61 store hợp lệ. Các store vận hành, nhật ký và backup vẫn là chi tiết nội bộ dù có trong danh mục.",
      docs: "Tài liệu nguồn trong repository: api.md và manual.md. Máy chủ chỉ phục vụ cây frontend, nên đây là tham chiếu tên tệp, không phải liên kết web.",
      checklistTitle: "Checklist client an toàn",
      checklist: ["Dùng HTTPS khi triển khai thật.", "URL-encode store và record ID.", "Không log mật khẩu, cookie, Authorization hoặc nội dung backup.", "Xác nhận và backup trước import replace, hard delete hoặc clear.", "Giữ API, JSON, Admin, Superadmin và User đúng nghĩa trong UI."],
    },
    en: {
      title: "Private API reference",
      subtitle: "Read-only manager reference for the current private same-origin API.",
      language: "Language",
      warningTitle: "Private API, not a public integration contract",
      warning: "Call it only from the frontend served by the application server on the same origin. Do not enable CORS or put cookies or tokens in URLs, logs, Git, or localStorage. This page has no request executor.",
      overview: "Connection and session",
      base: "Base URL",
      transport: "Transport",
      transportValue: "UTF-8 JSON; no-store responses; 100 MiB maximum body",
      auth: "Authentication",
      authValue: "HttpOnly tpt_session cookie, Path=/api, SameSite=Strict",
      lifetime: "Session lifetime",
      lifetimeValue: "Sliding 12-hour TTL; lost when the server process restarts",
      scope: "Scope",
      scopeValue: "All store data is constrained by the session's selectedSchoolId",
      filters: "Endpoint filters",
      search: "Search endpoint, path, or description",
      method: "All methods",
      group: "All groups",
      result: (shown, total) => `${shown}/${total} endpoints`,
      noResult: "No endpoints match these filters.",
      access: "Access / result",
      examples: "Safe examples",
      curlTitle: "curl with a private cookie jar",
      curlNote: "Set mode 600 on the login JSON and cookie jar; never commit or share them. This read-only example assumes login.private.json contains username, password, and schoolId.",
      fetchTitle: "Same-origin fetch",
      fetchNote: "The browser manages the HttpOnly cookie. Always set credentials: same-origin; never try to read the token with JavaScript.",
      contract: "Data contract",
      permissionsTitle: "Permissions and roles",
      permissions: "Admin and Superadmin bypass ordinary store permissions. A User needs store:<store>:read/write; dashboard grants read access only to a UI store set. data:export and data:import are separate permissions. Hiding a UI route never replaces server-side 403 enforcement.",
      revisionTitle: "Revision and metadata",
      revision: "Read the latest record and send its revision when updating. A 409 RevisionConflictError requires reload and reconciliation, not a retry with revision removed. The server owns default id, school_profile_id, timestamps, revision, source, device_id, audit, and operation journal.",
      archivedTitle: "Archived-year correction",
      archived: "Generic single/bulk writes accept optional top-level archivedYearReason. It is manager-only, used when an archived year is opened for correction, must contain at least 10 trimmed characters, and is recorded in the server audit trail.",
      reservedTitle: "Rejected / reserved internal options",
      reserved: "The server rejects audit, journal, allowArchivedYear, preserveMetadata, or resolveConflict in options with 400 on generic writes and imports. Import options are not forwarded. archivedYearReason is a separate top-level field, not an options bypass. Do not write operation_journal directly or treat audit_logs as a business store.",
      blobTitle: "Blob envelope",
      blob: "There is no multipart/form-data route. Binary data travels in the JSON envelope below and may be nested in objects/arrays. Prefer window.ApiDataProvider for encoding and decoding. FileSystemHandle becomes null.",
      errorsTitle: "Errors to handle",
      errors: "Use HTTP status and name, not message parsing: 400 data/constraint; 401 session; 403 permission/scope; 404 route/store/record; 405 method; 409 conflict; 413 over 100 MiB; 500 internal error. Success may be null, true, a number, an array, or an object.",
      storesTitle: "Store catalog",
      storesNote: "61 valid stores. Operational, journal, and backup stores remain internal details even though they appear in the catalog.",
      docs: "Repository source documents: api.md and manual.md. The server serves only the frontend tree, so these are filename references, not web links.",
      checklistTitle: "Safe client checklist",
      checklist: ["Use HTTPS in real deployments.", "URL-encode store and record IDs.", "Never log passwords, cookies, Authorization, or backup contents.", "Confirm and back up before import replace, hard delete, or clear.", "Keep familiar terms API, JSON, checklist, Admin, Superadmin, and User in the UI."],
    },
  };

  const CURL = `umask 077
BASE_URL="http://127.0.0.1:3000/api"
COOKIE_JAR="$(mktemp)"
trap 'rm -f "$COOKIE_JAR"' EXIT
chmod 600 ./login.private.json "$COOKIE_JAR"

curl --fail-with-body -c "$COOKIE_JAR" -b "$COOKIE_JAR" \\
  -H "Content-Type: application/json" \\
  --data @login.private.json "$BASE_URL/session"

curl --fail-with-body -b "$COOKIE_JAR" \\
  -H "Accept: application/json" "$BASE_URL/stores/tasks"`;

  const FETCH = `async function api(path, options = {}) {
  const headers = new Headers(options.headers);
  headers.set("Accept", "application/json");
  if (options.body !== undefined && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const response = await fetch(\`/api\${path}\`, {
    ...options,
    headers,
    credentials: "same-origin",
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(payload?.error || \`API failed (\${response.status})\`);
    error.name = payload?.name || "ApiError";
    error.status = response.status;
    throw error;
  }
  return payload;
}

const tasks = await api("/stores/tasks");`;

  const BLOB = `{
  "__type": "Blob",
  "type": "application/pdf",
  "name": "report.pdf",
  "data": "JVBERi0xLjQK...base64..."
}`;

  function renderApiReference(deps) {
    const { setContent, pageHead, esc } = deps || {};
    if (![setContent, pageHead, esc].every((item) => typeof item === "function")) {
      throw new TypeError("renderApiReference requires setContent, pageHead, and esc functions.");
    }

    const state = { lang: "vi", query: "", method: "", group: "" };
    const text = (pair) => pair[state.lang === "vi" ? 0 : 1];
    const code = (value) => `<pre><code>${esc(value)}</code></pre>`;

    function renderEndpointList() {
      const root = document.querySelector(".api-reference");
      if (!root) return;
      const normalized = state.query.trim().toLocaleLowerCase(state.lang === "vi" ? "vi" : "en");
      const matches = ENDPOINTS.filter((endpoint) => {
        const [method, path, group] = endpoint;
        const searchable = endpoint.slice(0, 8).join(" ").toLocaleLowerCase(state.lang === "vi" ? "vi" : "en");
        return (!state.method || method === state.method) &&
          (!state.group || group === state.group) &&
          (!normalized || searchable.includes(normalized));
      });
      const grouped = Object.keys(GROUPS).map((group) => {
        const endpoints = matches.filter((endpoint) => endpoint[2] === group);
        if (!endpoints.length) return "";
        return `<section class="api-reference__endpoint-group" aria-labelledby="api-group-${group}">
          <div class="api-reference__group-head">
            <h3 id="api-group-${group}">${esc(text(GROUPS[group]))}</h3>
            <span>${endpoints.length}</span>
          </div>
          <div class="api-reference__endpoint-grid">${endpoints.map((endpoint) => {
            const [method, path, , viTitle, enTitle, viDescription, enDescription, result] = endpoint;
            return `<article class="api-reference__endpoint">
              <div class="api-reference__endpoint-line">
                <span class="api-reference__method api-reference__method--${method.toLowerCase()}">${esc(method)}</span>
                <code>${esc(path)}</code>
              </div>
              <h4>${esc(state.lang === "vi" ? viTitle : enTitle)}</h4>
              <p>${esc(state.lang === "vi" ? viDescription : enDescription)}</p>
              <div class="api-reference__result"><span>${esc(COPY[state.lang].access)}</span><code>${esc(result)}</code></div>
            </article>`;
          }).join("")}</div>
        </section>`;
      }).join("");
      root.querySelector("[data-api-results]").innerHTML = grouped || `<div class="api-reference__empty">${esc(COPY[state.lang].noResult)}</div>`;
      root.querySelector("[data-api-count]").textContent = COPY[state.lang].result(matches.length, ENDPOINTS.length);
    }

    function renderBody() {
      const c = COPY[state.lang];
      const groupOptions = Object.entries(GROUPS).map(([value, label]) => `<option value="${esc(value)}">${esc(text(label))}</option>`).join("");
      setContent(`${pageHead(c.title, c.subtitle)}
        <div class="api-reference" data-lang="${esc(state.lang)}">
          <div class="api-reference__topline">
            <span class="api-reference__eyebrow">PRIVATE / SAME-ORIGIN / READ-ONLY</span>
            <div class="api-reference__languages" role="group" aria-label="${esc(c.language)}">
              <button type="button" data-api-lang="vi" aria-pressed="${state.lang === "vi"}">Tiếng Việt</button>
              <button type="button" data-api-lang="en" aria-pressed="${state.lang === "en"}">English</button>
            </div>
          </div>

          <aside class="api-reference__warning" role="note">
            <span aria-hidden="true">!</span><div><strong>${esc(c.warningTitle)}</strong><p>${esc(c.warning)}</p></div>
          </aside>

          <section class="api-reference__section" aria-labelledby="api-overview-title">
            <div class="api-reference__section-head"><span>01</span><h2 id="api-overview-title">${esc(c.overview)}</h2></div>
            <div class="api-reference__facts">
              <div><span>${esc(c.base)}</span><code>/api</code></div>
              <div><span>${esc(c.transport)}</span><strong>${esc(c.transportValue)}</strong></div>
              <div><span>${esc(c.auth)}</span><strong>${esc(c.authValue)}</strong></div>
              <div><span>${esc(c.lifetime)}</span><strong>${esc(c.lifetimeValue)}</strong></div>
              <div><span>${esc(c.scope)}</span><strong>${esc(c.scopeValue)}</strong></div>
            </div>
          </section>

          <section class="api-reference__section" aria-labelledby="api-endpoints-title">
            <div class="api-reference__section-head"><span>02</span><h2 id="api-endpoints-title">Endpoints</h2></div>
            <div class="api-reference__filters" role="search" aria-label="${esc(c.filters)}">
              <label class="api-reference__search"><span class="sr-only">${esc(c.search)}</span><input type="search" data-api-query value="${esc(state.query)}" placeholder="${esc(c.search)}" autocomplete="off"></label>
              <label><span class="sr-only">Method</span><select data-api-method><option value="">${esc(c.method)}</option>${["GET", "POST", "PATCH", "DELETE"].map((method) => `<option value="${method}">${method}</option>`).join("")}</select></label>
              <label><span class="sr-only">${esc(c.group)}</span><select data-api-group><option value="">${esc(c.group)}</option>${groupOptions}</select></label>
              <output data-api-count></output>
            </div>
            <div class="api-reference__results" data-api-results aria-live="polite"></div>
          </section>

          <section class="api-reference__section" aria-labelledby="api-examples-title">
            <div class="api-reference__section-head"><span>03</span><h2 id="api-examples-title">${esc(c.examples)}</h2></div>
            <div class="api-reference__code-grid">
              <article><h3>${esc(c.curlTitle)}</h3><p>${esc(c.curlNote)}</p>${code(CURL)}</article>
              <article><h3>${esc(c.fetchTitle)}</h3><p>${esc(c.fetchNote)}</p>${code(FETCH)}</article>
            </div>
          </section>

          <section class="api-reference__section" aria-labelledby="api-contract-title">
            <div class="api-reference__section-head"><span>04</span><h2 id="api-contract-title">${esc(c.contract)}</h2></div>
            <div class="api-reference__notes">
              <article><span>AUTHZ</span><h3>${esc(c.permissionsTitle)}</h3><p>${esc(c.permissions)}</p></article>
              <article><span>409</span><h3>${esc(c.revisionTitle)}</h3><p>${esc(c.revision)}</p></article>
              <article><span>YEAR</span><h3>${esc(c.archivedTitle)}</h3><p>${esc(c.archived)}</p></article>
              <article class="api-reference__note--danger"><span>STOP</span><h3>${esc(c.reservedTitle)}</h3><p>${esc(c.reserved)}</p><code>audit · journal · allowArchivedYear · preserveMetadata · resolveConflict</code></article>
              <article><span>BLOB</span><h3>${esc(c.blobTitle)}</h3><p>${esc(c.blob)}</p>${code(BLOB)}</article>
              <article><span>4XX</span><h3>${esc(c.errorsTitle)}</h3><p>${esc(c.errors)}</p></article>
            </div>
          </section>

          <section class="api-reference__section" aria-labelledby="api-stores-title">
            <div class="api-reference__section-head"><span>05</span><h2 id="api-stores-title">${esc(c.storesTitle)}</h2></div>
            <p class="api-reference__lead">${esc(c.storesNote)}</p>
            <div class="api-reference__store-list">${STORES.map((store) => `<code>${esc(store)}</code>`).join("")}</div>
          </section>

          <section class="api-reference__footer-grid">
            <article><h2>${esc(c.checklistTitle)}</h2><ul>${c.checklist.map((item) => `<li>${esc(item)}</li>`).join("")}</ul></article>
            <aside><p>${esc(c.docs)}</p><code>backend/api.js</code><code>backend/auth.js</code><code>backend/repository.js</code><code>backend/stores.js</code></aside>
          </section>
        </div>`);

      const root = document.querySelector(".api-reference");
      root.querySelector("[data-api-method]").value = state.method;
      root.querySelector("[data-api-group]").value = state.group;
      root.querySelectorAll("[data-api-lang]").forEach((button) => button.addEventListener("click", () => {
        if (state.lang === button.dataset.apiLang) return;
        state.lang = button.dataset.apiLang;
        renderBody();
      }));
      root.querySelector("[data-api-query]").addEventListener("input", (event) => {
        state.query = event.target.value;
        renderEndpointList();
      });
      root.querySelector("[data-api-method]").addEventListener("change", (event) => {
        state.method = event.target.value;
        renderEndpointList();
      });
      root.querySelector("[data-api-group]").addEventListener("change", (event) => {
        state.group = event.target.value;
        renderEndpointList();
      });
      renderEndpointList();
    }

    renderBody();
  }

  window.TPTAppModules = window.TPTAppModules || {};
  window.TPTAppModules.apiReference = Object.freeze({ renderApiReference });
})(window);
