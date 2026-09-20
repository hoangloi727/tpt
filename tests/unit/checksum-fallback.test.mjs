import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import vm from "node:vm";
import { createApiHandler } from "../../backend/api.js";
import { SessionManager } from "../../backend/auth.js";

const source = await readFile(new URL("../../frontend/scripts/backup-codec.js", import.meta.url), "utf8");
test("Checksums remain SHA-256 without browser Web Crypto, including large binary files", async () => {
  const sessions = new SessionManager();
  const { token } = sessions.create({ id: "root", role: "superadmin", selectedSchoolId: "school" });
  const handler = createApiHandler({ sessions, repository: {}, users: {} });
  const request = async (body, authenticated = true) => {
    const incoming = Readable.from([Buffer.from(body)]);
    incoming.method = "POST";
    incoming.headers = authenticated ? { authorization: `Bearer ${token}` } : {};
    let status, result;
    await handler(incoming, {
      writeHead(value) { status = value; }, end(value) { result = JSON.parse(value); },
    }, new URL("http://localhost/api/checksums/sha256"));
    return { ok: status === 200, status, json: async () => result };
  };
  const context = vm.createContext({ window: {}, crypto: {}, TextEncoder, Blob, btoa, atob,
    Worker: class { constructor() { throw new Error("Must not use worker without Web Crypto"); } },
    fetch: async (path, options) => {
      assert.equal(path, "/api/checksums/sha256");
      assert.equal(options.credentials, "same-origin");
      return request(options.body);
    },
  });
  vm.runInContext(source, context);
  const codec = context.window.TPTAppModules.backupCodec;
  for (const text of ["", "abc", "Khóa bảng — Tiếng Việt 🔒"])
    assert.equal(await codec.sha256Text(text), createHash("sha256").update(text).digest("hex"));
  const bytes = Uint8Array.from({ length: 2 * 1024 * 1024 + 1 }, (_, i) => i % 256);
  assert.equal(await codec.sha256Blob(new Blob([bytes])), createHash("sha256").update(bytes).digest("hex"));
  assert.equal((await request('{"data":"YWJj"}', false)).status, 401);
  for (const data of [null, 1, "bad base64!"])
    assert.equal((await request(JSON.stringify({ data }))).status, 400);
  context.fetch = async () => ({ ok: false, json: async () => ({ error: "Session expired" }) });
  await assert.rejects(codec.sha256Text("abc"), /Session expired/);
  context.fetch = async () => ({ ok: true, json: async () => ({ checksum: "invalid" }) });
  await assert.rejects(codec.sha256Text("abc"), /không hợp lệ/);
});
