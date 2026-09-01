import { hasPermission } from "./auth.js";

const MAX_BODY_BYTES = 100 * 1024 * 1024;
const DASHBOARD_STORES = new Set([
  "app_settings",
  "calendar_events",
  "campuses",
  "classes",
  "criteria",
  "criteria_sets",
  "school_weeks",
  "school_years",
  "score_entries",
  "semesters",
  "schools",
  "tasks",
  "weekly_score_sheets",
]);

const sendJson = (response, status, value) => {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(value));
};

const readJson = (request) =>
  new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        const error = new Error("Request body is too large.");
        error.status = 413;
        reject(error);
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {});
      } catch (_) {
        const error = new Error("Invalid JSON body.");
        error.status = 400;
        reject(error);
      }
    });
    request.on("error", reject);
  });

const forbidden = (response) =>
  sendJson(response, 403, { error: "Tài khoản không có quyền thực hiện thao tác này." });

const sessionUser = (user, school) => ({
  ...user,
  selectedSchoolId: school.id,
  selectedSchoolName: school.name,
});

const canReadStore = (user, store) =>
  store === "score_grader_assignments" ||
  ["superadmin", "admin"].includes(user.role) ||
  hasPermission(user, `store:${store}:read`) ||
  (hasPermission(user, "dashboard") && DASHBOARD_STORES.has(store));

const canWriteStore = (user, store) =>
  ["superadmin", "admin"].includes(user.role) ||
  hasPermission(user, `store:${store}:write`);

const isManager = (user) => ["superadmin", "admin"].includes(user.role);

const graderAssignments = (repository, user) =>
  repository
    .all("score_grader_assignments", false, user.selectedSchoolId)
    .filter((row) => row.user_id === user.id);

const canGrade = (repository, user, row) =>
  isManager(user) ||
  graderAssignments(repository, user).some(
    (assignment) =>
      assignment.school_year_id ===
        (row.school_year_id || row.academic_year_id) &&
      assignment.class_ids?.includes(row.class_id),
  );

const clearGraderAssignments = async (repository, userId, schoolId) => {
  const assignments = repository
    .all("score_grader_assignments", false, schoolId)
    .filter((row) => row.user_id === userId);
  for (const assignment of assignments)
    await repository.remove("score_grader_assignments", assignment.id, false, {
      schoolId,
    });
};

