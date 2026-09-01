import { randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const USERNAME_PATTERN = /^[a-z0-9][a-z0-9._-]{2,31}$/;
const PERMISSION_PATTERN = /^[a-z0-9*:_-]{1,80}$/;

const now = () => new Date().toISOString();

const badRequest = (message) => {
  const error = new Error(message);
  error.status = 400;
  return error;
};

const conflict = (message) => {
  const error = new Error(message);
  error.status = 409;
  return error;
};

const normalizeUsername = (value) => String(value || "").trim().toLowerCase();

const validatePassword = (password) => {
  if (String(password || "").length < 10) {
    throw badRequest("Mật khẩu phải có ít nhất 10 ký tự.");
  }
};

const normalizePermissions = (permissions, role) => {
  if (role === "superadmin") return ["*"];
  const values = Array.isArray(permissions) ? permissions : ["dashboard"];
  const normalized = [...new Set(values.map((value) => String(value).trim().toLowerCase()).filter(Boolean))]
    .filter((value) => PERMISSION_PATTERN.test(value));
  return normalized.length ? normalized : ["dashboard"];
};

const publicUser = (user) => ({
  id: user.id,
  username: user.username,
  displayName: user.displayName,
  role: user.role,
  schoolId: user.schoolId || null,
  permissions: [...user.permissions],
  disabled: !!user.disabled,
  root: !!user.root,
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
  lastLoginAt: user.lastLoginAt || null,
});

export class UserStore {
  constructor(database, legacyFilePath, defaultSchoolId) {
    this.database = database;
    this.legacyFilePath = legacyFilePath;
    this.defaultSchoolId = defaultSchoolId;
    this.state = null;
    this.queue = Promise.resolve();
  }

  async open() {
    if (this.database.metadata("auth_initialized") === "true") {
      this.state = { version: 2, users: this.database.loadUsers() };
      return this;
    }
    let stored = null;
    try {
      stored = JSON.parse(await readFile(this.legacyFilePath, "utf8"));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    const users = Array.isArray(stored?.users) ? stored.users : [];
    this.state = {
      version: 2,
      users: users.map((user) => ({
        ...user,
        role: ["superadmin", "admin"].includes(user.role)
          ? user.role
          : "user",
        schoolId:
          user.role === "superadmin"
            ? null
            : user.schoolId || this.defaultSchoolId,
      })),
    };
    await this.persist(this.state, {
      auth_initialized: true,
      legacy_auth_imported_at: stored ? now() : "none",
      legacy_auth_user_count: users.length,
    });
    if (this.database.loadUsers().length !== users.length)
      throw new Error("SQLite account migration verification failed.");
    return this;
  }

  persist(state, metadata = {}) {
    return this.database.replaceUsers(state.users, metadata);
  }

  mutate(task) {
    const run = async () => {
      const draft = structuredClone(this.state);
      const result = await task(draft);
      await this.persist(draft);
      this.state = draft;
      return result;
    };
    this.queue = this.queue.then(run, run);
    return this.queue;
  }

  setupRequired() {
    return this.state.users.length === 0;
  }

  validateUsername(value) {
    const username = normalizeUsername(value);
    if (!USERNAME_PATTERN.test(username)) {
      throw badRequest("Tên đăng nhập phải có 3-32 ký tự: chữ thường, số, dấu chấm, gạch ngang hoặc gạch dưới.");
    }
    return username;
  }

  async passwordFields(password) {
    validatePassword(password);
    const salt = randomBytes(16).toString("base64url");
    const hash = await scrypt(String(password), salt, 64);
    return { passwordSalt: salt, passwordHash: Buffer.from(hash).toString("base64url") };
  }

  async setupRoot({ username, displayName, password, schoolId }) {
    const normalized = this.validateUsername(username);
    const credentials = await this.passwordFields(password);
    return this.mutate((draft) => {
      if (draft.users.length) throw conflict("Tài khoản root đã được khởi tạo.");
      const stamp = now();
      const user = {
        id: randomUUID(),
        username: normalized,
        displayName: String(displayName || normalized).trim().slice(0, 120),
        role: "superadmin",
        schoolId: null,
        permissions: ["*"],
        disabled: false,
        root: true,
        ...credentials,
        createdAt: stamp,
        updatedAt: stamp,
        lastLoginAt: stamp,
      };
      draft.users.push(user);
      return { ...publicUser(user), selectedSchoolId: schoolId };
    });
  }

  async authenticate(username, password, schoolId) {
    const normalized = normalizeUsername(username);
    const user = this.state.users.find((item) => item.username === normalized);
    if (
      !user ||
      user.disabled ||
      (user.role !== "superadmin" && user.schoolId !== schoolId)
    )
      return null;
    const actual = Buffer.from(user.passwordHash, "base64url");
    const supplied = Buffer.from(await scrypt(String(password || ""), user.passwordSalt, 64));
    if (actual.length !== supplied.length || !timingSafeEqual(actual, supplied)) return null;
    const loginAt = now();
    await this.mutate((draft) => {
      const current = draft.users.find((item) => item.id === user.id);
      if (current) current.lastLoginAt = loginAt;
    });
    return {
      ...publicUser(user),
      selectedSchoolId: schoolId,
      lastLoginAt: loginAt,
    };
  }

  list(schoolId, includeGlobal = false) {
    return this.state.users
      .filter(
        (user) =>
          user.schoolId === schoolId ||
          (includeGlobal && user.role === "superadmin"),
      )
      .map(publicUser)
      .sort((a, b) => a.username.localeCompare(b.username));
  }

  get(id) {
    const user = this.state.users.find((item) => item.id === id);
    return user ? publicUser(user) : null;
  }

  async create({
    username,
    displayName,
    password,
    role = "user",
    permissions = ["dashboard"],
    schoolId,
  }) {
    const normalized = this.validateUsername(username);
    const normalizedRole = ["superadmin", "admin"].includes(role)
      ? role
      : "user";
    const credentials = await this.passwordFields(password);
    return this.mutate((draft) => {
      if (draft.users.some((user) => user.username === normalized)) {
        throw conflict("Tên đăng nhập đã tồn tại.");
      }
      const stamp = now();
      const user = {
        id: randomUUID(),
        username: normalized,
        displayName: String(displayName || normalized).trim().slice(0, 120),
        role: normalizedRole,
        schoolId: normalizedRole === "superadmin" ? null : schoolId,
        permissions: normalizePermissions(permissions, normalizedRole),
        disabled: false,
        root: false,
        ...credentials,
        createdAt: stamp,
        updatedAt: stamp,
        lastLoginAt: null,
      };
      draft.users.push(user);
      return publicUser(user);
    });
  }

  async update(id, changes) {
    const credentials = changes.password ? await this.passwordFields(changes.password) : null;
    return this.mutate((draft) => {
      const user = draft.users.find((item) => item.id === id);
      if (!user) {
        const error = new Error("Không tìm thấy tài khoản.");
        error.status = 404;
        throw error;
      }
      if (changes.username && normalizeUsername(changes.username) !== user.username) {
        const username = this.validateUsername(changes.username);
        if (draft.users.some((item) => item.id !== id && item.username === username)) {
          throw conflict("Tên đăng nhập đã tồn tại.");
        }
        user.username = username;
      }
      if (changes.displayName !== undefined) {
        user.displayName = String(changes.displayName || user.username).trim().slice(0, 120);
      }
      if (!user.root && changes.role !== undefined) {
        user.role = ["superadmin", "admin"].includes(changes.role)
          ? changes.role
          : "user";
        user.schoolId =
          user.role === "superadmin"
            ? null
            : changes.schoolId || user.schoolId;
      }
      if (!user.root && changes.disabled !== undefined) user.disabled = !!changes.disabled;
      user.permissions = normalizePermissions(changes.permissions ?? user.permissions, user.role);
      if (credentials) Object.assign(user, credentials);
      user.updatedAt = now();
      return publicUser(user);
    });
  }

  remove(id) {
    return this.mutate((draft) => {
      const index = draft.users.findIndex((item) => item.id === id);
      if (index < 0) return false;
      if (draft.users[index].root) throw badRequest("Không thể xóa tài khoản root.");
      draft.users.splice(index, 1);
      return true;
    });
  }
}

export class SessionManager {
  constructor() {
    this.sessions = new Map();
  }

  create(user) {
    const token = randomBytes(32).toString("base64url");
    this.sessions.set(token, { user, expiresAt: Date.now() + SESSION_TTL_MS });
    return { token, user };
  }

  verify(header) {
    const token = String(header || "").replace(/^Bearer\s+/i, "");
    const session = this.sessions.get(token);
    if (!token || !session || session.expiresAt <= Date.now()) {
      if (token) this.sessions.delete(token);
      return null;
    }
    session.expiresAt = Date.now() + SESSION_TTL_MS;
    return { token, user: session.user };
  }

  remove(header) {
    const token = String(header || "").replace(/^Bearer\s+/i, "");
    return this.sessions.delete(token);
  }

  update(header, user) {
    const token = String(header || "").replace(/^Bearer\s+/i, ""),
      session = this.sessions.get(token);
    if (!session) return null;
    session.user = user;
    session.expiresAt = Date.now() + SESSION_TTL_MS;
    return { token, user };
  }

  revokeUser(userId) {
    for (const [token, session] of this.sessions) {
      if (session.user.id === userId) this.sessions.delete(token);
    }
  }

  refreshUser(userId, user) {
    for (const session of this.sessions.values()) {
      if (session.user.id === userId)
        session.user = { ...session.user, ...user };
    }
  }
}

export const hasPermission = (user, permission) =>
  ["superadmin", "admin"].includes(user?.role) ||
  user?.permissions?.includes("*") ||
  user?.permissions?.includes(permission);
