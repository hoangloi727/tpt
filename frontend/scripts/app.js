      "use strict";
      (() => {
        const PUBLIC_CONFIG = Object.freeze(window.TPT_APP_CONFIG || {});
        const APP = {
          name: "Trợ lý Tổng phụ trách Đội",
          version: PUBLIC_CONFIG.APP_VERSION || "3.1.0-rc.1",
          schema: Number(PUBLIC_CONFIG.SCHEMA_VERSION || 12),
          dbName: PUBLIC_CONFIG.DB_NAME || "TPT_DOI_DB",
          appId:
            PUBLIC_CONFIG.APP_ID || "vn.giaoducso40.tpt.thcs.standard",
          schoolProfileId:
            PUBLIC_CONFIG.SCHOOL_PROFILE_ID || "thcs-local-profile-001",
          defaultSchoolProfileId:
            PUBLIC_CONFIG.SCHOOL_PROFILE_ID || "thcs-local-profile-001",
          schoolName: PUBLIC_CONFIG.SCHOOL_NAME || "TRƯỜNG",
          schoolLevel: PUBLIC_CONFIG.SCHOOL_LEVEL || "TH-THCS",
          repositoryName: String(PUBLIC_CONFIG.REPOSITORY_NAME || "").trim(),
          basePath: String(PUBLIC_CONFIG.BASE_PATH || "./").trim() || "./",
          backupFormat: "TPT-BACKUP-3",
          buildId: PUBLIC_CONFIG.BUILD_ID || "20260831-api",
        };
        const STORES = [
          "profiles",
          "schools",
          "campuses",
          "school_years",
          "semesters",
          "school_weeks",
          "grades",
          "classes",
          "homeroom_teachers",
          "plans",
          "plan_targets",
          "tasks",
          "task_check_items",
          "task_dependencies",
          "calendar_events",
          "activity_categories",
          "activities",
          "activity_classes",
          "activity_check_items",
          "criteria_sets",
          "criteria_groups",
          "criteria",
          "weekly_score_sheets",
          "score_entries",
          "score_evidence",
          "ranking_snapshots",
          "team_units",
          "team_positions",
          "team_members",
          "training_records",
          "programs",
          "program_results",
          "commendations",
          "documents",
          "attachments",
          "equipment",
          "equipment_transactions",
          "report_templates",
          "generated_reports",
          "audit_logs",
          "app_settings",
          "config_categories",
          "config_items",
          "custom_field_definitions",
          "document_folders",
          "document_links",
          "file_versions",
          "migration_logs",
          "task_templates",
          "score_component_versions",
          "license_events",
          "operation_journal",
          "internal_snapshots",
          "form_drafts",
          "restore_staging",
          "backup_handles",
          "backup_records",
          "year_transition_logs",
          "report_packages",
        ];
        const SYSTEM_STORES = new Set([
          "operation_journal",
          "internal_snapshots",
          "form_drafts",
          "restore_staging",
          "backup_handles",
          "backup_records",
          "migration_logs",
          "audit_logs",
          "license_events",
        ]);
        const SNAPSHOT_EXCLUDED_STORES = new Set([
          ...SYSTEM_STORES,
          "attachments",
          "file_versions",
        ]);
        const EXTERNAL_BACKUP_EXCLUDED_STORES = new Set([
          "operation_journal",
          "internal_snapshots",
          "form_drafts",
          "restore_staging",
          "backup_handles",
        ]);
        const $ = (s) => document.querySelector(s),
          $$ = (s) => [...document.querySelectorAll(s)];
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
        const getDeviceId = () => {
          const key = `${APP.appId}:device-id`;
          try {
            let value = localStorage.getItem(key);
            if (!value) {
              value = `web-${uid()}`;
              localStorage.setItem(key, value);
            }
            return value;
          } catch (_) {
            return `session-${uid()}`;
          }
        };
        const DEVICE_ID = getDeviceId();
        const withoutBinary = (record) =>
          Object.fromEntries(
            Object.entries(record || {}).filter(([, value]) => {
              if (typeof Blob !== "undefined" && value instanceof Blob)
                return false;
              if (typeof FileSystemHandle !== "undefined" && value instanceof FileSystemHandle)
                return false;
              return true;
            }),
          );
        const state = {
          page: "dashboard",
          yearId: "",
          semesterId: "all",
          weekId: "",
          scoreDate: "",
          campusId: "all",
          scoreTab: "entry",
          taskView: "list",
          calendarDate: new Date(),
          lastScoreUndo: null,
          settingsTab: "school",
          documentFolderId: "root",
          documentView: "grid",
          cache: {},
          yearEditOverrides: new Map(),
          hasPendingDraft: false,
          modalReturnFocus: null,
          activeBackup: null,
          unlocked: false,
          setupRequired: false,
          loginSchools: [],
          schoolId: "",
          schoolLogo: null,
          brandLogoUrl: "",
          user: null,
          unlockTimeoutMinutes: 10,
        };

        function applyAuthenticatedUser(user) {
          if (state.schoolId && state.schoolId !== user.selectedSchoolId) {
            state.yearId = "";
            state.semesterId = "all";
            state.weekId = "";
            state.scoreDate = "";
            state.campusId = "all";
            state.criteriaSetId = "";
            state.lastScoreUndo = null;
            state.schoolLogo = null;
          }
          state.user = user;
          state.schoolId = user.selectedSchoolId;
          APP.schoolProfileId = user.selectedSchoolId;
          APP.schoolName = user.selectedSchoolName;
          if (
            !state.loginSchools.some(
              (school) => school.id === user.selectedSchoolId,
            )
          )
            state.loginSchools.push({
              id: user.selectedSchoolId,
              name: user.selectedSchoolName,
            });
          updateSchoolBranding();
        }

        class SessionLockManager {
          constructor() {
            this.failedAttempts = 0;
            this.blockedUntil = 0;
            this.lastActivityAt = Date.now();
            this.hiddenAt = 0;
            this.timer = null;
            this.bound = false;
          }
          async verify({
            username,
            password,
            displayName,
            confirmPassword,
            schoolId,
            schoolName,
          }) {
            if (Date.now() < this.blockedUntil)
              return {
                ok: false,
                wait: Math.ceil((this.blockedUntil - Date.now()) / 1000),
              };
            let user = null,
              errorMessage = "";
            try {
              if (state.setupRequired) {
                if (password !== confirmPassword)
                  throw new Error("Mật khẩu nhập lại không khớp.");
                user = await db.setupRoot({
                  username,
                  password,
                  displayName,
                  schoolId,
                  schoolName,
                });
                state.setupRequired = false;
                updateActivationMode();
              } else user = await db.authenticate(username, password, schoolId);
            } catch (error) {
              errorMessage = error.message;
            }
            if (user) {
              this.failedAttempts = 0;
              this.blockedUntil = 0;
              this.lastActivityAt = Date.now();
              state.unlocked = true;
              applyAuthenticatedUser(user);
              return { ok: true, wait: 0, user };
            }
            this.failedAttempts += 1;
            const delay =
              this.failedAttempts < 3
                ? 0
                : Math.min(30, 2 ** (this.failedAttempts - 3));
            this.blockedUntil = Date.now() + delay * 1000;
            return { ok: false, wait: delay, message: errorMessage };
          }
          start() {
            if (!this.bound) {
              this.bound = true;
              const activity = () => {
                if (state.unlocked && !document.hidden)
                  this.lastActivityAt = Date.now();
              };
              ["pointerdown", "keydown", "touchstart"].forEach((type) =>
                document.addEventListener(type, activity, {
                  passive: true,
                  capture: true,
                }),
              );
              document.addEventListener("visibilitychange", () => {
                if (document.hidden) this.hiddenAt = Date.now();
                else if (
                  state.unlocked &&
                  this.hiddenAt &&
                  Date.now() - this.hiddenAt >= this.timeoutMs()
                )
                  this.lock("Ứng dụng đã tự khóa sau thời gian ở nền.");
                else this.lastActivityAt = Date.now();
              });
            }
            clearInterval(this.timer);
            this.timer = setInterval(() => {
              if (
                state.unlocked &&
                Date.now() - this.lastActivityAt >= this.timeoutMs()
              )
                this.lock("Ứng dụng đã tự khóa do không hoạt động.");
            }, 15000);
            this.updateLabel();
          }
          timeoutMs() {
            return state.unlockTimeoutMinutes * 60 * 1000;
          }
          setTimeoutMinutes(value) {
            state.unlockTimeoutMinutes = [5, 10, 15, 30].includes(
              Number(value),
            )
              ? Number(value)
              : 10;
            this.lastActivityAt = Date.now();
            this.updateLabel();
          }
          updateLabel() {
            const el = $("#sessionChip");
            if (el)
              el.textContent = state.user
                ? `${state.user.displayName} • ${state.user.role === "superadmin" ? "root" : state.user.role}`
                : `Khóa sau ${state.unlockTimeoutMinutes} phút`;
          }
          lock(message = "Ứng dụng đã khóa.") {
            if (
              !state.unlocked &&
              !$("#activationScreen").classList.contains("hidden")
            )
              return;
            // An authenticated session proves root setup is complete. Never flash the setup form on logout.
            state.setupRequired = false;
            state.unlocked = false;
            state.user = null;
            db?.disconnectMemory?.();
            closeModal();
            showActivation(message);
            db.authStatus()
              .then((status) => {
                state.setupRequired = !!status.setupRequired;
                state.loginSchools = status.schools || [];
                updateActivationMode();
              })
              .catch(() => {});
          }
        }
        const sessionLock = new SessionLockManager();

        class TabCoordinator {
          constructor() {
            this.tabId = uid();
            this.readOnly = false;
            this.lockHeld = false;
            this.releaseLock = null;
            this.leaseKey = `${APP.appId}:writer-lease`;
            this.channel = null;
            this.heartbeat = null;
          }
          async start() {
            if (this.started) return;
            this.started = true;
            if (navigator.locks?.request) {
              await new Promise((ready) => {
                navigator.locks
                  .request(
                    `${APP.appId}:writer`,
                    { mode: "exclusive", ifAvailable: true },
                    async (lock) => {
                      if (!lock) {
                        this.readOnly = true;
                        ready();
                        return;
                      }
                      this.lockHeld = true;
                      this.readOnly = false;
                      ready();
                      await new Promise((resolve) => {
                        this.releaseLock = resolve;
                      });
                    },
                  )
                  .catch(() => {
                    this.startLeaseFallback();
                    ready();
                  });
              });
            } else this.startLeaseFallback();
            if ("BroadcastChannel" in window) {
              this.channel = new BroadcastChannel(`${APP.appId}:tabs`);
              this.channel.onmessage = (event) => {
                if (event.data?.type === "data-changed" && this.readOnly)
                  toast("Dữ liệu vừa thay đổi ở thẻ đang có quyền ghi.");
              };
            }
            window.addEventListener("beforeunload", () => this.release());
          }
          startLeaseFallback() {
            try {
              const lease = JSON.parse(localStorage.getItem(this.leaseKey));
              const active =
                lease?.tabId !== this.tabId && lease?.expiresAt > Date.now();
              this.readOnly = !!active;
              if (!active) {
                this.writeLease();
                this.heartbeat = setInterval(() => this.writeLease(), 5000);
              }
            } catch (_) {
              this.readOnly = false;
            }
          }
          writeLease() {
            try {
              localStorage.setItem(
                this.leaseKey,
                JSON.stringify({
                  tabId: this.tabId,
                  expiresAt: Date.now() + 15000,
                }),
              );
            } catch (_) {}
          }
          assertWritable() {
            if (this.readOnly)
              throw new Error(
                "Thẻ này đang ở chế độ chỉ đọc vì một thẻ khác đang có quyền ghi.",
              );
          }
          announceChange(store, id) {
            this.channel?.postMessage({ type: "data-changed", store, id });
          }
          release() {
            if (this.releaseLock) this.releaseLock();
            clearInterval(this.heartbeat);
            if (!this.readOnly) {
              try {
                const lease = JSON.parse(localStorage.getItem(this.leaseKey));
                if (lease?.tabId === this.tabId)
                  localStorage.removeItem(this.leaseKey);
              } catch (_) {}
            }
            this.channel?.close();
          }
        }
        const tabCoordinator = new TabCoordinator();

        class AssistantProvider {
          async answer(q) {
            return buildAssistantAnswer(q);
          }
        }
        class BrowserPlatformAdapter {
          constructor() {
            this.kind = "browser";
            this.contractVersion = "1.0";
          }
          capabilities() {
            return {
              runtime: "browser-pwa",
              filesystem_directory: "showDirectoryPicker" in window,
              secure_keystore: false,
              native_scheduler: false,
              atomic_file_replace: false,
            };
          }
          download(blob, name) {
            const url = URL.createObjectURL(blob),
              anchor = document.createElement("a");
            anchor.href = url;
            anchor.download = name;
            document.body.append(anchor);
            anchor.click();
            anchor.remove();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
          }
          async chooseDirectory() {
            if (!("showDirectoryPicker" in window))
              throw new Error(
                "Trình duyệt này không hỗ trợ chọn thư mục. Hãy dùng tệp tải xuống.",
              );
            return window.showDirectoryPicker({ mode: "readwrite" });
          }
          async permission(handle, request = false) {
            if (!handle?.queryPermission) return false;
            let result = await handle.queryPermission({ mode: "readwrite" });
            if (result !== "granted" && request && handle.requestPermission)
              result = await handle.requestPermission({ mode: "readwrite" });
            return result === "granted";
          }
          async writeFile(handle, name, blob, requestPermission = false) {
            if (!(await this.permission(handle, requestPermission)))
              throw new Error("Chưa có quyền ghi vào thư mục sao lưu.");
            const fileHandle = await handle.getFileHandle(name, {
                create: true,
              }),
              writable = await fileHandle.createWritable();
            try {
              await writable.write(blob);
              await writable.close();
            } catch (error) {
              await writable.abort?.();
              throw error;
            }
            return true;
          }
        }
        const platform = new BrowserPlatformAdapter();
        const db = new window.ApiDataProvider({
            schema: APP.schema,
            stores: STORES,
            beforeWrite: () => tabCoordinator.assertWritable(),
            allowArchivedYear: (row) => {
              const yearId = row?.school_year_id || row?.academic_year_id;
              return !!yearId && state.yearEditOverrides.has(yearId);
            },
            onSave: setSave,
            onChange: (store, id) => tabCoordinator.announceChange(store, id),
          }),
          assistant = new AssistantProvider();

        async function startOperation(operation, details = {}) {
          return db.put(
            "operation_journal",
            {
              operation_id: uid(),
              operation,
              status: "started",
              details,
              started_at: now(),
            },
            { audit: false, journal: false },
          );
        }
        async function finishOperation(row, status, result = {}) {
          if (!row) return;
          const current = await db.get("operation_journal", row.id);
          await db.put(
            "operation_journal",
            {
              ...current,
              status,
              result,
              finished_at: now(),
            },
            { audit: false, journal: false },
          );
        }
        async function recoverInterruptedOperations() {
          for (const row of await db.all("operation_journal"))
            if (row.status === "started")
              await finishOperation(row, "interrupted", {
                reason: "Ứng dụng mở lại trước khi thao tác ghi nhận hoàn tất.",
              });
        }

        const NAV = [
          ["dashboard", "⌂", "Tổng quan"],
          ["today", "◷", "Hôm nay"],
          ["plans", "▤", "Kế hoạch"],
          ["tasks", "✓", "Công việc và checklist"],
          ["calendar", "▦", "Lịch hoạt động"],
          ["scores", "★", "Thi đua lớp"],
          ["activities", "⚑", "Hoạt động Đội"],
          ["organization", "♟", "Tổ chức Liên đội"],
          ["programs", "◇", "Rèn luyện – phong trào"],
          ["commendations", "✦", "Khen thưởng"],
          ["documents", "▧", "Hồ sơ – minh chứng"],
          ["equipment", "◫", "Thiết bị Đội"],
          ["reports", "▥", "Báo cáo"],
          ["assistant", "◎", "Trợ lý tổng hợp"],
          ["backup", "⇄", "Sao lưu – khôi phục"],
          ["users", "♜", "Quản lý người dùng"],
          ["settings", "⚙", "Thiết lập"],
        ];
        function canAccessPage(page) {
          if (["superadmin", "admin"].includes(state.user?.role)) return true;
          const permissions = state.user?.permissions || [];
          return permissions.includes("*") || permissions.includes(page) || permissions.includes(`page:${page}`);
        }
        const ENTITY = {
          plans: {
            title: "Kế hoạch",
            store: "plans",
            desc: "Kế hoạch năm học, học kỳ, tháng và tuần.",
            fields: [
              ["code", "Mã kế hoạch", "text", 1],
              ["name", "Tên kế hoạch", "text", 1],
              [
                "level",
                "Cấp kế hoạch",
                "select",
                1,
                "year: Năm học|semester: Học kỳ|month: Tháng|week: Tuần",
              ],
              ["start_date", "Bắt đầu", "date", 1],
              ["end_date", "Kết thúc", "date", 1],
              ["objectives", "Mục tiêu", "textarea", 1],
              ["targets", "Chỉ tiêu đo được", "textarea"],
              ["basis", "Căn cứ/văn bản liên quan", "textarea"],
              ["coordination", "Đơn vị phối hợp", "text"],
              ["resources", "Nguồn lực", "text"],
              ["risks", "Rủi ro và phương án", "textarea"],
              [
                "status",
                "Trạng thái",
                "select",
                1,
                "draft: Dự thảo|active: Đang thực hiện|finished: Đã kết thúc",
              ],
              ["progress", "Tiến độ (%)", "number"],
            ],
          },
          activities: {
            title: "Hoạt động Đội",
            store: "activities",
            desc: "Tổ chức, theo dõi hoạt động và phương án an toàn.",
            fields: [
              ["name", "Tên hoạt động", "text", 1],
              [
                "category",
                "Nhóm hoạt động",
                "select",
                1,
                "Truyền thống – đạo đức|Học tập – sáng tạo|Kỹ năng sống – an toàn|Văn nghệ – thể thao|Môi trường|Tình nguyện – nhân đạo|Rèn luyện đội viên|Xây dựng tổ chức Đội",
              ],
              ["theme", "Chủ điểm", "text"],
              ["date", "Ngày tổ chức", "date", 1],
              ["location", "Địa điểm", "text", 1],
              ["leader", "Người phụ trách", "text", 1],
              ["participants", "Đối tượng/quy mô", "text"],
              ["objectives", "Mục tiêu", "textarea"],
              ["safety", "Phương án an toàn", "textarea", 1],
              ["backup_plan", "Phương án dự phòng", "textarea"],
              ["result", "Kết quả sau hoạt động", "textarea"],
              [
                "status",
                "Trạng thái",
                "select",
                1,
                "planned: Dự kiến|active: Đang thực hiện|finished: Đã kết thúc",
              ],
            ],
          },
          organization: {
            title: "Tổ chức Liên đội",
            store: "team_members",
            desc: "Ban Chỉ huy, đội nghi lễ, phát thanh măng non và đội nhóm.",
            fields: [
              ["name", "Họ và tên", "text", 1],
              ["internal_code", "Mã nội bộ", "text"],
              ["class_name", "Lớp", "text", 1],
              [
                "unit",
                "Đội/ban",
                "select",
                1,
                "Ban Chỉ huy Liên đội|Ban Chỉ huy Chi đội|Đội nghi lễ|Phát thanh măng non|Đội tự quản|Câu lạc bộ",
              ],
              ["position", "Chức vụ", "text", 1],
              ["term", "Nhiệm kỳ", "text", 1],
              ["training", "Kết quả bồi dưỡng", "textarea"],
            ],
          },
          programs: {
            title: "Rèn luyện – phong trào",
            store: "program_results",
            desc: "Theo dõi chương trình, chuyên hiệu, công trình và việc tốt.",
            fields: [
              ["name", "Tên chương trình/chuyên hiệu", "text", 1],
              ["scope", "Đối tượng/lớp", "text", 1],
              ["result", "Kết quả công nhận", "text"],
              ["recognized_date", "Ngày công nhận", "date"],
              ["activity", "Hoạt động tham gia", "text"],
              ["evidence", "Minh chứng/ghi chú", "textarea"],
              [
                "status",
                "Trạng thái",
                "select",
                1,
                "draft: Đang theo dõi|approved: Đã công nhận",
              ],
            ],
          },
          commendations: {
            title: "Khen thưởng",
            store: "commendations",
            desc: "Hồ sơ khen thưởng tập thể và cá nhân.",
            fields: [
              ["award_type", "Loại khen thưởng", "text", 1],
              ["level", "Cấp khen thưởng", "text", 1],
              ["recipient", "Đối tượng", "text", 1],
              ["achievement", "Thành tích", "textarea", 1],
              ["date", "Thời gian", "date"],
              ["related", "Hoạt động/kỳ thi đua liên quan", "text"],
              [
                "approval_status",
                "Trạng thái xét duyệt",
                "select",
                1,
                "draft: Dự thảo|review: Chờ duyệt|approved: Đã duyệt",
              ],
              ["decision", "Quyết định", "text"],
              ["notes", "Ghi chú", "textarea"],
            ],
          },
          documents: {
            title: "Hồ sơ – minh chứng",
            store: "documents",
            desc: "Thư viện hồ sơ theo năm học và bản ghi liên quan.",
            fields: [
              ["name", "Tên hồ sơ", "text", 1],
              [
                "type",
                "Loại",
                "select",
                1,
                "Kế hoạch|Hoạt động|Thi đua|Tổ chức Đội|Khen thưởng|Báo cáo",
              ],
              ["document_no", "Số hiệu", "text"],
              ["issuer", "Đơn vị ban hành", "text"],
              ["date", "Ngày văn bản", "date"],
              ["related", "Bản ghi liên quan", "text"],
              ["tags", "Thẻ", "text"],
              ["description", "Mô tả/đường dẫn tệp cục bộ", "textarea"],
              [
                "status",
                "Trạng thái",
                "select",
                1,
                "draft: Bản nháp|approved: Đã xác nhận",
              ],
            ],
          },
          equipment: {
            title: "Thiết bị Đội",
            store: "equipment",
            desc: "Kiểm kê, mượn–trả và chuẩn bị thiết bị cho sự kiện.",
            fields: [
              ["name", "Tên thiết bị/vật tư", "text", 1],
              ["code", "Mã", "text", 1],
              ["group", "Nhóm", "text"],
              ["quantity", "Số lượng", "number", 1],
              ["unit", "Đơn vị tính", "text", 1],
              [
                "condition",
                "Tình trạng",
                "select",
                1,
                "Tốt|Cần sửa|Hỏng|Đang mượn",
              ],
              ["location", "Nơi lưu", "text"],
              ["inventory_date", "Ngày kiểm kê", "date"],
              ["activity", "Hoạt động đang sử dụng", "text"],
              ["notes", "Ghi chú hư hỏng/bổ sung", "textarea"],
            ],
          },
        };

        async function boot() {
          try {
            bindActivation();
            sessionLock.start();
            const authStatus = await db.authStatus();
            state.setupRequired = !!authStatus.setupRequired;
            state.loginSchools = authStatus.schools || [];
            updateActivationMode();
            showActivation(
              state.setupRequired
                ? "Khởi tạo tài khoản root đầu tiên để quản trị hệ thống."
                : "Nhập tài khoản để mở phiên làm việc. Ứng dụng không ghi nhớ mật khẩu.",
            );
            registerPWA();
          } catch (e) {
            document.body.innerHTML =
              '<main style="padding:30px;font-family:system-ui"><h1>Không thể khởi động ứng dụng</h1><p>Hãy tải lại trang bằng Chrome, Edge hoặc Safari phiên bản hiện hành.</p></main>';
          }
        }
        function bindActivation() {
          $("#toggleActivationCode").onclick = () => {
            const input = $("#activationCode");
            input.type = input.type === "password" ? "text" : "password";
          };
          $("#activationForm").onsubmit = async (e) => {
            e.preventDefault();
            const button = $("#activateButton"),
              status = $("#activationStatus"),
              passwordInput = $("#activationCode"),
              confirmInput = $("#confirmActivationCode"),
              result = await sessionLock.verify({
                username: $("#activationUsername").value,
                password: passwordInput.value,
                displayName: $("#displayName").value,
                confirmPassword: confirmInput.value,
                schoolId: $("#activationSchool").value,
                schoolName: $("#activationSchoolName").value,
              });
            passwordInput.value = "";
            confirmInput.value = "";
            if (!result.ok) {
              status.style.color = "var(--red)";
              status.textContent = result.wait
                ? `Mật khẩu không đúng. Thử lại sau ${result.wait} giây.`
                : result.message || "Tên đăng nhập hoặc mật khẩu không đúng.";
              passwordInput.focus();
              if (result.wait) {
                button.disabled = true;
                setTimeout(() => {
                  button.disabled = false;
                  status.textContent = "Có thể thử lại mật khẩu.";
                  status.style.color = "var(--muted)";
                  passwordInput.focus();
                }, result.wait * 1000);
              }
              return;
            }
            button.disabled = true;
            status.style.color = "var(--muted)";
            status.textContent = "Đang mở dữ liệu trên máy chủ…";
            try {
              await launchApp();
            } catch (err) {
              state.unlocked = false;
              showActivation("Không thể mở dữ liệu: " + err.message);
              status.style.color = "var(--red)";
            } finally {
              button.disabled = false;
            }
          };
        }
        function updateActivationMode() {
          const setupRequired = state.setupRequired,
            hasSchools = state.loginSchools.length > 0,
            displayName = $("#displayName"),
            confirmation = $("#confirmActivationCode"),
            schoolSelect = $("#activationSchool"),
            schoolName = $("#activationSchoolName");
          fillSelect(
            schoolSelect,
            state.loginSchools.map((school) => [school.id, school.name]),
            schoolSelect.value || state.loginSchools[0]?.id,
          );
          $("#schoolSelectField").classList.toggle("hidden", !hasSchools);
          $("#schoolNameField").classList.toggle(
            "hidden",
            !setupRequired || hasSchools,
          );
          schoolSelect.disabled = !hasSchools;
          schoolSelect.required = hasSchools;
          schoolName.disabled = !setupRequired || hasSchools;
          schoolName.required = setupRequired && !hasSchools;
          $("#displayNameField").classList.toggle("hidden", !setupRequired);
          $("#confirmPasswordField").classList.toggle("hidden", !setupRequired);
          displayName.disabled = !setupRequired;
          confirmation.disabled = !setupRequired;
          displayName.required = setupRequired;
          confirmation.required = setupRequired;
          $("#activationPasswordLabel").textContent = setupRequired
            ? "Mật khẩu root"
            : "Mật khẩu";
          $("#activationCode").autocomplete = state.setupRequired
            ? "new-password"
            : "current-password";
          $("#activateButton").textContent = state.setupRequired
            ? "Tạo tài khoản root"
            : "Đăng nhập";
        }
        function showActivation(
          message = "Nhập tài khoản để mở phiên làm việc. Ứng dụng không ghi nhớ mật khẩu.",
        ) {
          updateActivationMode();
          $("#activationScreen").classList.remove("hidden");
          $("#appShell").classList.add("hidden");
          $("#appShell").setAttribute("inert", "");
          $("#appShell").setAttribute("aria-hidden", "true");
          $("#activationStatus").textContent = message;
          $("#activationStatus").style.color = "var(--muted)";
          $("#activationUsername").value = "";
          $("#displayName").value = "";
          $("#activationSchoolName").value = "";
          $("#activationCode").value = "";
          $("#confirmActivationCode").value = "";
          setTimeout(() => $("#activationUsername").focus(), 30);
        }
        async function launchApp() {
          if (!db.db) {
            await tabCoordinator.start();
            await db.open();
            bindShell();
            updateNetwork();
            window.addEventListener("online", updateNetwork);
            window.addEventListener("offline", updateNetwork);
          }
          if (
            !tabCoordinator.readOnly &&
            ["superadmin", "admin"].includes(state.user?.role)
          ) {
            await recoverInterruptedOperations();
            await ensureSeed();
            await migrateEnhancedData();
            await generateRecurringTasks();
            await ensureStorageProtection();
            await ensureScheduledSnapshots();
            await ensureScheduledDirectoryBackup();
          }
          await loadContext();
          const [activeSchool] = await db.all("schools");
          state.schoolLogo = activeSchool?.brand_logo || null;
          updateSchoolBranding();
          renderNav();
          sessionLock.setTimeoutMinutes(
            Number(await setting("auto_lock_minutes")) || 10,
          );
          const manager = ["superadmin", "admin"].includes(state.user?.role);
          $("#quickAdd").classList.toggle("hidden", !manager);
          document.body.dataset.paper =
            (await setting("paper_orientation")) || "landscape";
          const route = location.hash.replace(/^#/, ""),
            initialPage = NAV.some(([id]) => id === route) && canAccessPage(route)
              ? route
              : "dashboard";
          if (!location.hash)
            history.replaceState(null, "", `#${initialPage}`);
          await go(initialPage, false, true);
          $("#activationScreen").classList.add("hidden");
          $("#appShell").classList.remove("hidden");
          $("#appShell").removeAttribute("inert");
          $("#appShell").removeAttribute("aria-hidden");
          if (
            state.user?.role === "superadmin" &&
            !tabCoordinator.readOnly &&
            !(await setting("onboarded"))
          )
            showOnboarding();
        }
        function updateSchoolBranding() {
          const schoolName =
            state.user?.selectedSchoolName || APP.schoolName || "TRƯỜNG";
          const brand = $("#selectedSchoolName");
          if (brand) brand.textContent = schoolName.toUpperCase();
          const mark = $(".brand-mark");
          if (mark) {
            if (state.brandLogoUrl) URL.revokeObjectURL(state.brandLogoUrl);
            state.brandLogoUrl = "";
            mark.replaceChildren();
            if (state.schoolLogo instanceof Blob) {
              state.brandLogoUrl = URL.createObjectURL(state.schoolLogo);
              const image = document.createElement("img");
              image.src = state.brandLogoUrl;
              image.alt = "";
              mark.append(image);
            } else mark.textContent = "Đ";
          }
          const selector = $("#schoolSelect"),
            canSwitch = state.user?.role === "superadmin";
          if (selector) {
            selector.classList.toggle("hidden", !canSwitch);
            if (canSwitch)
              fillSelect(
                selector,
                state.loginSchools.map((school) => [school.id, school.name]),
                state.schoolId,
              );
          }
          document.title = `${schoolName} - Trợ lý Tổng phụ trách Đội`;
        }
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
        function bindShell() {
          $("#toggleSidebar").onclick = () => {
            $("#sidebar").classList.toggle("collapsed");
            document.body.classList.toggle(
              "sidebar-collapsed",
              $("#sidebar").classList.contains("collapsed"),
            );
          };
          $("#modalClose").onclick = closeModal;
          $("#modalLayer").addEventListener("click", (e) => {
            if (e.target.id === "modalLayer") closeModal();
          });
          $("#modalFoot").addEventListener(
            "click",
            (e) => {
              const id = e.target.closest("button")?.id || "";
              state.modalSaveIntent =
                /save|confirm|create|finalize|activate|finish|doBackup/i.test(
                  id,
                ) && !/cancel|close/i.test(id);
            },
            true,
          );
          $("#quickAdd").onclick = showQuickAdd;
          $("#mobileContext").onclick = showMobileContext;
          $("#schoolSelect").onchange = async (event) => {
            const selector = event.target,
              previousSchoolId = state.schoolId;
            if (
              state.user?.role !== "superadmin" ||
              selector.value === previousSchoolId
            )
              return;
            selector.disabled = true;
            try {
              const user = await db.switchSchool(selector.value);
              applyAuthenticatedUser(user);
              await launchApp();
              toast(`Đã chuyển sang ${user.selectedSchoolName}`);
            } catch (error) {
              selector.value = previousSchoolId;
              toast(error.message, "bad");
            } finally {
              selector.disabled = false;
            }
          };
          $("#lockNow").onclick = () => sessionLock.lock("Đã đăng xuất. Hãy đăng nhập để tiếp tục.");
          const followRoute = () => {
            const page = location.hash.replace(/^#/, "");
            if (NAV.some(([id]) => id === page) && page !== state.page)
              go(page, false, true);
          };
          window.addEventListener("hashchange", followRoute);
          window.addEventListener("popstate", followRoute);
          $("#globalSearch").addEventListener(
            "input",
            debounce(globalSearch, 250),
          );
          $("#yearSelect").onchange = (e) => {
            state.yearId = e.target.value;
            state.semesterId = "all";
            state.weekId = "";
            refreshContext();
          };
          $("#semesterSelect").onchange = (e) => {
            state.semesterId = e.target.value;
            refreshContext();
          };
          $("#weekSelect").onchange = (e) => {
            state.weekId = e.target.value;
            refreshContext();
          };
          $("#campusSelect").onchange = (e) => {
            state.campusId = e.target.value;
            refreshContext();
          };
          document.addEventListener("keydown", (e) => {
            if (e.key === "Escape") closeModal();
            if (
              e.key === "Tab" &&
              $("#modalLayer").classList.contains("open")
            ) {
              const focusable = [
                ...$("#modal").querySelectorAll(
                  'button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href],[tabindex]:not([tabindex="-1"])',
                ),
              ].filter((element) => element.offsetParent !== null);
              if (focusable.length) {
                const first = focusable[0],
                  last = focusable[focusable.length - 1];
                if (e.shiftKey && document.activeElement === first) {
                  e.preventDefault();
                  last.focus();
                } else if (!e.shiftKey && document.activeElement === last) {
                  e.preventDefault();
                  first.focus();
                }
              }
            }
            if (
              ["ArrowDown", "ArrowUp", "Enter"].includes(e.key) &&
              $("#globalSuggestions")
            ) {
              const items = $$("#globalSuggestions button");
              if (!items.length) return;
              const current = Math.max(
                0,
                items.findIndex((x) => x.classList.contains("active")),
              );
              if (e.key === "Enter") {
                e.preventDefault();
                items[current].click();
                return;
              }
              e.preventDefault();
              items[current].classList.remove("active");
              const next =
                e.key === "ArrowDown"
                  ? (current + 1) % items.length
                  : (current - 1 + items.length) % items.length;
              items[next].classList.add("active");
              items[next].scrollIntoView({ block: "nearest" });
            }
            if (e.ctrlKey && e.key.toLowerCase() === "k") {
              e.preventDefault();
              $("#globalSearch").focus();
            }
            if (
              e.ctrlKey &&
              e.key === "Enter" &&
              !$("#modalLayer").classList.contains("open")
            ) {
              e.preventDefault();
              showQuickAdd();
            }
          });
        }
        async function ensureSeed() {
          const [schools, existingYears] = await Promise.all([
            db.all("schools"),
            db.all("school_years"),
          ]);
          if (existingYears.length) return;
          const yid = uid(),
            c1 = uid(),
            c2 = uid();
          if (!schools.length)
            await db.put("schools", {
              id: "school-main",
              name:
                APP.schoolName === "TRƯỜNG TH-THCS"
                  ? "TRƯỜNG TH-THCS (CHƯA CẤU HÌNH)"
                  : APP.schoolName,
              code: "",
              address: "",
              is_sample: APP.schoolName === "TRƯỜNG TH-THCS",
            });
          await db.bulkPut("campuses", [
            { id: c1, name: "Cơ sở 1", code: "CS1" },
            { id: c2, name: "Cơ sở 2", code: "CS2" },
          ]);
          await db.put("school_years", {
            id: yid,
            name: "2026–2027",
            start_date: "2026-08-15",
            end_date: "2027-05-31",
            is_current: true,
          });
          await db.bulkPut("semesters", [
            {
              id: uid(),
              school_year_id: yid,
              name: "Học kỳ I",
              start_date: "2026-08-15",
              end_date: "2027-01-10",
            },
            {
              id: uid(),
              school_year_id: yid,
              name: "Học kỳ II",
              start_date: "2027-01-11",
              end_date: "2027-05-31",
            },
          ]);
          const weeks = [];
          let d = new Date("2026-08-17T00:00:00");
          for (let i = 1; i <= 40; i++) {
            let end = new Date(d);
            end.setDate(end.getDate() + 6);
            weeks.push({
              id: uid(),
              school_year_id: yid,
              number: i,
              name: `Tuần ${i}`,
              start_date: localISO(d),
              end_date: localISO(end),
            });
            d.setDate(d.getDate() + 7);
          }
          await db.bulkPut("school_weeks", weeks);
          const classes = [];
          for (const [campus, prefix] of [
            [c1, "A"],
            [c2, "B"],
          ])
            for (let g = 6; g <= 9; g++)
              for (let n = 1; n <= 2; n++)
                classes.push({
                  id: uid(),
                  school_year_id: yid,
                  campus_id: campus,
                  grade: g,
                  class_name: `${g}/${prefix}${n}`,
                  teacher: "",
                  active: true,
                  is_sample: true,
                });
          await db.bulkPut("classes", classes);
          const setId = uid();
          await db.put("criteria_sets", {
            id: setId,
            school_year_id: yid,
            campus_id: "all",
            name: "Mẫu tham khảo – cần nhà trường phê duyệt trước khi sử dụng",
            version: "1.0",
            formula: "base",
            base_score: 100,
            status: "draft",
            effective_date: "2026-08-15",
            basis: "Mẫu nội bộ, chưa phải quy định bắt buộc.",
            is_sample: true,
          });
          const criteria = [
            ["NN01", "Nề nếp", "Thực hiện nề nếp chung", -2, -20, 0],
            ["VS01", "Vệ sinh", "Vệ sinh, cảnh quan", -2, -20, 0],
            ["HT01", "Học tập", "Thực hiện nhiệm vụ học tập tập thể", 2, 0, 20],
            ["HD01", "Hoạt động", "Tham gia hoạt động, phong trào", 3, 0, 30],
            ["VT01", "Việc tốt", "Việc tốt, sáng kiến tập thể", 2, 0, 20],
          ];
          await db.bulkPut(
            "criteria",
            criteria.map((x, i) => ({
              id: uid(),
              criteria_set_id: setId,
              school_year_id: yid,
              campus_id: "all",
              code: x[0],
              group: x[1],
              name: x[2],
              data_type: "score",
              points: x[3],
              min: x[4],
              max: x[5],
              evidence_required: false,
              order: i + 1,
              active: true,
              is_sample: true,
            })),
          );
          await db.bulkPut("tasks", [
            {
              id: uid(),
              school_year_id: yid,
              campus_id: "all",
              title: "Chuẩn bị nội dung sinh hoạt dưới cờ",
              group: "Hằng tuần",
              start_date: today(),
              due_date: today(),
              priority: "high",
              status: "doing",
              progress: 40,
              is_sample: true,
            },
            {
              id: uid(),
              school_year_id: yid,
              campus_id: c1,
              title: "Rà soát lớp chưa nhập thi đua",
              group: "Thi đua",
              start_date: today(),
              due_date: today(),
              priority: "normal",
              status: "todo",
              progress: 0,
              is_sample: true,
            },
            {
              id: uid(),
              school_year_id: yid,
              campus_id: c2,
              title: "Kiểm tra hồ sơ Chi đội",
              group: "Tổ chức Đội",
              start_date: today(),
              due_date: addDays(today(), 2),
              priority: "normal",
              status: "todo",
              progress: 0,
              is_sample: true,
            },
          ]);
          await db.put("app_settings", {
            id: "seed_state",
            sample_loaded: true,
            sample_deleted: false,
            onboarded: false,
            last_backup_at: null,
          });
        }
        const addDays = (iso, n) => {
          const d = new Date(iso + "T00:00:00");
          d.setDate(d.getDate() + n);
          return localISO(d);
        };
        async function setting(key, value) {
          let r = (await db.get("app_settings", "seed_state")) || {
            id: "seed_state",
          };
          if (arguments.length === 2) {
            r[key] = value;
            await db.put("app_settings", r);
            return value;
          }
          return r[key];
        }
        function sortWeeksAscending(rows) {
          const getNumber = (row) => {
            const stored = Number(row?.number),
              fromName = Number(
                String(row?.name || "").match(/\d+/)?.[0],
              );
            if (Number.isFinite(stored) && stored > 0) return stored;
            if (Number.isFinite(fromName) && fromName > 0) return fromName;
            return Number.MAX_SAFE_INTEGER;
          };
          return [...rows].sort(
            (a, b) =>
              getNumber(a) - getNumber(b) ||
              String(a.start_date || "").localeCompare(
                String(b.start_date || ""),
              ) ||
              String(a.name || "").localeCompare(String(b.name || ""), "vi", {
                numeric: true,
                sensitivity: "base",
              }),
          );
        }
        async function loadContext() {
          const [years, sems, rawWeeks, campuses] = await Promise.all(
            ["school_years", "semesters", "school_weeks", "campuses"].map((s) =>
              db.all(s),
            ),
          ),
            weeks = sortWeeksAscending(rawWeeks);
          state.cache = { years, sems, weeks, campuses };
          state.yearId =
            state.yearId ||
            years.find((x) => x.is_current)?.id ||
            years[0]?.id ||
            "";
          state.weekId =
            state.weekId ||
            weeks.find((w) => today() >= w.start_date && today() <= w.end_date)
              ?.id ||
            weeks[0]?.id ||
            "";
          fillSelect(
            $("#yearSelect"),
            years.map((x) => [x.id, x.name]),
            state.yearId,
          );
          fillSelect(
            $("#semesterSelect"),
            [
              ["all", "Cả học kỳ"],
              ...sems
                .filter((x) => x.school_year_id === state.yearId)
                .map((x) => [x.id, x.name]),
            ],
            state.semesterId,
          );
          fillSelect(
            $("#weekSelect"),
            weeks
              .filter((x) => x.school_year_id === state.yearId)
              .map((x) => [x.id, x.name]),
            state.weekId,
          );
          fillSelect(
            $("#campusSelect"),
            [["all", "Tất cả cơ sở"], ...campuses.map((x) => [x.id, x.name])],
            state.campusId,
          );
        }
        function fillSelect(el, items, value) {
          el.replaceChildren(
            ...items.map(([v, l]) => {
              const o = document.createElement("option");
              o.value = v;
              o.textContent = l;
              o.selected = v === value;
              return o;
            }),
          );
        }
        async function refreshContext() {
          await loadContext();
          await go(state.page, false);
        }
        function showMobileContext() {
          const optionList = (items, selected) =>
            items
              .map(
                ([value, label]) =>
                  `<option value="${esc(value)}" ${value === selected ? "selected" : ""}>${esc(label)}</option>`,
              )
              .join("");
          openModal(
            "Phạm vi dữ liệu",
            `<div class="form-grid"><div class="field full"><label>Năm học</label><select id="mobileYear">${optionList(state.cache.years.map((row) => [row.id, row.name]), state.yearId)}</select></div><div class="field"><label>Học kỳ</label><select id="mobileSemester">${optionList([["all", "Cả học kỳ"], ...state.cache.sems.filter((row) => row.school_year_id === state.yearId).map((row) => [row.id, row.name])], state.semesterId)}</select></div><div class="field"><label>Tuần</label><select id="mobileWeek">${optionList(state.cache.weeks.filter((row) => row.school_year_id === state.yearId).map((row) => [row.id, row.name]), state.weekId)}</select></div><div class="field full"><label>Cơ sở</label><select id="mobileCampus">${optionList([["all", "Toàn trường"], ...state.cache.campuses.map((row) => [row.id, row.name])], state.campusId)}</select></div></div>`,
            `<button class="btn" id="cancelMobileContext">Hủy</button><button class="btn primary" id="applyMobileContext">Áp dụng</button>`,
          );
          $("#cancelMobileContext").onclick = closeModal;
          $("#applyMobileContext").onclick = async () => {
            const nextYear = $("#mobileYear").value,
              yearChanged = nextYear !== state.yearId;
            state.yearId = nextYear;
            state.semesterId = yearChanged
              ? "all"
              : $("#mobileSemester").value;
            state.weekId = yearChanged ? "" : $("#mobileWeek").value;
            state.campusId = $("#mobileCampus").value;
            closeModal();
            await refreshContext();
          };
        }
        function renderNav() {
          $("#nav").replaceChildren(
            ...NAV.filter(([id]) => canAccessPage(id)).map(([id, ico, label]) => {
              const b = document.createElement("button");
              b.dataset.page = id;
              b.className = id === state.page ? "active" : "";
              b.title = label;
              b.setAttribute("aria-label", label);
              b.innerHTML = `<span class="ico" aria-hidden="true">${ico}</span><span class="nav-label">${esc(label)}</span>`;
              b.onclick = () => go(id);
              return b;
            }),
          );
        }
        async function go(page, focus = true, fromHistory = false) {
          if (!NAV.some(([id]) => id === page)) page = "dashboard";
          if (!canAccessPage(page)) {
            toast("Tài khoản không có quyền mở phân hệ này.", "bad");
            page = "dashboard";
          }
          if (!fromHistory && location.hash !== `#${page}`)
            history.pushState(null, "", `#${page}`);
          state.page = page;
          renderNav();
          const content = $("#content");
          content.innerHTML = '<div class="empty">Đang tải dữ liệu…</div>';
          const renderers = {
            dashboard: renderDashboard,
            today: renderToday,
            plans: () => renderEntity("plans"),
            tasks: renderTasks,
            calendar: renderCalendar,
            scores: renderScores,
            activities: () => renderEntity("activities"),
            organization: () => renderEntity("organization"),
            programs: () => renderEntity("programs"),
            commendations: () => renderEntity("commendations"),
            documents: renderDocuments,
            equipment: () => renderEntity("equipment"),
            reports: renderReports,
            assistant: renderAssistant,
            backup: renderBackup,
            users: renderUserManagement,
            settings: renderSettings,
          };
          try {
            await renderers[page]();
          } catch (e) {
            console.error(e);
            content.innerHTML = `<div class="notice danger"><strong>Không thể hiển thị dữ liệu.</strong><br>${esc(e.message)}</div>`;
          }
          if (focus) content.focus();
        }
        const pageHead = (title, desc, actions = "") =>
          `<div class="page-head"><div><h1>${esc(title)}</h1><p>${esc(desc)}</p></div><div class="page-actions">${actions}</div></div>`;
        function setContent(html) {
          $("#content").innerHTML =
            `<section class="page active">${tabCoordinator.readOnly ? '<div class="readonly-banner" role="status"><strong>Chế độ chỉ đọc:</strong> một thẻ khác đang có quyền ghi dữ liệu. Có thể xem và xuất sao lưu; hãy đóng thẻ ghi rồi tải lại để chỉnh sửa.</div>' : ""}${html}</section><footer class="app-footer">Phát triển bởi: Thầy Trường - Zalo: 0329203951</footer>`;
        }
        function toast(msg, type = "ok") {
          const t = document.createElement("div");
          t.className = "toast " + type;
          t.textContent = msg;
          $("#toasts").append(t);
          setTimeout(() => t.remove(), 3300);
        }
        function setSave(text, status = "saved") {
          const el = $("#saveState");
          if (el) {
            el.textContent = text;
            el.dataset.state = status;
          }
        }
        function updateNetwork() {
          const online = navigator.onLine;
          $("#networkDot").classList.toggle("off", !online);
          $("#networkText").textContent = online ? "Trực tuyến" : "Ngoại tuyến";
          $("#networkText").title = online
            ? "Kết nối máy chủ đang khả dụng."
            : "Cần kết nối lại để đọc hoặc ghi dữ liệu trên máy chủ.";
        }
        function debounce(fn, ms) {
          let t;
          return (...a) => {
            clearTimeout(t);
            t = setTimeout(() => fn(...a), ms);
          };
        }
        function openModal(title, body, foot = "", wide = false) {
          state.modalReturnFocus = document.activeElement;
          state.modalSaveIntent = false;
          $("#modalTitle").textContent = title;
          $("#modalBody").innerHTML = body;
          $("#modalFoot").innerHTML = foot;
          $("#modal").classList.toggle("wide", wide);
          $("#modalLayer").classList.add("open");
          $("#modalLayer").setAttribute("aria-hidden", "false");
          setTimeout(() => {
            setupModalDraft(title);
            $("#modalBody")
              .querySelector("input,select,textarea,button")
              ?.focus();
          }, 10);
        }
        function closeModal() {
          if (state.modalSaveIntent && state.modalDraftKey)
            clearFormDraft(state.modalDraftKey);
          $("#modalLayer").classList.remove("open");
          $("#modalLayer").setAttribute("aria-hidden", "true");
          state.hasPendingDraft = false;
          state.modalDraftKey = null;
          state.modalSaveIntent = false;
          state.modalReturnFocus?.focus?.();
        }

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
              await db.put(
                "form_drafts",
                {
                  id: key,
                  page: state.page,
                  form_id: form.id || "",
                  title,
                  fields: captureFormState(form),
                  saved_at: now(),
                },
                { audit: false, journal: false },
              );
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
              notice.querySelector("[data-draft-discard]").onclick =
                async () => {
                  await clearFormDraft(key);
                  notice.remove();
                  toast("Đã bỏ bản nháp cục bộ.");
                };
            })
            .catch(() => {});
        }

        async function scoped(store) {
          return (await db.all(store)).filter(
            (x) =>
              (!x.school_year_id || x.school_year_id === state.yearId) &&
              (!x.semester_id ||
                state.semesterId === "all" ||
                x.semester_id === state.semesterId) &&
              (!x.campus_id ||
                x.campus_id === "all" ||
                state.campusId === "all" ||
                x.campus_id === state.campusId),
          );
        }
        const campusName = (id) =>
          id === "all"
            ? "Toàn trường"
            : state.cache.campuses.find((x) => x.id === id)?.name || "—";
        async function renderDashboard() {
          const [tasks, events, classes, sheets, entries] = await Promise.all([
            scoped("tasks"),
            scoped("calendar_events"),
            scoped("classes"),
            scoped("weekly_score_sheets"),
            scoped("score_entries"),
          ]);
          const open = tasks.filter((x) => x.status !== "done"),
            dueToday = open.filter((x) => x.due_date === today()),
            soon = open.filter(
              (x) => x.due_date > today() && x.due_date <= addDays(today(), 3),
            ),
            overdue = open.filter((x) => x.due_date < today()),
            upcoming = events
              .filter((x) => x.date >= today())
              .sort((a, b) => a.date.localeCompare(b.date))
              .slice(0, 5),
            sheet = sheets.find((x) => x.week_id === state.weekId),
            filled = new Set(
              entries
                .filter((x) => x.week_id === state.weekId)
                .map((x) => x.class_id),
            ),
            rankings = await calculateRanking(false),
            completeClasses = new Set(
              rankings.filter((row) => row.complete).map((row) => row.id),
            ),
            missing = classes.filter((x) => !completeClasses.has(x.id)),
            done = tasks.filter((x) => x.status === "done").length,
            progress = tasks.length
              ? Math.round((done / tasks.length) * 100)
              : 0,
            lastBackup = await setting("last_backup_at"),
            canManage = ["superadmin", "admin"].includes(state.user?.role);
          setContent(
            pageHead(
              "Tổng quan",
              "Thông tin cần hành động trong phạm vi đang chọn.",
              canManage
                ? `<button class="btn" data-go="reports">Tạo báo cáo</button><button class="btn primary" data-add="tasks">＋ Công việc</button>`
                : "",
            ) +
              `
      <div class="kpi-grid">
        <button class="kpi" data-filter-task="today"><span class="num">${dueToday.length}</span><span class="label">Việc hôm nay</span></button>
        <button class="kpi warning" data-filter-task="soon"><span class="num">${soon.length}</span><span class="label">Sắp đến hạn trong 3 ngày</span></button>
        <button class="kpi danger" data-filter-task="overdue"><span class="num">${overdue.length}</span><span class="label">Việc quá hạn</span></button>
        <button class="kpi" data-go="calendar"><span class="num">${upcoming.length}</span><span class="label">Hoạt động sắp diễn ra</span></button>
        <button class="kpi warning" data-go="scores"><span class="num">${missing.length}</span><span class="label">Lớp chưa nhập đủ điểm ngày</span></button>
        <button class="kpi success" data-go="scores"><span class="num">${sheet && ["approved", "locked"].includes(sheet.status) ? classes.length : 0}</span><span class="label">Lớp thuộc bảng đã duyệt</span></button>
      </div>
      <div class="grid-2">
        <div class="card"><div class="card-head"><h2>Việc cần xử lý</h2><span class="meta">${open.length} việc đang mở</span></div><div class="card-body"><ul class="compact-list">${
          [...overdue, ...dueToday, ...soon]
            .slice(0, 7)
            .map(
              (t) =>
                `<li><span class="badge ${t.due_date < today() ? "red" : "yellow"}">${t.due_date < today() ? "Quá hạn" : fmtDate(t.due_date)}</span><div class="main"><strong>${esc(t.title)}</strong><small>${esc(t.group || "Công việc")} • ${esc(campusName(t.campus_id))}</small></div>${canManage ? `<button class="link-btn" data-edit-task="${t.id}">Mở</button>` : ""}</li>`,
            )
            .join("") ||
          '<li class="muted">Không có việc khẩn trong phạm vi đã chọn.</li>'
        }</ul></div></div>
        <div class="card"><div class="card-head"><h2>Tiến độ và dữ liệu</h2></div><div class="card-body">
          <div class="split"><span>Tiến độ công việc</span><strong>${progress}%</strong></div><div class="progress"><span style="width:${progress}%"></span></div>
          <div class="split mt"><span>Trạng thái bảng tuần</span>${statusBadge(sheet?.status || "Chưa tạo")}</div>
          <div class="split mt"><span>Lớp đã có dữ liệu</span><strong>${filled.size}/${classes.length}</strong></div>
          <div class="split mt"><span>Sao lưu gần nhất</span><strong>${lastBackup ? fmtDateTime(lastBackup) : "Chưa sao lưu"}</strong></div>
          ${canManage ? '<button class="btn small mt" data-go="backup">Sao lưu ngay</button>' : ""}
        </div></div>
      </div>
      <div class="grid-2 mt">
        <div class="card"><div class="card-head"><h2>Hoạt động sắp tới</h2><span class="meta">Theo lịch</span></div><div class="card-body"><ul class="compact-list">${upcoming.map((e) => `<li><span class="badge blue">${fmtDate(e.date)}</span><div class="main"><strong>${esc(e.title)}</strong><small>${esc(e.location || "Chưa có địa điểm")} • ${esc(campusName(e.campus_id))}</small></div></li>`).join("") || '<li class="muted">Chưa có hoạt động sắp tới.</li>'}</ul></div></div>
        <div class="card"><div class="card-head"><h2>5 lớp dẫn đầu tạm thời</h2><span class="meta">Chỉ để theo dõi nội bộ</span></div><div class="card-body"><ul class="compact-list">${
          rankings
            .slice(0, 5)
            .map(
              (r, i) =>
                `<li><span class="badge ${r.rank <= 3 ? "yellow" : ""}">#${r.rank}</span><div class="main"><strong>${esc(r.class_name)}</strong><small>${esc(campusName(r.campus_id))}</small></div><strong>${r.total.toFixed(1)} điểm</strong></li>`,
            )
            .join("") || '<li class="muted">Chưa đủ dữ liệu để xếp hạng.</li>'
        }</ul></div></div>
      </div>`,
          );
          bindCommonActions();
          $$("[data-filter-task]").forEach(
            (b) =>
              (b.onclick = () => {
                state.taskFilter = b.dataset.filterTask;
                go("tasks");
              }),
          );
        }

        async function renderToday() {
          const [tasks, events] = await Promise.all([
              scoped("tasks"),
              scoped("calendar_events"),
            ]),
            dayTasks = tasks.filter(
              (x) =>
                x.status !== "done" &&
                (x.due_date <= today() || x.start_date === today()),
            ),
            dayEvents = events.filter((x) => x.date === today());
          setContent(
            pageHead(
              "Hôm nay",
              "Tập trung công việc, lịch và ghi nhận nhanh trong ngày.",
              `<button class="btn" id="finishDay">Kết thúc ngày</button><button class="btn primary" id="quickIncident">＋ Ghi nhận nhanh</button>`,
            ) +
              `
      <div class="grid-2"><div class="card"><div class="card-head"><h2>Việc phải làm</h2><span class="meta">${fmtDate(today())}</span></div><div class="card-body"><ul class="compact-list">${dayTasks.map((t) => `<li><input type="checkbox" data-done-task="${t.id}" ${t.status === "done" ? "checked" : ""}><div class="main"><strong>${esc(t.title)}</strong><small>${esc(t.group || "Công việc")} • hạn ${fmtDate(t.due_date)}</small></div>${statusBadge(t.due_date < today() ? "overdue" : t.status)}</li>`).join("") || '<li class="muted">Không có công việc đến hạn hôm nay.</li>'}</ul></div></div>
      <div class="card"><div class="card-head"><h2>Lịch hôm nay</h2></div><div class="card-body"><ul class="compact-list">${dayEvents.map((e) => `<li><span class="badge blue">${esc(e.time || "Cả ngày")}</span><div class="main"><strong>${esc(e.title)}</strong><small>${esc(e.location || "Chưa có địa điểm")}</small></div></li>`).join("") || '<li class="muted">Chưa có lịch trong ngày.</li>'}</ul></div></div></div>
      <div class="grid-3 mt"><div class="card"><div class="card-head"><h2>Checklist trực tuần</h2></div><div class="card-body"><label class="check-row"><input type="checkbox"> Kiểm tra khu vực trực</label><label class="check-row mt"><input type="checkbox"> Ghi nhận nề nếp đầu giờ</label><label class="check-row mt"><input type="checkbox"> Rà soát minh chứng</label></div></div><div class="card"><div class="card-head"><h2>Chờ phối hợp</h2></div><div class="card-body"><strong>${tasks.filter((x) => x.status === "waiting").length}</strong> công việc đang chờ đơn vị khác.<br><button class="link-btn mt" data-go="tasks">Xem danh sách</button></div></div><div class="card"><div class="card-head"><h2>Ghi chú nhanh</h2></div><div class="card-body"><textarea id="dailyNote" style="width:100%;min-height:90px;border:1px solid var(--line);border-radius:7px;padding:8px" placeholder="Nội dung cần nhớ trong ngày…"></textarea><button class="btn small mt" id="saveDailyNote">Lưu ghi chú</button></div></div></div>`,
          );
          bindCommonActions();
          $$("[data-done-task]").forEach(
            (c) =>
              (c.onchange = async () => {
                const t = await db.get("tasks", c.dataset.doneTask);
                await db.put("tasks", {
                  ...t,
                  status: c.checked ? "done" : "doing",
                  progress: c.checked ? 100 : t.progress,
                });
                toast("Đã cập nhật công việc");
                renderToday();
              }),
          );
          $("#quickIncident").onclick = () => openQuickIncident();
          $("#finishDay").onclick = () =>
            openModal(
              "Kết thúc ngày",
              `<p>Đã hoàn thành <strong>${tasks.filter((x) => x.status === "done" && x.updated_at?.startsWith(today())).length}</strong> việc. Còn <strong>${dayTasks.length}</strong> việc cần tiếp tục xử lý.</p><div class="notice">Các việc chưa hoàn thành vẫn giữ nguyên hạn và được hiển thị ngày sau; hệ thống không tự sửa trạng thái.</div>`,
              `<button class="btn" onclick="document.querySelector('#modalClose').click()">Đóng</button>`,
            );
          $("#saveDailyNote").onclick = async () => {
            const v = $("#dailyNote").value.trim();
            if (!v) return toast("Hãy nhập nội dung ghi chú.", "bad");
            await db.put("documents", {
              name: `Ghi chú ngày ${fmtDate(today())}`,
              type: "Ghi chú",
              date: today(),
              description: v,
              status: "draft",
              school_year_id: state.yearId,
              campus_id: state.campusId,
            });
            toast("Đã lưu ghi chú");
            $("#dailyNote").value = "";
          };
        }

        async function renderEntity(key) {
          const cfg = ENTITY[key],
            rows = await scoped(cfg.store);
          setContent(
            pageHead(
              cfg.title,
              cfg.desc,
              `<button class="btn" data-export-entity="${key}">Xuất CSV</button><button class="btn primary" data-new-entity="${key}">＋ Thêm mới</button>`,
            ) +
              `<div class="toolbar"><input class="grow" id="entitySearch" placeholder="Tìm trong ${esc(cfg.title.toLowerCase())}…"><select id="entityCampus"><option value="all">Tất cả cơ sở</option>${state.cache.campuses.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join("")}</select><span class="muted">${rows.length} bản ghi</span></div><div class="table-wrap"><table><thead><tr>${entityColumns(
                key,
              )
                .map((x) => `<th>${esc(x[1])}</th>`)
                .join(
                  "",
                )}<th>Thao tác</th></tr></thead><tbody id="entityRows"></tbody></table></div>`,
          );
          renderEntityRows(key, rows);
          $("#entitySearch").oninput = debounce(
            () =>
              renderEntityRows(
                key,
                rows.filter((r) =>
                  Object.values(r).some((v) =>
                    String(v ?? "")
                      .toLowerCase()
                      .includes($("#entitySearch").value.toLowerCase()),
                  ),
                ),
              ),
            180,
          );
          $("#entityCampus").onchange = () =>
            renderEntityRows(
              key,
              rows.filter(
                (r) =>
                  $("#entityCampus").value === "all" ||
                  r.campus_id === $("#entityCampus").value,
              ),
            );
          $$("[data-new-entity]").forEach(
            (b) => (b.onclick = () => entityForm(key)),
          );
          $$("[data-export-entity]").forEach(
            (b) => (b.onclick = () => exportEntityCSV(key, rows)),
          );
        }
        function entityColumns(key) {
          const map = {
            plans: [
              ["code", "Mã"],
              ["name", "Tên kế hoạch"],
              ["level", "Cấp"],
              ["status", "Trạng thái"],
              ["progress", "Tiến độ"],
            ],
            activities: [
              ["name", "Tên hoạt động"],
              ["category", "Nhóm"],
              ["date", "Thời gian"],
              ["location", "Địa điểm"],
              ["status", "Trạng thái"],
            ],
            organization: [
              ["name", "Họ và tên"],
              ["class_name", "Lớp"],
              ["unit", "Đội/ban"],
              ["position", "Chức vụ"],
              ["term", "Nhiệm kỳ"],
            ],
            programs: [
              ["name", "Chương trình/chuyên hiệu"],
              ["scope", "Đối tượng"],
              ["result", "Kết quả"],
              ["recognized_date", "Ngày công nhận"],
              ["status", "Trạng thái"],
            ],
            commendations: [
              ["recipient", "Đối tượng"],
              ["award_type", "Loại khen thưởng"],
              ["level", "Cấp"],
              ["date", "Thời gian"],
              ["approval_status", "Trạng thái"],
            ],
            documents: [
              ["name", "Tên hồ sơ"],
              ["type", "Loại"],
              ["document_no", "Số hiệu"],
              ["date", "Ngày"],
              ["status", "Trạng thái"],
            ],
            equipment: [
              ["code", "Mã"],
              ["name", "Thiết bị/vật tư"],
              ["quantity", "Số lượng"],
              ["condition", "Tình trạng"],
              ["location", "Nơi lưu"],
            ],
          };
          return map[key];
        }
        function renderEntityRows(key, rows) {
          const body = $("#entityRows");
          if (!body) return;
          state.entityPage = Math.min(
            state.entityPage || 0,
            Math.max(0, Math.ceil(rows.length / 200) - 1),
          );
          const page = rows.slice(
              state.entityPage * 200,
              state.entityPage * 200 + 200,
            ),
            cols = entityColumns(key).length + 1;
          body.innerHTML =
            page
              .map(
                (r) =>
                  `<tr>${entityColumns(key)
                    .map(
                      ([f]) =>
                        `<td class="${f === "name" ? "wrap" : ""}">${["status", "approval_status"].includes(f) ? statusBadge(r[f]) : esc(f === "date" || f === "recognized_date" ? fmtDate(r[f]) : f === "progress" ? (r[f] || 0) + "%" : (r[f] ?? "—"))}</td>`,
                    )
                    .join(
                      "",
                    )}<td><div class="row-actions"><button class="link-btn" data-edit-entity="${r.id}">Sửa</button><button class="link-btn red" data-delete-entity="${r.id}">Xóa</button></div></td></tr>`,
              )
              .join("") ||
            `<tr><td colspan="${cols}" class="empty">Chưa có bản ghi. Hãy chọn “Thêm mới”.</td></tr>`;
          if (rows.length > 200)
            body.innerHTML += `<tr><td colspan="${cols}" class="center"><button class="btn small" id="entityPrev" ${state.entityPage === 0 ? "disabled" : ""}>‹ Trước</button> <span class="muted">Trang ${state.entityPage + 1}/${Math.ceil(rows.length / 200)} • tối đa 200 dòng/trang</span> <button class="btn small" id="entityNext" ${state.entityPage + 1 >= Math.ceil(rows.length / 200) ? "disabled" : ""}>Sau ›</button></td></tr>`;
          $$("[data-edit-entity]").forEach(
            (b) => (b.onclick = () => entityForm(key, b.dataset.editEntity)),
          );
          $$("[data-delete-entity]").forEach(
            (b) =>
              (b.onclick = () =>
                confirmDelete(ENTITY[key].store, b.dataset.deleteEntity, () =>
                  renderEntity(key),
                )),
          );
          if ($("#entityPrev"))
            $("#entityPrev").onclick = () => {
              state.entityPage--;
              renderEntityRows(key, rows);
            };
          if ($("#entityNext"))
            $("#entityNext").onclick = () => {
              state.entityPage++;
              renderEntityRows(key, rows);
            };
        }
        async function entityForm(key, id) {
          const cfg = ENTITY[key],
            row = id ? await db.get(cfg.store, id) : {},
            customDefs = await customFieldDefs(key),
            dynamicMap = {
              activities: { category: "activity_type" },
              organization: { unit: "team_group" },
              commendations: { award_type: "award_type", level: "award_level" },
              programs: { name: "program_type" },
              equipment: {
                group: "equipment_group",
                condition: "equipment_condition",
                unit: "unit",
              },
            },
            dynamic = dynamicMap[key] || {},
            dynamicValues = Object.fromEntries(
              await Promise.all(
                Object.entries(dynamic).map(async ([field, category]) => [
                  field,
                  await configItems(category),
                ]),
              ),
            );
          const fields = cfg.fields
            .map(([name, label, type, req, options]) => {
              let input = "";
              if (dynamicValues[name]?.length) {
                type = "select";
                options = dynamicValues[name].map((x) => x.label).join("|");
              }
              if (type === "textarea")
                input = `<textarea name="${name}" ${req ? "required" : ""}>${esc(row[name] || "")}</textarea>`;
              else if (type === "select") {
                const opts = options
                  .split("|")
                  .map((x) => {
                    const [v, l] = x.includes(": ") ? x.split(": ") : [x, x];
                    return `<option value="${esc(v)}" ${row[name] === v ? "selected" : ""}>${esc(l)}</option>`;
                  })
                  .join("");
                input = `<select name="${name}" ${req ? "required" : ""}><option value="">— Chọn —</option>${opts}</select>`;
              } else
                input = `<input name="${name}" type="${type}" value="${esc(row[name] ?? "")}" ${type === "number" ? 'step="any"' : ""} ${req ? "required" : ""}>`;
              return `<div class="field ${type === "textarea" ? "full" : ""}"><label class="${req ? "required" : ""}">${esc(label)}</label>${input}</div>`;
            })
            .join("");
          openModal(
            `${id ? "Cập nhật" : "Thêm"} ${cfg.title.toLowerCase()}`,
            `<form id="entityForm"><div class="form-grid">${fields}${renderCustomInputs(customDefs, row.custom_values)}<div class="field"><label>Cơ sở áp dụng</label><select name="campus_id"><option value="all">Toàn trường</option>${state.cache.campuses.map((c) => `<option value="${c.id}" ${row.campus_id === c.id ? "selected" : ""}>${esc(c.name)}</option>`).join("")}</select></div></div><div class="error" id="formError"></div></form>`,
            `<button class="btn" id="cancelForm">Hủy</button><button class="btn primary" id="saveEntity">Lưu</button>`,
            true,
          );
          $("#cancelForm").onclick = closeModal;
          $("#saveEntity").onclick = async () => {
            const f = $("#entityForm");
            if (!f.reportValidity()) return;
            const fd = new FormData(f),
              data = Object.fromEntries(fd);
            data.custom_values = collectCustomValues(fd, customDefs);
            for (const [n, , type] of cfg.fields)
              if (type === "number") data[n] = Number(data[n] || 0);
            await db.put(cfg.store, {
              ...row,
              ...data,
              school_year_id: state.yearId,
              semester_id: state.semesterId === "all" ? null : state.semesterId,
            });
            closeModal();
            toast("Đã lưu bản ghi");
            renderEntity(key);
          };
        }
        async function confirmDelete(store, id, after) {
          const row = await db.get(store, id);
          openModal(
            "Xác nhận xóa",
            `<div class="notice danger">Bản ghi sẽ được xóa mềm và vẫn còn trong nhật ký. Không thể hoàn tác trực tiếp trên màn hình này.</div><p><strong>${esc(row?.name || row?.title || row?.recipient || row?.code || "Bản ghi đã chọn")}</strong></p>`,
            `<button class="btn" id="cancelDelete">Hủy</button><button class="btn danger" id="doDelete">Xóa</button>`,
          );
          $("#cancelDelete").onclick = closeModal;
          $("#doDelete").onclick = async () => {
            await db.remove(store, id);
            closeModal();
            toast("Đã xóa bản ghi");
            after?.();
          };
        }
        function exportEntityCSV(key, rows) {
          const cols = entityColumns(key),
            lines = [cols.map((x) => csvSafe(x[1])).join(",")];
          rows.forEach((r) =>
            lines.push(cols.map(([f]) => csvSafe(r[f])).join(",")),
          );
          download(
            "\ufeff" + lines.join("\r\n"),
            `${key}-${today()}.csv`,
            "text/csv;charset=utf-8",
          );
        }
        function bindCommonActions() {
          $$("[data-go]").forEach((b) => (b.onclick = () => go(b.dataset.go)));
          $$("[data-add]").forEach(
            (b) =>
              (b.onclick = () =>
                b.dataset.add === "tasks"
                  ? taskForm()
                  : entityForm(b.dataset.add)),
          );
          $$("[data-edit-task]").forEach(
            (b) => (b.onclick = () => taskForm(b.dataset.editTask)),
          );
        }
        function openQuickIncident() {
          openModal(
            "Ghi nhận nhanh sự việc",
            `<form id="incidentForm"><div class="form-grid"><div class="field"><label class="required">Lớp/khu vực</label><input name="subject" required maxlength="100"></div><div class="field"><label>Loại ghi nhận</label><select name="type"><option>Ghi chú</option><option>Điểm cộng đề xuất</option><option>Điểm trừ đề xuất</option><option>Chờ phối hợp</option></select></div><div class="field full"><label class="required">Nội dung và lý do</label><textarea name="description" required maxlength="1000"></textarea></div></div></form><div class="notice warn mt">Ghi nhận này không tự động thay đổi bảng thi đua, đặc biệt khi bảng đã khóa.</div>`,
            `<button class="btn" id="cancelIncident">Hủy</button><button class="btn primary" id="saveIncident">Lưu ghi nhận</button>`,
          );
          $("#cancelIncident").onclick = closeModal;
          $("#saveIncident").onclick = async () => {
            const f = $("#incidentForm");
            if (!f.reportValidity()) return;
            const d = Object.fromEntries(new FormData(f));
            await db.put("documents", {
              name: `${d.type}: ${d.subject}`,
              type: "Ghi nhận nhanh",
              date: today(),
              description: d.description,
              status: "draft",
              school_year_id: state.yearId,
              campus_id: state.campusId,
            });
            closeModal();
            toast("Đã lưu ghi nhận, chưa tác động điểm thi đua");
          };
        }

        async function renderTasks() {
          let rows = await scoped("tasks");
          const configuredStatuses = await configItems("task_status"),
            configuredPriorities = await configItems("priority"),
            statusOptions = [
              ["todo", "Chưa làm"],
              ["doing", "Đang làm"],
              ["waiting", "Chờ phối hợp"],
              ["review", "Chờ duyệt"],
              ["done", "Hoàn thành"],
              ["paused", "Tạm dừng"],
              ...configuredStatuses.map((x) => [x.label, x.label]),
            ].filter((x, i, a) => a.findIndex((y) => y[0] === x[0]) === i),
            priorityOptions = [
              ["low", "Thấp"],
              ["normal", "Bình thường"],
              ["high", "Cao"],
              ["urgent", "Khẩn"],
              ...configuredPriorities.map((x) => [x.label, x.label]),
            ].filter((x, i, a) => a.findIndex((y) => y[0] === x[0]) === i);
          const filter = state.taskFilter;
          if (filter === "today")
            rows = rows.filter((x) => x.due_date === today());
          if (filter === "soon")
            rows = rows.filter(
              (x) => x.due_date > today() && x.due_date <= addDays(today(), 3),
            );
          if (filter === "overdue")
            rows = rows.filter(
              (x) => x.status !== "done" && x.due_date < today(),
            );
          setContent(
            pageHead(
              "Công việc và checklist",
              "Theo dõi đầu việc, hạn, phụ thuộc và tiến độ thực hiện.",
              `<button class="btn" id="taskTemplates">Thư viện mẫu</button><button class="btn primary" id="newTask">＋ Công việc</button>`,
            ) +
              `
      <div class="toolbar"><input class="grow" id="taskSearch" placeholder="Tìm công việc…"><select id="taskStatus"><option value="all">Mọi trạng thái</option>${statusOptions.map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join("")}</select><select id="taskPriority"><option value="all">Mọi mức ưu tiên</option>${priorityOptions.map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join("")}</select><div class="tabs" style="margin:0 0 0 auto;border:0"><button data-task-view="list" class="${state.taskView === "list" ? "active" : ""}">Danh sách</button><button data-task-view="kanban" class="${state.taskView === "kanban" ? "active" : ""}">Kanban</button></div></div><div id="taskArea"></div>`,
          );
          renderTaskArea(rows);
          $("#newTask").onclick = () => taskForm();
          $("#taskTemplates").onclick = showTaskTemplates;
          $$("[data-task-view]").forEach(
            (b) =>
              (b.onclick = () => {
                state.taskView = b.dataset.taskView;
                renderTasks();
              }),
          );
          const apply = () => {
            const q = $("#taskSearch").value.toLowerCase(),
              s = $("#taskStatus").value,
              p = $("#taskPriority").value;
            renderTaskArea(
              rows.filter(
                (x) =>
                  (!q || JSON.stringify(x).toLowerCase().includes(q)) &&
                  (s === "all" || x.status === s) &&
                  (p === "all" || x.priority === p),
              ),
            );
          };
          $("#taskSearch").oninput = debounce(apply, 160);
          $("#taskStatus").onchange = apply;
          $("#taskPriority").onchange = apply;
          state.taskFilter = null;
        }
        function renderTaskArea(rows) {
          const area = $("#taskArea");
          if (!area) return;
          if (state.taskView === "kanban") {
            const statuses = [
              ["todo", "Chưa làm"],
              ["doing", "Đang làm"],
              ["waiting", "Chờ phối hợp"],
              ["done", "Hoàn thành"],
            ];
            area.innerHTML = `<div class="kanban">${statuses
              .map(([s, l]) => {
                const all = rows.filter((x) => x.status === s),
                  shown = all.slice(0, 50);
                return `<div class="kanban-col"><h3>${l} • ${all.length}</h3>${shown.map((t) => `<article class="task-card"><strong>${esc(t.title)}</strong><small class="muted">Hạn ${fmtDate(t.due_date)} • ${esc(campusName(t.campus_id))}</small><div class="progress mt"><span style="width:${clamp(t.progress, 0, 100)}%"></span></div><button class="link-btn mt" data-edit-task="${t.id}">Mở chi tiết</button></article>`).join("")}${all.length > 50 ? '<small class="muted">Đang hiển thị 50 mục đầu. Dùng bộ lọc để thu hẹp.</small>' : ""}</div>`;
              })
              .join("")}</div>`;
          } else {
            state.taskPage = Math.min(
              state.taskPage || 0,
              Math.max(0, Math.ceil(rows.length / 100) - 1),
            );
            const page = rows.slice(
              state.taskPage * 100,
              state.taskPage * 100 + 100,
            );
            area.innerHTML = `<div class="table-wrap"><table><thead><tr><th>Công việc</th><th>Nhóm</th><th>Cơ sở</th><th>Hạn</th><th>Ưu tiên</th><th>Trạng thái</th><th>Tiến độ</th><th>Thao tác</th></tr></thead><tbody>${page.map((t) => `<tr><td class="wrap"><strong>${esc(t.title)}</strong>${t.obstacle ? `<br><small class="muted">Trở ngại: ${esc(t.obstacle)}</small>` : ""}</td><td>${esc(t.group || "—")}</td><td>${esc(campusName(t.campus_id))}</td><td>${t.status !== "done" && t.due_date < today() ? '<span class="badge red">Quá hạn</span> ' : ""}${fmtDate(t.due_date)}</td><td>${esc({ low: "Thấp", normal: "Bình thường", high: "Cao", urgent: "Khẩn" }[t.priority] || "—")}</td><td>${statusBadge(t.status)}</td><td style="min-width:120px"><div class="split"><div class="progress" style="width:80px"><span style="width:${clamp(t.progress, 0, 100)}%"></span></div><small>${clamp(t.progress, 0, 100)}%</small></div></td><td><button class="link-btn" data-edit-task="${t.id}">Sửa</button><button class="link-btn" data-clone-task="${t.id}">Nhân bản</button><button class="link-btn red" data-delete-task="${t.id}">Xóa</button></td></tr>`).join("") || '<tr><td colspan="8" class="empty">Không có công việc phù hợp bộ lọc.</td></tr>'}${rows.length > 100 ? `<tr><td colspan="8" class="center"><button class="btn small" id="taskPrev" ${state.taskPage === 0 ? "disabled" : ""}>‹ Trước</button> <span class="muted">Trang ${state.taskPage + 1}/${Math.ceil(rows.length / 100)} • 100 việc/trang</span> <button class="btn small" id="taskNext" ${state.taskPage + 1 >= Math.ceil(rows.length / 100) ? "disabled" : ""}>Sau ›</button></td></tr>` : ""}</tbody></table></div>`;
            if ($("#taskPrev"))
              $("#taskPrev").onclick = () => {
                state.taskPage--;
                renderTaskArea(rows);
              };
            if ($("#taskNext"))
              $("#taskNext").onclick = () => {
                state.taskPage++;
                renderTaskArea(rows);
              };
          }
          $$("[data-edit-task]").forEach(
            (b) => (b.onclick = () => taskForm(b.dataset.editTask)),
          );
          $$("[data-clone-task]").forEach(
            (b) =>
              (b.onclick = async () => {
                const t = await db.get("tasks", b.dataset.cloneTask);
                delete t.id;
                await db.put("tasks", {
                  ...t,
                  title: t.title + " (bản sao)",
                  status: "todo",
                  progress: 0,
                });
                toast("Đã nhân bản công việc");
                renderTasks();
              }),
          );
          $$("[data-delete-task]").forEach(
            (b) =>
              (b.onclick = () =>
                confirmDelete("tasks", b.dataset.deleteTask, renderTasks)),
          );
        }
        async function taskForm(id) {
          const t = id
            ? await db.get("tasks", id)
            : {
                priority: "normal",
                status: "todo",
                progress: 0,
                start_date: today(),
                due_date: today(),
                campus_id: state.campusId,
              };
          const checks = await db.all("task_check_items"),
            mine = checks.filter((x) => x.task_id === id),
            customDefs = await customFieldDefs("tasks"),
            groups = await configItems("task_group"),
            statuses = await configItems("task_status"),
            priorities = await configItems("priority");
          openModal(
            id ? "Cập nhật công việc" : "Thêm công việc",
            `<form id="taskForm"><div class="form-grid"><div class="field full"><label class="required">Tiêu đề</label><input name="title" value="${esc(t.title || "")}" required maxlength="200"></div><div class="field"><label>Nhóm nghiệp vụ</label><select name="group"><option value="">— Chọn —</option>${groups.map((x) => `<option value="${esc(x.label)}" ${t.group === x.label ? "selected" : ""}>${esc(x.label)}</option>`).join("")}</select></div><div class="field"><label>Cơ sở</label><select name="campus_id"><option value="all">Toàn trường</option>${state.cache.campuses.map((c) => `<option value="${c.id}" ${t.campus_id === c.id ? "selected" : ""}>${esc(c.name)}</option>`).join("")}</select></div><div class="field"><label>Ngày bắt đầu</label><input type="date" name="start_date" value="${esc(t.start_date || "")}"></div><div class="field"><label class="required">Hạn hoàn thành</label><input type="date" name="due_date" value="${esc(t.due_date || "")}" required></div><div class="field"><label>Ưu tiên</label><select name="priority">${[
              ["low", "Thấp"],
              ["normal", "Bình thường"],
              ["high", "Cao"],
              ["urgent", "Khẩn"],
              ...priorities.map((x) => [x.label, x.label]),
            ]
              .map(
                (x) =>
                  `<option value="${x[0]}" ${t.priority === x[0] ? "selected" : ""}>${x[1]}</option>`,
              )
              .join(
                "",
              )}</select></div><div class="field"><label>Trạng thái</label><select name="status">${[
              ["todo", "Chưa làm"],
              ["doing", "Đang làm"],
              ["waiting", "Chờ phối hợp"],
              ["review", "Chờ duyệt"],
              ["done", "Hoàn thành"],
              ["paused", "Tạm dừng"],
              ...statuses.map((x) => [x.label, x.label]),
            ]
              .map(
                (x) =>
                  `<option value="${x[0]}" ${t.status === x[0] ? "selected" : ""}>${x[1]}</option>`,
              )
              .join(
                "",
              )}</select></div><div class="field"><label>Tiến độ (%)</label><input name="progress" type="number" min="0" max="100" value="${t.progress || 0}"></div><div class="field"><label>Người/bộ phận phối hợp</label><input name="coordination" value="${esc(t.coordination || "")}"></div><div class="field"><label>Chu kỳ lặp</label><select name="repeat_rule"><option value="none">Không lặp</option>${[
              ["daily", "Hằng ngày"],
              ["weekly", "Hằng tuần"],
              ["monthly", "Hằng tháng"],
              ["yearly", "Hằng năm"],
            ]
              .map(
                ([v, l]) =>
                  `<option value="${v}" ${t.repeat_rule === v ? "selected" : ""}>${l}</option>`,
              )
              .join(
                "",
              )}</select></div><div class="field"><label>Kết thúc lặp (tùy chọn)</label><input type="date" name="repeat_until" value="${esc(t.repeat_until || "")}"></div><div class="field full"><label>Checklist con (mỗi dòng một mục; thêm ! ở đầu nếu bắt buộc)</label><textarea name="checklist">${esc(mine.map((x) => (x.required ? "! " : "") + x.label).join("\n"))}</textarea></div><div class="field"><label>Trở ngại</label><textarea name="obstacle">${esc(t.obstacle || "")}</textarea></div><div class="field"><label>Ghi chú/kết quả</label><textarea name="notes">${esc(t.notes || "")}</textarea></div>${renderCustomInputs(customDefs, t.custom_values)}</div></form>`,
            `<button class="btn" id="cancelTask">Hủy</button><button class="btn primary" id="saveTask">Lưu công việc</button>`,
            true,
          );
          $("#cancelTask").onclick = closeModal;
          $("#saveTask").onclick = async () => {
            const f = $("#taskForm");
            if (!f.reportValidity()) return;
            const fd = new FormData(f),
              d = Object.fromEntries(fd);
            d.custom_values = collectCustomValues(fd, customDefs);
            if (d.due_date < d.start_date)
              return toast(
                "Hạn hoàn thành phải từ ngày bắt đầu trở đi.",
                "bad",
              );
            const lines = d.checklist
              .split("\n")
              .map((x) => x.trim())
              .filter(Boolean);
            if (d.status === "done" && mine.some((x) => x.required && !x.done))
              return toast(
                "Chưa thể hoàn thành vì còn checklist bắt buộc chưa xong.",
                "bad",
              );
            delete d.checklist;
            d.progress = clamp(d.progress, 0, 100);
            d.repeat_rule = d.repeat_rule || "none";
            if (d.repeat_rule === "none") {
              d.repeat_next_at = null;
              d.repeat_until = null;
            } else if (!t.repeat_next_at || t.repeat_rule !== d.repeat_rule) {
              d.repeat_next_at = nextRepeatDate(d.due_date, d.repeat_rule);
            }
            const saved = await db.put("tasks", {
              ...t,
              ...d,
              school_year_id: state.yearId,
              semester_id: state.semesterId === "all" ? null : state.semesterId,
            });
            const nextChecks = lines.map((label, i) => {
              const clean = label.replace(/^!\s*/, ""),
                old = mine.find(
                  (x) => normalizeText(x.label) === normalizeText(clean),
                );
              return {
                ...(old || {}),
                id: old?.id || uid(),
                task_id: saved.id,
                label: clean,
                required: label.startsWith("!"),
                done: old?.done || false,
                order: i,
              };
            });
            for (const old of mine)
              if (!nextChecks.some((x) => x.id === old.id))
                await db.remove("task_check_items", old.id);
            if (nextChecks.length)
              await db.bulkPut("task_check_items", nextChecks);
            closeModal();
            toast("Đã lưu công việc");
            renderTasks();
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
        async function generateRecurringTasks() {
          const tasks = await db.all("tasks"),
            checks = await db.all("task_check_items");
          for (const source of tasks.filter(
            (x) =>
              x.repeat_rule && x.repeat_rule !== "none" && x.repeat_next_at,
          )) {
            let due = source.repeat_next_at,
              guard = 0;
            while (due <= today() && guard++ < 400) {
              if (source.repeat_until && due > source.repeat_until) break;
              const occurrenceKey = `${source.id}:${due}`;
              if (
                !tasks.some((x) => x.repeat_occurrence_key === occurrenceKey)
              ) {
                const duration = Math.max(
                    0,
                    Math.round(
                      (new Date(`${source.due_date}T12:00:00`) -
                        new Date(
                          `${source.start_date || source.due_date}T12:00:00`,
                        )) /
                        86400000,
                    ),
                  ),
                  created = await db.put("tasks", {
                    ...source,
                    id: uid(),
                    title: source.title,
                    start_date: addDays(due, -duration),
                    due_date: due,
                    status: "todo",
                    progress: 0,
                    repeat_rule: "none",
                    repeat_next_at: null,
                    repeat_source_id: source.id,
                    repeat_occurrence_key: occurrenceKey,
                    created_at: now(),
                    updated_at: now(),
                  });
                const templateChecks = checks.filter(
                  (x) => x.task_id === source.id && !x.deleted_at,
                );
                if (templateChecks.length)
                  await db.bulkPut(
                    "task_check_items",
                    templateChecks.map((x) => ({
                      ...x,
                      id: uid(),
                      task_id: created.id,
                      done: false,
                    })),
                  );
              }
              due = nextRepeatDate(due, source.repeat_rule);
            }
            if (due !== source.repeat_next_at)
              await db.put("tasks", { ...source, repeat_next_at: due });
          }
        }
        function showTaskTemplates() {
          const templates = [
            "Chuẩn bị nội dung sinh hoạt dưới cờ",
            "Kiểm tra kế hoạch trực tuần",
            "Rà soát lớp chưa nhập thi đua",
            "Kiểm tra minh chứng",
            "Tổng hợp và duyệt thi đua",
            "Công bố kết quả nội bộ",
            "Chuẩn bị phát thanh măng non",
            "Báo cáo Ban Giám hiệu",
            "Xây dựng kế hoạch tuần kế tiếp",
            "Xây dựng chủ điểm tháng",
            "Kiểm tra hồ sơ Chi đội",
            "Kiểm tra thiết bị, vật tư Đội",
            "Tổ chức Đại hội Chi đội và Liên đội",
            "Bồi dưỡng Ban Chỉ huy",
            "Sơ kết học kỳ",
            "Tổng kết năm học",
          ];
          openModal(
            "Thư viện công việc mẫu",
            `<div class="notice">Các mẫu chỉ để tham khảo; thầy có thể chọn, sau đó sửa lại trước khi dùng.</div><div class="form-grid">${templates.map((x, i) => `<label class="check-row"><input type="checkbox" value="${esc(x)}"> ${esc(x)}</label>`).join("")}</div>`,
            `<button class="btn" id="closeTemplates">Đóng</button><button class="btn primary" id="addTemplates">Thêm mục đã chọn</button>`,
            true,
          );
          $("#closeTemplates").onclick = closeModal;
          $("#addTemplates").onclick = async () => {
            const vals = $$("#modalBody input:checked").map((x) => x.value);
            if (!vals.length) return toast("Hãy chọn ít nhất một mẫu.", "bad");
            await db.bulkPut(
              "tasks",
              vals.map((title) => ({
                id: uid(),
                school_year_id: state.yearId,
                campus_id: "all",
                title,
                group: "Mẫu tham khảo",
                start_date: today(),
                due_date: addDays(today(), 7),
                priority: "normal",
                status: "todo",
                progress: 0,
              })),
            );
            closeModal();
            toast(`Đã thêm ${vals.length} công việc`);
            renderTasks();
          };
        }

        async function renderCalendar() {
          const events = await scoped("calendar_events"),
            d = state.calendarDate,
            y = d.getFullYear(),
            m = d.getMonth(),
            first = new Date(y, m, 1),
            start = new Date(y, m, 1 - first.getDay() + 1),
            cells = [];
          for (let i = 0; i < 42; i++) {
            const x = new Date(start);
            x.setDate(start.getDate() + i);
            cells.push(x);
          }
          setContent(
            pageHead(
              "Lịch hoạt động",
              "Xem lịch tháng; cảnh báo thiếu địa điểm, phụ trách hoặc an toàn.",
              `<button class="btn" onclick="window.print()">In lịch</button><button class="btn primary" id="newEvent">＋ Sự kiện</button>`,
            ) +
              `<div class="toolbar"><button class="btn small" id="prevMonth">‹</button><strong>Tháng ${m + 1}/${y}</strong><button class="btn small" id="nextMonth">›</button><button class="btn small" id="thisMonth">Hôm nay</button><span class="muted" style="margin-left:auto">${events.length} sự kiện trong phạm vi dữ liệu</span></div><div class="calendar-grid"><div class="dow">Thứ 2</div><div class="dow">Thứ 3</div><div class="dow">Thứ 4</div><div class="dow">Thứ 5</div><div class="dow">Thứ 6</div><div class="dow">Thứ 7</div><div class="dow">Chủ nhật</div>${cells
                .map((x) => {
                  const iso = localISO(x),
                    mine = events.filter((e) => e.date === iso);
                  return `<div class="${x.getMonth() !== m ? "other" : ""}"><span>${x.getDate()}</span>${mine.map((e) => `<div class="calendar-event" title="${esc(e.title)}" data-event="${e.id}">${esc(e.time || "")} ${esc(e.title)}</div>`).join("")}</div>`;
                })
                .join("")}</div>`,
          );
          $("#newEvent").onclick = () => eventForm();
          $("#prevMonth").onclick = () => {
            state.calendarDate = new Date(y, m - 1, 1);
            renderCalendar();
          };
          $("#nextMonth").onclick = () => {
            state.calendarDate = new Date(y, m + 1, 1);
            renderCalendar();
          };
          $("#thisMonth").onclick = () => {
            state.calendarDate = new Date();
            renderCalendar();
          };
          $$("[data-event]").forEach(
            (e) => (e.onclick = () => eventForm(e.dataset.event)),
          );
        }
        async function eventForm(id) {
          const e = id
            ? await db.get("calendar_events", id)
            : {
                date: today(),
                campus_id: state.campusId,
                category: "Hoạt động Đội",
              };
          openModal(
            id ? "Cập nhật lịch" : "Thêm lịch hoạt động",
            `<form id="eventForm"><div class="form-grid"><div class="field full"><label class="required">Tên sự kiện</label><input name="title" value="${esc(e.title || "")}" required></div><div class="field"><label class="required">Ngày</label><input type="date" name="date" value="${e.date}" required></div><div class="field"><label>Giờ</label><input type="time" name="time" value="${esc(e.time || "")}"></div><div class="field"><label>Địa điểm</label><input name="location" value="${esc(e.location || "")}"></div><div class="field"><label>Người phụ trách</label><input name="leader" value="${esc(e.leader || "")}"></div><div class="field"><label>Cơ sở</label><select name="campus_id"><option value="all">Toàn trường</option>${state.cache.campuses.map((c) => `<option value="${c.id}" ${e.campus_id === c.id ? "selected" : ""}>${esc(c.name)}</option>`).join("")}</select></div><div class="field"><label>Nhắc trước (giờ)</label><input type="number" name="reminder_hours" min="0" value="${e.reminder_hours || 24}"></div><div class="field full"><label>Checklist an toàn</label><textarea name="safety">${esc(e.safety || "")}</textarea><span class="hint">Hoạt động đông người nên ghi rõ phương án an toàn và dự phòng.</span></div></div></form>`,
            `<button class="btn" id="deleteEvent" ${id ? "" : 'style="display:none"'}>Xóa</button><button class="btn" id="cancelEvent">Hủy</button><button class="btn primary" id="saveEvent">Lưu</button>`,
          );
          $("#cancelEvent").onclick = closeModal;
          if (id)
            $("#deleteEvent").onclick = () =>
              confirmDelete("calendar_events", id, () => {
                closeModal();
                renderCalendar();
              });
          $("#saveEvent").onclick = async () => {
            const f = $("#eventForm");
            if (!f.reportValidity()) return;
            const d = Object.fromEntries(new FormData(f));
            await db.put("calendar_events", {
              ...e,
              ...d,
              school_year_id: state.yearId,
            });
            closeModal();
            toast(
              !d.location || !d.leader || !d.safety
                ? "Đã lưu; còn thiếu địa điểm, phụ trách hoặc checklist an toàn."
                : "Đã lưu lịch hoạt động",
              !d.location || !d.leader || !d.safety ? "bad" : "ok",
            );
            renderCalendar();
          };
        }

        function criterionScore(entry, criterion, set) {
          let score = Number(entry?.value || 0);
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
            const criterion = criteria.find((row) => row.id === entry.criteria_id);
            return total +
              (criterion && entry.entry_state === "value"
                ? criterionScore(entry, criterion, set)
                : 0);
          }, 0);
        }
        function classScoreSummary(ctx, classId) {
          const entries = ctx.entries.filter((entry) => entry.class_id === classId),
            selectedEntries = entries.filter(
              (entry) => entry.entry_date === state.scoreDate,
            );
          return {
            dayAdjustment: scoreAdjustment(selectedEntries, ctx.criteria, ctx.set),
            weeklyTotal:
              (ctx.set?.formula === "base" ? Number(ctx.set.base_score || 0) : 0) +
              scoreAdjustment(entries, ctx.criteria, ctx.set),
          };
        }
        async function renderScores() {
          const ctx = await scoreContext(),
            week = state.cache.weeks.find((x) => x.id === state.weekId);
          setContent(
            pageHead(
              "Thi đua lớp",
              "Nhập điểm từng ngày, duyệt, khóa và truy vết theo tuần.",
              `<button class="btn" id="criteriaConfig">Bộ tiêu chí</button><button class="btn" id="undoScore" ${state.lastScoreUndo ? "" : "disabled"}>↶ Hoàn tác</button><button class="btn primary" id="scoreWorkflow">${workflowLabel(ctx.sheet)}</button>`,


            ) +
              `
      <div class="notice warn"><strong>${esc(ctx.set?.name || "Chưa có bộ tiêu chí")}</strong><br>${esc(ctx.set?.basis || "Cần tạo bộ tiêu chí trước khi nhập điểm.")} ${ctx.set ? `Công thức: ${ctx.set.formula === "base" ? `Điểm chuẩn ${ctx.set.base_score || 0}, sau đó cộng/trừ` : "Cộng điểm từng nhóm"}.` : ""}</div>
      <div class="toolbar"><strong>${esc(week?.name || "Chưa chọn tuần")}</strong><span>${week ? `${fmtDate(week.start_date)} – ${fmtDate(week.end_date)}` : ""}</span><label class="muted">Bộ tiêu chí <select id="scoreSetSelect">${ctx.sets.map((s) => `<option value="${s.id}" ${s.id === ctx.set?.id ? "selected" : ""}>${esc(s.name)} • v${esc(s.version || "1.0")}</option>`).join("")}</select></label><span style="margin-left:auto">Trạng thái: ${statusBadge(ctx.sheet?.status || "Chưa tạo")}</span></div>
      <div class="tabs"><button data-score-tab="entry" class="${state.scoreTab === "entry" ? "active" : ""}">Nhập điểm</button><button data-score-tab="ranking" class="${state.scoreTab === "ranking" ? "active" : ""}">Xếp hạng</button><button data-score-tab="anomaly" class="${state.scoreTab === "anomaly" ? "active" : ""}">Kiểm tra bất thường</button><button data-score-tab="history" class="${state.scoreTab === "history" ? "active" : ""}">Nhật ký điều chỉnh</button></div><div id="scoreArea"></div>`,
          );
          if (state.scoreTab === "entry") renderScoreEntry(ctx);
          if (state.scoreTab === "ranking") renderScoreRanking(ctx);
          if (state.scoreTab === "anomaly") renderScoreAnomalies(ctx);
          if (state.scoreTab === "history") await renderScoreHistory(ctx);
          $$("[data-score-tab]").forEach(
            (b) =>
              (b.onclick = () => {
                state.scoreTab = b.dataset.scoreTab;
                renderScores();
              }),
          );
          $("#criteriaConfig").onclick = showCriteriaConfig;
          if ($("#scoreSetSelect"))
            $("#scoreSetSelect").onchange = (e) => {
              state.criteriaSetId = e.target.value;
              renderScores();
            };
          $("#scoreWorkflow").onclick = () => scoreWorkflow(ctx);
          $("#undoScore").onclick = undoScore;
        }
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
        function entryMap(entries) {
          return new Map(
            entries.map((e) => [e.class_id + "|" + e.criteria_id, e]),
          );
        }
        function renderScoreEntry(ctx) {
          const area = $("#scoreArea");
          if (!ctx.set || !ctx.criteria.length)
            return (area.innerHTML =
              '<div class="empty">Chưa có bộ tiêu chí hoạt động. Hãy mở “Bộ tiêu chí” để cấu hình.</div>');
          if (!ctx.sheet)
            return (area.innerHTML =
              '<div class="empty">Chưa khởi tạo bảng tuần. Chọn “Khởi tạo bảng tuần” để bắt đầu nhập.</div>');
          if (!ctx.days.length)
            return (area.innerHTML =
              '<div class="empty">Tuần đang chọn chưa có ngày học từ Thứ Hai đến Thứ Sáu.</div>');
          const map = entryMap(ctx.selectedEntries),
            locked = ctx.sheet.status === "locked";
          area.innerHTML = `<div class="score-day-picker" aria-label="Chọn ngày nhập điểm">${ctx.days.map((day) => `<button type="button" data-score-date="${day.date}" class="${day.date === state.scoreDate ? "active" : ""}"><strong>${day.label}</strong><span>${fmtDate(day.date)}</span></button>`).join("")}</div><div class="score-wrap"><table class="score-table"><thead><tr><th style="min-width:110px">Lớp</th>${ctx.criteria.map((c) => `<th title="${esc(c.name)}">${esc(c.code)}<br><small>${esc(c.group)}</small></th>`).join("")}<th>Điểm ngày</th><th>Tổng tuần</th><th>Trạng thái ngày</th></tr></thead><tbody>${ctx.classes
            .map((cl, ri) => {
              let filled = 0;
              const cells = ctx.criteria
                .map((c, ci) => {
                  const e = map.get(cl.id + "|" + c.id),
                    v =
                      e?.entry_state === "na"
                        ? "KAD"
                        : e?.entry_state === "exempt"
                          ? "MIỄN"
                          : (e?.value ?? "");
                  if (e && e.entry_state === "value") {
                    filled++;
                  } else if (e) filled++;
                  return `<td><input class="score-input ${e ? "" : "missing"}" data-row="${ri}" data-col="${ci}" data-class="${cl.id}" data-criterion="${c.id}" data-entry="${e?.id || ""}" value="${esc(v)}" ${locked ? "disabled" : ""} aria-label="${esc(cl.class_name)} - ${esc(c.name)}"></td>`;
                })
                .join("");
              const totals = classScoreSummary(ctx, cl.id);
              return `<tr><td><strong>${esc(cl.class_name)}</strong><br><small>${esc(campusName(cl.campus_id))}</small></td>${cells}<td class="score-total">${totals.dayAdjustment.toFixed(1)}</td><td class="score-total" data-total="${cl.id}">${totals.weeklyTotal.toFixed(1)}</td><td>${filled === ctx.criteria.length ? '<span class="badge green">Đủ</span>' : `<span class="badge yellow">${filled}/${ctx.criteria.length}</span>`}</td></tr>`;
            })
            .join(
              "",
            )}</tbody></table></div><div class="notice mt">Điểm tuần = điểm chuẩn một lần + tổng điều chỉnh từ Thứ Hai đến Thứ Sáu. Ô trống = chưa nhập; nhập <strong>0</strong> = có dữ liệu bằng 0; nhập <strong>KAD</strong> = không áp dụng; nhập <strong>MIỄN</strong> = được miễn. Có thể dán một vùng dữ liệu từ Excel bắt đầu tại ô đang chọn.</div>`;
          $$('[data-score-date]').forEach(
            (button) =>
              (button.onclick = () => {
                state.scoreDate = button.dataset.scoreDate;
                renderScores();
              }),
          );
          $$(".score-input").forEach((i) => {
            i.addEventListener("change", saveScoreCell);
            i.addEventListener("keydown", scoreKeyNav);
            i.addEventListener("paste", scorePaste);
          });
        }
        async function saveScoreCell(ev) {
          const i = ev.currentTarget,
            ctx = await scoreContext(),
            criterion = ctx.criteria.find((c) => c.id === i.dataset.criterion),
            old = i.dataset.entry
              ? await db.get("score_entries", i.dataset.entry)
              : null,
            raw = i.value.trim().toUpperCase();
          let entry_state = "value",
            value = null;
          if (raw === "KAD" || raw === "N/A") entry_state = "na";
          else if (raw === "MIỄN" || raw === "MIEN") entry_state = "exempt";
          else if (raw === "") {
            if (old) {
              await db.remove("score_entries", old.id);
              await db.put("audit_logs", {
                action: "score_clear",
                entity: "score_entries",
                entity_id: old.id,
                summary: `Xóa giá trị ${old.value}`,
                old_value: old.value,
                new_value: null,
                reason: "Người dùng xóa ô",
              });
              state.lastScoreUndo = { type: "restore", row: old };
            }
            i.classList.add("missing");
            renderScores();
            return;
          } else {
            if (
              criterion.data_type === "boolean" &&
              ["ĐẠT", "DAT", "CÓ", "CO"].includes(raw)
            )
              value = 1;
            else if (
              criterion.data_type === "boolean" &&
              ["KHÔNG ĐẠT", "KHONG DAT", "KHÔNG", "KHONG"].includes(raw)
            )
              value = 0;
            else value = Number(raw.replace(",", "."));
            if (!Number.isFinite(value))
              return toast(
                "Nhập số, ĐẠT/KHÔNG ĐẠT, KAD hoặc MIỄN theo kiểu tiêu chí.",
                "bad",
              );
            if (
              value < Number(criterion.min ?? -Infinity) ||
              value > Number(criterion.max ?? Infinity)
            )
              return toast(
                `Giá trị phải trong khoảng ${criterion.min} đến ${criterion.max}.`,
                "bad",
              );
          }
          const saved = await db.put(
            "score_entries",
            {
              ...(old || {}),
              sheet_id: ctx.sheet.id,
              school_year_id: state.yearId,
              campus_id: ctx.classes.find((c) => c.id === i.dataset.class)
                ?.campus_id,
              class_id: i.dataset.class,
              criteria_id: i.dataset.criterion,
              week_id: state.weekId,
              entry_date: state.scoreDate,
              entry_state,
              value,
              reason: old?.reason || "",
            },
            { audit: false },
          );
          await db.put("audit_logs", {
            action: old ? "score_update" : "score_create",
            entity: "score_entries",
            entity_id: saved.id,
            summary: `${state.scoreDate}|${i.dataset.class}|${i.dataset.criterion}`,
            old_value: old?.value ?? old?.entry_state ?? null,
            new_value: value ?? entry_state,
            reason: "Nhập trực tiếp điểm ngày",
          });
          state.lastScoreUndo = old
            ? { type: "restore", row: old }
            : { type: "delete", id: saved.id };
          i.dataset.entry = saved.id;
          i.classList.remove("missing");
          toast("Đã lưu điểm");
          renderScores();
        }
        function scoreKeyNav(e) {
          if (e.key !== "Enter") return;
          e.preventDefault();
          const r = Number(e.currentTarget.dataset.row) + (e.shiftKey ? -1 : 1),
            c = e.currentTarget.dataset.col;
          document
            .querySelector(`.score-input[data-row="${r}"][data-col="${c}"]`)
            ?.focus();
        }
        async function scorePaste(e) {
          const text = e.clipboardData?.getData("text/plain");
          if (!text || (!text.includes("\t") && !text.includes("\n"))) return;
          e.preventDefault();
          const ctx = await scoreContext(),
            matrix = text
              .trim()
              .split(/\r?\n/)
              .map((r) => r.split("\t")),
            startR = Number(e.currentTarget.dataset.row),
            startC = Number(e.currentTarget.dataset.col),
            map = entryMap(ctx.selectedEntries),
            batch = [];
          for (let r = 0; r < matrix.length; r++)
            for (let c = 0; c < matrix[r].length; c++) {
              const cl = ctx.classes[startR + r],
                criterion = ctx.criteria[startC + c];
              if (!cl || !criterion) continue;
              const raw = matrix[r][c].trim().toUpperCase(),
                old = map.get(cl.id + "|" + criterion.id);
              let entry_state = "value",
                value = null;
              if (raw === "KAD" || raw === "N/A") entry_state = "na";
              else if (raw === "MIỄN" || raw === "MIEN") entry_state = "exempt";
              else {
                if (
                  criterion.data_type === "boolean" &&
                  ["ĐẠT", "DAT", "CÓ", "CO"].includes(raw)
                )
                  value = 1;
                else if (
                  criterion.data_type === "boolean" &&
                  ["KHÔNG ĐẠT", "KHONG DAT", "KHÔNG", "KHONG"].includes(raw)
                )
                  value = 0;
                else value = Number(raw.replace(",", "."));
                if (
                  !Number.isFinite(value) ||
                  value < Number(criterion.min ?? -Infinity) ||
                  value > Number(criterion.max ?? Infinity)
                )
                  continue;
              }
              batch.push({
                ...(old || {}),
                id: old?.id || uid(),
                sheet_id: ctx.sheet.id,
                school_year_id: state.yearId,
                campus_id: cl.campus_id,
                class_id: cl.id,
                criteria_id: criterion.id,
                week_id: state.weekId,
                entry_date: state.scoreDate,
                entry_state,
                value,
              });
            }
          if (batch.length) {
            await db.bulkPut("score_entries", batch);
            await db.put("audit_logs", {
              action: "score_bulk_paste",
              entity: "score_entries",
              summary: `Dán ${batch.length} ô điểm`,
              reason: "Dán vùng dữ liệu từ bảng tính",
            });
            toast(`Đã dán ${batch.length} ô dữ liệu`);
            renderScores();
          } else toast("Không có ô hợp lệ để nhập.", "bad");
        }
        async function undoScore() {
          const u = state.lastScoreUndo;
          if (!u) return;
          if (u.type === "delete") await db.remove("score_entries", u.id);
          else await db.put("score_entries", u.row, { audit: false });
          state.lastScoreUndo = null;
          await db.put("audit_logs", {
            action: "score_undo",
            entity: "score_entries",
            entity_id: u.id || u.row.id,
            summary: "Hoàn tác thay đổi điểm",
            reason: "Người dùng hoàn tác",
          });
          toast("Đã hoàn tác thay đổi gần nhất");
          renderScores();
        }
        async function scoreWorkflow(ctx) {
          if (!ctx.sheet) {
            const sheet = await db.put("weekly_score_sheets", {
              school_year_id: state.yearId,
              campus_id: state.campusId,
              week_id: state.weekId,
              criteria_set_id: ctx.set?.id,
              status: "draft",
              approved_at: null,
              locked_at: null,
            });
            toast("Đã khởi tạo bảng tuần");
            return renderScores();
          }
          const sheet = ctx.sheet;
          if (sheet.status === "draft") {
            const expected =
                ctx.classes.length * ctx.criteria.length * ctx.days.length,
              filled = new Set(
                ctx.entries.map(
                  (entry) =>
                    `${entry.entry_date}|${entry.class_id}|${entry.criteria_id}`,
                ),
              ).size;
            if (filled < expected)
              return toast(
                `Còn ${expected - filled} ô ngày chưa nhập/KAD/MIỄN. Chưa thể đánh dấu đủ.`,
                "bad",
              );
            sheet.status = "complete";
          } else if (sheet.status === "complete" || sheet.status === "unlocked")
            sheet.status = "review";
          else if (sheet.status === "review") {
            sheet.status = "approved";
            sheet.approved_at = now();
          } else if (sheet.status === "approved") {
            await createInternalSnapshot(
              `Trước khóa bảng thi đua ${state.weekId}`,
              {
                tier: "protected",
                protectedSnapshot: true,
                reason: "before-score-lock",
                yearId: state.yearId,
              },
            );
            sheet.status = "locked";
            sheet.locked_at = now();
            sheet.criteria_snapshot = {
              set: ctx.set,
              criteria: ctx.criteria.map((x) => ({ ...x })),
            };
            const ranked = await calculateRanking(false);
            await db.put("ranking_snapshots", {
              school_year_id: state.yearId,
              semester_id: state.semesterId === "all" ? null : state.semesterId,
              campus_id: state.campusId,
              week_id: state.weekId,
              sheet_id: sheet.id,
              criteria_set_id: ctx.set?.id,
              criteria_version: ctx.set?.version,
              rows: ranked.map((x) => ({ ...x })),
            });
          } else if (sheet.status === "locked") return unlockSheet(sheet);
          await db.put("weekly_score_sheets", sheet);
          await db.put("audit_logs", {
            action: "sheet_status",
            entity: "weekly_score_sheets",
            entity_id: sheet.id,
            summary: `Chuyển trạng thái: ${sheet.status}`,
            reason: "Quy trình thi đua",
          });
          toast("Đã cập nhật trạng thái bảng tuần");
          renderScores();
        }
        function unlockSheet(sheet) {
          openModal(
            "Mở khóa bảng thi đua",
            `<div class="notice danger">Mở khóa cho phép sửa điểm đã khóa. Hệ thống sẽ ghi lại lý do, thời gian và đánh dấu báo cáo liên quan cần cập nhật.</div><div class="field"><label class="required">Lý do mở khóa</label><textarea id="unlockReason" maxlength="500" required></textarea></div>`,
            `<button class="btn" id="cancelUnlock">Hủy</button><button class="btn danger" id="confirmUnlock">Mở khóa</button>`,
          );
          $("#cancelUnlock").onclick = closeModal;
          $("#confirmUnlock").onclick = async () => {
            const reason = $("#unlockReason").value.trim();
            if (reason.length < 5)
              return toast("Hãy nhập lý do cụ thể, tối thiểu 5 ký tự.", "bad");
            await createInternalSnapshot(
              `Trước mở khóa bảng thi đua ${sheet.week_id}`,
              {
                tier: "protected",
                protectedSnapshot: true,
                reason: "before-score-unlock",
                yearId: state.yearId,
              },
            );
            await db.put("weekly_score_sheets", {
              ...sheet,
              status: "unlocked",
              unlock_reason: reason,
              unlocked_at: now(),
              reports_stale: true,
            });
            await db.put("audit_logs", {
              action: "sheet_unlock",
              entity: "weekly_score_sheets",
              entity_id: sheet.id,
              summary: "Mở khóa bảng thi đua",
              reason,
            });
            closeModal();
            toast("Đã mở khóa và lưu lý do");
            renderScores();
          };
        }
        async function calculateRanking(official = true) {
          const ctx = await scoreContext();
          if (
            !ctx.sheet ||
            (official && !["approved", "locked"].includes(ctx.sheet.status))
          )
            return [];
          const ranked = ctx.classes
            .map((cl) => {
              let total =
                  ctx.set?.formula === "base"
                    ? Number(ctx.set.base_score || 0)
                    : 0,
                filled = 0;
              const entries = ctx.entries.filter((entry) => entry.class_id === cl.id);
              total += scoreAdjustment(entries, ctx.criteria, ctx.set);
              filled = new Set(
                entries.map((entry) => `${entry.entry_date}|${entry.criteria_id}`),
              ).size;
              const daily = Object.fromEntries(
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
                id: cl.id,
                class_name: cl.class_name,
                campus_id: cl.campus_id,
                total,
                daily,
                filled,
                complete: filled === ctx.criteria.length * ctx.days.length,
              };
            })
            .filter((x) => x.filled > 0)
            .sort(
              (a, b) =>
                b.total - a.total ||
                a.class_name.localeCompare(b.class_name, "vi", {
                  numeric: true,
                }),
            );
          ranked.forEach((row, index) => {
            row.rank =
              index > 0 && row.total === ranked[index - 1].total
                ? ranked[index - 1].rank
                : index + 1;
          });
          return ranked;
        }
        async function renderScoreRanking(ctx) {
          const area = $("#scoreArea"),
            official = ["approved", "locked"].includes(ctx.sheet?.status),
            rank = await calculateRanking(false);
          area.innerHTML = `${!official ? '<div class="notice warn">Bảng chưa được duyệt. Xếp hạng dưới đây là tạm thời, không dùng cho báo cáo chính thức.</div>' : ""}<div class="table-wrap"><table><thead><tr><th>Hạng</th><th>Lớp</th><th>Cơ sở</th>${ctx.days.map((day) => `<th>${day.label.replace("Thứ ", "T")}</th>`).join("")}<th>Tổng tuần</th><th>Mức dữ liệu</th><th>Loại</th></tr></thead><tbody>${rank.map((r) => `<tr><td><strong>${r.rank}</strong></td><td>${esc(r.class_name)}</td><td>${esc(campusName(r.campus_id))}</td>${ctx.days.map((day) => `<td>${Number(r.daily[day.date] || 0).toFixed(1)}</td>`).join("")}<td><strong>${r.total.toFixed(1)}</strong></td><td>${r.complete ? '<span class="badge green">Đủ</span>' : '<span class="badge yellow">Chưa đủ</span>'}</td><td>${official ? '<span class="badge green">Chính thức</span>' : '<span class="badge yellow">Tạm thời</span>'}</td></tr>`).join("") || `<tr><td colspan="${ctx.days.length + 6}" class="empty">Chưa có dữ liệu xếp hạng.</td></tr>`}</tbody></table></div>`;
        }
        function renderScoreAnomalies(ctx) {
          const items = [],
            expected = ctx.criteria.length * ctx.days.length;
          ctx.classes.forEach((cl) => {
            const count = new Set(
              ctx.entries
                .filter((entry) => entry.class_id === cl.id)
                .map((entry) => `${entry.entry_date}|${entry.criteria_id}`),
            ).size;
            if (!count)
              items.push({
                level: "red",
                text: `Lớp ${cl.class_name} chưa có dữ liệu.`,
              });
            else if (count < expected)
              items.push({
                level: "yellow",
                text: `Lớp ${cl.class_name} còn thiếu ${expected - count} ô điểm ngày.`,
              });
          });
          ctx.entries.forEach((e) => {
            const c = ctx.criteria.find((x) => x.id === e.criteria_id);
            if (c?.evidence_required && !e.evidence_id)
              items.push({
                level: "yellow",
                text: `Thiếu minh chứng bắt buộc ngày ${fmtDate(e.entry_date)}, lớp ${ctx.classes.find((x) => x.id === e.class_id)?.class_name}, tiêu chí ${c.code}.`,
              });
            if (
              e.entry_state === "value" &&
              (e.value < c?.min || e.value > c?.max)
            )
              items.push({
                level: "red",
                text: `Giá trị vượt giới hạn ở tiêu chí ${c?.code}.`,
              });
          });
          $("#scoreArea").innerHTML =
            `<div class="notice">Cảnh báo chỉ yêu cầu kiểm tra, không tự kết luận sai phạm.</div><div class="card"><div class="card-body"><ul class="compact-list">${items.map((x) => `<li><span class="badge ${x.level}">${x.level === "red" ? "Kiểm tra" : "Lưu ý"}</span><div class="main">${esc(x.text)}</div></li>`).join("") || '<li class="muted">Chưa phát hiện bất thường theo các quy tắc đang bật.</li>'}</ul></div></div>`;
        }
        async function renderScoreHistory(ctx) {
          const logs = (await db.all("audit_logs"))
            .filter((x) =>
              ["score_entries", "weekly_score_sheets"].includes(x.entity),
            )
            .sort((a, b) => b.created_at.localeCompare(a.created_at));
          $("#scoreArea").innerHTML =
            `<div class="table-wrap"><table><thead><tr><th>Thời gian</th><th>Hành động</th><th>Nội dung</th><th>Giá trị cũ</th><th>Giá trị mới</th><th>Lý do</th></tr></thead><tbody>${logs.map((x) => `<tr><td>${fmtDateTime(x.created_at)}</td><td>${esc(x.action)}</td><td>${esc(x.summary)}</td><td>${esc(x.old_value ?? "—")}</td><td>${esc(x.new_value ?? "—")}</td><td class="wrap">${esc(x.reason || "—")}</td></tr>`).join("") || '<tr><td colspan="6" class="empty">Chưa có điều chỉnh.</td></tr>'}</tbody></table></div>`;
        }

        async function reportData() {
          const [school] = await db.all("schools"),
            tasks = await scoped("tasks"),
            events = await scoped("calendar_events"),
            activities = await scoped("activities"),
            rank = await calculateRanking(true),
            classes = await scoped("classes"),
            ctx = await scoreContext(),
            week = state.cache.weeks.find((x) => x.id === state.weekId);
          return {
            school,
            tasks,
            events,
            activities,
            rank,
            classes,
            ctx,
            week,
            completed: tasks.filter((x) => x.status === "done"),
            overdue: tasks.filter(
              (x) => x.status !== "done" && x.due_date < today(),
            ),
            upcoming: events.filter((x) => x.date >= today()).slice(0, 10),
          };
        }
        async function renderReports() {
          const d = await reportData(),
            saved = (await scoped("generated_reports")).sort((a, b) =>
              String(b.generated_at || b.created_at).localeCompare(
                a.generated_at || a.created_at,
              ),
            );
          setContent(
            pageHead(
              "Báo cáo",
              "Tổng hợp số liệu đã xác nhận và truy ngược về bản ghi gốc.",
              `<button class="btn" id="exportReportPackage">Gói báo cáo chốt</button><button class="btn" id="exportReportCsv">Xuất CSV</button><button class="btn" onclick="window.print()">In/Lưu PDF</button><button class="btn" id="saveReportDraft">Lưu nháp</button><button class="btn primary" id="finalizeReport">Chốt báo cáo</button>`,
            ) +
              `<div class="toolbar no-print"><select id="reportType"><option value="week">Báo cáo công tác tuần</option><option value="scores">Tổng hợp thi đua lớp</option><option value="tasks">Tiến độ công việc</option><option value="activities">Báo cáo hoạt động</option><option value="equipment">Báo cáo thiết bị</option></select><select id="reportPaper"><option value="landscape">A4 ngang</option><option value="portrait">A4 dọc</option></select><input id="reportRecipient" placeholder="Nơi nhận (tùy chọn)"><select id="reportSubmission"><option value="not_submitted">Chưa gửi</option><option value="submitted">Đã gửi</option><option value="accepted">Đã tiếp nhận</option></select><span class="muted">Số liệu nguồn không sửa tại báo cáo</span></div><div class="notice warn no-print"><strong>Nháp</strong> có thể tạo lại; <strong>báo cáo chốt</strong> lưu nội dung tĩnh, phiên bản, bộ lọc, checksum và trạng thái gửi. Muốn sửa sau chốt phải tạo phiên bản mới.</div><article class="card" id="reportPreview"><div class="card-body">${await reportHTML("week", d)}</div></article><div class="card mt no-print"><div class="card-head"><h2>Phiên bản báo cáo đã lưu</h2><span class="meta">${saved.length} phiên bản</span></div><div class="card-body"><ul class="compact-list">${
                saved
                  .slice(0, 30)
                  .map(
                    (r) =>
                      `<li><div class="main"><strong>${esc(r.name)}</strong><small>${fmtDateTime(r.generated_at || r.created_at)} • ${esc(r.type)} • v${Number(r.version || 1)} • ${r.status === "finalized" ? "đã chốt" : "bản nháp"} • ${statusLabel(r.submission_status)}</small></div><span class="badge ${r.status === "finalized" ? "green" : "yellow"}">${r.status === "finalized" ? "Bất biến" : "Nháp"}</span><button class="link-btn" data-open-report="${r.id}">Mở lại</button></li>`,
                  )
                  .join("") ||
                '<li class="muted">Chưa lưu phiên bản báo cáo.</li>'
              }</ul></div></div>`,
          );
          $("#reportType").onchange = async () =>
            ($("#reportPreview .card-body").innerHTML = await reportHTML(
              $("#reportType").value,
              await reportData(),
            ));
          $("#exportReportCsv").onclick = () =>
            exportReportCSV($("#reportType").value, d);
          $("#exportReportPackage").onclick = () =>
            exportFinalizedReportPackage(state.yearId);
          $("#reportPaper").value = document.body.dataset.paper || "landscape";
          $("#reportPaper").onchange = async () => {
            document.body.dataset.paper = $("#reportPaper").value;
            await setting("paper_orientation", $("#reportPaper").value);
            toast("Đã đổi khổ in báo cáo");
          };
          $("#saveReportDraft").onclick = () => saveCurrentReport("draft");
          $("#finalizeReport").onclick = () => confirmFinalizeCurrentReport();
          $$("[data-open-report]").forEach(
            (b) =>
              (b.onclick = async () => {
                const r = await db.get(
                  "generated_reports",
                  b.dataset.openReport,
                );
                openModal(
                  r.name,
                  `<div class="notice">Bản lưu lúc ${fmtDateTime(r.generated_at || r.created_at)} • v${Number(r.version || 1)} • ${r.status === "finalized" ? "đã chốt, bất biến" : "bản nháp"}. Nội dung không tự cập nhật theo nguồn hiện tại.</div><div class="split"><span>Nơi nhận/trạng thái gửi</span><strong>${esc(r.recipient || "Chưa ghi")} • ${esc(statusLabel(r.submission_status))}</strong></div><div class="split mt"><span>Checksum nguồn</span><code>${esc(r.source_checksum || "Chưa có ở phiên bản cũ")}</code></div><article class="mt">${r.content_html || `<pre style="white-space:pre-wrap">${esc(r.content || r.content_text || "")}</pre>`}</article>`,
                  `<button class="btn primary" id="closeSavedReport">Đóng</button>`,
                  true,
                );
                $("#closeSavedReport").onclick = closeModal;
              }),
          );
        }

        async function saveCurrentReport(status) {
          const type = $("#reportType").value,
            html = $("#reportPreview .card-body").innerHTML,
            data = await reportData(),
            source = {
              type,
              scope: {
                year_id: state.yearId,
                semester_id: state.semesterId,
                week_id: state.weekId,
                campus_id: state.campusId,
              },
              tasks: data.tasks,
              events: data.events,
              activities: data.activities,
              ranking: data.rank,
            },
            sourceChecksum = await sha256Text(stableJSON(source)),
            existing = (await db.all("generated_reports")).filter(
              (row) => row.type === type && row.school_year_id === state.yearId,
            ),
            version =
              Math.max(0, ...existing.map((row) => Number(row.version || 0))) +
              1;
          const report = await db.put("generated_reports", {
            name: `${$("#reportType option:checked").textContent} - ${fmtDate(today())}`,
            type,
            version,
            status,
            immutable: status === "finalized",
            recipient: $("#reportRecipient").value.trim(),
            submission_status: $("#reportSubmission").value,
            filters: source.scope,
            scope: source.scope,
            content_html: html,
            content_text: $("#reportPreview").innerText,
            content_checksum: await sha256Text(html),
            source_checksum: sourceChecksum,
            source_record_count:
              data.tasks.length +
              data.events.length +
              data.activities.length +
              data.rank.length,
            config_snapshot: {
              criteria_set_id: data.ctx?.set?.id || null,
              criteria_set_version: data.ctx?.set?.version || null,
              app_version: APP.version,
              schema: APP.schema,
              build_id: APP.buildId,
            },
            generated_at: now(),
            finalized_at: status === "finalized" ? now() : null,
            school_year_id: state.yearId,
            campus_id: state.campusId,
          });
          if (status === "finalized")
            await createInternalSnapshot(`Sau chốt báo cáo ${report.name}`, {
              tier: "protected",
              protectedSnapshot: true,
              reason: "after-finalized-report",
              yearId: state.yearId,
            });
          toast(
            status === "finalized"
              ? `Đã chốt báo cáo v${version}; nội dung lưu bất biến.`
              : `Đã lưu bản nháp v${version}.`,
          );
          renderReports();
          return report;
        }

        function confirmFinalizeCurrentReport() {
          openModal(
            "Chốt báo cáo",
            `<div class="notice warn"><strong>Sau khi chốt, phiên bản này không sửa trực tiếp.</strong> Nếu số liệu thay đổi, hãy tạo và chốt phiên bản mới.</div><label class="check-row"><input id="confirmFinalizeCheck" type="checkbox"> Tôi đã đối chiếu nội dung, bộ lọc, nơi nhận và trạng thái gửi.</label>`,
            `<button class="btn" id="cancelFinalizeReport">Hủy</button><button class="btn primary" id="confirmFinalizeReport">Chốt phiên bản</button>`,
          );
          $("#cancelFinalizeReport").onclick = closeModal;
          $("#confirmFinalizeReport").onclick = async () => {
            if (!$("#confirmFinalizeCheck").checked)
              return toast("Cần xác nhận đã đối chiếu báo cáo.", "bad");
            const values = {
              type: $("#reportType")?.value,
              recipient: $("#reportRecipient")?.value || "",
              submission: $("#reportSubmission")?.value || "not_submitted",
              html: $("#reportPreview .card-body")?.innerHTML || "",
            };
            closeModal();
            await go("reports", false);
            $("#reportType").value = values.type;
            $("#reportRecipient").value = values.recipient;
            $("#reportSubmission").value = values.submission;
            $("#reportPreview .card-body").innerHTML = values.html;
            await saveCurrentReport("finalized");
          };
        }

        async function createFinalizedYearReport(year) {
          const all = async (store) =>
              (await db.all(store)).filter(
                (row) => row.school_year_id === year.id,
              ),
            [tasks, activities, events, sheets, entries, classes] =
              await Promise.all([
                all("tasks"),
                all("activities"),
                all("calendar_events"),
                all("weekly_score_sheets"),
                all("score_entries"),
                all("classes"),
              ]),
            source = { tasks, activities, events, sheets, entries, classes },
            html = `<h2>BÁO CÁO TỔNG KẾT CÔNG TÁC ĐỘI NĂM HỌC ${esc(year.name)}</h2><p>Chốt lúc ${fmtDateTime(now())}.</p>${simpleTable(
              ["Chỉ tiêu", "Số lượng"],
              [
                ["Lớp", classes.length],
                ["Công việc", tasks.length],
                [
                  "Công việc hoàn thành",
                  tasks.filter((row) => row.status === "done").length,
                ],
                ["Hoạt động", activities.length],
                ["Sự kiện lịch", events.length],
                [
                  "Bảng thi đua đã khóa",
                  sheets.filter((row) => row.status === "locked").length,
                ],
                ["Dòng điểm", entries.length],
              ],
            )}`;
          const existing = (await db.all("generated_reports")).filter(
              (row) =>
                row.type === "year-final" && row.school_year_id === year.id,
            ),
            version =
              Math.max(0, ...existing.map((row) => Number(row.version || 0))) +
              1;
          return db.put("generated_reports", {
            name: `Tổng kết năm học ${year.name}`,
            type: "year-final",
            version,
            status: "finalized",
            immutable: true,
            recipient: "Nhà trường/đơn vị quản lý",
            submission_status: "not_submitted",
            scope: { year_id: year.id, campus_id: "all" },
            filters: { year_id: year.id, campus_id: "all" },
            content_html: html,
            content_text: html.replace(/<[^>]+>/g, " "),
            content_checksum: await sha256Text(html),
            source_checksum: await sha256Text(stableJSON(source)),
            source_record_count: Object.values(source).reduce(
              (sum, rows) => sum + rows.length,
              0,
            ),
            config_snapshot: {
              app_version: APP.version,
              schema: APP.schema,
              build_id: APP.buildId,
            },
            generated_at: now(),
            finalized_at: now(),
            school_year_id: year.id,
            campus_id: "all",
          });
        }

        async function exportFinalizedReportPackage(yearId) {
          const reports = (await db.all("generated_reports")).filter(
              (row) =>
                row.school_year_id === yearId && row.status === "finalized",
            ),
            attachments = (await db.all("attachments")).filter(
              (row) => !row.school_year_id || row.school_year_id === yearId,
            ),
            files = [];
          if (!reports.length)
            return toast("Chưa có báo cáo chốt trong năm học này.", "bad");
          for (const row of attachments)
            if (row.blob instanceof Blob)
              files.push({
                id: row.id,
                name: row.original_name || row.name,
                type: row.mime_type || row.blob.type,
                size: row.blob.size,
                sha256: row.sha256 || (await sha256Blob(row.blob)),
                data: await blobToBase64(row.blob),
              });
          const core = { reports, files },
            packageData = {
              format: "TPT-REPORT-PACKAGE-1",
              app_id: APP.appId,
              school_profile_id: APP.schoolProfileId,
              academic_year_id: yearId,
              created_at: now(),
              manifest: {
                report_count: reports.length,
                file_count: files.length,
                checksum: await sha256Text(stableJSON(core)),
              },
              ...core,
            },
            text = JSON.stringify(packageData),
            fileName = `goi-bao-cao-chot-${today()}.tptbackup`;
          download(text, fileName, "application/json");
          await db.put("report_packages", {
            name: fileName,
            academic_year_id: yearId,
            report_ids: reports.map((row) => row.id),
            report_count: reports.length,
            file_count: files.length,
            checksum: await sha256Text(text),
            created_at: now(),
          });
          toast(
            `Đã tạo gói ${reports.length} báo cáo chốt và ${files.length} tệp.`,
          );
        }
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
                    "Hạng",
                    "Lớp",
                    "Cơ sở",
                    ...d.ctx.days.map((day) => day.label),
                    "Tổng tuần",
                  ],
                  d.rank.map((x) => [
                    x.rank,
                    x.class_name,
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
        function simpleTable(head, rows) {
          return `<div class="table-wrap" style="max-height:none"><table><thead><tr>${head.map((x) => `<th>${esc(x)}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((x, i) => `<td class="${i === 0 ? "wrap" : ""}">${esc(x)}</td>`).join("")}</tr>`).join("") || `<tr><td colspan="${head.length}" class="empty">Không có dữ liệu trong phạm vi đã chọn.</td></tr>`}</tbody></table></div>`;
        }
        function exportReportCSV(type, d) {
          let head = [],
            rows = [];
          if (type === "scores") {
            head = [
              "Hạng",
              "Lớp",
              "Cơ sở",
              ...d.ctx.days.map((day) => `${day.label} (${day.date})`),
              "Tổng tuần",
            ];
            rows = d.rank.map((x) => [
              x.rank,
              x.class_name,
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

        async function renderAssistant() {
          setContent(
            pageHead(
              "Trợ lý tổng hợp",
              "Trả lời theo quy tắc từ dữ liệu đã lưu; không tự sửa hoặc tạo số liệu.",
              `<span class="badge blue">AssistantProvider cục bộ</span>`,
            ) +
              `<div class="assistant-layout"><aside class="card quick-prompts"><div class="card-head"><h2>Câu hỏi nhanh</h2></div><div class="card-body">${["Hôm nay tôi cần làm gì?", "Việc nào đang quá hạn?", "Lớp nào chưa nhập thi đua?", "Tuần này có bất thường gì?", "Tạo nháp báo cáo tuần.", "Tóm tắt tiến độ tháng.", "Hoạt động sắp tới còn thiếu gì?", "Dữ liệu nào chưa được sao lưu?"].map((x) => `<button data-prompt="${esc(x)}">${esc(x)}</button>`).join("")}</div></aside><section class="card assistant-answer"><div class="card-head"><h2>Tra cứu dữ liệu</h2></div><div class="card-body"><div class="split"><input id="assistantQuery" style="flex:1;height:38px;border:1px solid var(--line);border-radius:7px;padding:0 9px" placeholder="Nhập câu hỏi về dữ liệu hệ thống…"><button class="btn primary" id="askAssistant">Tra cứu</button></div><div id="assistantOutput" class="mt"><div class="notice">Chọn một câu hỏi nhanh hoặc nhập câu hỏi. Phản hồi luôn ghi rõ thời điểm và phạm vi.</div></div></div></section></div>`,
          );
          const ask = async (q) => {
            $("#assistantQuery").value = q;
            $("#assistantOutput").innerHTML =
              '<div class="empty">Đang tổng hợp dữ liệu…</div>';
            $("#assistantOutput").innerHTML = await assistant.answer(q);
          };
          $$("[data-prompt]").forEach(
            (b) => (b.onclick = () => ask(b.dataset.prompt)),
          );
          $("#askAssistant").onclick = () => ask($("#assistantQuery").value);
          $("#assistantQuery").onkeydown = (e) => {
            if (e.key === "Enter") $("#askAssistant").click();
          };
        }
        async function buildAssistantAnswer(q) {
          q = (q || "").trim().toLowerCase();
          const d = await reportData(),
            expected = d.ctx.criteria.length * d.ctx.days.length,
            missing = d.classes.filter((cl) => {
              const filled = new Set(
                d.ctx.entries
                  .filter((entry) => entry.class_id === cl.id)
                  .map((entry) => `${entry.entry_date}|${entry.criteria_id}`),
              ).size;
              return filled < expected;
            }),
            stamp = `Dữ liệu lúc ${fmtDateTime(now())}; phạm vi ${d.week?.name || "năm học"}, ${campusName(state.campusId)}.`;
          let title = "Kết quả tra cứu",
            html = "";
          if (!q)
            return '<div class="notice warn">Hãy nhập câu hỏi cụ thể.</div>';
          if (q.includes("hôm nay")) {
            const list = d.tasks.filter(
              (x) =>
                x.status !== "done" &&
                (x.due_date <= today() || x.start_date === today()),
            );
            title = "Việc cần làm hôm nay";
            html = list.length
              ? `<ul>${list.map((x) => `<li>${esc(x.title)} — hạn ${fmtDate(x.due_date)}</li>`).join("")}</ul>`
              : "Không có công việc đến hạn hôm nay.";
          } else if (q.includes("quá hạn")) {
            title = "Công việc quá hạn";
            html = d.overdue.length
              ? `<ul>${d.overdue.map((x) => `<li>${esc(x.title)} — quá hạn từ ${fmtDate(x.due_date)}</li>`).join("")}</ul>`
              : "Không có công việc quá hạn.";
          } else if (q.includes("chưa nhập")) {
            title = "Lớp chưa nhập thi đua";
            html = missing.length
              ? missing
                  .map(
                    (x) =>
                      `<span class="badge yellow" style="margin:3px">${esc(x.class_name)}</span>`,
                  )
                  .join("")
              : "Tất cả lớp đã nhập đủ điểm ngày trong bảng hiện tại.";
          } else if (q.includes("bất thường")) {
            title = "Dấu hiệu cần kiểm tra";
            html = `Có ${missing.length} lớp chưa nhập đủ điểm ngày; ${
              d.ctx.entries.filter((x) => {
                const c = d.ctx.criteria.find((y) => y.id === x.criteria_id);
                return (
                  x.entry_state === "value" &&
                  (x.value < c?.min || x.value > c?.max)
                );
              }).length
            } giá trị vượt giới hạn cấu hình. Cảnh báo không phải kết luận sai phạm.`;
          } else if (q.includes("báo cáo")) {
            title = "Nháp báo cáo tuần";
            html = `Trong phạm vi đã chọn có ${d.tasks.length} công việc, ${d.completed.length} việc hoàn thành và ${d.overdue.length} việc quá hạn. Có ${d.upcoming.length} hoạt động/lịch sắp tới. ${["approved", "locked"].includes(d.ctx.sheet?.status) ? `Bảng thi đua đã được duyệt; lớp dẫn đầu là ${esc(d.rank[0]?.class_name || "chưa xác định")}.` : "Bảng thi đua chưa được duyệt nên không đưa xếp hạng vào báo cáo chính thức."}<br><button class="btn small mt" data-assistant-go="reports">Mở báo cáo để kiểm tra</button>`;
          } else if (q.includes("tiến độ")) {
            const p = d.tasks.length
              ? Math.round((d.completed.length / d.tasks.length) * 100)
              : 0;
            title = "Tiến độ công việc";
            html = `Hoàn thành ${d.completed.length}/${d.tasks.length} công việc (${p}%). Còn ${d.overdue.length} việc quá hạn.`;
          } else if (q.includes("hoạt động")) {
            const bad = d.upcoming.filter(
              (x) => !x.location || !x.leader || !x.safety,
            );
            title = "Mức sẵn sàng của hoạt động sắp tới";
            html = bad.length
              ? `Có ${bad.length} hoạt động thiếu ít nhất một thông tin: địa điểm, người phụ trách hoặc checklist an toàn.<ul>${bad.map((x) => `<li>${esc(x.title)}</li>`).join("")}</ul>`
              : "Không phát hiện hoạt động sắp tới thiếu trường bắt buộc theo quy tắc.";
          } else if (q.includes("sao lưu")) {
            const last = await setting("last_backup_at");
            title = "Tình trạng sao lưu";
            html = last
              ? `Lần sao lưu gần nhất: ${fmtDateTime(last)}.`
              : "Chưa ghi nhận bản sao lưu nào. Nên tạo bản sao ngay.";
          } else
            html =
              "Tôi chưa nhận diện được câu hỏi. Hãy hỏi về công việc hôm nay, việc quá hạn, thi đua, bất thường, hoạt động hoặc sao lưu.";
          setTimeout(
            () =>
              $$("[data-assistant-go]").forEach(
                (b) => (b.onclick = () => go(b.dataset.assistantGo)),
              ),
            0,
          );
          return `<div class="answer-block"><h3>${title}</h3><p>${html}</p><small class="muted">${esc(stamp)}</small><div><button class="link-btn source-link" data-assistant-go="${q.includes("thi đua") || q.includes("bất thường") ? "scores" : q.includes("hoạt động") ? "calendar" : q.includes("sao lưu") ? "backup" : "tasks"}">Mở dữ liệu nguồn</button></div></div>`;
        }

        async function scoreContext() {
          const allSets = (await scoped("criteria_sets")).filter(
              (x) => x.status !== "stopped",
            ),
            sheets = await scoped("weekly_score_sheets"),
            weekSheet = sheets.find(
              (x) =>
                x.week_id === state.weekId &&
                ["locked", "approved"].includes(x.status),
            ),
            set =
              allSets.find((x) => x.id === state.criteriaSetId) ||
              allSets.find((x) => x.id === weekSheet?.criteria_set_id) ||
              allSets.find(
                (x) =>
                  x.status === "active" &&
                  (!x.semester_id ||
                    state.semesterId === "all" ||
                    x.semester_id === state.semesterId),
              ) ||
              allSets[0],
            criteria = set
              ? (await db.all("criteria"))
                  .filter(
                    (x) => x.criteria_set_id === set.id && x.active !== false,
                  )
                  .sort((a, b) => (a.order || 0) - (b.order || 0))
              : [],
            classes = (await scoped("classes"))
              .filter((x) => x.active !== false)
              .sort((a, b) =>
                String(a.class_name).localeCompare(String(b.class_name), "vi", {
                  numeric: true,
                }),
              ),
            week = state.cache.weeks.find((x) => x.id === state.weekId),
            days = scoreWeekdays(week),
            validDates = new Set(days.map((day) => day.date)),
            sheet = sheets.find(
              (x) =>
                x.week_id === state.weekId && x.criteria_set_id === set?.id,
            ),
            entries = (await scoped("score_entries")).filter(
              (x) =>
                x.week_id === state.weekId &&
                (!sheet || x.sheet_id === sheet.id) &&
                validDates.has(x.entry_date),
            );
          state.criteriaSetId = set?.id || "";
          if (!validDates.has(state.scoreDate))
            state.scoreDate = validDates.has(today()) ? today() : days[0]?.date || "";
          const selectedEntries = entries.filter(
            (entry) => entry.entry_date === state.scoreDate,
          );
          return {
            sets: allSets,
            set,
            criteria,
            classes,
            sheet,
            entries,
            days,
            selectedEntries,
          };
        }
        async function showCriteriaConfig(selectedId = "") {
          const sets = (await scoped("criteria_sets")).sort((a, b) =>
              String(b.updated_at).localeCompare(a.updated_at),
            ),
            set =
              sets.find((x) => x.id === selectedId) ||
              sets.find((x) => x.id === state.criteriaSetId) ||
              sets[0],
            criteria = set
              ? (await db.all("criteria"))
                  .filter((x) => x.criteria_set_id === set.id)
                  .sort((a, b) => (a.order || 0) - (b.order || 0))
              : [],
            used = set
              ? (await db.all("weekly_score_sheets")).some(
                  (x) => x.criteria_set_id === set.id,
                )
              : false;
          openModal(
            "Quản lý bộ tiêu chí thi đua",
            `<div class="notice warn">Bộ đã phát sinh điểm được khóa cấu trúc. Hãy nhân bản thành phiên bản mới để thay đổi nội dung quan trọng.</div><div class="toolbar"><select id="criteriaSetChooser" class="grow"><option value="">— Chọn bộ tiêu chí —</option>${sets.map((s) => `<option value="${s.id}" ${s.id === set?.id ? "selected" : ""}>${esc(s.name)} • v${esc(s.version || "1.0")} • ${statusLabel(s.status)}</option>`).join("")}</select><button class="btn small" id="newCriteriaSet">＋ Bộ mới</button><button class="btn small" id="cloneCriteriaSet" ${set ? "" : "disabled"}>Nhân bản phiên bản</button><button class="btn small" id="exportCriteriaSet" ${set ? "" : "disabled"}>Xuất JSON</button></div>${set ? `<form id="criteriaSetForm"><div class="form-grid"><div class="field full"><label class="required">Tên bộ tiêu chí</label><input name="name" value="${esc(set.name || "")}" required ${used ? "readonly" : ""}></div><div class="field"><label>Phiên bản</label><input name="version" value="${esc(set.version || "1.0")}" ${used ? "readonly" : ""}></div><div class="field"><label>Học kỳ</label><select name="semester_id"><option value="">Mọi học kỳ</option>${(state.cache.sems || []).map((s) => `<option value="${s.id}" ${set.semester_id === s.id ? "selected" : ""}>${esc(s.name)}</option>`).join("")}</select></div><div class="field"><label>Cơ sở</label><select name="campus_id"><option value="all">Toàn trường</option>${state.cache.campuses.map((c) => `<option value="${c.id}" ${set.campus_id === c.id ? "selected" : ""}>${esc(c.name)}</option>`).join("")}</select></div><div class="field"><label>Cách tính</label><select name="formula" ${used ? "disabled" : ""}><option value="base" ${set.formula === "base" ? "selected" : ""}>Điểm chuẩn rồi cộng/trừ</option><option value="sum" ${set.formula === "sum" ? "selected" : ""}>Cộng các thành phần</option><option value="weighted" ${set.formula === "weighted" ? "selected" : ""}>Trọng số theo tiêu chí</option></select></div><div class="field"><label>Điểm chuẩn</label><input type="number" step="0.01" name="base_score" value="${Number(set.base_score || 0)}" ${used ? "readonly" : ""}></div><div class="field"><label>Hiệu lực từ</label><input type="date" name="effective_from" value="${esc(set.effective_from || "")}"></div><div class="field"><label>Hiệu lực đến</label><input type="date" name="effective_to" value="${esc(set.effective_to || "")}"></div><div class="field"><label>Trạng thái</label><select name="status"><option value="draft" ${set.status === "draft" ? "selected" : ""}>Dự thảo</option><option value="active" ${set.status === "active" ? "selected" : ""}>Đang áp dụng</option><option value="stopped" ${set.status === "stopped" ? "selected" : ""}>Ngừng áp dụng</option></select></div><div class="field full"><label>Căn cứ nội bộ</label><textarea name="basis">${esc(set.basis || "")}</textarea></div></div></form><div class="split mt"><h3>Tiêu chí/thành phần</h3><button class="btn small primary" id="newCriterion" ${used ? "disabled" : ""}>＋ Tiêu chí</button></div><div class="table-wrap" style="max-height:340px"><table><thead><tr><th>TT</th><th>Mã</th><th>Nhóm</th><th>Tên</th><th>Kiểu</th><th>Cộng/trừ</th><th>Giới hạn</th><th>Trọng số</th><th>Trạng thái</th><th></th></tr></thead><tbody>${criteria.map((c, i) => `<tr><td>${i + 1}</td><td>${esc(c.code)}</td><td>${esc(c.group || "—")}</td><td class="wrap">${esc(c.name)}</td><td>${esc(c.data_type || "score")}</td><td>${Number(c.points || 0) >= 0 ? "Cộng" : "Trừ"}</td><td>${c.min ?? "—"} → ${c.max ?? "—"}</td><td>${Number(c.weight || 1)}</td><td>${c.active !== false ? "Đang dùng" : "Ngừng"}</td><td><button class="link-btn" data-edit-criterion="${c.id}" ${used ? "disabled" : ""}>Sửa</button><button class="link-btn" data-toggle-criterion="${c.id}">${c.active !== false ? "Ngừng" : "Bật"}</button></td></tr>`).join("") || '<tr><td colspan="10" class="empty">Chưa có tiêu chí.</td></tr>'}</tbody></table></div>` : '<div class="empty">Chưa có bộ tiêu chí. Hãy tạo bộ mới.</div>'}`,
            `<button class="btn" id="closeCriteria">Đóng</button>${set ? '<button class="btn primary" id="saveCriteriaSet">Lưu bộ tiêu chí</button>' : ""}`,
            true,
          );
          $("#closeCriteria").onclick = closeModal;
          $("#criteriaSetChooser").onchange = (e) => {
            state.criteriaSetId = e.target.value;
            closeModal();
            showCriteriaConfig(e.target.value);
          };
          $("#newCriteriaSet").onclick = () => criteriaSetForm();
          if ($("#cloneCriteriaSet"))
            $("#cloneCriteriaSet").onclick = () =>
              cloneCriteriaSet(set, criteria);
          if ($("#exportCriteriaSet"))
            $("#exportCriteriaSet").onclick = () =>
              download(
                JSON.stringify(
                  { format: "TPT-CRITERIA-1", set, criteria },
                  null,
                  2,
                ),
                `bo-tieu-chi-${today()}.json`,
                "application/json",
              );
          if ($("#saveCriteriaSet"))
            $("#saveCriteriaSet").onclick = async () => {
              const f = $("#criteriaSetForm");
              if (!f.reportValidity()) return;
              const d = Object.fromEntries(new FormData(f));
              if (
                d.effective_to &&
                d.effective_from &&
                d.effective_to < d.effective_from
              )
                return toast("Ngày hết hiệu lực phải sau ngày bắt đầu.", "bad");
              await db.put("criteria_sets", {
                ...set,
                ...d,
                base_score: Number(d.base_score || 0),
                school_year_id: state.yearId,
                formula: used ? set.formula : d.formula,
                locked_version: used,
              });
              closeModal();
              toast("Đã lưu bộ tiêu chí");
              renderScores();
            };
          if ($("#newCriterion"))
            $("#newCriterion").onclick = () => criterionForm(set);
          $$("[data-edit-criterion]").forEach(
            (b) =>
              (b.onclick = () => criterionForm(set, b.dataset.editCriterion)),
          );
          $$("[data-toggle-criterion]").forEach(
            (b) =>
              (b.onclick = async () => {
                const c = await db.get("criteria", b.dataset.toggleCriterion);
                await db.put("criteria", { ...c, active: c.active === false });
                closeModal();
                showCriteriaConfig(set.id);
              }),
          );
        }
        function criteriaSetForm() {
          openModal(
            "Tạo bộ tiêu chí",
            `<form id="newCriteriaSetForm"><div class="form-grid"><div class="field full"><label class="required">Tên bộ tiêu chí</label><input name="name" required></div><div class="field"><label>Phiên bản</label><input name="version" value="1.0"></div><div class="field"><label>Cách tính</label><select name="formula"><option value="base">Điểm chuẩn rồi cộng/trừ</option><option value="sum">Cộng các thành phần</option><option value="weighted">Trọng số theo tiêu chí</option></select></div><div class="field"><label>Điểm chuẩn</label><input type="number" name="base_score" value="100"></div><div class="field"><label>Trạng thái</label><select name="status"><option value="draft">Dự thảo</option><option value="active">Đang áp dụng</option></select></div><div class="field full"><label>Căn cứ nội bộ</label><textarea name="basis"></textarea></div></div></form>`,
            `<button class="btn" id="cancelNewSet">Hủy</button><button class="btn primary" id="saveNewSet">Tạo bộ</button>`,
          );
          $("#cancelNewSet").onclick = closeModal;
          $("#saveNewSet").onclick = async () => {
            const f = $("#newCriteriaSetForm");
            if (!f.reportValidity()) return;
            const d = Object.fromEntries(new FormData(f)),
              row = await db.put("criteria_sets", {
                ...d,
                base_score: Number(d.base_score || 0),
                school_year_id: state.yearId,
                semester_id:
                  state.semesterId === "all" ? null : state.semesterId,
                campus_id: state.campusId,
                effective_from: today(),
              });
            state.criteriaSetId = row.id;
            closeModal();
            showCriteriaConfig(row.id);
          };
        }
        async function cloneCriteriaSet(set, criteria) {
          const row = await db.put("criteria_sets", {
            ...set,
            id: undefined,
            name: set.name + " – Phiên bản mới",
            version: nextVersion(set.version),
            status: "draft",
            locked_version: false,
            source_set_id: set.id,
          });
          await db.bulkPut(
            "criteria",
            criteria.map((c) => ({
              ...c,
              id: uid(),
              criteria_set_id: row.id,
              active: c.active !== false,
              source_criteria_id: c.id,
            })),
          );
          state.criteriaSetId = row.id;
          closeModal();
          toast("Đã tạo phiên bản mới; dữ liệu tuần cũ không thay đổi");
          showCriteriaConfig(row.id);
        }
        function nextVersion(v) {
          const parts = String(v || "1.0").split("."),
            last = Number(parts.pop()) || 0;
          return [...parts, last + 1].join(".");
        }
        async function criterionForm(set, id = "") {
          const c = id
            ? await db.get("criteria", id)
            : {
                active: true,
                data_type: "score",
                points: 0,
                min: -20,
                max: 20,
                decimals: 1,
                weight: 1,
                color: "#0b6bcb",
                order: 99,
              };
          openModal(
            id ? "Sửa tiêu chí" : "Thêm tiêu chí",
            `<form id="criterionForm"><div class="form-grid"><div class="field"><label class="required">Mã</label><input name="code" value="${esc(c.code || "")}" required></div><div class="field"><label>Nhóm</label><input name="group" value="${esc(c.group || "")}"></div><div class="field full"><label class="required">Tên hiển thị</label><input name="name" value="${esc(c.name || "")}" required></div><div class="field full"><label>Mô tả cách chấm</label><textarea name="description">${esc(c.description || "")}</textarea></div><div class="field"><label>Kiểu dữ liệu</label><select name="data_type">${[
              ["score", "Điểm trực tiếp"],
              ["count", "Số lần"],
              ["boolean", "Đạt/không đạt"],
              ["choice", "Mức lựa chọn"],
              ["note", "Ghi chú"],
            ]
              .map(
                ([v, l]) =>
                  `<option value="${v}" ${c.data_type === v ? "selected" : ""}>${l}</option>`,
              )
              .join(
                "",
              )}</select></div><div class="field"><label>Điểm mỗi lần</label><input type="number" step="0.01" name="points" value="${Number(c.points || 0)}"></div><div class="field"><label>Tối thiểu</label><input type="number" step="0.01" name="min" value="${c.min ?? ""}"></div><div class="field"><label>Tối đa</label><input type="number" step="0.01" name="max" value="${c.max ?? ""}"></div><div class="field"><label>Số chữ số thập phân</label><input type="number" min="0" max="3" name="decimals" value="${Number(c.decimals || 0)}"></div><div class="field"><label>Trọng số</label><input type="number" step="0.01" min="0" name="weight" value="${Number(c.weight || 1)}"></div><div class="field"><label>Thứ tự</label><input type="number" name="order" value="${Number(c.order || 99)}"></div><div class="field"><label>Màu</label><input type="color" name="color" value="${esc(c.color || "#0b6bcb")}"></div><label class="check-row"><input type="checkbox" name="evidence_required" ${c.evidence_required ? "checked" : ""}> Bắt buộc minh chứng</label><label class="check-row"><input type="checkbox" name="active" ${c.active !== false ? "checked" : ""}> Đang sử dụng</label></div></form>`,
            `<button class="btn" id="cancelCriterion">Hủy</button><button class="btn primary" id="saveCriterion">Lưu tiêu chí</button>`,
          );
          $("#cancelCriterion").onclick = closeModal;
          $("#saveCriterion").onclick = async () => {
            const f = $("#criterionForm");
            if (!f.reportValidity()) return;
            const d = Object.fromEntries(new FormData(f)),
              list = (await db.all("criteria")).filter(
                (x) => x.criteria_set_id === set.id,
              );
            if (
              list.some(
                (x) =>
                  x.id !== id && x.code.toLowerCase() === d.code.toLowerCase(),
              )
            )
              return toast("Mã tiêu chí đã tồn tại trong bộ.", "bad");
            d.min = Number(d.min);
            d.max = Number(d.max);
            if (
              !Number.isFinite(d.min) ||
              !Number.isFinite(d.max) ||
              d.min > d.max
            )
              return toast("Giới hạn tối thiểu/tối đa không hợp lệ.", "bad");
            await db.put("criteria", {
              ...c,
              ...d,
              criteria_set_id: set.id,
              school_year_id: state.yearId,
              campus_id: set.campus_id || "all",
              points: Number(d.points || 0),
              decimals: Number(d.decimals || 0),
              weight: Number(d.weight || 1),
              order: Number(d.order || 99),
              evidence_required: !!d.evidence_required,
              active: !!d.active,
            });
            closeModal();
            showCriteriaConfig(set.id);
          };
        }

        async function encryptText(text, password) {
          const enc = new TextEncoder(),
            salt = crypto.getRandomValues(new Uint8Array(16)),
            iv = crypto.getRandomValues(new Uint8Array(12)),
            base = await crypto.subtle.importKey(
              "raw",
              enc.encode(password),
              "PBKDF2",
              false,
              ["deriveKey"],
            ),
            key = await crypto.subtle.deriveKey(
              { name: "PBKDF2", salt, iterations: 210000, hash: "SHA-256" },
              base,
              { name: "AES-GCM", length: 256 },
              false,
              ["encrypt"],
            ),
            data = await crypto.subtle.encrypt(
              { name: "AES-GCM", iv },
              key,
              enc.encode(text),
            );
          return {
            format: "TPT-ENCRYPTED-1",
            kdf: "PBKDF2-SHA256",
            iterations: 210000,
            cipher: "AES-GCM",
            salt: b64(salt),
            iv: b64(iv),
            data: b64(new Uint8Array(data)),
          };
        }
        async function decryptText(obj, password) {
          const enc = new TextEncoder(),
            base = await crypto.subtle.importKey(
              "raw",
              enc.encode(password),
              "PBKDF2",
              false,
              ["deriveKey"],
            ),
            key = await crypto.subtle.deriveKey(
              {
                name: "PBKDF2",
                salt: unb64(obj.salt),
                iterations: obj.iterations,
                hash: "SHA-256",
              },
              base,
              { name: "AES-GCM", length: 256 },
              false,
              ["decrypt"],
            ),
            data = await crypto.subtle.decrypt(
              { name: "AES-GCM", iv: unb64(obj.iv) },
              key,
              unb64(obj.data),
            );
          return new TextDecoder().decode(data);
        }
        const b64 = (u) => {
            let s = "";
            for (let i = 0; i < u.length; i += 32768)
              s += String.fromCharCode(...u.subarray(i, i + 32768));
            return btoa(s);
          },
          unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

        async function campusForm(id) {
          const c = id ? await db.get("campuses", id) : {};
          openModal(
            id ? "Sửa cơ sở" : "Thêm cơ sở",
            `<form id="campusForm"><div class="field"><label class="required">Tên cơ sở</label><input name="name" value="${esc(c.name || "")}" required maxlength="120" placeholder="Ví dụ: Cơ sở 1"></div><div class="field mt"><label class="required">Mã cơ sở</label><input name="code" value="${esc(c.code || "")}" required maxlength="30" pattern="[A-Za-z0-9_-]+" placeholder="Ví dụ: CS1"><span class="hint">Chỉ dùng chữ không dấu, số, dấu gạch ngang hoặc gạch dưới. Mã cơ sở phải duy nhất.</span></div></form>`,
            `<button class="btn" id="cancelCampus">Hủy</button><button class="btn primary" id="saveCampus">Lưu</button>`,
          );
          $("#cancelCampus").onclick = closeModal;
          $("#saveCampus").onclick = async () => {
            const f = $("#campusForm");
            if (!f.reportValidity()) return;
            const values = Object.fromEntries(new FormData(f)),
              name = String(values.name || "").trim(),
              code = String(values.code || "").trim().toUpperCase(),
              campuses = await db.all("campuses");
            if (!name || !code) return;
            if (
              campuses.some(
                (row) =>
                  row.id !== c.id &&
                  normalizeText(row.name) === normalizeText(name),
              )
            )
              return toast("Tên cơ sở đã tồn tại.", "bad");
            if (
              campuses.some(
                (row) =>
                  row.id !== c.id &&
                  String(row.code || "").toUpperCase() === code,
              )
            )
              return toast("Mã cơ sở đã tồn tại.", "bad");
            const button = $("#saveCampus");
            button.disabled = true;
            try {
              await db.put("campuses", {
                ...c,
                id: c.id || uid(),
                name,
                code,
              });
              closeModal();
              await loadContext();
              toast(id ? "Đã cập nhật cơ sở" : "Đã thêm cơ sở");
              await renderSettingsPanel("context");
            } catch (error) {
              button.disabled = false;
              toast("Không thể lưu cơ sở: " + error.message, "bad");
            }
          };
        }
        async function deleteCampus(id) {
          const campuses = await db.all("campuses"),
            campus = campuses.find((row) => row.id === id);
          if (!campus) return toast("Không tìm thấy cơ sở.", "bad");
          if (campuses.length <= 1)
            return toast("Phải giữ lại ít nhất một cơ sở.", "bad");
          const referenceStores = [
              ["classes", "lớp"],
              ["plans", "kế hoạch"],
              ["tasks", "công việc"],
              ["calendar_events", "lịch hoạt động"],
              ["activities", "hoạt động Đội"],
              ["criteria_sets", "bộ tiêu chí"],
              ["weekly_score_sheets", "bảng thi đua"],
              ["score_entries", "dòng điểm"],
              ["ranking_snapshots", "bảng xếp hạng"],
              ["team_units", "đơn vị Đội"],
              ["training_records", "bản ghi rèn luyện"],
              ["programs", "phong trào"],
              ["commendations", "khen thưởng"],
              ["documents", "hồ sơ"],
              ["equipment", "thiết bị"],
              ["generated_reports", "báo cáo"],
            ],
            usage = [];
          for (const [store, label] of referenceStores) {
            const count = (await db.allIncludingDeleted(store)).filter(
              (row) => !row.deleted_at && row.campus_id === id,
            ).length;
            if (count) usage.push(`${count} ${label}`);
          }
          if (usage.length) {
            openModal(
              "Chưa thể xóa cơ sở",
              `<div class="notice warn"><strong>${esc(campus.name)}</strong> đang được dùng bởi ${esc(usage.join(", "))}. Để bảo toàn dữ liệu lịch sử, hãy sửa tên hoặc mã cơ sở; chỉ xóa được cơ sở chưa phát sinh dữ liệu.</div>`,
              `<button class="btn" id="closeCampusUsage">Đóng</button><button class="btn primary" id="editUsedCampus">Sửa cơ sở</button>`,
            );
            $("#closeCampusUsage").onclick = closeModal;
            $("#editUsedCampus").onclick = () => campusForm(id);
            return;
          }
          openModal(
            "Xóa cơ sở chưa sử dụng",
            `<p>Xóa <strong>${esc(campus.name)}</strong> (${esc(campus.code || "không có mã")})?</p><div class="notice warn">Thao tác được lưu vào nhật ký. Cơ sở đã có dữ liệu liên quan sẽ không được phép xóa.</div>`,
            `<button class="btn" id="cancelDeleteCampus">Hủy</button><button class="btn danger" id="confirmDeleteCampus">Xóa cơ sở</button>`,
          );
          $("#cancelDeleteCampus").onclick = closeModal;
          $("#confirmDeleteCampus").onclick = async () => {
            const button = $("#confirmDeleteCampus");
            button.disabled = true;
            try {
              await db.remove("campuses", id);
              if (state.campusId === id) state.campusId = "all";
              closeModal();
              await loadContext();
              toast("Đã xóa cơ sở chưa sử dụng");
              await renderSettingsPanel("context");
            } catch (error) {
              button.disabled = false;
              toast("Không thể xóa cơ sở: " + error.message, "bad");
            }
          };
        }
        function yearForm() {
          openModal(
            "Thêm năm học",
            `<form id="yearForm"><div class="form-grid"><div class="field full"><label class="required">Tên năm học</label><input name="name" placeholder="2027–2028" required></div><div class="field"><label class="required">Ngày bắt đầu</label><input type="date" name="start_date" required></div><div class="field"><label class="required">Ngày kết thúc</label><input type="date" name="end_date" required></div><label class="check-row full"><input type="checkbox" name="is_current" value="true"> Đặt làm năm học hiện hành</label></div></form>`,
            `<button class="btn" id="cancelYear">Hủy</button><button class="btn primary" id="saveYear">Tạo năm học và 40 tuần</button>`,
          );
          $("#cancelYear").onclick = closeModal;
          $("#saveYear").onclick = async () => {
            const f = $("#yearForm");
            if (!f.reportValidity()) return;
            const d = Object.fromEntries(new FormData(f));
            if (d.end_date <= d.start_date)
              return toast("Ngày kết thúc phải sau ngày bắt đầu.", "bad");
            const id = uid();
            if (d.is_current) {
              for (const y of await db.all("school_years"))
                await db.put("school_years", { ...y, is_current: false });
            }
            await db.put("school_years", {
              id,
              ...d,
              is_current: !!d.is_current,
            });
            const weeks = [];
            let date = new Date(d.start_date + "T00:00:00");
            for (let i = 1; i <= 40; i++) {
              let end = new Date(date);
              end.setDate(end.getDate() + 6);
              weeks.push({
                id: uid(),
                school_year_id: id,
                number: i,
                name: `Tuần ${i}`,
                start_date: localISO(date),
                end_date: localISO(end),
              });
              date.setDate(date.getDate() + 7);
            }
            await db.bulkPut("school_weeks", weeks);
            closeModal();
            await loadContext();
            toast("Đã tạo năm học");
            renderSettings();
          };
        }
        async function classForm(id) {
          const c = id
            ? await db.get("classes", id)
            : { active: true, campus_id: state.cache.campuses[0]?.id };
          openModal(
            id ? "Sửa lớp" : "Thêm lớp",
            `<form id="classForm"><div class="form-grid"><div class="field"><label class="required">Tên lớp/chi đội</label><input name="class_name" value="${esc(c.class_name || "")}" required></div><div class="field"><label class="required">Khối</label><select name="grade">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((g) => `<option value="${g}" ${Number(c.grade) === g ? "selected" : ""}>Khối ${g}</option>`).join("")}</select></div><div class="field"><label class="required">Cơ sở</label><select name="campus_id">${state.cache.campuses.map((x) => `<option value="${x.id}" ${c.campus_id === x.id ? "selected" : ""}>${esc(x.name)}</option>`).join("")}</select></div><div class="field"><label>Giáo viên chủ nhiệm</label><input name="teacher" value="${esc(c.teacher || "")}"></div><label class="check-row"><input type="checkbox" name="active" value="true" ${c.active !== false ? "checked" : ""}> Đang hoạt động</label></div></form>`,
            `<button class="btn" id="cancelClass">Hủy</button><button class="btn primary" id="saveClass">Lưu lớp</button>`,
          );
          $("#cancelClass").onclick = closeModal;
          $("#saveClass").onclick = async () => {
            const f = $("#classForm");
            if (!f.reportValidity()) return;
            const d = Object.fromEntries(new FormData(f)),
              dupe = (await db.all("classes")).some(
                (x) =>
                  x.id !== id &&
                  x.school_year_id === state.yearId &&
                  x.class_name.toLowerCase() === d.class_name.toLowerCase(),
              );
            if (dupe) return toast("Tên lớp đã tồn tại trong năm học.", "bad");
            await db.put("classes", {
              ...c,
              ...d,
              grade: Number(d.grade),
              active: !!d.active,
              school_year_id: state.yearId,
            });
            closeModal();
            toast("Đã lưu lớp");
            renderSettings();
          };
        }
        function showClassImport() {
          openModal(
            "Nhập danh sách lớp",
            `<div class="notice">Dán dữ liệu từ Excel theo 5 cột: mã lớp, tên lớp, khối, mã cơ sở, giáo viên chủ nhiệm. Dòng tiêu đề có thể có hoặc không.</div><div class="field"><label>Dữ liệu CSV hoặc bảng dán</label><textarea id="classImportText" style="min-height:220px" placeholder="6A1\t6/1\t6\tCS1\tNguyễn Văn A"></textarea></div><div id="importPreview" class="mt"></div>`,
            `<button class="btn" id="cancelImport">Hủy</button><button class="btn" id="previewImport">Xem trước</button><button class="btn primary" id="commitImport" disabled>Nhập dữ liệu</button>`,
            true,
          );
          $("#cancelImport").onclick = closeModal;
          let parsed = [];
          $("#previewImport").onclick = () => {
            const text = $("#classImportText").value.trim();
            if (!text) return toast("Hãy dán dữ liệu.", "bad");
            const delim = text.includes("\t") ? "\t" : ",",
              rows = text
                .split(/\r?\n/)
                .map((line) => parseDelimited(line, delim))
                .filter((r) => r.length >= 4);
            if (rows[0] && /mã|ma_lop/i.test(rows[0][0])) rows.shift();
            parsed = rows.map((r, i) => ({
              row: i + 1,
              code: r[0]?.trim(),
              class_name: r[1]?.trim(),
              grade: Number(r[2]),
              campus_code: r[3]?.trim(),
              teacher: r[4]?.trim() || "",
            }));
            const errors = parsed.filter(
              (x) =>
                !x.class_name ||
                ![1, 2, 3, 4, 5, 6, 7, 8, 9].includes(x.grade) ||
                !state.cache.campuses.some((c) => c.code === x.campus_code),
            );
            $("#importPreview").innerHTML =
              `<div class="notice ${errors.length ? "danger" : ""}">${parsed.length} dòng; ${errors.length} dòng lỗi.</div>${simpleTable(
                ["Dòng", "Lớp", "Khối", "Cơ sở", "Kết quả"],
                parsed
                  .slice(0, 20)
                  .map((x) => [
                    x.row,
                    x.class_name,
                    x.grade,
                    x.campus_code,
                    !x.class_name ||
                    ![1, 2, 3, 4, 5, 6, 7, 8, 9].includes(x.grade) ||
                    !state.cache.campuses.some((c) => c.code === x.campus_code)
                      ? "Lỗi"
                      : "Hợp lệ",
                  ]),
              )}`;
            $("#commitImport").disabled = !!errors.length || !parsed.length;
          };
          $("#commitImport").onclick = async () => {
            const existing = await db.all("classes"),
              fresh = parsed
                .filter(
                  (x) =>
                    !existing.some(
                      (e) =>
                        e.school_year_id === state.yearId &&
                        e.class_name.toLowerCase() ===
                          x.class_name.toLowerCase(),
                    ),
                )
                .map((x) => ({
                  id: uid(),
                  school_year_id: state.yearId,
                  campus_id: state.cache.campuses.find(
                    (c) => c.code === x.campus_code,
                  ).id,
                  code: x.code,
                  class_name: x.class_name,
                  grade: x.grade,
                  teacher: x.teacher,
                  active: true,
                }));
            await createInternalSnapshot("Trước nhập hàng loạt danh sách lớp", {
              tier: "protected",
              protectedSnapshot: true,
              reason: "before-class-import",
              yearId: state.yearId,
            });
            await db.bulkPut("classes", fresh);
            await db.put("audit_logs", {
              action: "bulk_import",
              entity: "classes",
              summary: `Nhập ${fresh.length} lớp`,
              reason: "Nhập CSV/Excel",
            });
            closeModal();
            toast(
              `Đã nhập ${fresh.length} lớp; bỏ qua ${parsed.length - fresh.length} lớp trùng.`,
            );
            renderSettings();
          };
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
        async function deleteSampleData() {
          openModal(
            "Xóa dữ liệu mẫu",
            `<div class="notice danger">Chỉ các bản ghi mang nhãn dữ liệu mẫu bị xóa. Dữ liệu thầy đã tạo được giữ nguyên.</div>`,
            `<button class="btn" id="cancelSample">Hủy</button><button class="btn danger" id="confirmSample">Xóa dữ liệu mẫu</button>`,
          );
          $("#cancelSample").onclick = closeModal;
          $("#confirmSample").onclick = async () => {
            await createInternalSnapshot("Trước xóa dữ liệu mẫu", {
              tier: "protected",
              protectedSnapshot: true,
              reason: "before-delete-sample",
            });
            let n = 0;
            for (const s of STORES) {
              if (s === "schools") continue;
              for (const r of await db.all(s))
                if (r.is_sample) {
                  await db.remove(s, r.id);
                  n++;
                }
            }
            await setting("sample_deleted", true);
            closeModal();
            toast(`Đã xóa ${n} bản ghi mẫu`);
            await loadContext();
            renderSettings();
          };
        }
        function wipeLocalData() {
          openModal(
            "Xóa toàn bộ dữ liệu trên máy chủ",
            `<div class="notice danger"><strong>Không thể hoàn tác nếu chưa sao lưu.</strong></div><div class="field"><label>Nhập chính xác: XÓA TOÀN BỘ</label><input id="wipeConfirm" autocomplete="off"></div>`,
            `<button class="btn" id="cancelWipe">Hủy</button><button class="btn danger" id="confirmWipe">Xóa vĩnh viễn trên máy chủ</button>`,
          );
          $("#cancelWipe").onclick = closeModal;
          $("#confirmWipe").onclick = async () => {
            if ($("#wipeConfirm").value !== "XÓA TOÀN BỘ")
              return toast("Câu xác nhận chưa chính xác.", "bad");
            await createInternalSnapshot("Trước xóa toàn bộ dữ liệu", {
              tier: "protected",
              protectedSnapshot: true,
              reason: "before-wipe",
            });
            const safetyBackup = await exportBusinessData(true),
              safetyText = JSON.stringify(safetyBackup);
            download(
              safetyText,
              `sao-luu-day-du-truoc-khi-xoa-${today()}.tptbackup`,
              "application/json",
            );
            for (const s of STORES)
              if (s !== "schools") await db.hardClear(s);
            closeModal();
            location.reload();
          };
        }

        async function legacyGlobalSearch() {
          const q = $("#globalSearch").value.trim().toLowerCase();
          if (q.length < 2) return;
          const groups = [];
          for (const [store, label, page, field] of [
            ["tasks", "Công việc", "tasks", "title"],
            ["classes", "Lớp", "settings", "class_name"],
            ["activities", "Hoạt động", "activities", "name"],
            ["plans", "Kế hoạch", "plans", "name"],
            ["documents", "Hồ sơ", "documents", "name"],
          ]) {
            const rows = (await scoped(store))
              .filter((x) => JSON.stringify(x).toLowerCase().includes(q))
              .slice(0, 5);
            groups.push(
              ...rows.map((r) => ({
                label,
                page,
                text: r[field],
                sub:
                  store === "classes"
                    ? campusName(r.campus_id)
                    : r.group || r.type || "",
              })),
            );
          }
          openModal(
            "Kết quả tìm kiếm",
            groups.length
              ? `<ul class="compact-list">${groups.map((x) => `<li><div class="main"><strong>${esc(x.text)}</strong><small>${esc(x.label)} • ${esc(x.sub)}</small></div><button class="link-btn" data-search-go="${x.page}">Mở</button></li>`).join("")}</ul>`
              : '<div class="empty">Không tìm thấy dữ liệu phù hợp.</div>',
            `<button class="btn" id="closeSearch">Đóng</button>`,
          );
          $("#closeSearch").onclick = closeModal;
          $$("[data-search-go]").forEach(
            (b) =>
              (b.onclick = () => {
                closeModal();
                go(b.dataset.searchGo);
              }),
          );
        }
        async function globalSearch() {
          const q = normalizeText($("#globalSearch").value.trim());
          let box = $("#globalSuggestions");
          if (q.length < 2) {
            box?.remove();
            return;
          }
          const groups = [];
          for (const [store, label, page, field] of [
            ["tasks", "Công việc", "tasks", "title"],
            ["classes", "Lớp", "settings", "class_name"],
            ["activities", "Hoạt động", "activities", "name"],
            ["plans", "Kế hoạch", "plans", "name"],
            ["documents", "Hồ sơ", "documents", "name"],
          ]) {
            const rows = (await scoped(store))
              .filter((x) => normalizeText(JSON.stringify(x)).includes(q))
              .slice(0, 5);
            groups.push(
              ...rows.map((r) => ({
                label,
                page,
                text: r[field],
                sub:
                  store === "classes"
                    ? campusName(r.campus_id)
                    : r.group || r.type || "",
              })),
            );
          }
          box ||= document.createElement("div");
          box.id = "globalSuggestions";
          box.className = "search-suggest";
          $(".searchbox").append(box);
          box.innerHTML = groups.length
            ? groups
                .map(
                  (x, i) =>
                    `<button type="button" class="${i === 0 ? "active" : ""}" data-search-go="${x.page}"><strong>${esc(x.text)}</strong><br><small>${esc(x.label)} • ${esc(x.sub)}</small></button>`,
                )
                .join("")
            : '<div class="empty">Không tìm thấy dữ liệu phù hợp.</div>';
          $$("[data-search-go]").forEach(
            (b) =>
              (b.onclick = () => {
                box.remove();
                $("#globalSearch").value = "";
                go(b.dataset.searchGo);
              }),
          );
        }
        function showQuickAdd() {
          openModal(
            "Thêm nhanh",
            `<div class="grid-3"><button class="btn" data-quick="task">✓ Công việc</button><button class="btn" data-quick="event">▦ Lịch hoạt động</button><button class="btn" data-quick="activity">⚑ Hoạt động Đội</button><button class="btn" data-quick="incident">＋ Ghi nhận</button><button class="btn" data-quick="plan">▤ Kế hoạch</button><button class="btn" data-quick="class">♙ Lớp học</button></div><div class="notice mt">Phím tắt: Ctrl + Enter để mở thêm nhanh; Ctrl + K để tìm kiếm.</div>`,
            `<button class="btn" id="closeQuick">Đóng</button>`,
          );
          $("#closeQuick").onclick = closeModal;
          $$("[data-quick]").forEach(
            (b) =>
              (b.onclick = () => {
                const x = b.dataset.quick;
                closeModal();
                if (x === "task") taskForm();
                if (x === "event") eventForm();
                if (x === "activity") entityForm("activities");
                if (x === "incident") openQuickIncident();
                if (x === "plan") entityForm("plans");
                if (x === "class") classForm();
              }),
          );
        }
        function download(content, name, type) {
          const blob =
            content instanceof Blob ? content : new Blob([content], { type });
          platform.download(blob, name);
        }

        async function showOnboarding() {
          let step = 0;
          const data = {
            school: "",
            code: "",
            address: "",
            campuses: ["Cơ sở 1", "Cơ sở 2"],
            year: "2026–2027",
            start: "2026-08-15",
            end: "2027-05-31",
            mode: "local",
          };
          const render = () => {
            const titles = [
              "Thông tin trường",
              "Các cơ sở",
              "Năm học",
              "Danh sách lớp",
              "Giáo viên chủ nhiệm",
              "Bộ tiêu chí",
              "Công việc định kỳ",
              "Chế độ dữ liệu",
              "Sẵn sàng sử dụng",
            ];
            let body = "";
            if (step === 0)
              body = `<div class="form-grid"><div class="field full"><label class="required">Tên trường</label><input id="wSchool" value="${esc(data.school)}" placeholder="TRƯỜNG TH-THCS"></div><div class="field"><label>Mã trường</label><input id="wCode" value="${esc(data.code)}"></div><div class="field"><label>Địa chỉ khái quát</label><input id="wAddress" value="${esc(data.address)}"></div></div>`;
            if (step === 1)
              body = `<div class="field"><label>Tên cơ sở, mỗi dòng một cơ sở</label><textarea id="wCampuses">${esc(data.campuses.join("\n"))}</textarea></div>`;
            if (step === 2)
              body = `<div class="form-grid"><div class="field full"><label>Năm học</label><input id="wYear" value="${esc(data.year)}"></div><div class="field"><label>Bắt đầu</label><input type="date" id="wStart" value="${data.start}"></div><div class="field"><label>Kết thúc</label><input type="date" id="wEnd" value="${data.end}"></div></div>`;
            if (step === 3)
              body = `<p>Thầy có thể nhập danh sách lớp ngay sau khi hoàn tất tại <strong>Thiết lập → Danh sách lớp</strong>.</p><div class="notice">Hệ thống hỗ trợ CSV và dán trực tiếp từ Excel, có xem trước và kiểm tra dòng lỗi.</div>`;
            if (step === 4)
              body = `<p>Thông tin tối thiểu gồm họ tên giáo viên và lớp phụ trách; số điện thoại/email là tùy chọn. Có thể cập nhật cùng danh sách lớp.</p>`;
            if (step === 5)
              body = `<div class="notice warn">Bộ tiêu chí mẫu chỉ mang tính tham khảo, cần nhà trường phê duyệt trước khi sử dụng.</div><label class="check-row"><input id="wUseCriteria" type="checkbox" checked> Giữ bộ tiêu chí mẫu để chỉnh sửa</label>`;
            if (step === 6)
              body = `<p>Thư viện đã có mẫu công việc tuần, tháng và năm học. Sau khi hoàn tất, vào <strong>Công việc và checklist → Thư viện mẫu</strong> để chọn.</p>`;
            if (step === 7)
              body = `<div class="notice"><strong>Lưu trữ máy chủ:</strong> mọi thao tác nghiệp vụ được gửi tới API của ứng dụng.</div><p class="muted">Có thể tạo tệp sao lưu, điểm khôi phục nội bộ và chọn thư mục sao lưu sau khi hoàn tất.</p>`;
            if (step === 8)
              body = `<div class="notice"><strong>Checklist sẵn sàng</strong><ul><li>${data.school ? "✓" : "○"} Tên trường</li><li>✓ ${data.campuses.length} cơ sở</li><li>✓ Năm học và 40 tuần</li><li>○ Danh sách lớp thật — có thể nhập sau</li><li>○ Bản sao lưu đầu tiên — tạo sau khi hoàn tất cấu hình</li></ul></div>`;
            openModal(
              `${step + 1}/9 • ${titles[step]}`,
              `<div class="wizard-steps">${Array.from({ length: 9 }, (_, i) => `<span class="${i < step ? "done" : i === step ? "active" : ""}"></span>`).join("")}</div>${body}`,
              `<button class="btn" id="wizardBack" ${step === 0 ? "disabled" : ""}>Quay lại</button><button class="btn" id="wizardSkip">${step === 8 ? "Để sau" : "Bỏ qua"}</button><button class="btn primary" id="wizardNext">${step === 8 ? "Hoàn tất" : "Tiếp tục"}</button>`,
              true,
            );
            $("#modalClose").style.display = "none";
            $("#wizardBack").onclick = () => {
              capture();
              step--;
              render();
            };
            $("#wizardSkip").onclick = () => {
              if (step === 8) finish();
              else {
                capture();
                step++;
                render();
              }
            };
            $("#wizardNext").onclick = () => {
              if (step === 0 && !$("#wSchool").value.trim())
                return toast("Hãy nhập tên trường hoặc chọn Bỏ qua.", "bad");
              capture();
              if (step < 8) {
                step++;
                render();
              } else finish();
            };
            function capture() {
              if (step === 0) {
                data.school = $("#wSchool")?.value.trim() || data.school;
                data.code = $("#wCode")?.value.trim() || "";
                data.address = $("#wAddress")?.value.trim() || "";
              }
              if (step === 1)
                data.campuses =
                  $("#wCampuses")
                    ?.value.split("\n")
                    .map((x) => x.trim())
                    .filter(Boolean) || data.campuses;
              if (step === 2) {
                data.year = $("#wYear")?.value.trim() || data.year;
                data.start = $("#wStart")?.value || data.start;
                data.end = $("#wEnd")?.value || data.end;
              }
            }
            async function finish() {
              const school = (await db.all("schools"))[0];
              if (data.school)
                await db.put("schools", {
                  ...school,
                  name: data.school,
                  code: data.code,
                  address: data.address,
                  is_sample: false,
                });
              const oldCampuses = await db.all("campuses");
              for (let i = 0; i < data.campuses.length; i++) {
                if (oldCampuses[i])
                  await db.put("campuses", {
                    ...oldCampuses[i],
                    name: data.campuses[i],
                    is_sample: false,
                  });
                else
                  await db.put("campuses", {
                    name: data.campuses[i],
                    code: `CS${i + 1}`,
                  });
              }
              await setting("onboarded", true);
              $("#modalClose").style.display = "grid";
              closeModal();
              await loadContext();
              toast("Đã hoàn tất thiết lập ban đầu");
              await go("dashboard");
            }
          };
          render();
        }

        async function renderBackup() {
          const quick = await exportBusinessData(false),
            last = await setting("last_backup_at"),
            attachmentCount = (
              await db.allIncludingDeleted("attachments")
            ).filter((x) => !x.deleted_at).length,
            snapshots = (await db.all("internal_snapshots")).sort((a, b) =>
              String(b.created_at).localeCompare(String(a.created_at)),
            ),
            backupRecords = (await db.all("backup_records")).sort((a, b) =>
              String(b.completed_at || b.created_at).localeCompare(
                String(a.completed_at || a.created_at),
              ),
            ),
            [directoryRecord] = await db.all("backup_handles"),
            directoryAuto = !!(await setting("backup_directory_auto")),
            directorySupported = platform.capabilities().filesystem_directory;
          setContent(
            pageHead(
              "Sao lưu – khôi phục",
              "Xuất, kiểm tra và khôi phục dữ liệu lưu trên máy chủ.",
              `<button class="btn primary" id="backupNow">Tạo bản sao lưu</button>`,
            ) +
              `<div class="grid-3"><div class="card"><div class="card-head"><h2>Sao lưu gần nhất</h2></div><div class="card-body"><strong>${last ? fmtDateTime(last) : "Chưa có"}</strong><p>${quick.manifest.record_count.toLocaleString("vi-VN")} bản ghi • ${attachmentCount} tệp</p><button class="btn small" id="verifyLastBackup" ${backupRecords.length ? "" : "disabled"}>Kiểm tra bản đã ghi nhận</button></div></div><div class="card"><div class="card-head"><h2>Phục hồi an toàn</h2></div><div class="card-body"><p>Kiểm tra định dạng, định danh, phiên bản và checksum trước khi ghi.</p><button class="btn" id="restoreFile">Chọn tệp phục hồi</button></div></div><div class="card"><div class="card-head"><h2>Lưu trữ chính</h2></div><div class="card-body"><span class="badge blue">SQLite qua API máy chủ</span><p>Dữ liệu nghiệp vụ được lưu tập trung trên máy chủ.</p><small class="muted">Tệp xuất và thư mục sao lưu là các bản sao độc lập để phục hồi khi cần.</small></div></div></div><div class="notice warn mt"><strong>Phân biệt:</strong> tự lưu ghi lên máy chủ; điểm khôi phục bảo vệ trạng thái dữ liệu; bản sao lưu ngoài là tệp hoặc thư mục cục bộ; báo cáo chốt là hồ sơ nghiệp vụ bất biến.</div><div class="card mt"><div class="card-head"><h2>Ba phạm vi sao lưu ngoài</h2></div><div class="card-body">${simpleTable(
                ["Chế độ", "Nội dung", "Phù hợp"],
                [
                  [
                    "Nhanh",
                    "Cấu hình, metadata và dữ liệu nghiệp vụ; không gồm Blob",
                    "Sao lưu thường xuyên",
                  ],
                  [
                    "Đầy đủ",
                    "Toàn bộ dữ liệu, tệp, manifest và SHA-256",
                    "Đổi máy, lưu trữ định kỳ",
                  ],
                  [
                    "Gói năm học",
                    "Dữ liệu năm đang chọn, cấu hình dùng chung, báo cáo chốt và tệp liên quan",
                    "Đóng năm/bàn giao",
                  ],
                ],
              )}</div></div><div class="card mt"><div class="card-head"><h2>Thư mục sao lưu ngoài</h2><span class="meta">${directorySupported ? "Trình duyệt hỗ trợ" : "Không hỗ trợ"}</span></div><div class="card-body"><p>${directoryRecord ? `Đã chọn: <strong>${esc(directoryRecord.name || directoryRecord.handle?.name || "Thư mục cục bộ")}</strong>` : "Chưa chọn thư mục. Mặc định ứng dụng chỉ yêu cầu trình duyệt tải tệp xuống."}</p><div class="toolbar"><button class="btn" id="chooseBackupDirectory" ${directorySupported ? "" : "disabled"}>Chọn/cấp lại thư mục</button><label class="check-row"><input id="directoryAutoBackup" type="checkbox" ${directoryAuto ? "checked" : ""} ${directoryRecord ? "" : "disabled"}> Tạo sao lưu nhanh mỗi ngày khi ứng dụng đang mở và quyền thư mục còn hiệu lực</label></div><div class="notice warn">Web/PWA không chạy lịch nền tin cậy khi đã đóng và không bảo đảm thao tác đổi tên tệp nguyên tử trên mọi trình duyệt. Tự động ở đây chỉ chạy lúc mở ứng dụng.</div></div></div><div class="card mt"><div class="card-head"><h2>Điểm khôi phục nội bộ</h2><span class="meta">${snapshots.length} điểm</span></div><div class="card-body"><div class="toolbar"><button class="btn small primary" id="createSnapshot">Tạo điểm ngay</button><span class="muted">Mặc định giữ 7 ngày • 4 tuần • 12 tháng; điểm bảo vệ không tự xóa.</span></div><div class="table-wrap" style="max-height:320px"><table><thead><tr><th>Thời gian</th><th>Tên</th><th>Loại</th><th>Bản ghi</th><th>Checksum</th><th>Thao tác</th></tr></thead><tbody>${snapshots.map((s) => `<tr><td>${fmtDateTime(s.created_at)}</td><td>${esc(s.name)}</td><td>${esc(s.tier)}${s.protected ? " • bảo vệ" : ""}</td><td>${Number(s.record_count || 0).toLocaleString("vi-VN")}</td><td><code>${esc(String(s.checksum || "").slice(0, 12))}…</code></td><td><button class="link-btn" data-view-snapshot="${s.id}">Xem</button><button class="link-btn" data-restore-snapshot="${s.id}">Khôi phục</button></td></tr>`).join("") || '<tr><td colspan="6" class="empty">Chưa có điểm khôi phục.</td></tr>'}</tbody></table></div></div></div>`,
          );
          $("#backupNow").onclick = chooseBackup;
          $("#restoreFile").onclick = () => {
            $("#backupFileInput").accept =
              ".json,.tdt,.tptbackup,application/json";
            $("#backupFileInput").onchange = restoreSelected;
            $("#backupFileInput").click();
          };
          $("#verifyLastBackup").onclick = () => {
            const record = backupRecords[0];
            openModal(
              "Bản sao lưu đã ghi nhận",
              `<div class="notice"><strong>${esc(record.name)}</strong></div><div class="split"><span>Hoàn tất</span><strong>${fmtDateTime(record.completed_at)}</strong></div><div class="split mt"><span>Phạm vi</span><strong>${esc(record.scope)}</strong></div><div class="split mt"><span>Dung lượng</span><strong>${formatBytes(record.size)}</strong></div><div class="split mt"><span>Checksum</span><code>${esc(record.checksum)}</code></div><div class="notice warn mt">Đây là kiểm tra nhật ký và checksum lúc tạo. Trình duyệt không thể tự đọc lại tệp đã tải xuống nếu thầy chưa chọn lại tệp.</div>`,
              `<button class="btn primary" id="closeBackupRecord">Đóng</button>`,
            );
            $("#closeBackupRecord").onclick = closeModal;
          };
          $("#createSnapshot").onclick = async () => {
            await createInternalSnapshot(`Thủ công ${fmtDateTime(now())}`);
            toast("Đã tạo điểm khôi phục nội bộ");
            renderBackup();
          };
          $("#chooseBackupDirectory").onclick = async () => {
            try {
              const handle = await platform.chooseDirectory();
              if (!(await platform.permission(handle, true)))
                throw new Error("Thư mục chưa được cấp quyền ghi.");
              await db.put(
                "backup_handles",
                {
                  id: "primary-directory",
                  name: handle.name,
                  handle,
                  permission_checked_at: now(),
                },
                { audit: false },
              );
              toast("Đã lưu quyền thư mục trong hồ sơ trình duyệt hiện tại.");
              renderBackup();
            } catch (error) {
              if (error.name !== "AbortError")
                toast("Không thể chọn thư mục: " + error.message, "bad");
            }
          };
          $("#directoryAutoBackup").onchange = async () => {
            await setting(
              "backup_directory_auto",
              $("#directoryAutoBackup").checked,
            );
            toast(
              $("#directoryAutoBackup").checked
                ? "Đã bật kiểm tra sao lưu khi mở ứng dụng."
                : "Đã tắt sao lưu thư mục khi mở ứng dụng.",
            );
          };
          $$("[data-view-snapshot]").forEach((button) => {
            button.onclick = async () => {
              const snapshot = await db.get(
                "internal_snapshots",
                button.dataset.viewSnapshot,
              );
              openModal(
                "Chi tiết điểm khôi phục",
                `<div class="notice">Điểm này không chứa Blob tệp để tránh nhân đôi dung lượng.</div>${simpleTable(
                  ["Phân hệ", "Bản ghi"],
                  Object.entries(snapshot.counts || {})
                    .filter(([, count]) => count)
                    .map(([store, count]) => [store, count]),
                )}<p><strong>SHA-256:</strong> <code>${esc(snapshot.checksum)}</code></p>`,
                `<button class="btn primary" id="closeSnapshotPreview">Đóng</button>`,
                true,
              );
              $("#closeSnapshotPreview").onclick = closeModal;
            };
          });
          $$("[data-restore-snapshot]").forEach((button) => {
            button.onclick = () =>
              restoreInternalSnapshot(button.dataset.restoreSnapshot);
          });
        }

        async function restoreInternalSnapshot(id) {
          const snapshot = await db.get("internal_snapshots", id);
          if (!snapshot) return toast("Không tìm thấy điểm khôi phục.", "bad");
          const checksum = await sha256Text(stableJSON(snapshot.payload));
          if (checksum !== snapshot.checksum)
            return toast(
              "Điểm khôi phục hỏng checksum; không phục hồi.",
              "bad",
            );
          openModal(
            "Khôi phục điểm nội bộ",
            `<div class="notice warn">Sẽ thay dữ liệu cấu trúc trong điểm <strong>${esc(snapshot.name)}</strong>. Tệp Blob hiện tại được giữ vì snapshot không nhân đôi tệp.</div><p>${Number(snapshot.record_count || 0).toLocaleString("vi-VN")} bản ghi • ${fmtDateTime(snapshot.created_at)}</p>`,
            `<button class="btn" id="cancelInternalRestore">Hủy</button><button class="btn danger" id="confirmInternalRestore">Khôi phục</button>`,
          );
          $("#cancelInternalRestore").onclick = closeModal;
          $("#confirmInternalRestore").onclick = async () => {
            const currentAttachments =
                await db.allIncludingDeleted("attachments"),
              payload = {
                schema: snapshot.schema,
                data: { ...snapshot.payload, attachments: currentAttachments },
              };
            await createInternalSnapshot("Trước khôi phục điểm nội bộ", {
              tier: "protected",
              protectedSnapshot: true,
              reason: "before-internal-restore",
            });
            await db.replaceAll(payload);
            closeModal();
            await loadContext();
            toast(
              "Đã khôi phục dữ liệu cấu trúc; tệp đính kèm hiện tại được giữ.",
            );
            go("dashboard");
          };
        }
        async function chooseBackup() {
          const [directoryRecord] = await db.all("backup_handles"),
            directoryGranted = directoryRecord?.handle
              ? await platform.permission(directoryRecord.handle, false)
              : false;
          openModal(
            "Tạo bản sao lưu",
            `<div class="form-grid"><div class="field"><label>Phạm vi</label><select id="backupScope"><option value="quick">Sao lưu nhanh – không gồm tệp đính kèm</option><option value="full">Sao lưu đầy đủ – gồm toàn bộ tệp</option><option value="year">Gói năm học đang chọn – gồm tệp của năm</option></select></div><div class="field"><label>Đích lưu</label><select id="backupDestination"><option value="download">Tệp tải xuống của trình duyệt</option>${directoryGranted ? `<option value="directory">Thư mục ${esc(directoryRecord.name || directoryRecord.handle.name)}</option>` : ""}</select></div></div><div class="field mt"><label>Bảo vệ tệp</label><select id="backupMode"><option value="plain">Không mã hóa</option><option value="encrypted">Mã hóa AES-GCM bằng mật khẩu</option></select></div><div class="form-grid mt hidden" id="backupPasswordField"><div class="field"><label>Mật khẩu, tối thiểu 8 ký tự</label><input id="backupPassword" type="password" autocomplete="new-password"></div><div class="field"><label>Nhập lại mật khẩu</label><input id="backupPasswordConfirm" type="password" autocomplete="new-password"></div></div><div class="notice warn mt">Sao lưu đầy đủ/gói năm có thể dùng nhiều bộ nhớ. Tiến trình có thể hủy; chỉ bản đóng gói xong mới được ghi nhận.</div><progress id="backupProgressBar" class="task-progress" max="100" value="0"></progress><div id="backupProgress" class="muted" role="status"></div>`,
            `<button class="btn" id="cancelBackup">Hủy</button><button class="btn primary" id="doBackup">Tạo tệp</button>`,
          );
          $("#cancelBackup").onclick = () => {
            if (state.activeBackup) {
              state.activeBackup.abort();
              $("#backupProgress").textContent = "Đang hủy an toàn…";
            } else closeModal();
          };
          $("#backupMode").onchange = () =>
            $("#backupPasswordField").classList.toggle(
              "hidden",
              $("#backupMode").value !== "encrypted",
            );
          $("#doBackup").onclick = async () => {
            const button = $("#doBackup"),
              progress = $("#backupProgress"),
              scope = $("#backupScope").value,
              full = ["full", "year"].includes(scope),
              controller = new AbortController();
            let operation = null;
            try {
              operation = await startOperation("external_backup", {
                scope,
                academic_year_id: scope === "year" ? state.yearId : null,
                encrypted: $("#backupMode").value === "encrypted",
              });
              state.activeBackup = controller;
              button.disabled = true;
              progress.textContent = full
                ? "Đang đọc và kiểm tra tệp đính kèm…"
                : "Đang tổng hợp dữ liệu…";
              await new Promise((r) => setTimeout(r, 30));
              const payload = await exportBusinessData(
                full,
                scope === "year" ? state.yearId : null,
                controller.signal,
                ({ phase, ratio }) => {
                  $("#backupProgressBar").value = Math.round(ratio * 80);
                  progress.textContent =
                    phase === "files"
                      ? `Đang đọc tệp: ${Math.round(ratio * 100)}%`
                      : `Đang tổng hợp dữ liệu: ${Math.round(ratio * 100)}%`;
                },
              );
              progress.textContent = "Đang đóng gói bản sao lưu…";
              $("#backupProgressBar").value = 85;
              let text = JSON.stringify(payload),
                ext = full ? "tptbackup" : "json";
              if ($("#backupMode").value === "encrypted") {
                const password = $("#backupPassword").value;
                if (password.length < 8)
                  throw new Error("Mật khẩu cần ít nhất 8 ký tự.");
                if (password !== $("#backupPasswordConfirm").value)
                  throw new Error("Hai lần nhập mật khẩu chưa khớp.");
                progress.textContent = "Đang mã hóa AES-GCM…";
                text = JSON.stringify(await encryptText(text, password));
                ext = "tdt";
              }
              $("#backupProgressBar").value = 95;
              const fileName = `tro-ly-doi-${scope === "year" ? "nam-hoc" : full ? "day-du" : "nhanh"}-${today()}.${ext}`;
              const outputBlob = new Blob([text], { type: "application/json" }),
                destination = $("#backupDestination").value;
              if (destination === "directory")
                await platform.writeFile(
                  directoryRecord.handle,
                  fileName,
                  outputBlob,
                  false,
                );
              else download(outputBlob, fileName, "application/json");
              await db.put(
                "backup_records",
                {
                  name: fileName,
                  scope,
                  encrypted: $("#backupMode").value === "encrypted",
                  destination,
                  size: outputBlob.size,
                  checksum: await sha256Text(text),
                  status: "completed",
                  completed_at: now(),
                },
                { audit: false },
              );
              await finishOperation(operation, "completed", {
                file_name: fileName,
                destination,
                size: outputBlob.size,
              });
              await setting("last_backup_at", now());
              $("#backupProgressBar").value = 100;
              state.activeBackup = null;
              closeModal();
              toast(
                `Đã tạo ${scope === "year" ? "gói năm học" : full ? "sao lưu đầy đủ" : "sao lưu nhanh"}`,
              );
            } catch (e) {
              state.activeBackup = null;
              await finishOperation(
                operation,
                e.name === "AbortError" ? "cancelled" : "failed",
                { error: e.message },
              ).catch(() => {});
              progress.textContent =
                e.name === "AbortError"
                  ? "Đã hủy; không ghi nhận bản dở dang."
                  : "";
              toast(
                e.name === "AbortError"
                  ? "Đã hủy tạo sao lưu"
                  : "Không thể sao lưu: " + e.message,
                e.name === "AbortError" ? "ok" : "bad",
              );
              button.disabled = false;
            }
          };
        }
        async function restoreSelected(e) {
          const file = e.target.files[0];
          e.target.value = "";
          if (!file) return;
          try {
            let obj = JSON.parse(await file.text());
            if (obj.format === "TPT-ENCRYPTED-1") {
              const password = prompt("Nhập mật khẩu tệp sao lưu:");
              if (password === null) return;
              obj = JSON.parse(await decryptText(obj, password));
            }
            if (
              obj.app !== APP.name ||
              !obj.data ||
              !Number.isInteger(obj.schema) ||
              obj.schema > APP.schema
            )
              throw new Error(
                "Tệp sai định dạng hoặc dùng lược đồ mới hơn ứng dụng.",
              );
            const identityWarnings = [];
            if (obj.app_id && obj.app_id !== APP.appId)
              identityWarnings.push("APP_ID của tệp khác ứng dụng hiện tại");
            if (
              obj.school_profile_id &&
              obj.school_profile_id !== APP.schoolProfileId
            )
              identityWarnings.push(
                "hồ sơ trường trong tệp khác hồ sơ hiện tại",
              );
            const dataChecksum = await sha256Text(stableJSON(obj.data));
            if (
              obj.manifest?.source_checksum &&
              obj.manifest.source_checksum !== dataChecksum
            )
              throw new Error("Checksum dữ liệu cấu trúc không khớp.");
            const reconstructed = { ...obj, data: { ...obj.data } },
              files = Array.isArray(obj.files) ? obj.files : [],
              fileById = new Map(files.map((x) => [x.id, x]));
            if (obj.includes_attachments) {
              reconstructed.data.attachments = [];
              for (const meta of obj.data.attachments || []) {
                const f = fileById.get(meta.id);
                if (!f)
                  throw new Error(
                    `Thiếu dữ liệu tệp ${meta.original_name || meta.id}.`,
                  );
                const blob = base64ToBlob(f.data, f.type),
                  hash = await sha256Blob(blob);
                if (hash !== f.sha256 || blob.size !== f.size)
                  throw new Error(`Checksum không khớp: ${f.name}.`);
                reconstructed.data.attachments.push({
                  ...meta,
                  blob,
                  sha256: hash,
                  size: blob.size,
                });
              }
            }
            const total = Object.values(obj.data).reduce(
                (n, rows) => n + (Array.isArray(rows) ? rows.length : 0),
                0,
              ),
              currentMaps = {},
              conflicts = { newRows: 0, incomingNewer: 0, currentKept: 0 };
            for (const store of STORES) {
              if (!Array.isArray(obj.data[store])) continue;
              currentMaps[store] = new Map(
                (await db.allIncludingDeleted(store)).map((row) => [
                  row.id,
                  row,
                ]),
              );
              for (const incoming of obj.data[store]) {
                const current = currentMaps[store].get(incoming.id);
                if (!current) conflicts.newRows++;
                else if (
                  Number(incoming.revision || 0) >
                    Number(current.revision || 0) ||
                  Date.parse(incoming.updated_at || 0) >
                    Date.parse(current.updated_at || 0)
                )
                  conflicts.incomingNewer++;
                else conflicts.currentKept++;
              }
            }
            openModal(
              "Kiểm tra tệp phục hồi",
              `<div class="notice"><strong>Tệp hợp lệ.</strong> Chưa có dữ liệu nào bị thay đổi.</div>${identityWarnings.length ? `<div class="notice danger"><strong>Cảnh báo định danh:</strong> ${esc(identityWarnings.join("; "))}. Chỉ tiếp tục khi đây là dữ liệu cần chuyển trường/hồ sơ.</div>` : ""}<div class="split"><span>Ngày tạo</span><strong>${fmtDateTime(obj.exported_at)}</strong></div><div class="split mt"><span>Lược đồ</span><strong>${obj.schema} → ${APP.schema}</strong></div><div class="split mt"><span>Bản ghi</span><strong>${total.toLocaleString("vi-VN")}</strong></div><div class="split mt"><span>Tệp đã kiểm tra</span><strong>${files.length}</strong></div><div class="split mt"><span>Bản ghi mới / tệp mới hơn / giữ hiện tại</span><strong>${conflicts.newRows} / ${conflicts.incomingNewer} / ${conflicts.currentKept}</strong></div><div class="field mt"><label>Phương thức</label><select id="restoreMode"><option value="merge">Hợp nhất theo ID, revision và thời điểm; mặc định giữ bản hiện tại khi không cũ hơn</option><option value="replace">Thay thế dữ liệu nghiệp vụ trong một giao dịch</option></select></div><div class="notice danger mt">Ứng dụng sẽ tạo điểm khôi phục nội bộ trước khi ghi. Điểm này không thay thế bản sao lưu ngoài thiết bị.</div>`,
              `<button class="btn" id="cancelRestore">Hủy</button><button class="btn danger" id="confirmRestore">Xác nhận phục hồi</button>`,
              true,
            );
            $("#cancelRestore").onclick = closeModal;
            $("#confirmRestore").onclick = async () => {
              const button = $("#confirmRestore");
              let operation = null;
              button.disabled = true;
              try {
                operation = await startOperation("external_restore", {
                  file_name: file.name,
                  mode: $("#restoreMode").value,
                  source_checksum: dataChecksum,
                  conflicts,
                });
                await createInternalSnapshot("Trước phục hồi tệp ngoài", {
                  tier: "protected",
                  protectedSnapshot: true,
                  reason: "before-external-restore",
                });
                await db.put(
                  "restore_staging",
                  {
                    id: "active-restore",
                    file_name: file.name,
                    source_checksum: dataChecksum,
                    status: "validated",
                    validated_at: now(),
                    conflicts,
                  },
                  { audit: false },
                );
                let mergeStats = null;
                if ($("#restoreMode").value === "replace")
                  await db.replaceAll(reconstructed);
                else mergeStats = await db.mergeAll(reconstructed);
                await setting("migration_9_completed", false);
                await migrateEnhancedData();
                await db.put(
                  "restore_staging",
                  {
                    id: "active-restore",
                    status: "committed",
                    committed_at: now(),
                    merge_stats: mergeStats,
                  },
                  { audit: false },
                );
                await finishOperation(operation, "completed", {
                  mode: $("#restoreMode").value,
                  merge_stats: mergeStats,
                });
                closeModal();
                await loadContext();
                toast(
                  mergeStats
                    ? `Hợp nhất hoàn tất: ${mergeStats.inserted} mới, ${mergeStats.updated} cập nhật, ${mergeStats.kept_current} giữ hiện tại.`
                    : "Phục hồi thay thế hoàn tất trong một giao dịch.",
                );
                go("dashboard");
              } catch (err) {
                await finishOperation(operation, "failed", {
                  error: err.message,
                }).catch(() => {});
                button.disabled = false;
                toast(
                  "Phục hồi thất bại; dữ liệu hiện tại được giữ nguyên. " +
                    err.message,
                  "bad",
                );
              }
            };
          } catch (err) {
            toast("Không thể đọc tệp: " + err.message, "bad");
          }
        }

        const permissionList = (value) =>
          [...new Set(String(value || "").split(/[\s,]+/).map((item) => item.trim().toLowerCase()).filter(Boolean))];

        async function renderUserManagement() {
          const users = await db.listUsers(),
            isSuperadmin = state.user?.role === "superadmin";
          setContent(
            pageHead(
              "Quản lý người dùng",
              `Tài khoản thuộc ${state.user?.selectedSchoolName || "trường đang chọn"}.`,
              `${isSuperadmin ? '<button class="btn" id="addSchool">＋ Thêm trường</button>' : ""}<button class="btn primary" id="addUser">＋ Thêm người dùng</button>`,
            ) +
              `<div class="notice"><strong>Admin có toàn quyền trong trường này</strong> và có thể quản lý User/Admin, nhưng không thể tạo hoặc quản lý Superadmin. Superadmin dùng bộ chọn trường trên thanh điều hướng để đổi phạm vi.</div><div class="table-wrap"><table><thead><tr><th>Tài khoản</th><th>Tên hiển thị</th><th>Vai trò</th><th>Quyền</th><th>Trạng thái</th><th>Lần đăng nhập cuối</th><th>Thao tác</th></tr></thead><tbody>${users
                .map(
                  (user) => {
                    const manageable =
                        isSuperadmin || user.role !== "superadmin",
                      roleBadge =
                        user.role === "superadmin"
                          ? '<span class="badge red">Superadmin</span>'
                          : user.role === "admin"
                          ? '<span class="badge blue">Admin</span>'
                          : '<span class="badge">User</span>',
                      actions = user.root
                        ? `<button class="link-btn" data-edit-user="${user.id}">Đổi tên/mật khẩu</button> <span class="muted">root</span>`
                        : manageable
                          ? `<div class="row-actions"><button class="link-btn" data-edit-user="${user.id}">Sửa</button><button class="link-btn red" data-delete-user="${user.id}">Xóa</button></div>`
                          : '<span class="muted">Được bảo vệ</span>';
                    return `<tr><td><strong>${esc(user.username)}</strong></td><td>${esc(user.displayName)}</td><td>${roleBadge}</td><td class="wrap">${["superadmin", "admin"].includes(user.role) ? "Toàn quyền" : esc((user.permissions || []).join(", ") || "Chưa cấp")}</td><td>${user.disabled ? '<span class="badge red">Đã khóa</span>' : '<span class="badge green">Hoạt động</span>'}</td><td>${user.lastLoginAt ? fmtDateTime(user.lastLoginAt) : "Chưa đăng nhập"}</td><td>${actions}</td></tr>`;
                  },
                )
                .join("")}</tbody></table></div>`,
          );
          $("#addUser").onclick = () => openUserForm();
          if ($("#addSchool"))
            $("#addSchool").onclick = async () => {
              const name = prompt("Tên trường mới:")?.trim();
              if (!name) return;
              try {
                const school = await db.createSchool(name);
                state.loginSchools.push(school);
                updateSchoolBranding();
                toast("Đã thêm trường. Chọn trường mới trên thanh điều hướng.");
              } catch (error) {
                toast(error.message, "bad");
              }
            };
          $$('[data-edit-user]').forEach(
            (button) =>
              (button.onclick = () =>
                openUserForm(users.find((user) => user.id === button.dataset.editUser))),
          );
          $$('[data-delete-user]').forEach(
            (button) =>
              (button.onclick = async () => {
                const user = users.find((item) => item.id === button.dataset.deleteUser);
                if (!confirm(`Xóa tài khoản ${user?.username}?`)) return;
                await db.deleteUser(button.dataset.deleteUser);
                toast("Đã xóa tài khoản");
                renderUserManagement();
              }),
          );
        }

        function openUserForm(user = null) {
          const editing = !!user,
            isSuperadmin = state.user?.role === "superadmin",
            roleOptions = isSuperadmin
              ? `<option value="user" ${user?.role === "user" || !user ? "selected" : ""}>User</option><option value="admin" ${user?.role === "admin" ? "selected" : ""}>Admin trường</option><option value="superadmin" ${user?.role === "superadmin" ? "selected" : ""}>Superadmin</option>`
              : `<option value="user" ${user?.role === "user" || !user ? "selected" : ""}>User</option><option value="admin" ${user?.role === "admin" ? "selected" : ""}>Admin trường</option>`;
          openModal(
            editing ? "Sửa tài khoản" : "Thêm người dùng",
            `<form id="userForm"><div class="form-grid"><div class="field"><label class="required">Tên đăng nhập</label><input name="username" value="${esc(user?.username || "")}" minlength="3" maxlength="32" pattern="[a-z0-9._\\-]+" autocapitalize="none" required></div><div class="field"><label class="required">Tên hiển thị</label><input name="displayName" value="${esc(user?.displayName || "")}" required></div><div class="field"><label>Vai trò</label><select name="role" ${user?.root ? "disabled" : ""}>${roleOptions}</select></div><div class="field"><label>${editing ? "Mật khẩu mới (để trống nếu giữ nguyên)" : "Mật khẩu, tối thiểu 10 ký tự"}</label><input name="password" type="password" minlength="10" autocomplete="new-password" ${editing ? "" : "required"}></div><div class="field full"><label>Khóa quyền, cách nhau bằng dấu phẩy</label><textarea name="permissions" placeholder="dashboard, page:tasks, store:tasks:read">${esc((user?.permissions || ["dashboard"]).filter((value) => value !== "*").join(", "))}</textarea><small class="hint">Admin và Superadmin có toàn quyền theo vai trò; các khóa này áp dụng cho User.</small></div>${editing && !user?.root ? `<label class="check-row field full"><input type="checkbox" name="disabled" ${user.disabled ? "checked" : ""}> Khóa tài khoản này</label>` : ""}</div></form>`,
            '<button class="btn" id="cancelUser">Hủy</button><button class="btn primary" id="saveUser">Lưu tài khoản</button>',
          );
          $("#cancelUser").onclick = closeModal;
          $("#saveUser").onclick = async () => {
            const form = $("#userForm");
            if (!form.reportValidity()) return;
            const values = Object.fromEntries(new FormData(form)),
              details = {
                username: values.username,
                displayName: values.displayName,
                role: values.role,
                permissions: permissionList(values.permissions),
                ...(values.password ? { password: values.password } : {}),
                ...(editing ? { disabled: !!values.disabled } : {}),
            };
            try {
              const updatedUser = editing
                ? await db.updateUser(user.id, details)
                : await db.createUser(details);
              closeModal();
              if (
                editing &&
                user.id === state.user?.id &&
                (values.password || updatedUser.disabled)
              ) {
                sessionLock.lock("Tài khoản đã cập nhật. Hãy đăng nhập lại.");
                return;
              }
              if (editing && user.id === state.user?.id) {
                const refreshedUser = { ...state.user, ...updatedUser };
                db.currentUser = refreshedUser;
                applyAuthenticatedUser(refreshedUser);
                sessionLock.updateLabel();
                await launchApp();
                toast("Đã cập nhật tài khoản");
                return;
              }
              toast(editing ? "Đã cập nhật tài khoản" : "Đã tạo tài khoản");
              renderUserManagement();
            } catch (error) {
              toast(error.message, "bad");
            }
          };
        }

        const SETTINGS_TABS = [
          ["school", "Thông tin trường"],
          ["context", "Cơ sở – năm học – học kỳ – tuần"],
          ["classes", "Lớp và giáo viên chủ nhiệm"],
          ["competition", "Cấu hình thi đua"],
          ["activities", "Danh mục hoạt động"],
          ["tasks", "Công việc và checklist"],
          ["documents", "Hồ sơ – tài liệu"],
          ["team", "Tổ chức Đội – phong trào"],
          ["awards", "Khen thưởng"],
          ["equipment", "Thiết bị"],
          ["reports", "Báo cáo và mẫu in"],
          ["appearance", "Giao diện"],
          ["data", "Dữ liệu – sao lưu"],
          ["security", "Khóa phiên và bảo mật"],
        ];
        const SETTINGS_CONFIG_KEYS = {
          activities: ["activity_type", "calendar_type"],
          tasks: ["task_group", "task_status", "priority"],
          documents: ["document_type", "document_status"],
          team: ["team_group", "team_position", "program_type", "specialty"],
          awards: ["award_type", "award_level"],
          equipment: ["equipment_group", "equipment_condition", "unit"],
          reports: ["report_type", "report_template"],
          context: ["plan_type", "plan_level", "plan_status"],
        };
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
        async function renderCustomFieldManager(entity) {
          const defs = await customFieldDefs(entity, true),
            label = {
              plans: "kế hoạch",
              tasks: "công việc",
              activities: "hoạt động",
              documents: "hồ sơ",
              commendations: "khen thưởng",
              equipment: "thiết bị",
            }[entity];
          return `<div class="card mt"><div class="card-head"><h2>Trường thông tin tùy chỉnh – ${label}</h2><span class="meta">${defs.length} trường</span></div><div class="card-body"><div class="notice">Chỉ dùng các kiểu dữ liệu an toàn; không cho phép nhập hoặc thực thi mã JavaScript.</div><button class="btn small primary" data-custom-add="${entity}">＋ Thêm trường</button><div class="table-wrap mt" style="max-height:300px"><table><thead><tr><th>Thứ tự</th><th>Tên trường</th><th>Kiểu</th><th>Bắt buộc</th><th>Trạng thái</th><th></th></tr></thead><tbody>${defs.map((f, i) => `<tr><td>${i + 1}</td><td>${esc(f.name)}</td><td>${esc(f.field_type)}</td><td>${f.required ? "Có" : "Không"}</td><td>${f.active !== false ? "Đang dùng" : "Ngừng"}</td><td><button class="link-btn" data-custom-edit="${f.id}">Sửa</button><button class="link-btn" data-custom-toggle="${f.id}">${f.active !== false ? "Ngừng" : "Bật"}</button></td></tr>`).join("") || '<tr><td colspan="6" class="empty">Chưa có trường tùy chỉnh.</td></tr>'}</tbody></table></div></div></div>`;
        }
        function bindCustomFieldActions() {
          $$("[data-custom-add]").forEach(
            (b) => (b.onclick = () => customFieldForm(b.dataset.customAdd)),
          );
          $$("[data-custom-edit]").forEach(
            (b) =>
              (b.onclick = () => customFieldForm("", b.dataset.customEdit)),
          );
          $$("[data-custom-toggle]").forEach(
            (b) =>
              (b.onclick = async () => {
                const f = await db.get(
                  "custom_field_definitions",
                  b.dataset.customToggle,
                );
                await db.put("custom_field_definitions", {
                  ...f,
                  active: f.active === false,
                });
                toast("Đã cập nhật trường tùy chỉnh");
                renderSettings();
              }),
          );
        }
        async function customFieldForm(entity, id = "") {
          const f = id
            ? await db.get("custom_field_definitions", id)
            : { entity_type: entity, active: true, order: 99 };
          openModal(
            id ? "Sửa trường tùy chỉnh" : "Thêm trường tùy chỉnh",
            `<form id="customFieldForm"><div class="form-grid"><div class="field full"><label class="required">Tên trường</label><input name="name" value="${esc(f.name || "")}" required></div><div class="field"><label>Kiểu trường</label><select name="field_type">${[
              ["short_text", "Văn bản ngắn"],
              ["long_text", "Văn bản dài"],
              ["number", "Số"],
              ["date", "Ngày"],
              ["single_choice", "Lựa chọn một"],
              ["multi_choice", "Lựa chọn nhiều"],
              ["boolean", "Có/không"],
              ["link", "Liên kết"],
              ["file", "Tệp đính kèm"],
            ]
              .map(
                ([v, l]) =>
                  `<option value="${v}" ${f.field_type === v ? "selected" : ""}>${l}</option>`,
              )
              .join(
                "",
              )}</select></div><div class="field"><label>Thứ tự</label><input type="number" name="order" value="${Number(f.order || 99)}"></div><div class="field full"><label>Các lựa chọn, ngăn bằng dấu |</label><input name="options" value="${esc(f.options || "")}" placeholder="Mức 1|Mức 2|Mức 3"></div><div class="field full"><label>Mô tả</label><textarea name="description">${esc(f.description || "")}</textarea></div><label class="check-row"><input type="checkbox" name="required" ${f.required ? "checked" : ""}> Bắt buộc</label><label class="check-row"><input type="checkbox" name="active" ${f.active !== false ? "checked" : ""}> Đang sử dụng</label></div></form>`,
            `<button class="btn" id="cancelCustomField">Hủy</button><button class="btn primary" id="saveCustomField">Lưu</button>`,
          );
          $("#cancelCustomField").onclick = closeModal;
          $("#saveCustomField").onclick = async () => {
            const form = $("#customFieldForm");
            if (!form.reportValidity()) return;
            const d = Object.fromEntries(new FormData(form));
            await db.put("custom_field_definitions", {
              ...f,
              ...d,
              required: !!d.required,
              active: !!d.active,
              order: Number(d.order || 99),
            });
            closeModal();
            toast("Đã lưu trường tùy chỉnh");
            renderSettings();
          };
        }
        async function renderSettings() {
          setContent(
            pageHead(
              "Trung tâm cấu hình",
              "Điều chỉnh ứng dụng theo quy trình của từng trường mà không sửa mã nguồn.",
              `<button class="btn" id="exportAllConfig">Xuất cấu hình</button><button class="btn" id="importAllConfig">Nhập cấu hình</button>`,
            ) +
              `<div class="settings-shell"><nav class="settings-menu" aria-label="Nhóm cấu hình">${SETTINGS_TABS.map(([id, label], i) => `<button data-setting-tab="${id}" class="${state.settingsTab === id ? "active" : ""}">${i + 1}. ${esc(label)}</button>`).join("")}</nav><section class="settings-panel" id="settingsPanel"><div class="empty">Đang tải cấu hình…</div></section></div>`,
          );
          $$("[data-setting-tab]").forEach(
            (b) =>
              (b.onclick = () => {
                state.settingsTab = b.dataset.settingTab;
                renderSettings();
              }),
          );
          $("#exportAllConfig").onclick = exportAllConfig;
          $("#importAllConfig").onclick = importAllConfig;
          await renderSettingsPanel(state.settingsTab);
        }
        async function renderSettingsPanel(tab) {
          const panel = $("#settingsPanel");
          if (!panel) return;
          if (tab === "school") return renderSchoolPanel(panel);
          if (tab === "context") return renderAcademicYearPanel(panel);
          if (tab === "classes") return renderClassPanel(panel);
          if (tab === "competition") {
            panel.innerHTML = `<div class="card"><div class="card-head"><h2>Bộ tiêu chí thi đua</h2></div><div class="card-body"><p>Quản lý nhiều bộ theo năm học, học kỳ, cơ sở, hiệu lực và phiên bản. Bộ đã có điểm chỉ được tạo phiên bản mới.</p><button class="btn primary" id="manageCriteria">Mở trình quản lý bộ tiêu chí</button></div></div>`;
            return ($("#manageCriteria").onclick = showCriteriaConfig);
          }
          if (tab === "appearance") {
            const paper = (await setting("paper_orientation")) || "landscape",
              compact = (await setting("compact_mode")) !== false;
            panel.innerHTML = `<div class="card"><div class="card-head"><h2>Giao diện và in</h2></div><div class="card-body"><div class="form-grid"><div class="field"><label>Khổ in báo cáo</label><select id="paperOrientation"><option value="landscape" ${paper === "landscape" ? "selected" : ""}>A4 ngang</option><option value="portrait" ${paper === "portrait" ? "selected" : ""}>A4 dọc</option></select></div><label class="check-row"><input id="compactMode" type="checkbox" ${compact ? "checked" : ""}> Chế độ hiển thị gọn</label></div><button class="btn primary mt" id="saveAppearance">Lưu giao diện</button></div></div>`;
            return ($("#saveAppearance").onclick = async () => {
              await setting("paper_orientation", $("#paperOrientation").value);
              await setting("compact_mode", $("#compactMode").checked);
              document.body.dataset.paper = $("#paperOrientation").value;
              toast("Đã lưu giao diện và khổ in");
            });
          }
          if (tab === "data") {
            panel.innerHTML = `<div class="grid-2"><div class="card"><div class="card-head"><h2>Dữ liệu và sao lưu</h2></div><div class="card-body"><p>Sao lưu nhanh cho dữ liệu cấu trúc; sao lưu đầy đủ gồm cả tệp Blob và checksum.</p><button class="btn primary" id="openBackup">Mở Sao lưu – khôi phục</button></div></div><div class="card"><div class="card-head"><h2>Giới hạn tệp và cảnh báo dung lượng</h2></div><div class="card-body"><div class="field"><label>Dung lượng tối đa mỗi tệp (MB)</label><input id="maxFileMb" type="number" min="1" max="250" value="${Number(await setting("max_file_mb")) || 25}"></div><div class="form-grid mt"><div class="field"><label>Cảnh báo sớm (%)</label><input id="storageLow" type="number" min="50" max="90" value="${Number(await setting("storage_warning_low")) || 70}"></div><div class="field"><label>Cảnh báo cao (%)</label><input id="storageHigh" type="number" min="60" max="95" value="${Number(await setting("storage_warning_high")) || 85}"></div><div class="field"><label>Cảnh báo nguy cấp (%)</label><input id="storageCritical" type="number" min="70" max="99" value="${Number(await setting("storage_warning_critical")) || 95}"></div></div><button class="btn mt" id="saveFileLimit">Lưu giới hạn</button></div></div></div>`;
            $("#openBackup").onclick = () => go("backup");
            return ($("#saveFileLimit").onclick = async () => {
              const low = clamp($("#storageLow").value, 50, 90),
                high = clamp($("#storageHigh").value, 60, 95),
                critical = clamp($("#storageCritical").value, 70, 99);
              if (!(low < high && high < critical))
                return toast(
                  "Ba ngưỡng phải tăng dần: sớm < cao < nguy cấp.",
                  "bad",
                );
              await setting(
                "max_file_mb",
                clamp($("#maxFileMb").value, 1, 250),
              );
              await setting("storage_warning_low", low);
              await setting("storage_warning_high", high);
              await setting("storage_warning_critical", critical);
              toast("Đã lưu giới hạn tệp và ngưỡng dung lượng");
            });
          }
          if (tab === "security") return renderSecurityPanel(panel);
          const keys =
            SETTINGS_CONFIG_KEYS[tab] || SETTINGS_CONFIG_KEYS.context;
          const customEntity = {
            context: "plans",
            activities: "activities",
            tasks: "tasks",
            documents: "documents",
            awards: "commendations",
            equipment: "equipment",
          }[tab];
          panel.innerHTML = `<div class="notice">Danh mục ngừng sử dụng không xuất hiện khi tạo mới nhưng vẫn giữ nguyên tên trong dữ liệu lịch sử.</div>${(await Promise.all(keys.map(renderConfigCategory))).join("")}${customEntity ? await renderCustomFieldManager(customEntity) : ""}`;
          bindConfigActions();
          bindCustomFieldActions();
        }
        async function renderSchoolPanel(panel) {
          const [school] = await db.all("schools");
          let selectedLogo = school?.brand_logo || null;
          panel.innerHTML = `<div class="card"><div class="card-head"><h2>Thông tin trường</h2></div><div class="card-body"><form id="schoolCenterForm"><div class="form-grid"><div class="field full"><label class="required">Tên trường</label><input name="name" value="${esc(school?.name || "")}" required></div><div class="field"><label>Mã trường</label><input name="code" value="${esc(school?.code || "")}"></div><div class="field"><label>Địa chỉ</label><input name="address" value="${esc(school?.address || "")}"></div><div class="field"><label>Người lập báo cáo</label><input name="reporter" value="${esc(school?.reporter || "")}"></div><div class="field"><label>Chức danh</label><input name="reporter_title" value="${esc(school?.reporter_title || "Tổng phụ trách Đội")}"></div><div class="field full"><label>Logo trường</label><div class="brand-logo-editor"><div class="brand-logo-preview" id="schoolLogoPreview" aria-label="Xem trước logo"></div><div><input id="schoolLogoInput" type="file" accept="image/png,image/jpeg,image/webp"><div class="toolbar mt"><button class="btn small" id="removeSchoolLogo" type="button">Dùng biểu tượng mặc định</button></div><small class="hint">Chọn ảnh PNG, JPEG hoặc WebP, tối đa 2 MB. Logo được lưu riêng cho trường này.</small></div></div></div></div></form><button class="btn primary mt" id="saveSchoolCenter">Lưu thông tin</button></div></div>`;
          const renderLogoPreview = () => {
            const preview = $("#schoolLogoPreview");
            preview.replaceChildren();
            if (!(selectedLogo instanceof Blob)) {
              preview.textContent = "Đ";
              return;
            }
            const image = document.createElement("img"),
              url = URL.createObjectURL(selectedLogo);
            image.src = url;
            image.alt = "Logo trường đã chọn";
            image.onload = () => URL.revokeObjectURL(url);
            preview.append(image);
          };
          renderLogoPreview();
          $("#schoolLogoInput").onchange = (event) => {
            const file = event.target.files[0];
            if (!file) return;
            if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
              event.target.value = "";
              return toast("Logo phải là ảnh PNG, JPEG hoặc WebP.", "bad");
            }
            if (file.size > 2 * 1048576) {
              event.target.value = "";
              return toast("Logo không được vượt quá 2 MB.", "bad");
            }
            selectedLogo = file;
            renderLogoPreview();
          };
          $("#removeSchoolLogo").onclick = () => {
            selectedLogo = null;
            $("#schoolLogoInput").value = "";
            renderLogoPreview();
          };
          $("#saveSchoolCenter").onclick = async () => {
            const f = $("#schoolCenterForm");
            if (!f.reportValidity()) return;
            await db.put("schools", {
              ...(school || {}),
              ...Object.fromEntries(new FormData(f)),
              brand_logo: selectedLogo,
            });
            state.schoolLogo = selectedLogo;
            updateSchoolBranding();
            toast("Đã lưu thông tin trường");
          };
        }
        async function renderAcademicYearPanel(panel) {
          const years = (await db.all("school_years")).sort((a, b) =>
              String(b.start_date || "").localeCompare(
                String(a.start_date || ""),
              ),
            ),
            activeYear = years.find((year) => year.id === state.yearId),
            semesters = (await db.all("semesters")).filter(
              (row) => row.school_year_id === state.yearId,
            ),
            weeks = (await db.all("school_weeks")).filter(
              (row) => row.school_year_id === state.yearId,
            ),
            campuses = await db.all("campuses"),
            classes = await db.all("classes"),
            classCountByCampus = classes.reduce((result, row) => {
              if (row.campus_id)
                result[row.campus_id] = (result[row.campus_id] || 0) + 1;
              return result;
            }, {});
          panel.innerHTML = `<div class="card"><div class="card-head"><h2>Quản lý cơ sở</h2><span class="meta">${campuses.length} cơ sở</span></div><div class="card-body"><div class="toolbar"><button class="btn primary" id="addCampusCenter">＋ Thêm cơ sở</button></div><div class="notice">Có thể thêm cơ sở mới hoặc sửa tên, mã cơ sở bất cứ lúc nào. Việc đổi tên/mã không làm mất liên kết dữ liệu. Chỉ xóa được cơ sở chưa có lớp hoặc dữ liệu nghiệp vụ.</div><div class="table-wrap" style="max-height:300px"><table><thead><tr><th>TT</th><th>Tên cơ sở</th><th>Mã cơ sở</th><th>Số lớp</th><th>Thao tác</th></tr></thead><tbody>${campuses.map((campus, index) => `<tr><td>${index + 1}</td><td class="wrap"><strong>${esc(campus.name)}</strong></td><td>${esc(campus.code || "—")}</td><td>${Number(classCountByCampus[campus.id] || 0).toLocaleString("vi-VN")}</td><td><div class="row-actions"><button class="link-btn" data-edit-campus="${campus.id}">Sửa</button><button class="link-btn red" data-delete-campus="${campus.id}">Xóa</button></div></td></tr>`).join("") || '<tr><td colspan="5" class="empty">Chưa có cơ sở. Hãy chọn “Thêm cơ sở”.</td></tr>'}</tbody></table></div></div></div><div class="card mt"><div class="card-head"><h2>Vòng đời năm học</h2><span class="meta">${years.length} năm</span></div><div class="card-body"><div class="toolbar"><button class="btn primary" id="createAcademicYear">＋ Tạo năm học mới</button><button class="btn" id="closeAcademicYear" ${activeYear?.status === "archived" ? "disabled" : ""}>Đóng năm đang chọn</button></div><div class="notice">Năm đã đóng mặc định chỉ đọc. Muốn hiệu chỉnh phải mở quyền trong phiên và ghi lý do; mọi thao tác được lưu nhật ký.</div><div class="table-wrap" style="max-height:360px"><table><thead><tr><th>Năm học</th><th>Thời gian</th><th>Học kỳ/tuần</th><th>Trạng thái</th><th>Quyền sửa phiên này</th><th>Thao tác</th></tr></thead><tbody>${years
            .map((year) => {
              const override = state.yearEditOverrides.has(year.id);
              return `<tr><td><strong>${esc(year.name)}</strong>${year.is_current ? " • hiện hành" : ""}</td><td>${fmtDate(year.start_date)} – ${fmtDate(year.end_date)}</td><td>${year.id === state.yearId ? `${semesters.length}/${weeks.length}` : "—"}</td><td>${year.status === "archived" || year.read_only ? '<span class="badge yellow">Đã đóng • chỉ đọc</span>' : '<span class="badge green">Đang mở</span>'}</td><td>${override ? '<span class="badge red">Đang mở sửa có lý do</span>' : "Mặc định"}</td><td>${year.status === "archived" || year.read_only ? `<button class="link-btn" data-year-edit="${year.id}">${override ? "Đóng quyền sửa" : "Mở sửa có lý do"}</button>` : "—"}</td></tr>`;
            })
            .join(
              "",
            )}</tbody></table></div></div></div><div class="grid-2 mt"><div class="card"><div class="card-head"><h2>Quy tắc tạo năm</h2></div><div class="card-body"><ul><li>Tạo mới học kỳ và 40 tuần theo ngày bắt đầu.</li><li>Chỉ sao chép lớp và bộ tiêu chí khi được chọn.</li><li>Không sao chép điểm, xếp hạng, hoạt động, công việc đã phát sinh hay báo cáo cũ.</li></ul></div></div><div class="card"><div class="card-head"><h2>Quy tắc đóng năm</h2></div><div class="card-body"><ul><li>Kiểm tra bảng điểm chưa khóa, việc chưa xong và báo cáo nháp.</li><li>Tạo snapshot bảo vệ, báo cáo tổng kết chốt và gói năm học.</li><li>Sau khi đóng, bản ghi năm cũ chuyển sang chỉ đọc.</li></ul></div></div></div>`;
          $("#addCampusCenter").onclick = () => campusForm();
          $$('[data-edit-campus]').forEach(
            (button) =>
              (button.onclick = () => campusForm(button.dataset.editCampus)),
          );
          $$('[data-delete-campus]').forEach(
            (button) =>
              (button.onclick = () => deleteCampus(button.dataset.deleteCampus)),
          );
          $("#createAcademicYear").onclick = showCreateAcademicYear;
          $("#closeAcademicYear").onclick = () =>
            closeAcademicYear(state.yearId);
          $$("[data-year-edit]").forEach((button) => {
            button.onclick = () => toggleYearEdit(button.dataset.yearEdit);
          });
        }

        async function showCreateAcademicYear() {
          const current = state.cache.years.find(
              (year) => year.id === state.yearId,
            ),
            startYear =
              Number(
                String(current?.name || "").match(/\d{4}/)?.[0] ||
                  new Date().getFullYear(),
              ) + 1;
          openModal(
            "Tạo năm học mới",
            `<form id="academicYearForm"><div class="form-grid"><div class="field full"><label class="required">Tên năm học</label><input name="name" value="${startYear}–${startYear + 1}" required></div><div class="field"><label class="required">Ngày bắt đầu</label><input type="date" name="start_date" value="${startYear}-08-15" required></div><div class="field"><label class="required">Ngày kết thúc</label><input type="date" name="end_date" value="${startYear + 1}-05-31" required></div></div><fieldset class="mt"><legend>Sao chép có chọn lọc từ ${esc(current?.name || "năm hiện tại")}</legend><label class="check-row"><input type="checkbox" name="copy_classes" checked> Danh sách lớp và giáo viên (tạo ID mới)</label><label class="check-row"><input type="checkbox" name="copy_criteria" checked> Bộ tiêu chí và tiêu chí (chuyển về dự thảo)</label><label class="check-row"><input type="checkbox" name="copy_templates" checked> Mẫu công việc dùng chung</label></fieldset><div class="notice warn mt">Không sao chép điểm thi đua, xếp hạng, công việc phát sinh, hoạt động, hồ sơ giao dịch hoặc báo cáo năm cũ.</div></form>`,
            `<button class="btn" id="cancelCreateYear">Hủy</button><button class="btn primary" id="confirmCreateYear">Tạo năm học</button>`,
            true,
          );
          $("#cancelCreateYear").onclick = closeModal;
          $("#confirmCreateYear").onclick = async () => {
            const form = $("#academicYearForm");
            if (!form.reportValidity()) return;
            const values = Object.fromEntries(new FormData(form));
            if (values.start_date >= values.end_date)
              return toast("Ngày kết thúc phải sau ngày bắt đầu.", "bad");
            if (
              (await db.all("school_years")).some(
                (year) =>
                  normalizeText(year.name) === normalizeText(values.name),
              )
            )
              return toast("Tên năm học đã tồn tại.", "bad");
            const button = $("#confirmCreateYear");
            let operation = null;
            button.disabled = true;
            try {
              operation = await startOperation("create_academic_year", {
                from_year_id: state.yearId,
                academic_year_name: values.name,
              });
              await createInternalSnapshot("Trước tạo năm học mới", {
                tier: "protected",
                protectedSnapshot: true,
                reason: "before-create-year",
              });
              const previousId = state.yearId,
                yearId = uid();
              for (const year of await db.all("school_years"))
                if (year.is_current)
                  await db.put("school_years", { ...year, is_current: false });
              await db.put("school_years", {
                id: yearId,
                name: values.name,
                start_date: values.start_date,
                end_date: values.end_date,
                is_current: true,
                status: "active",
                read_only: false,
              });
              const middle = new Date(values.start_date + "T00:00:00");
              middle.setDate(middle.getDate() + 145);
              await db.bulkPut("semesters", [
                {
                  id: uid(),
                  school_year_id: yearId,
                  name: "Học kỳ I",
                  start_date: values.start_date,
                  end_date: localISO(middle),
                },
                {
                  id: uid(),
                  school_year_id: yearId,
                  name: "Học kỳ II",
                  start_date: addDays(localISO(middle), 1),
                  end_date: values.end_date,
                },
              ]);
              const firstMonday = new Date(values.start_date + "T00:00:00");
              firstMonday.setDate(
                firstMonday.getDate() + ((8 - firstMonday.getDay()) % 7),
              );
              const newWeeks = [];
              for (let number = 1; number <= 40; number++) {
                const start = new Date(firstMonday),
                  end = new Date(firstMonday);
                start.setDate(start.getDate() + (number - 1) * 7);
                end.setDate(start.getDate() + 6);
                newWeeks.push({
                  id: uid(),
                  school_year_id: yearId,
                  number,
                  name: `Tuần ${number}`,
                  start_date: localISO(start),
                  end_date: localISO(end),
                });
              }
              await db.bulkPut("school_weeks", newWeeks);
              let copiedClasses = 0,
                copiedCriteria = 0;
              if (values.copy_classes) {
                const oldClasses = (await db.all("classes")).filter(
                  (row) => row.school_year_id === previousId,
                );
                await db.bulkPut(
                  "classes",
                  oldClasses.map(
                    ({ id, created_at, updated_at, revision, ...row }) => ({
                      ...row,
                      id: uid(),
                      school_year_id: yearId,
                      academic_year_id: yearId,
                      source: "copied-year",
                    }),
                  ),
                );
                copiedClasses = oldClasses.length;
              }
              if (values.copy_criteria) {
                const sets = (await db.all("criteria_sets")).filter(
                    (row) => row.school_year_id === previousId,
                  ),
                  criteria = (await db.all("criteria")).filter(
                    (row) => row.school_year_id === previousId,
                  );
                for (const set of sets) {
                  const newSetId = uid();
                  await db.put("criteria_sets", {
                    ...set,
                    id: newSetId,
                    school_year_id: yearId,
                    academic_year_id: yearId,
                    status: "draft",
                    version: "1.0",
                    source: "copied-year",
                    created_at: undefined,
                    updated_at: undefined,
                    revision: undefined,
                  });
                  const children = criteria.filter(
                    (row) => row.criteria_set_id === set.id,
                  );
                  await db.bulkPut(
                    "criteria",
                    children.map(
                      ({ id, created_at, updated_at, revision, ...row }) => ({
                        ...row,
                        id: uid(),
                        criteria_set_id: newSetId,
                        school_year_id: yearId,
                        academic_year_id: yearId,
                        source: "copied-year",
                      }),
                    ),
                  );
                  copiedCriteria += children.length;
                }
              }
              await db.put("year_transition_logs", {
                action: "create_year",
                from_year_id: previousId,
                to_year_id: yearId,
                copied_classes: copiedClasses,
                copied_criteria: copiedCriteria,
                excluded: [
                  "score_entries",
                  "ranking_snapshots",
                  "tasks",
                  "activities",
                  "generated_reports",
                ],
                completed_at: now(),
              });
              await finishOperation(operation, "completed", {
                to_year_id: yearId,
                copied_classes: copiedClasses,
                copied_criteria: copiedCriteria,
              });
              state.yearId = yearId;
              state.weekId = "";
              state.semesterId = "all";
              closeModal();
              await loadContext();
              toast(
                `Đã tạo ${values.name}: ${copiedClasses} lớp, ${copiedCriteria} tiêu chí.`,
              );
              renderSettings();
            } catch (error) {
              await finishOperation(operation, "failed", {
                error: error.message,
              }).catch(() => {});
              button.disabled = false;
              toast("Không thể tạo năm học: " + error.message, "bad");
            }
          };
        }

        async function closeAcademicYear(yearId) {
          const year = await db.get("school_years", yearId);
          if (!year || year.status === "archived") return;
          const [sheets, tasks, reports] = await Promise.all([
              db.all("weekly_score_sheets"),
              db.all("tasks"),
              db.all("generated_reports"),
            ]),
            unlocked = sheets.filter(
              (row) => row.school_year_id === yearId && row.status !== "locked",
            ),
            openTasks = tasks.filter(
              (row) => row.school_year_id === yearId && row.status !== "done",
            ),
            draftReports = reports.filter(
              (row) =>
                row.school_year_id === yearId && row.status !== "finalized",
            ),
            blockers = [
              unlocked.length && `${unlocked.length} bảng thi đua chưa khóa`,
              openTasks.length &&
                `${openTasks.length} công việc chưa hoàn thành`,
              draftReports.length &&
                `${draftReports.length} báo cáo còn là bản nháp`,
            ].filter(Boolean);
          openModal(
            `Đóng năm học ${year.name}`,
            `${blockers.length ? `<div class="notice danger"><strong>Chưa đủ điều kiện đóng:</strong><ul>${blockers.map((item) => `<li>${esc(item)}</li>`).join("")}</ul>Hãy xử lý hoặc xác nhận nghiệp vụ tại phân hệ tương ứng.</div>` : '<div class="notice"><strong>Đủ điều kiện kỹ thuật để đóng năm.</strong></div>'}<p>Khi xác nhận, ứng dụng tạo snapshot bảo vệ, báo cáo tổng kết chốt, gói năm học có checksum rồi chuyển năm sang chỉ đọc.</p><label class="check-row"><input id="confirmCloseYearCheck" type="checkbox" ${blockers.length ? "disabled" : ""}> Tôi đã đối chiếu số liệu và hiểu gói tải xuống cần được lưu ngoài thiết bị.</label><div id="closeYearProgress" class="muted mt" role="status"></div>`,
            `<button class="btn" id="cancelCloseYear">Hủy</button><button class="btn danger" id="confirmCloseYear" ${blockers.length ? "disabled" : ""}>Chốt và đóng năm</button>`,
            true,
          );
          $("#cancelCloseYear").onclick = closeModal;
          $("#confirmCloseYear").onclick = async () => {
            if (!$("#confirmCloseYearCheck").checked)
              return toast("Cần xác nhận đã đối chiếu số liệu.", "bad");
            const button = $("#confirmCloseYear"),
              progress = $("#closeYearProgress");
            let operation = null;
            button.disabled = true;
            try {
              operation = await startOperation("close_academic_year", {
                academic_year_id: yearId,
                academic_year_name: year.name,
              });
              progress.textContent = "Đang tạo điểm khôi phục bảo vệ…";
              await createInternalSnapshot(`Trước đóng ${year.name}`, {
                tier: "protected",
                protectedSnapshot: true,
                reason: "before-close-year",
                yearId,
              });
              progress.textContent = "Đang tạo báo cáo tổng kết chốt…";
              await createFinalizedYearReport(year);
              await db.put("school_years", {
                ...year,
                status: "archived",
                read_only: true,
                is_current: false,
                closed_at: now(),
              });
              progress.textContent = "Đang đóng gói dữ liệu và tệp của năm…";
              const packageData = await exportBusinessData(true, yearId);
              const packageText = JSON.stringify(packageData),
                fileName = `goi-nam-hoc-${String(year.name).replace(/[^0-9A-Za-zÀ-ỹ–-]+/g, "-")}-${today()}.tptbackup`;
              download(packageText, fileName, "application/json");
              await db.put("year_transition_logs", {
                action: "close_year",
                year_id: yearId,
                package_name: fileName,
                package_checksum: await sha256Text(packageText),
                status: "archived",
                completed_at: now(),
              });
              await createInternalSnapshot(`Sau đóng ${year.name}`, {
                tier: "protected",
                protectedSnapshot: true,
                reason: "after-close-year",
                yearId,
              });
              await finishOperation(operation, "completed", {
                package_name: fileName,
                package_checksum: await sha256Text(packageText),
              });
              closeModal();
              await loadContext();
              toast(
                "Đã chốt năm và yêu cầu trình duyệt tải gói năm học. Hãy lưu tệp ngoài thiết bị.",
              );
              renderSettings();
            } catch (error) {
              await finishOperation(operation, "failed", {
                error: error.message,
              }).catch(() => {});
              button.disabled = false;
              progress.textContent = "";
              toast("Không thể đóng năm: " + error.message, "bad");
            }
          };
        }

        async function toggleYearEdit(yearId) {
          if (state.yearEditOverrides.has(yearId)) {
            state.yearEditOverrides.delete(yearId);
            toast("Đã đóng quyền sửa năm cũ trong phiên này.");
            return renderSettings();
          }
          const year = await db.get("school_years", yearId);
          openModal(
            `Mở sửa ${year?.name || "năm cũ"}`,
            `<div class="notice warn">Quyền chỉ tồn tại trong thẻ hiện tại. Mọi thay đổi vẫn có revision và nhật ký.</div><div class="field"><label class="required">Lý do hiệu chỉnh</label><textarea id="yearEditReason" required minlength="10" placeholder="Nêu rõ hồ sơ/số liệu cần hiệu chỉnh…"></textarea></div>`,
            `<button class="btn" id="cancelYearEdit">Hủy</button><button class="btn danger" id="confirmYearEdit">Mở quyền sửa</button>`,
          );
          $("#cancelYearEdit").onclick = closeModal;
          $("#confirmYearEdit").onclick = async () => {
            const reason = $("#yearEditReason").value.trim();
            if (reason.length < 10)
              return toast("Lý do cần ít nhất 10 ký tự.", "bad");
            state.yearEditOverrides.set(yearId, reason);
            await db.put("year_transition_logs", {
              action: "open_archived_year_edit",
              year_id: yearId,
              reason,
              session_tab_id: tabCoordinator.tabId,
              opened_at: now(),
            });
            closeModal();
            toast("Đã mở quyền sửa có lý do trong phiên này.");
            renderSettings();
          };
        }
        async function renderClassPanel(panel) {
          const classes = await scoped("classes");
          panel.innerHTML = `<div class="card"><div class="card-head"><h2>Danh sách lớp</h2><span class="meta">${classes.length} lớp</span></div><div class="card-body"><div class="toolbar"><button class="btn" id="addClassCenter">＋ Lớp</button><button class="btn" id="importClassCenter">Nhập CSV/dán Excel</button></div><div class="table-wrap" style="max-height:430px"><table><thead><tr><th>Lớp</th><th>Khối</th><th>Cơ sở</th><th>Giáo viên chủ nhiệm</th><th>Trạng thái</th><th></th></tr></thead><tbody>${classes.map((c) => `<tr><td>${esc(c.class_name)}</td><td>${esc(c.grade)}</td><td>${esc(campusName(c.campus_id))}</td><td>${esc(c.teacher || "—")}</td><td>${c.active !== false ? '<span class="badge green">Đang dùng</span>' : '<span class="badge">Ngừng dùng</span>'}</td><td><button class="link-btn" data-edit-center-class="${c.id}">Sửa</button></td></tr>`).join("")}</tbody></table></div></div></div>`;
          $("#addClassCenter").onclick = () => classForm();
          $("#importClassCenter").onclick = showClassImport;
          $$("[data-edit-center-class]").forEach(
            (b) => (b.onclick = () => classForm(b.dataset.editCenterClass)),
          );
        }
        async function renderSecurityPanel(panel) {
          const timeout = Number(await setting("auto_lock_minutes")) || 10;
          panel.innerHTML = `<div class="grid-2"><div class="card"><div class="card-head"><h2>Khóa phiên làm việc</h2></div><div class="card-body"><div class="field"><label>Tự khóa khi không hoạt động</label><select id="autoLockMinutes">${[5, 10, 15, 30].map((minutes) => `<option value="${minutes}" ${timeout === minutes ? "selected" : ""}>${minutes} phút</option>`).join("")}</select></div><div class="toolbar mt"><button class="btn primary" id="saveAutoLock">Lưu thời gian</button><button class="btn" id="lockApplication">Khóa ngay</button></div><div class="notice warn">Mật khẩu được máy chủ băm bằng <code>scrypt</code> và không được ghi nhớ trong trình duyệt. Quản lý tài khoản tại phân hệ Người dùng.</div></div></div><div class="card"><div class="card-head"><h2>Định danh phát hành</h2></div><div class="card-body"><div class="split"><span>APP_ID</span><code>${esc(APP.appId)}</code></div><div class="split mt"><span>Hồ sơ trường</span><code>${esc(APP.schoolProfileId)}</code></div><div class="split mt"><span>Thiết bị</span><code>${esc(DEVICE_ID)}</code></div><p class="muted">Dữ liệu được lưu bằng SQLite qua API máy chủ. Dùng trang Sao lưu – khôi phục để tạo bản sao ngoài.</p><button class="btn" id="openBackupSettings">Mở Sao lưu – khôi phục</button></div></div></div>`;
          $("#saveAutoLock").onclick = async () => {
            const minutes = Number($("#autoLockMinutes").value);
            await setting("auto_lock_minutes", minutes);
            sessionLock.setTimeoutMinutes(minutes);
            toast(`Đã đặt tự khóa sau ${minutes} phút.`);
          };
          $("#lockApplication").onclick = () =>
            sessionLock.lock("Đã đăng xuất. Hãy đăng nhập để tiếp tục.");
          $("#openBackupSettings").onclick = () => go("backup");
        }
        async function renderConfigCategory(key) {
          const categories = await db.all("config_categories"),
            cat = categories.find((x) => x.key === key),
            items = await configItems(key, true);
          return `<div class="card mb config-card" data-config-key="${key}"><div class="card-head"><h2>${esc(cat?.name || key)}</h2><span class="meta">${items.filter((x) => x.active !== false).length}/${items.length} đang dùng</span></div><div class="card-body"><div class="toolbar"><input class="grow" data-config-search="${key}" placeholder="Tìm trong danh mục…"><button class="btn small primary" data-config-add="${key}">＋ Thêm</button><button class="btn small" data-config-restore="${key}">Khôi phục mẫu</button></div><div class="table-wrap" style="max-height:300px"><table><thead><tr><th>Thứ tự</th><th>Màu</th><th>Tên hiển thị</th><th>Mã</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody data-config-rows="${key}">${items.map((x, i) => `<tr data-config-text="${esc(normalizeText(x.label))}"><td>${i + 1}</td><td><span style="display:inline-block;width:16px;height:16px;border-radius:4px;background:${esc(x.color || "#0b6bcb")}"></span></td><td class="wrap">${esc(x.label)}</td><td>${esc(x.code)}</td><td>${x.active !== false ? '<span class="badge green">Đang dùng</span>' : '<span class="badge">Ngừng dùng</span>'}</td><td><button class="link-btn" data-config-up="${x.id}">↑</button><button class="link-btn" data-config-down="${x.id}">↓</button><button class="link-btn" data-config-edit="${x.id}">Sửa</button><button class="link-btn" data-config-clone="${x.id}">Nhân bản</button><button class="link-btn" data-config-toggle="${x.id}">${x.active !== false ? "Ngừng" : "Bật"}</button></td></tr>`).join("")}</tbody></table></div></div></div>`;
        }
        function bindConfigActions() {
          $$("[data-config-search]").forEach(
            (i) =>
              (i.oninput = () => {
                const q = normalizeText(i.value);
                $$(`[data-config-rows="${i.dataset.configSearch}"] tr`).forEach(
                  (r) =>
                    r.classList.toggle(
                      "hidden",
                      !r.dataset.configText.includes(q),
                    ),
                );
              }),
          );
          $$("[data-config-add]").forEach(
            (b) => (b.onclick = () => configItemForm(b.dataset.configAdd)),
          );
          $$("[data-config-edit]").forEach(
            (b) => (b.onclick = () => configItemForm("", b.dataset.configEdit)),
          );
          $$("[data-config-clone]").forEach(
            (b) =>
              (b.onclick = async () => {
                const x = await db.get("config_items", b.dataset.configClone);
                await db.put("config_items", {
                  ...x,
                  id: undefined,
                  label: x.label + " – Bản sao",
                  code: x.code + "_copy",
                  is_default: false,
                });
                toast("Đã nhân bản mục");
                renderSettings();
              }),
          );
          $$("[data-config-toggle]").forEach(
            (b) =>
              (b.onclick = async () => {
                const x = await db.get("config_items", b.dataset.configToggle);
                await db.put("config_items", {
                  ...x,
                  active: x.active === false,
                });
                toast(
                  x.active === false
                    ? "Đã bật sử dụng"
                    : "Đã ngừng sử dụng; dữ liệu cũ vẫn được giữ",
                );
                renderSettings();
              }),
          );
          $$("[data-config-up],[data-config-down]").forEach(
            (b) =>
              (b.onclick = async () => {
                const id = b.dataset.configUp || b.dataset.configDown,
                  x = await db.get("config_items", id);
                x.order = Math.max(
                  1,
                  Number(x.order || 1) + (b.dataset.configUp ? -1 : 1),
                );
                await db.put("config_items", x);
                renderSettings();
              }),
          );
          $$("[data-config-restore]").forEach(
            (b) =>
              (b.onclick = () =>
                restoreConfigDefaults(b.dataset.configRestore)),
          );
        }
        async function configItemForm(key, id = "") {
          const row = id
            ? await db.get("config_items", id)
            : { category_key: key, active: true, color: "#0b6bcb" };
          openModal(
            id ? "Sửa mục cấu hình" : "Thêm mục cấu hình",
            `<form id="configItemForm"><div class="form-grid"><div class="field full"><label class="required">Tên hiển thị</label><input name="label" value="${esc(row.label || "")}" required></div><div class="field"><label class="required">Mã duy nhất</label><input name="code" value="${esc(row.code || "")}" required pattern="[A-Za-z0-9_-]+"></div><div class="field"><label>Màu nhận diện</label><input type="color" name="color" value="${esc(row.color || "#0b6bcb")}"></div><div class="field"><label>Biểu tượng ký tự</label><input name="icon" value="${esc(row.icon || "•")}" maxlength="4"></div><div class="field"><label>Thứ tự</label><input type="number" name="order" value="${row.order || 99}"></div><div class="field full"><label>Mô tả</label><textarea name="description">${esc(row.description || "")}</textarea></div><label class="check-row"><input type="checkbox" name="active" ${row.active !== false ? "checked" : ""}> Đang sử dụng</label></div></form>`,
            `<button class="btn" id="cancelConfigItem">Hủy</button><button class="btn primary" id="saveConfigItem">Lưu</button>`,
          );
          $("#cancelConfigItem").onclick = closeModal;
          $("#saveConfigItem").onclick = async () => {
            const f = $("#configItemForm");
            if (!f.reportValidity()) return;
            const d = Object.fromEntries(new FormData(f)),
              all = await configItems(row.category_key, true);
            if (
              all.some(
                (x) =>
                  x.id !== id && x.code.toLowerCase() === d.code.toLowerCase(),
              )
            )
              return toast("Mã đã tồn tại trong danh mục.", "bad");
            await db.put("config_items", {
              ...row,
              ...d,
              active: !!d.active,
              order: Number(d.order || 99),
            });
            closeModal();
            toast("Đã lưu mục cấu hình");
            renderSettings();
          };
        }
        async function restoreConfigDefaults(key) {
          const def = CONFIG_DEFINITIONS.find((x) => x[0] === key);
          if (!def) return;
          const old = await configItems(key, true);
          for (const [i, label] of def[2].entries())
            if (
              !old.some((x) => normalizeText(x.label) === normalizeText(label))
            )
              await db.put("config_items", {
                category_key: key,
                code: normalizeText(label).replace(/\s+/g, "_").slice(0, 40),
                label,
                color: defaultConfigColor(i),
                icon: "•",
                active: true,
                order: i + 1,
                is_default: true,
              });
          toast("Đã bổ sung các mục mẫu còn thiếu");
          renderSettings();
        }
        async function exportAllConfig() {
          const payload = {
            format: "TPT-CONFIG-1",
            exported_at: now(),
            categories: await db.all("config_categories"),
            items: await db.all("config_items"),
            custom_fields: await db.all("custom_field_definitions"),
          };
          download(
            JSON.stringify(payload, null, 2),
            `cau-hinh-tro-ly-doi-${today()}.json`,
            "application/json",
          );
        }
        function importAllConfig() {
          $("#backupFileInput").accept = ".json,application/json";
          $("#backupFileInput").onchange = async (e) => {
            const file = e.target.files[0];
            e.target.value = "";
            if (!file) return;
            try {
              const p = JSON.parse(await file.text());
              if (p.format !== "TPT-CONFIG-1" || !Array.isArray(p.items))
                throw new Error("Không đúng tệp cấu hình.");
              const existing = await db.all("config_items"),
                fresh = p.items.filter(
                  (x) =>
                    !existing.some(
                      (y) =>
                        y.category_key === x.category_key && y.code === x.code,
                    ),
                );
              await db.bulkPut("config_items", fresh);
              toast(`Đã nhập ${fresh.length} mục cấu hình; bỏ qua mục trùng.`);
              renderSettings();
            } catch (err) {
              toast(err.message, "bad");
            }
          };
          $("#backupFileInput").click();
        }

        async function renderDocuments() {
          const allDocs = await db.allIncludingDeleted("documents"),
            folders = await db.all("document_folders"),
            attachments = await db.allIncludingDeleted("attachments"),
            trash = state.documentFolderId === "trash",
            activeFolder = trash ? null : state.documentFolderId,
            query = state.documentSearch || "",
            docs = allDocs
              .filter((d) =>
                trash
                  ? !!d.deleted_at
                  : !d.deleted_at &&
                    (activeFolder === "root" ||
                      (d.folder_id || "root") === activeFolder),
              )
              .filter(
                (d) =>
                  !query ||
                  normalizeText(
                    `${d.name} ${d.tags} ${d.description} ${d.document_no}`,
                  ).includes(normalizeText(query)),
              )
              .sort(
                (a, b) =>
                  b.pinned - a.pinned ||
                  String(b.updated_at).localeCompare(a.updated_at),
              ),
            attachMap = new Map(
              attachments
                .filter((a) => !a.deleted_at && a.status !== "archived")
                .sort((a, b) => Number(a.version || 0) - Number(b.version || 0))
                .map((a) => [a.document_id, a]),
            ),
            estimate = navigator.storage?.estimate
              ? await navigator.storage.estimate()
              : {},
            used =
              estimate.usage ||
              attachments.reduce((n, a) => n + Number(a.size || 0), 0),
            quota = estimate.quota || 0,
            pct = quota ? Math.min(100, Math.round((used / quota) * 100)) : 0;
          setContent(
            pageHead(
              "Hồ sơ – minh chứng",
              "Kho tài liệu ngoại tuyến: lưu tệp thật, thư mục, phiên bản, tìm kiếm và thùng rác.",
              `<button class="btn" id="newFolder">＋ Thư mục</button><button class="btn primary" id="uploadDocuments">＋ Tải tệp</button>`,
            ) +
              `<div class="toolbar"><input class="grow" id="documentSearch" value="${esc(query)}" placeholder="Tìm tên, số hiệu, thẻ…"><select id="documentTypeFilter"><option value="all">Tất cả loại tệp</option><option value="pdf">PDF</option><option value="image">Hình ảnh</option><option value="office">Word/Excel/PowerPoint</option></select><button class="btn small" id="toggleDocumentView">${state.documentView === "grid" ? "☷ Danh sách" : "▦ Dạng lưới"}</button><span class="muted">${docs.length} tài liệu</span></div><div class="document-layout"><aside class="folder-pane"><strong>Thư mục</strong><button class="folder-row ${activeFolder === "root" ? "active" : ""}" data-folder="root">▧ Tất cả tài liệu</button>${folders.map((f) => `<button class="folder-row ${activeFolder === f.id ? "active" : ""}" data-folder="${f.id}">▸ ${esc(f.name)}</button>`).join("")}<button class="folder-row ${trash ? "active" : ""}" data-folder="trash">♲ Thùng rác</button><hr style="border:0;border-top:1px solid var(--line)"><small class="muted">Dung lượng ước tính</small><div class="storage-meter mt"><span style="width:${pct}%"></span></div><small>${formatBytes(used)}${quota ? ` / ${formatBytes(quota)} (${pct}%)` : ""}</small><button class="btn small mt" id="requestPersistent">Bảo vệ lưu trữ</button></aside><section><div class="drop-zone ${trash ? "hidden" : ""}" id="documentDrop">Kéo thả nhiều tệp vào đây hoặc dán ảnh từ clipboard</div><div class="${state.documentView === "grid" ? "file-grid" : "table-wrap"} mt" id="documentItems">${renderDocumentItems(docs, attachMap, trash)}</div></section></div>`,
          );
          $("#documentSearch").oninput = debounce(() => {
            state.documentSearch = $("#documentSearch").value;
            renderDocuments();
          }, 220);
          $("#toggleDocumentView").onclick = () => {
            state.documentView =
              state.documentView === "grid" ? "list" : "grid";
            renderDocuments();
          };
          $$("[data-folder]").forEach(
            (b) =>
              (b.onclick = () => {
                state.documentFolderId = b.dataset.folder;
                renderDocuments();
              }),
          );
          $("#uploadDocuments").onclick = () => $("#documentFileInput").click();
          $("#documentFileInput").onchange = async (e) => {
            await saveDocumentFiles([...e.target.files]);
            e.target.value = "";
          };
          $("#newFolder").onclick = createFolder;
          const dz = $("#documentDrop");
          if (dz) {
            dz.ondragover = (e) => {
              e.preventDefault();
              dz.classList.add("drag");
            };
            dz.ondragleave = () => dz.classList.remove("drag");
            dz.ondrop = async (e) => {
              e.preventDefault();
              dz.classList.remove("drag");
              await saveDocumentFiles([...e.dataTransfer.files]);
            };
          }
          document.onpaste = async (e) => {
            if (state.page !== "documents") return;
            const files = [...(e.clipboardData?.items || [])]
              .filter((x) => x.kind === "file")
              .map((x) => x.getAsFile())
              .filter(Boolean);
            if (files.length) await saveDocumentFiles(files);
          };
          $("#requestPersistent").onclick = async () => {
            if (!navigator.storage?.persist)
              return toast(
                "Trình duyệt không hỗ trợ yêu cầu lưu bền vững.",
                "bad",
              );
            const ok = await navigator.storage.persist();
            toast(
              ok
                ? "Trình duyệt đã ưu tiên giữ dữ liệu."
                : "Chưa được cấp lưu bền vững; hãy sao lưu định kỳ.",
              ok ? "ok" : "bad",
            );
          };
          bindDocumentActions(trash);
        }
        function renderDocumentItems(docs, attachMap, trash) {
          if (!docs.length)
            return '<div class="empty">Chưa có tài liệu phù hợp.</div>';
          if (state.documentView === "list")
            return `<table><thead><tr><th>Tên tài liệu</th><th>Loại</th><th>Dung lượng</th><th>Cập nhật</th><th>Thao tác</th></tr></thead><tbody>${docs
              .map((d) => {
                const a = attachMap.get(d.id);
                return `<tr><td class="wrap"><strong>${esc(d.name)}</strong><br><small>${esc(d.tags || "")}</small></td><td>${esc(a?.extension || d.type || "—")}</td><td>${formatBytes(a?.size || 0)}</td><td>${fmtDateTime(d.updated_at)}</td><td>${documentActions(d, trash)}</td></tr>`;
              })
              .join("")}</tbody></table>`;
          return docs
            .map((d) => {
              const a = attachMap.get(d.id);
              return `<article class="file-card"><span class="file-icon">${fileIcon(a?.extension)}</span><strong class="file-name" title="${esc(d.name)}">${d.pinned ? "★ " : ""}${esc(d.name)}</strong><small>${esc((a?.extension || d.type || "Tệp").toUpperCase())} • ${formatBytes(a?.size || 0)}</small><div class="row-actions mt">${documentActions(d, trash)}</div></article>`;
            })
            .join("");
        }
        function documentActions(d, trash) {
          return trash
            ? `<button class="link-btn" data-doc-restore="${d.id}">Khôi phục</button><button class="link-btn red" data-doc-purge="${d.id}">Xóa vĩnh viễn</button>`
            : `<button class="link-btn" data-doc-open="${d.id}">Mở</button><button class="link-btn" data-doc-edit="${d.id}">Sửa</button><button class="link-btn red" data-doc-delete="${d.id}">Xóa</button>`;
        }
        function bindDocumentActions(trash) {
          $$("[data-doc-open]").forEach(
            (b) => (b.onclick = () => openDocument(b.dataset.docOpen)),
          );
          $$("[data-doc-edit]").forEach(
            (b) => (b.onclick = () => editDocument(b.dataset.docEdit)),
          );
          $$("[data-doc-delete]").forEach(
            (b) =>
              (b.onclick = async () => {
                await db.remove("documents", b.dataset.docDelete);
                const related = (
                  await db.allIncludingDeleted("attachments")
                ).filter((x) => x.document_id === b.dataset.docDelete);
                for (const a of related) await db.remove("attachments", a.id);
                toast("Đã chuyển vào Thùng rác");
                renderDocuments();
              }),
          );
          $$("[data-doc-restore]").forEach(
            (b) =>
              (b.onclick = async () => {
                const d = await db.get("documents", b.dataset.docRestore);
                await db.put("documents", { ...d, deleted_at: null });
                const related = (
                  await db.allIncludingDeleted("attachments")
                ).filter((x) => x.document_id === d.id);
                for (const a of related)
                  await db.put("attachments", { ...a, deleted_at: null });
                toast("Đã khôi phục tài liệu");
                renderDocuments();
              }),
          );
          $$("[data-doc-purge]").forEach(
            (b) =>
              (b.onclick = async () => {
                if (
                  !confirm(
                    "Xóa vĩnh viễn tài liệu và các tệp liên quan khỏi máy chủ?",
                  )
                )
                  return;
                const id = b.dataset.docPurge,
                  related = (
                    await db.allIncludingDeleted("attachments")
                  ).filter((x) => x.document_id === id),
                  links = (
                    await db.allIncludingDeleted("document_links")
                  ).filter((x) => x.document_id === id),
                  versions = (
                    await db.allIncludingDeleted("file_versions")
                  ).filter((x) => x.document_id === id);
                await hardDelete("documents", id);
                for (const a of related) await hardDelete("attachments", a.id);
                for (const link of links)
                  await hardDelete("document_links", link.id);
                for (const version of versions)
                  await hardDelete("file_versions", version.id);
                toast("Đã xóa tài liệu và các tệp liên quan.");
                renderDocuments();
              }),
          );
        }
        async function hardDelete(store, id) {
          const row = await db.get(store, id);
          if (!row) return false;
          await db.put(store, {
            ...row,
            deleted_at: row.deleted_at || now(),
            purge_requested_at: now(),
          });
          return true;
        }
        async function saveDocumentFiles(files) {
          if (!files.length) return;
          const limitMb = Number(await setting("max_file_mb")) || 25,
            allowed = /\.(pdf|docx?|xlsx?|pptx?|txt|csv|png|jpe?g|webp|zip)$/i;
          let saved = 0;
          for (const file of files) {
            const clean = file.name
              .replace(/[\\/:*?"<>|\x00-\x1F]/g, "_")
              .slice(0, 180);
            if (!allowed.test(clean)) {
              toast(`Không hỗ trợ tệp ${clean}.`, "bad");
              continue;
            }
            if (file.size > limitMb * 1048576) {
              toast(`${clean} vượt giới hạn ${limitMb} MB.`, "bad");
              continue;
            }
            const checksum = await sha256Blob(file),
              dup = (await db.allIncludingDeleted("attachments")).find(
                (x) => x.sha256 === checksum && !x.deleted_at,
              );
            if (
              dup &&
              !confirm(
                `${clean} trùng nội dung với tệp đã lưu. Chọn OK để giữ thêm một bản.`,
              )
            )
              continue;
            const ext = clean.split(".").pop().toLowerCase(),
              doc = await db.put("documents", {
                name: clean.replace(/\.[^.]+$/, ""),
                type: ext,
                folder_id:
                  state.documentFolderId === "root"
                    ? "root"
                    : state.documentFolderId,
                tags: "",
                description: "",
                status: "approved",
                school_year_id: state.yearId,
                campus_id: state.campusId,
                pinned: false,
                file_version: 1,
              });
            const attachment = await db.put("attachments", {
              document_id: doc.id,
              original_name: clean,
              display_name: clean,
              mime_type: file.type || "application/octet-stream",
              extension: ext,
              size: file.size,
              sha256: checksum,
              blob: file,
              version: 1,
              status: "active",
            });
            await db.put("file_versions", {
              document_id: doc.id,
              attachment_id: attachment.id,
              version: 1,
              sha256: checksum,
              size: file.size,
              note: "Phiên bản đầu",
            });
            saved++;
          }
          toast(`Đã lưu ${saved}/${files.length} tệp trên máy chủ`);
          renderDocuments();
        }
        async function openDocument(id) {
          const doc = await db.get("documents", id),
            a = (await db.allIncludingDeleted("attachments"))
              .filter(
                (x) =>
                  x.document_id === id &&
                  !x.deleted_at &&
                  x.status !== "archived",
              )
              .sort(
                (x, y) => Number(y.version || 0) - Number(x.version || 0),
              )[0],
            links = (await db.all("document_links")).filter(
              (x) => x.document_id === id,
            );
          if (!a?.blob) return toast("Không tìm thấy dữ liệu tệp.", "bad");
          const url = URL.createObjectURL(a.blob),
            previewable =
              a.mime_type.startsWith("image/") ||
              a.mime_type === "application/pdf" ||
              a.mime_type.startsWith("text/");
          openModal(
            doc.name,
            previewable
              ? a.mime_type.startsWith("image/")
                ? `<img src="${url}" alt="${esc(doc.name)}" style="max-width:100%;max-height:65vh;display:block;margin:auto">`
                : a.mime_type === "application/pdf"
                  ? `<iframe src="${url}" title="Xem trước ${esc(doc.name)}" style="width:100%;height:65vh;border:0"></iframe>`
                  : `<pre id="textPreview" style="white-space:pre-wrap;max-height:60vh;overflow:auto"></pre>`
              : `<div class="notice">Trình duyệt không xem trực tiếp định dạng ${esc(a.extension.toUpperCase())}. Hãy tải xuống và mở bằng ứng dụng phù hợp.</div><p><strong>${esc(a.original_name)}</strong><br>${formatBytes(a.size)} • SHA-256: <code>${esc(a.sha256)}</code></p>` +
                  (links.length
                    ? `<div class="notice mt"><strong>Liên kết:</strong> ${links.map((x) => `${esc(x.related_module)} · ${esc(x.related_record_id || "không chỉ định")}`).join("; ")}</div>`
                    : ""),
            `<button class="btn" id="replaceDoc">Thay phiên bản</button><button class="btn" id="downloadDoc">Tải xuống</button><button class="btn primary" id="closeDoc">Đóng</button>`,
            true,
          );
          if (links.length && previewable)
            $("#modalBody").insertAdjacentHTML(
              "beforeend",
              `<div class="notice mt"><strong>Liên kết:</strong> ${links.map((x) => `${esc(x.related_module)} · ${esc(x.related_record_id || "không chỉ định")}`).join("; ")}</div>`,
            );
          const versionFiles = (await db.allIncludingDeleted("attachments"))
            .filter((x) => x.document_id === id && !x.deleted_at)
            .sort((x, y) => Number(y.version || 0) - Number(x.version || 0));
          if (versionFiles.length > 1)
            $("#modalBody").insertAdjacentHTML(
              "beforeend",
              `<div class="card mt"><div class="card-head"><h2>Lịch sử phiên bản</h2><span class="meta">${versionFiles.length} phiên bản</span></div><div class="card-body">${versionFiles.map((x) => `<div class="split"><span>v${x.version} · ${esc(x.original_name)} · ${formatBytes(x.size)}</span><button class="link-btn" data-version-download="${x.id}">Tải bản này</button></div>`).join("")}</div></div>`,
            );
          $$("[data-version-download]").forEach(
            (b) =>
              (b.onclick = () => {
                const old = versionFiles.find(
                  (x) => x.id === b.dataset.versionDownload,
                );
                if (old?.blob)
                  download(
                    old.blob,
                    `v${old.version}-${old.original_name}`,
                    old.mime_type,
                  );
              }),
          );
          if (a.mime_type.startsWith("text/"))
            a.blob.text().then((text) => {
              if ($("#textPreview"))
                $("#textPreview").textContent = text.slice(0, 200000);
            });
          $("#downloadDoc").onclick = () =>
            download(a.blob, a.original_name, a.mime_type);
          $("#replaceDoc").onclick = () => replaceDocumentVersion(id);
          $("#closeDoc").onclick = () => {
            URL.revokeObjectURL(url);
            closeModal();
          };
          const close = $("#modalClose").onclick;
          $("#modalClose").onclick = () => {
            URL.revokeObjectURL(url);
            closeModal();
            $("#modalClose").onclick = close;
          };
        }
        async function replaceDocumentVersion(documentId) {
          const input = $("#versionFileInput");
          input.onchange = async (e) => {
            const file = e.target.files[0];
            e.target.value = "";
            if (!file) return;
            try {
              const limitMb = Number(await setting("max_file_mb")) || 25;
              if (file.size > limitMb * 1048576)
                throw new Error(`Tệp vượt giới hạn ${limitMb} MB.`);
              if (
                !/\.(pdf|docx?|xlsx?|pptx?|txt|csv|png|jpe?g|webp|zip)$/i.test(
                  file.name,
                )
              )
                throw new Error("Định dạng tệp chưa được hỗ trợ.");
              const all = (await db.allIncludingDeleted("attachments")).filter(
                  (x) => x.document_id === documentId,
                ),
                active = all
                  .filter((x) => !x.deleted_at && x.status !== "archived")
                  .sort(
                    (a, b) => Number(b.version || 0) - Number(a.version || 0),
                  )[0],
                checksum = await sha256Blob(file);
              if (active?.sha256 === checksum)
                throw new Error(
                  "Tệp mới trùng hoàn toàn với phiên bản hiện tại.",
                );
              const version =
                Math.max(0, ...all.map((x) => Number(x.version || 0))) + 1;
              if (active)
                await db.put("attachments", { ...active, status: "archived" });
              const clean = file.name
                  .replace(/[\\/:*?"<>|\x00-\x1F]/g, "_")
                  .slice(0, 180),
                ext = clean.split(".").pop().toLowerCase(),
                attachment = await db.put("attachments", {
                  document_id: documentId,
                  original_name: clean,
                  display_name: clean,
                  mime_type: file.type || "application/octet-stream",
                  extension: ext,
                  size: file.size,
                  sha256: checksum,
                  blob: file,
                  version,
                  status: "active",
                });
              await db.put("file_versions", {
                document_id: documentId,
                attachment_id: attachment.id,
                version,
                sha256: checksum,
                size: file.size,
                note: `Thay phiên bản ${version}`,
              });
              const doc = await db.get("documents", documentId);
              await db.put("documents", {
                ...doc,
                type: ext,
                file_version: version,
              });
              closeModal();
              toast(
                `Đã lưu phiên bản ${version}; phiên bản cũ vẫn được bảo toàn.`,
              );
              renderDocuments();
            } catch (err) {
              toast(err.message, "bad");
            }
          };
          input.click();
        }
        async function editDocument(id) {
          const d = await db.get("documents", id),
            folders = await db.all("document_folders"),
            customDefs = await customFieldDefs("documents"),
            links = (await db.all("document_links")).filter(
              (x) => x.document_id === id,
            );
          openModal(
            "Cập nhật tài liệu",
            `<form id="documentEditForm"><div class="form-grid"><div class="field full"><label class="required">Tên hiển thị</label><input name="name" value="${esc(d.name)}" required></div><div class="field"><label>Thư mục</label><select name="folder_id"><option value="root">Tất cả tài liệu</option>${folders.map((f) => `<option value="${f.id}" ${d.folder_id === f.id ? "selected" : ""}>${esc(f.name)}</option>`).join("")}</select></div><div class="field"><label>Ngày văn bản</label><input type="date" name="date" value="${esc(d.date || "")}"></div><div class="field"><label>Số hiệu</label><input name="document_no" value="${esc(d.document_no || "")}"></div><div class="field"><label>Đơn vị ban hành</label><input name="issuer" value="${esc(d.issuer || "")}"></div><div class="field full"><label>Thẻ, cách nhau bằng dấu phẩy</label><input name="tags" value="${esc(d.tags || "")}"></div><div class="field full"><label>Mô tả</label><textarea name="description">${esc(d.description || "")}</textarea></div><div class="field full"><label>Liên kết phân hệ/bản ghi (mỗi dòng: phân_hệ | ID tùy chọn)</label><textarea name="related_links" placeholder="plans | ID-kế-hoạch\ntasks | ID-công-việc">${esc(links.map((x) => `${x.related_module} | ${x.related_record_id || ""}`).join("\n"))}</textarea><small>Hợp lệ: plans, tasks, calendar, activities, scores, commendations, programs, equipment, reports.</small></div><label class="check-row"><input type="checkbox" name="pinned" ${d.pinned ? "checked" : ""}> Ghim tài liệu</label>${renderCustomInputs(customDefs, d.custom_values)}</div></form>`,
            `<button class="btn" id="cancelDocEdit">Hủy</button><button class="btn primary" id="saveDocEdit">Lưu</button>`,
          );
          $("#cancelDocEdit").onclick = closeModal;
          $("#saveDocEdit").onclick = async () => {
            const f = $("#documentEditForm");
            if (!f.reportValidity()) return;
            const fd = new FormData(f),
              data = Object.fromEntries(fd);
            data.custom_values = collectCustomValues(fd, customDefs);
            const allowedModules = new Set([
                "plans",
                "tasks",
                "calendar",
                "activities",
                "scores",
                "commendations",
                "programs",
                "equipment",
                "reports",
              ]),
              relatedLinks = String(data.related_links || "")
                .split("\n")
                .map((x) => x.split("|").map((y) => y.trim()))
                .filter((x) => allowedModules.has(x[0]));
            delete data.related_links;
            await db.put("documents", { ...d, ...data, pinned: !!data.pinned });
            for (const old of links) await db.remove("document_links", old.id);
            for (const [relatedModule, relatedRecordId] of relatedLinks)
              await db.put("document_links", {
                document_id: id,
                related_module: relatedModule,
                related_record_id: relatedRecordId || null,
              });
            closeModal();
            toast("Đã cập nhật tài liệu");
            renderDocuments();
          };
        }
        async function createFolder() {
          const folders = await db.all("document_folders");
          openModal(
            "Tạo thư mục",
            `<form id="folderForm"><div class="field"><label class="required">Tên thư mục</label><input name="name" required maxlength="80"></div><div class="field mt"><label>Thư mục cha</label><select name="parent_id"><option value="root">Thư mục gốc</option>${folders.map((x) => `<option value="${x.id}" ${state.documentFolderId === x.id ? "selected" : ""}>${esc(x.name)}</option>`).join("")}</select></div></form>`,
            `<button class="btn" id="cancelFolder">Hủy</button><button class="btn primary" id="saveFolder">Tạo</button>`,
          );
          $("#cancelFolder").onclick = closeModal;
          $("#saveFolder").onclick = async () => {
            const f = $("#folderForm");
            if (!f.reportValidity()) return;
            const d = Object.fromEntries(new FormData(f));
            const dup = (await db.all("document_folders")).some(
              (x) =>
                normalizeText(x.name) === normalizeText(d.name) &&
                x.parent_id === d.parent_id,
            );
            if (dup) return toast("Tên thư mục đã tồn tại cùng cấp.", "bad");
            await db.put("document_folders", { ...d, active: true });
            closeModal();
            toast("Đã tạo thư mục");
            renderDocuments();
          };
        }
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

        const CONFIG_DEFINITIONS = [
          [
            "plan_type",
            "Loại kế hoạch",
            ["Năm học", "Học kỳ", "Tháng", "Tuần", "Chuyên đề"],
          ],
          [
            "plan_level",
            "Cấp kế hoạch",
            ["Toàn trường", "Liên đội", "Chi đội", "Cơ sở"],
          ],
          [
            "plan_status",
            "Trạng thái kế hoạch",
            ["Dự thảo", "Đang thực hiện", "Đã kết thúc"],
          ],
          [
            "activity_type",
            "Loại hoạt động",
            [
              "Giáo dục truyền thống – đạo đức",
              "Học tập – sáng tạo",
              "Kỹ năng sống – an toàn",
              "Văn nghệ – thể thao",
              "Môi trường",
              "Tình nguyện – nhân đạo",
              "Rèn luyện đội viên",
              "Xây dựng tổ chức Đội",
              "Hoạt động theo chủ điểm",
              "Hoạt động phối hợp",
            ],
          ],
          [
            "task_group",
            "Nhóm công việc",
            ["Tuần", "Tháng", "Học kỳ", "Năm học", "Đột xuất"],
          ],
          [
            "task_status",
            "Trạng thái công việc",
            [
              "Chưa làm",
              "Đang làm",
              "Chờ phối hợp",
              "Chờ duyệt",
              "Hoàn thành",
              "Tạm dừng",
            ],
          ],
          ["priority", "Mức ưu tiên", ["Thấp", "Bình thường", "Cao", "Khẩn"]],
          [
            "calendar_type",
            "Loại sự kiện lịch",
            ["Hoạt động Đội", "Họp", "Tập huấn", "Hạn hồ sơ", "Thi đua"],
          ],
          [
            "document_type",
            "Loại hồ sơ",
            [
              "Kế hoạch",
              "Hoạt động",
              "Thi đua",
              "Tổ chức Đội",
              "Rèn luyện",
              "Khen thưởng",
              "Báo cáo",
              "Thiết bị",
            ],
          ],
          [
            "document_status",
            "Trạng thái hồ sơ",
            ["Bản nháp", "Đã xác nhận", "Lưu trữ"],
          ],
          [
            "team_group",
            "Nhóm tổ chức/đội/ban",
            [
              "Ban Chỉ huy Liên đội",
              "Ban Chỉ huy Chi đội",
              "Đội nghi lễ",
              "Phát thanh măng non",
              "Đội tự quản",
              "Câu lạc bộ",
            ],
          ],
          [
            "team_position",
            "Chức vụ",
            [
              "Liên đội trưởng",
              "Liên đội phó",
              "Chi đội trưởng",
              "Chi đội phó",
              "Ủy viên",
            ],
          ],
          [
            "program_type",
            "Loại chương trình rèn luyện",
            [
              "Rèn luyện đội viên",
              "Chuyên hiệu",
              "Công trình măng non",
              "Việc tốt",
            ],
          ],
          [
            "specialty",
            "Chuyên hiệu",
            [
              "An toàn giao thông",
              "Chăm học",
              "Nghệ sĩ nhỏ tuổi",
              "Nhà sinh học nhỏ tuổi",
            ],
          ],
          [
            "award_type",
            "Loại khen thưởng",
            ["Giấy khen", "Tuyên dương", "Chứng nhận", "Phần thưởng"],
          ],
          [
            "award_level",
            "Cấp khen thưởng",
            ["Chi đội", "Liên đội", "Nhà trường", "Cấp trên"],
          ],
          [
            "equipment_group",
            "Nhóm thiết bị",
            ["Nghi lễ", "Âm thanh", "Trang trí", "Thể thao", "Văn phòng"],
          ],
          [
            "equipment_condition",
            "Tình trạng thiết bị",
            ["Tốt", "Cần sửa", "Hỏng", "Đang mượn"],
          ],
          ["unit", "Đơn vị tính", ["Cái", "Bộ", "Chiếc", "Hộp", "Cuộn"]],
          [
            "report_type",
            "Loại báo cáo",
            [
              "Công tác tuần",
              "Thi đua tuần",
              "Công việc",
              "Hoạt động",
              "Thiết bị",
              "Hồ sơ",
            ],
          ],
          [
            "report_template",
            "Mẫu báo cáo",
            ["Mẫu ngắn", "Mẫu đầy đủ", "Bảng tổng hợp"],
          ],
        ];
        async function migrateEnhancedData() {
          if (await setting("migration_9_completed")) return;
          const operation = await startOperation("schema_migration", {
            from_schema: Number(db.upgradedFrom ?? 7),
            to_schema: APP.schema,
          });
          try {
            const existing = await db.all("config_categories");
            if (!existing.length) {
              for (const [key, name, values] of CONFIG_DEFINITIONS) {
                const category = await db.put(
                  "config_categories",
                  {
                    key,
                    name,
                    active: true,
                    order:
                      CONFIG_DEFINITIONS.findIndex((x) => x[0] === key) + 1,
                  },
                  { audit: false },
                );
                await db.bulkPut(
                  "config_items",
                  values.map((label, order) => ({
                    id: uid(),
                    category_id: category.id,
                    category_key: key,
                    code: normalizeText(label)
                      .replace(/\s+/g, "_")
                      .slice(0, 40),
                    label,
                    color: defaultConfigColor(order),
                    icon: "•",
                    active: true,
                    order: order + 1,
                    is_default: true,
                  })),
                );
              }
            }
            if (!(await db.all("document_folders")).length) {
              await db.bulkPut(
                "document_folders",
                [
                  "Kế hoạch",
                  "Công việc",
                  "Hoạt động",
                  "Thi đua",
                  "Tổ chức Liên đội",
                  "Rèn luyện – phong trào",
                  "Khen thưởng",
                  "Báo cáo",
                  "Thiết bị",
                ].map((name, order) => ({
                  id: uid(),
                  name,
                  parent_id: "root",
                  order: order + 1,
                  active: true,
                  system: true,
                })),
              );
            }
            let normalizedCount = 0;
            for (const store of STORES) {
              if (
                [
                  "internal_snapshots",
                  "operation_journal",
                  "form_drafts",
                  "restore_staging",
                ].includes(store)
              )
                continue;
              const rows = await db.allIncludingDeleted(store),
                changed = rows.filter(
                  (row) =>
                    !row.school_profile_id ||
                    ((row.school_year_id || row.academic_year_id) &&
                      (!row.school_year_id || !row.academic_year_id)) ||
                    !row.created_at ||
                    !row.updated_at ||
                    !Number(row.revision) ||
                    !row.device_id,
                );
              if (changed.length) {
                await db.bulkPut(
                  store,
                  changed.map((row) => ({
                    ...row,
                    school_profile_id:
                      row.school_profile_id || APP.schoolProfileId,
                    ...(row.school_year_id || row.academic_year_id
                      ? {
                          school_year_id:
                            row.school_year_id || row.academic_year_id,
                          academic_year_id:
                            row.academic_year_id || row.school_year_id,
                        }
                      : {}),
                    created_at: row.created_at || row.updated_at || now(),
                    updated_at: row.updated_at || row.created_at || now(),
                    revision: Number(row.revision || 1),
                    source: row.source || "migration-v8",
                  })),
                  { preserveMetadata: true },
                );
                normalizedCount += changed.length;
              }
            }
            await db.put(
              "migration_logs",
              {
                from_schema: Number(db.upgradedFrom ?? 7),
                to_schema: APP.schema,
                status: "success",
                normalized_records: normalizedCount,
                summary: `Chuẩn hóa ${normalizedCount} bản ghi với hồ sơ trường, năm học, revision và nguồn; giữ nguyên ID.`,
              },
              { audit: false },
            );
            await setting("migration_9_completed", true);
            await createInternalSnapshot("Sau nâng cấp lược đồ 9", {
              tier: "protected",
              protectedSnapshot: true,
              reason: "migration-to-9",
            });
            await finishOperation(operation, "completed", {
              normalized_records: normalizedCount,
            });
          } catch (error) {
            try {
              await db.put(
                "migration_logs",
                {
                  from_schema: Number(db.upgradedFrom ?? 7),
                  to_schema: APP.schema,
                  status: "failed",
                  summary: error.message,
                },
                { audit: false },
              );
            } catch (_) {}
            await finishOperation(operation, "failed", {
              error: error.message,
            }).catch(() => {});
            throw new Error("Nâng cấp dữ liệu chưa hoàn tất: " + error.message);
          }
        }

        async function ensureStorageProtection() {
          if (!navigator.storage) return;
          try {
            const estimate = await navigator.storage.estimate(),
              ratio = estimate.quota ? estimate.usage / estimate.quota : 0,
              low = Number(await setting("storage_warning_low")) || 70,
              high = Number(await setting("storage_warning_high")) || 85,
              critical =
                Number(await setting("storage_warning_critical")) || 95,
              percent = Math.round(ratio * 100);
            await setting("storage_last_estimate", {
              usage: estimate.usage || 0,
              quota: estimate.quota || 0,
              checked_at: now(),
            });
            if (
              navigator.storage.persist &&
              !(await navigator.storage.persisted())
            )
              await navigator.storage.persist();
            if (percent >= low)
              toast(
                percent >= critical
                  ? `Dung lượng cục bộ đã dùng ${percent}% – mức nguy cấp. Hãy sao lưu đầy đủ và dọn tệp ngay.`
                  : percent >= high
                    ? `Dung lượng cục bộ đã dùng ${percent}% – mức cao. Hãy tạo sao lưu đầy đủ.`
                    : `Dung lượng cục bộ đã dùng ${percent}%. Nên kiểm tra và sao lưu định kỳ.`,
                "bad",
              );
          } catch (_) {}
        }

        const stableJSON = (value) => {
          if (Array.isArray(value))
            return `[${value.map(stableJSON).join(",")}]`;
          if (value && typeof value === "object" && !(value instanceof Blob))
            return `{${Object.keys(value)
              .sort()
              .map((key) => `${JSON.stringify(key)}:${stableJSON(value[key])}`)
              .join(",")}}`;
          return JSON.stringify(value);
        };
        async function sha256Text(text) {
          const hash = await crypto.subtle.digest(
            "SHA-256",
            new TextEncoder().encode(text),
          );
          return [...new Uint8Array(hash)]
            .map((x) => x.toString(16).padStart(2, "0"))
            .join("");
        }
        async function snapshotPayload(yearId = null) {
          const data = {},
            counts = {};
          for (const store of STORES) {
            if (SNAPSHOT_EXCLUDED_STORES.has(store)) continue;
            let rows = await db.allIncludingDeleted(store);
            if (yearId)
              rows = rows.filter(
                (row) => !row.school_year_id || row.school_year_id === yearId,
              );
            data[store] = rows.map(({ blob, ...row }) => row);
            counts[store] = data[store].length;
          }
          return { data, counts };
        }
        async function createInternalSnapshot(
          name,
          {
            tier = "manual",
            protectedSnapshot = false,
            reason = "manual",
            yearId = null,
          } = {},
        ) {
          tabCoordinator.assertWritable();
          const payload = await snapshotPayload(yearId),
            serialized = stableJSON(payload.data),
            checksum = await sha256Text(serialized),
            snapshot = await db.put(
              "internal_snapshots",
              {
                name,
                tier,
                protected: protectedSnapshot,
                reason,
                school_year_id: yearId || null,
                schema: APP.schema,
                app_id: APP.appId,
                school_profile_id: APP.schoolProfileId,
                counts: payload.counts,
                record_count: Object.values(payload.counts).reduce(
                  (sum, count) => sum + count,
                  0,
                ),
                checksum,
                payload: payload.data,
                created_at: now(),
              },
              { audit: false, journal: true },
            );
          await pruneSnapshots();
          return snapshot;
        }
        async function pruneSnapshots() {
          const retention = {
              daily: Number(await setting("snapshot_daily")) || 7,
              weekly: Number(await setting("snapshot_weekly")) || 4,
              monthly: Number(await setting("snapshot_monthly")) || 12,
            },
            rows = (await db.all("internal_snapshots")).sort((a, b) =>
              String(b.created_at).localeCompare(String(a.created_at)),
            );
          for (const tier of Object.keys(retention)) {
            const removable = rows
              .filter((row) => row.tier === tier && !row.protected)
              .slice(retention[tier]);
            for (const row of removable)
              await db.hardDelete("internal_snapshots", row.id);
          }
        }
        async function ensureScheduledSnapshots() {
          const rows = await db.all("internal_snapshots"),
            hasSince = (tier, days) =>
              rows.some(
                (row) =>
                  row.tier === tier &&
                  Date.now() - Date.parse(row.created_at) < days * 86400000,
              );
          if (!hasSince("daily", 1))
            await createInternalSnapshot("Tự động hằng ngày", {
              tier: "daily",
              reason: "scheduled",
            });
          if (!hasSince("weekly", 7))
            await createInternalSnapshot("Tự động hằng tuần", {
              tier: "weekly",
              reason: "scheduled",
            });
          if (!hasSince("monthly", 28))
            await createInternalSnapshot("Tự động hằng tháng", {
              tier: "monthly",
              reason: "scheduled",
            });
        }
        async function ensureScheduledDirectoryBackup() {
          if (!(await setting("backup_directory_auto"))) return;
          const [directoryRecord] = await db.all("backup_handles"),
            last = await setting("last_directory_backup_at");
          if (
            !directoryRecord?.handle ||
            (last && Date.now() - Date.parse(last) < 86400000) ||
            !(await platform.permission(directoryRecord.handle, false))
          )
            return;
          try {
            const payload = await exportBusinessData(false),
              text = JSON.stringify(payload),
              blob = new Blob([text], { type: "application/json" }),
              fileName = `tro-ly-doi-tu-dong-${today()}.json`;
            await platform.writeFile(
              directoryRecord.handle,
              fileName,
              blob,
              false,
            );
            await db.put(
              "backup_records",
              {
                name: fileName,
                scope: "quick",
                destination: "directory",
                scheduled_while_open: true,
                encrypted: false,
                size: blob.size,
                checksum: await sha256Text(text),
                status: "completed",
                completed_at: now(),
              },
              { audit: false },
            );
            await setting("last_directory_backup_at", now());
          } catch (error) {
            console.warn("Scheduled directory backup skipped:", error);
          }
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
        async function configItems(key, includeInactive = false) {
          return (await db.all("config_items"))
            .filter(
              (x) =>
                x.category_key === key &&
                (includeInactive || x.active !== false),
            )
            .sort((a, b) => (a.order || 0) - (b.order || 0));
        }
        async function exportBusinessData(
          includeFiles = false,
          yearId = null,
          signal = null,
          onProgress = () => {},
        ) {
          const data = {},
            files = [],
            fileMetadata = [],
            stores = STORES.filter(
              (store) => !EXTERNAL_BACKUP_EXCLUDED_STORES.has(store),
            );
          let storeIndex = 0;
          for (const store of stores) {
            if (signal?.aborted) throw new DOMException("Đã hủy", "AbortError");
            let rows = await db.allIncludingDeleted(store);
            if (yearId)
              rows = rows.filter(
                (row) => !row.school_year_id || row.school_year_id === yearId,
              );
            if (store === "attachments") {
              data[store] = rows.map(({ blob, ...meta }) => meta);
              if (includeFiles)
                for (let index = 0; index < rows.length; index++) {
                  if (signal?.aborted)
                    throw new DOMException("Đã hủy", "AbortError");
                  const row = rows[index];
                  if (row.blob instanceof Blob)
                    files.push({
                      id: row.id,
                      name: row.original_name || row.name,
                      type: row.mime_type || row.blob.type,
                      size: row.blob.size,
                      sha256: row.sha256 || (await sha256Blob(row.blob)),
                      data: await blobToBase64(row.blob, signal, (ratio) =>
                        onProgress({
                          phase: "files",
                          ratio: rows.length
                            ? (index + ratio) / rows.length
                            : 1,
                        }),
                      ),
                    });
                  fileMetadata.push({
                    id: row.id,
                    name: row.original_name || row.name,
                    type: row.mime_type || row.blob?.type || "",
                    size: Number(row.size || row.blob?.size || 0),
                    sha256: row.sha256 || "",
                    included: includeFiles && row.blob instanceof Blob,
                  });
                }
            } else data[store] = rows;
            storeIndex++;
            onProgress({ phase: "records", ratio: storeIndex / stores.length });
            await new Promise((resolve) => setTimeout(resolve, 0));
          }
          const payloadChecksum = await sha256Text(stableJSON(data)),
            exportedAt = now();
          return {
            app: APP.name,
            app_id: APP.appId,
            school_profile_id: APP.schoolProfileId,
            format: APP.backupFormat,
            scope: yearId ? "academic-year" : includeFiles ? "full" : "quick",
            version: APP.version,
            schema: APP.schema,
            build_id: APP.buildId,
            exported_at: exportedAt,
            includes_attachments: includeFiles,
            manifest: {
              app_id: APP.appId,
              school_profile_id: APP.schoolProfileId,
              device_id: DEVICE_ID,
              academic_year_id: yearId,
              exported_at: exportedAt,
              source_checksum: payloadChecksum,
              record_count: Object.values(data).reduce(
                (n, rows) => n + rows.length,
                0,
              ),
              file_count: files.length,
              total_file_bytes: files.reduce((n, x) => n + x.size, 0),
              file_metadata: fileMetadata,
            },
            data,
            files,
          };
        }
        async function sha256Blob(blob) {
          if (typeof Worker !== "undefined" && blob.size > 2 * 1024 * 1024) {
            const workerSource = `self.onmessage=async(event)=>{try{const hash=await crypto.subtle.digest("SHA-256",await event.data.arrayBuffer());const text=[...new Uint8Array(hash)].map(x=>x.toString(16).padStart(2,"0")).join("");self.postMessage({text})}catch(error){self.postMessage({error:error.message})}}`,
              workerUrl = URL.createObjectURL(
                new Blob([workerSource], { type: "text/javascript" }),
              );
            try {
              return await new Promise((resolve, reject) => {
                const worker = new Worker(workerUrl);
                worker.onmessage = (event) => {
                  worker.terminate();
                  if (event.data?.error)
                    reject(new Error(event.data.error));
                  else resolve(event.data.text);
                };
                worker.onerror = (event) => {
                  worker.terminate();
                  reject(new Error(event.message || "Không thể băm tệp."));
                };
                worker.postMessage(blob);
              });
            } finally {
              URL.revokeObjectURL(workerUrl);
            }
          }
          const hash = await crypto.subtle.digest(
            "SHA-256",
            await blob.arrayBuffer(),
          );
          return [...new Uint8Array(hash)]
            .map((x) => x.toString(16).padStart(2, "0"))
            .join("");
        }
        async function blobToBase64(
          blob,
          signal = null,
          onProgress = () => {},
        ) {
          const chunkSize = 3 * 1024 * 1024,
            chunks = [];
          for (let offset = 0; offset < blob.size; offset += chunkSize) {
            if (signal?.aborted) throw new DOMException("Đã hủy", "AbortError");
            const bytes = new Uint8Array(
                await blob.slice(offset, offset + chunkSize).arrayBuffer(),
              ),
              batchSize = 32768;
            let binary = "";
            for (let i = 0; i < bytes.length; i += batchSize)
              binary += String.fromCharCode(
                ...bytes.subarray(i, i + batchSize),
              );
            chunks.push(btoa(binary));
            onProgress(Math.min(1, (offset + bytes.length) / blob.size));
            await new Promise((resolve) => setTimeout(resolve, 0));
          }
          return chunks.join("");
        }
        function base64ToBlob(data, type) {
          const parts = [],
            slice = 32768;
          for (let i = 0; i < data.length; i += slice) {
            const binary = atob(data.slice(i, i + slice)),
              bytes = new Uint8Array(binary.length);
            for (let j = 0; j < binary.length; j++)
              bytes[j] = binary.charCodeAt(j);
            parts.push(bytes);
          }
          return new Blob(parts, { type: type || "application/octet-stream" });
        }

        boot();
      })();
