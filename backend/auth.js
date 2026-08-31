import { randomBytes, timingSafeEqual } from "node:crypto";

const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

export class SessionManager {
  constructor(password) {
    this.password = password;
    this.sessions = new Map();
  }

  verifyPassword(candidate) {
    const actual = Buffer.from(this.password);
    const supplied = Buffer.from(String(candidate || ""));
    return actual.length === supplied.length && timingSafeEqual(actual, supplied);
  }

  create(password) {
    if (!this.verifyPassword(password)) return null;
    const token = randomBytes(32).toString("base64url");
    this.sessions.set(token, Date.now() + SESSION_TTL_MS);
    return token;
  }

  verify(header) {
    const token = String(header || "").replace(/^Bearer\s+/i, "");
    const expiresAt = this.sessions.get(token) || 0;
    if (!token || expiresAt <= Date.now()) {
      if (token) this.sessions.delete(token);
      return false;
    }
    this.sessions.set(token, Date.now() + SESSION_TTL_MS);
    return true;
  }
}