export const createApiHandler = ({ repository, sessions, users }) =>
  async function handleApi(request, response, url) {
    try {
      if (request.method === "GET" && url.pathname === "/api/auth/status") {
        return sendJson(response, 200, {
          setupRequired: users.setupRequired(),
          schools: repository.listSchools(),
        });
      }
      if (request.method === "POST" && url.pathname === "/api/auth/setup") {
        if (!users.setupRequired())
          return sendJson(response, 409, {
            error: "Tài khoản root đã được khởi tạo.",
          });
        const body = await readJson(request);
        const school = repository.listSchools().length
          ? repository.school(body.schoolId)
          : await repository.ensureSchool(body.schoolName);
        if (!school) return sendJson(response, 400, { error: "Hãy chọn trường hợp lệ." });
        const user = await users.setupRoot({ ...body, schoolId: school.id });
        return sendJson(response, 201, sessions.create(sessionUser(user, school)));
      }
      if (request.method === "POST" && url.pathname === "/api/session") {
        if (users.setupRequired()) {
          return sendJson(response, 409, { error: "Cần khởi tạo tài khoản root trước." });
        }
        const body = await readJson(request);
        const school = repository.school(body.schoolId);
        if (!school) return sendJson(response, 400, { error: "Hãy chọn trường hợp lệ." });
        const user = await users.authenticate(body.username, body.password, school.id);
        if (!user) return sendJson(response, 401, { error: "Tên đăng nhập hoặc mật khẩu không đúng." });
        return sendJson(response, 200, sessions.create(sessionUser(user, school)));
      }

      const session = sessions.verify(request.headers.authorization);
      if (!session) return sendJson(response, 401, { error: "Phiên làm việc đã hết hạn." });
      const user = session.user;

      if (request.method === "GET" && url.pathname === "/api/session") {
        return sendJson(response, 200, { user });
      }
      if (request.method === "DELETE" && url.pathname === "/api/session") {
        sessions.remove(request.headers.authorization);
        return sendJson(response, 200, { ok: true });
      }
      if (request.method === "POST" && url.pathname === "/api/session/school") {
        if (user.role !== "superadmin") return forbidden(response);
        const body = await readJson(request),
          school = repository.school(body.schoolId);
        if (!school)
          return sendJson(response, 400, { error: "Hãy chọn trường hợp lệ." });
        const updated = sessionUser(user, school);
        sessions.update(request.headers.authorization, updated);
        return sendJson(response, 200, { user: updated });
      }
      if (request.method === "PATCH" && url.pathname === "/api/account") {
        const body = await readJson(request),
          allowedFields = new Set([
            "displayName",
            "currentPassword",
            "password",
          ]);
        if (Object.keys(body).some((key) => !allowedFields.has(key)))
          return sendJson(response, 400, {
            error: "Chỉ được thay đổi tên hiển thị và mật khẩu của chính mình.",
          });
        if (body.password) {
          const verified = await users.authenticate(
            user.username,
            body.currentPassword,
            user.selectedSchoolId,
          );
          if (!verified)
            return sendJson(response, 400, {
              error: "Mật khẩu hiện tại không đúng.",
            });
        }
        const updated = await users.update(user.id, {
          displayName: body.displayName,
          ...(body.password ? { password: body.password } : {}),
        });
        if (body.password) sessions.revokeUser(user.id);
        else {
          const refreshed =
            updated.role === "superadmin"
              ? updated
              : sessionUser(updated, repository.school(updated.schoolId));
          sessions.refreshUser(user.id, refreshed);
        }
        return sendJson(response, 200, updated);
      }
      if (request.method === "GET" && url.pathname === "/api/health") {
        return sendJson(response, 200, {
          ok: true,
          schema: repository.schema,
          previousSchema: repository.previousSchema,
          user,
        });
      }

      if (url.pathname === "/api/admin/schools") {
        if (user.role !== "superadmin") return forbidden(response);
        if (request.method === "GET")
          return sendJson(response, 200, repository.listSchools());
        if (request.method === "POST") {
          const body = await readJson(request);
          return sendJson(
            response,
            201,
            await repository.createSchool(body.name),
          );
        }
      }

      if (url.pathname === "/api/admin/users") {
        if (!["superadmin", "admin"].includes(user.role)) return forbidden(response);
        if (request.method === "GET")
          return sendJson(
            response,
            200,
            users.list(
              user.selectedSchoolId,
              user.role === "superadmin",
            ),
          );
        if (request.method === "POST") {
          const body = await readJson(request);
          if (user.role === "admin") {
            if (body.role === "superadmin") body.role = "admin";
          }
          return sendJson(
            response,
            201,
            await users.create({ ...body, schoolId: user.selectedSchoolId }),
          );
        }
      }
      const userMatch = url.pathname.match(/^\/api\/admin\/users\/([^/]+)$/);
      if (userMatch) {
        if (!["superadmin", "admin"].includes(user.role)) return forbidden(response);
        const id = decodeURIComponent(userMatch[1]);
        const target = users.get(id);
        if (
          !target ||
          (target.schoolId !== user.selectedSchoolId &&
            !(user.role === "superadmin" && target.role === "superadmin")) ||
          (user.role === "admin" && target.role === "superadmin")
        )
          return forbidden(response);
        if (request.method === "PATCH") {
          const changes = await readJson(request);
          const passwordChanged = !!changes.password;
          changes.schoolId = user.selectedSchoolId;
          if (user.role === "admin") {
            if (changes.role === "superadmin") changes.role = "admin";
          }
          const updated = await users.update(id, changes);
          if (updated.disabled || updated.role !== "user")
            await clearGraderAssignments(
              repository,
              id,
              target.schoolId || user.selectedSchoolId,
            );
          if (passwordChanged || updated.disabled) sessions.revokeUser(id);
          else {
            const refreshed =
              updated.role === "superadmin"
                ? updated
                : sessionUser(updated, repository.school(updated.schoolId));
            sessions.refreshUser(id, refreshed);
          }
          return sendJson(response, 200, updated);
        }
        if (request.method === "DELETE") {
          if (id === user.id) return sendJson(response, 400, { error: "Không thể xóa phiên đang đăng nhập." });
          const removed = await users.remove(id);
          if (removed)
            await clearGraderAssignments(
              repository,
              id,
              target.schoolId || user.selectedSchoolId,
            );
          sessions.revokeUser(id);
          return sendJson(response, removed ? 200 : 404, { removed });
        }
      }

      if (request.method === "GET" && url.pathname === "/api/export") {
        if (!hasPermission(user, "data:export")) return forbidden(response);
        return sendJson(response, 200, repository.exportAll(user.selectedSchoolId));
      }
      if (request.method === "POST" && url.pathname === "/api/import/replace") {
        if (!hasPermission(user, "data:import")) return forbidden(response);
        const body = await readJson(request);
        return sendJson(
          response,
          200,
          await repository.replaceAll(body.payload, {
            ...body.options,
            schoolId: user.selectedSchoolId,
          }),
        );
      }

      const match = url.pathname.match(/^\/api\/stores\/([^/]+)(?:\/([^/]+))?$/);
      if (!match) return sendJson(response, 404, { error: "API route not found." });
      const store = decodeURIComponent(match[1]);
      const id = match[2] ? decodeURIComponent(match[2]) : "";

      if (request.method === "GET") {
        if (!canReadStore(user, store)) return forbidden(response);
        if (!id) {
          if (store === "score_grader_assignments") {
            const rows = repository.all(store, false, user.selectedSchoolId);
            return sendJson(
              response,
              200,
              isManager(user)
                ? rows
                : rows.filter((row) => row.user_id === user.id),
            );
          }
          return sendJson(
            response,
            200,
            repository.all(
              store,
              url.searchParams.get("includeDeleted") === "1",
              user.selectedSchoolId,
            ),
          );
        }
        const record = repository.get(store, id, user.selectedSchoolId);
        if (
          store === "score_grader_assignments" &&
          record &&
          !isManager(user) &&
          record.user_id !== user.id
        )
          return forbidden(response);
        return record
          ? sendJson(response, 200, record)
          : url.searchParams.get("optional") === "1"
            ? sendJson(response, 200, null)
          : sendJson(response, 404, { error: "Record not found." });
      }

      const assignedGrader =
        !isManager(user) && graderAssignments(repository, user).length > 0;
      if (
        (store === "score_grader_assignments" && !isManager(user)) ||
        (store === "score_entries" && !isManager(user) && !assignedGrader) ||
        (store === "audit_logs" && !isManager(user) && !assignedGrader) ||
        (!["score_entries", "audit_logs"].includes(store) &&
          !canWriteStore(user, store))
      )
        return forbidden(response);
      if (store === "schools" && request.method === "DELETE") {
        return sendJson(response, 400, {
          error: "Không thể xóa trường đang dùng để đăng nhập.",
        });
      }
      if (request.method === "POST" && id === "bulk") {
        const body = await readJson(request);
        if (
          store === "score_grader_assignments" &&
          (body.rows || []).some((row) => {
            const target = users.get(row.user_id);
            return (
              !target ||
              target.role !== "user" ||
              target.schoolId !== user.selectedSchoolId
            );
          })
        )
          return forbidden(response);
        if (
          store === "score_entries" &&
          (body.rows || []).some((row) => !canGrade(repository, user, row))
        )
          return forbidden(response);
        if (
          store === "audit_logs" &&
          !isManager(user) &&
          (body.rows || []).some((row) => row.entity !== "score_entries")
        )
          return forbidden(response);
        return sendJson(
          response,
          200,
          await repository.bulkPut(store, body.rows || [], {
            ...body.options,
            schoolId: user.selectedSchoolId,
          }),
        );
      }
      if (request.method === "POST" && !id) {
        const body = await readJson(request);
        if (store === "score_grader_assignments") {
          const target = users.get(body.row?.user_id);
          if (
            !target ||
            target.role !== "user" ||
            target.schoolId !== user.selectedSchoolId
          )
            return forbidden(response);
        }
        if (
          (store === "score_entries" &&
            !canGrade(repository, user, body.row || {})) ||
          (store === "audit_logs" &&
            !isManager(user) &&
            body.row?.entity !== "score_entries")
        )
          return forbidden(response);
        return sendJson(
          response,
          200,
          await repository.put(store, body.row || {}, {
            ...body.options,
            schoolId: user.selectedSchoolId,
          }),
        );
      }
      if (request.method === "DELETE" && id) {
        if (
          store === "score_entries" &&
          !canGrade(
            repository,
            user,
            repository.get(store, id, user.selectedSchoolId) || {},
          )
        )
          return forbidden(response);
        return sendJson(
          response,
          200,
          await repository.remove(
            store,
            id,
            url.searchParams.get("hard") === "1",
            { schoolId: user.selectedSchoolId },
          ),
        );
      }
      if (request.method === "DELETE" && !id) {
        if (store === "score_entries" && !isManager(user))
          return forbidden(response);
        return sendJson(
          response,
          200,
          await repository.clear(store, user.selectedSchoolId),
        );
      }
      return sendJson(response, 405, { error: "Method not allowed." });
    } catch (error) {
      console.error(error);
      return sendJson(response, error.status || 500, {
        error: error.status ? error.message : "Internal server error.",
        name: error.name,
      });
    }
  };
