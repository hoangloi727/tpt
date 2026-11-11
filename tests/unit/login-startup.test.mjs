import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
const source = await readFile(new URL("../../frontend/scripts/app.js", import.meta.url), "utf8");

test("login blocks repeated submissions while authentication is pending and unlocks on rejection", async () => {
  const nodes = new Map();
  const $ = (id) => {
    if (!nodes.has(id)) nodes.set(id, { value: "", style: {}, focus() {} });
    return nodes.get(id);
  };
  let calls = 0, resolve;
  const context = vm.createContext({ $, startupStep: (_label, action) => action(), sessionLock: { verify() { calls++; return new Promise((done) => { resolve = done; }); } }, setTimeout });
  const code = source.slice(source.indexOf("        function bindActivation()"), source.indexOf("        function updateActivationMode()"));
  vm.runInContext(code + "\nbindActivation();", context);
  const submit = $("#activationForm").onsubmit;
  const first = submit({ preventDefault() {} });
  await submit({ preventDefault() {} });
  assert.equal(calls, 1);
  assert.equal($("#activateButton").disabled, true);
  resolve({ ok: false, wait: 0 });
  await first;
  assert.equal($("#activateButton").disabled, false);
});

test("maintenance is deferred, cancelled before idle, and drains an active task before switching", async () => {
  let idle, calls = 0, finish;
  const state = { unlocked: true, user: { role: "admin" } };
  const context = vm.createContext({
    state, tabCoordinator: { readOnly: false }, AbortController,
    window: { requestIdleCallback(callback) { idle = callback; } },
    ensureScheduledSnapshots: async () => { calls++; await new Promise((resolve) => { finish = resolve; }); },
    ensureScheduledDirectoryBackup: async () => { calls++; }, console, toast() {},
  });
  vm.runInContext(source.slice(source.indexOf("        let scheduledMaintenance"), source.indexOf("        async function startupStep")), context);
  context.scheduleMaintenance();
  assert.equal(calls, 0);
  await context.cancelScheduledMaintenance();
  idle();
  assert.equal(calls, 0);
  context.scheduleMaintenance();
  idle();
  assert.equal(calls, 1);
  let cancelled = false;
  const drain = context.cancelScheduledMaintenance().then(() => { cancelled = true; });
  await Promise.resolve();
  assert.equal(cancelled, false);
  finish();
  await drain;
  assert.equal(calls, 1, "directory backup must not start after cancellation");
  state.user.role = "teacher";
  context.scheduleMaintenance();
  assert.equal(calls, 1);
});

test("login displays the shell before scheduling maintenance without awaiting scheduled backups", () => {
  const launch = source.slice(source.indexOf("        async function launchApp()"), source.indexOf("        function updateSchoolBranding()"));
  assert.doesNotMatch(launch, /await.*ensureScheduled/);
  assert.ok(launch.indexOf('$("#appShell").classList.remove("hidden")') < launch.indexOf("scheduleMaintenance()"));
});

test("cancelling during snapshot hashing prevents writes while manual snapshots remain available", async () => {
  const context = vm.createContext({ window: {} });
  vm.runInContext(await readFile(new URL("../../frontend/scripts/backup-service.js", import.meta.url), "utf8"), context);
  const controller = new AbortController();
  let writes = 0;
  const service = context.window.TPTAppModules.backupService.createService({
    APP: {}, tabCoordinator: { assertWritable() {} }, now: () => "now",
    stableJSON: JSON.stringify,
    sha256Text: async () => { controller.abort(); return "checksum"; },
    db: {
      snapshotMetadata: async () => [],
      snapshotPayload: async () => ({ data: { tasks: [] }, counts: { tasks: 0 } }),
      put: async () => { writes++; return {}; }, pruneSnapshots: async () => {},
    },
  });
  await assert.rejects(service.ensureScheduledSnapshots(controller.signal), { name: "AbortError" });
  assert.equal(writes, 0);
  await service.createInternalSnapshot("Before restore", { protectedSnapshot: true });
  assert.equal(writes, 1);
});
