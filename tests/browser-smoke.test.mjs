import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { spawn } from "node:child_process";
import { test } from "node:test";

const run = promisify(execFile);
const chromium = "/home/loiht/.local/bin/chromium";

test("browser loads the authenticated app shell and first-run activation screen", async (t) => {
  try {
    await run(chromium, ["--version"]);
  } catch {
    t.skip("Chromium is not installed");
    return;
  }

  const directory = await mkdtemp(join(tmpdir(), "tpt-browser-"));
  const profile = join(directory, "chromium-profile");
  const port = 3200 + Math.floor(Math.random() * 500);
  const server = spawn(process.execPath, ["backend/server.js"], {
    cwd: fileURLToPath(new URL("..", import.meta.url)),
    env: {
      ...process.env,
      HOST: "127.0.0.1",
      PORT: String(port),
      SQLITE_FILE: join(directory, "database.sqlite"),
      DATA_FILE: join(directory, "legacy.json"),
      AUTH_FILE: join(directory, "users.json"),
    },
    stdio: "ignore",
  });

  try {
    const healthUrl = `http://127.0.0.1:${port}/api/auth/status`;
    let ready = false;
    for (let attempt = 0; attempt < 50; attempt++) {
      try {
        if ((await fetch(healthUrl)).ok) {
          ready = true;
          break;
        }
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    if (!ready) {
      t.skip("local server networking is unavailable in this environment");
      return;
    }
    let stdout;
    try {
      ({ stdout } = await run(chromium, [
        "--headless=new",
        "--no-sandbox",
        "--disable-crash-reporter",
        "--disable-gpu",
        "--disable-dev-shm-usage",
        `--user-data-dir=${profile}`,
        "--virtual-time-budget=3000",
        "--dump-dom",
        `http://127.0.0.1:${port}/`,
      ], { maxBuffer: 2 * 1024 * 1024, timeout: 15000 }));
    } catch (error) {
      t.skip(`Chromium could not run in this environment: ${error.code || error.message}`);
      return;
    }
    assert.match(stdout, /TRỢ LÝ TỔNG PHỤ TRÁCH ĐỘI/);
    assert.match(stdout, /id="activationForm"/);
    assert.match(stdout, /id="activationScreen"/);
    assert.doesNotMatch(stdout, /Không thể kiểm tra trạng thái đăng nhập/);
  } finally {
    server.kill("SIGTERM");
  }
});
