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
    recoverInterruptedOperations: async () => {},
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
  await new Promise(setImmediate);
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
  assert.doesNotMatch(launch, /ensureStorageProtection/);
  assert.ok(launch.indexOf('$("#appShell").classList.remove("hidden")') < launch.indexOf("scheduleMaintenance(pendingRecovery)"));
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

test("startup reads share one batch and a write invalidates it", async () => {
  let requests = 0;
  const context = vm.createContext({ window: {}, structuredClone, Headers, Blob, performance, TextEncoder, console, fetch: async () => {
    requests++;
    return { ok: true, status: 200, json: async () => ({ stores: { tasks: [{ id: "task", title: "Original" }] }, pending: [] }) };
  } });
  vm.runInContext(await readFile(new URL("../../frontend/scripts/api-data-provider.js", import.meta.url), "utf8"), context);
  const db = new context.window.ApiDataProvider({});
  db.currentUser = { role: "admin" };
  await db.prepareStartup();
  const rows = await db.all("tasks");
  rows[0].title = "Changed";
  assert.equal((await db.get("tasks", "task")).title, "Original");
  await db.pendingOperations();
  assert.equal(requests, 1);
  await db.request("/test", { method: "POST", body: "{}" });
  assert.equal(db.startupData, null);
});

test("dashboard revisits fetch one fresh batch, startup reuses its batch and failures release it", async () => {
  let loads = 0, renders = 0, fail = false;
  const db = { startupData: null, async preparePage() { loads++; this.startupData = {stores:{score_entries:[]}}; } };
  const context = vm.createContext({ db, state: { user: { role: "admin" } }, canManageScores: () => true,
    renderDashboardData: async () => { renders++; assert.ok(db.startupData); if (fail) throw Error("render failed"); },
  });
  vm.runInContext(source.slice(source.indexOf("        async function renderDashboard()"), source.indexOf("        async function renderDashboardData()")), context);
  await context.renderDashboard();
  await context.renderDashboard();
  assert.equal(loads, 2);
  assert.equal(db.startupData, null);
  db.startupData = {stores:{score_entries:[]}};
  await context.renderDashboard();
  assert.equal(loads, 2);
  db.startupData = null;
  fail = true;
  await assert.rejects(context.renderDashboard(), /render failed/);
  assert.equal(db.startupData, null);
  assert.equal(renders, 4);
});

test("page reads deduplicate sequential requests, refresh after writes and on the next page", async () => {
  let requests = 0;
  const context = vm.createContext({ window: {}, structuredClone, Headers, Blob, performance, TextEncoder, console, fetch: async () => {
    requests++;
    return { ok:true,status:200,json:async()=>[{id:"row",value:requests}] };
  } });
  vm.runInContext(await readFile(new URL("../../frontend/scripts/api-data-provider.js",import.meta.url),"utf8"),context);
  const db = new context.window.ApiDataProvider({});
  db.currentUser = {id:"a",selectedSchoolId:"school"};
  const scope = db.beginReadScope();
  const first = await db.all("tasks"); first[0].value = -1;
  assert.equal((await db.all("tasks"))[0].value,1);
  assert.equal(requests,1);
  await db.request("/write",{method:"POST",body:"{}"});
  await db.all("tasks"); assert.equal(requests,3);
  db.currentUser = {id:"a",selectedSchoolId:"other"};
  await db.all("tasks"); assert.equal(requests,4);
  db.endReadScope(scope);
  await db.all("tasks"); assert.equal(requests,5);
});

test("score subtabs reuse context and calculate rankings only once", async () => {
  const buttons = ["entry","ranking","anomaly","history"].map(tab => ({ dataset:{scoreTab:tab}, classList:{toggle(){} } }));
  let calculations = 0, entries = 0;
  const context = vm.createContext({
    state:{scoreTab:"entry"}, ctx:{sheet:{status:"draft"}}, manager:true,
    $$:()=>buttons, renderScoreEntry:()=>{entries++;}, renderScoreAnomalies:()=>{}, renderScoreHistory:async()=>{},
    calculateRanking:async()=>{calculations++;return [];}, renderScoreRanking:async()=>{}, toast:message=>{throw Error(message);},
  });
  const start = source.indexOf("          let ranking = null, rendering = false;");
  const end = source.indexOf('          if ($("#assignScoreGraders"))',start);
  await vm.runInContext(`(async()=>{${source.slice(start,end)}})()`,context);
  await buttons[1].onclick();
  await buttons[2].onclick();
  await buttons[1].onclick();
  await buttons[0].onclick();
  assert.equal(calculations,1);
  assert.equal(entries,2);
  assert.ok(buttons.every(button=>!button.disabled));
});

test("password eye toggles visibility and its accessible state", () => {
  const input = { type: "password", value: "unchanged" };
  const attributes = {};
  const toggle = { setAttribute: (name, value) => { attributes[name] = value; } };
  let slashHidden = true;
  const nodes = {
    '#activationCode': input,
    '#toggleActivationCode': toggle,
    '#passwordEyeSlash': { classList: { toggle: (_name, hidden) => { slashHidden = hidden; } } },
    '#activationForm': {},
  };
  const context = vm.createContext({ $: id => nodes[id] });
  const code = source.slice(source.indexOf("        function bindActivation()"), source.indexOf("        function updateActivationMode()"));
  vm.runInContext(code + "\nbindActivation();", context);
  for (const visible of [true, false]) {
    toggle.onclick();
    assert.equal(input.type, visible ? 'text' : 'password');
    assert.equal(attributes['aria-pressed'], String(visible));
    assert.equal(attributes['aria-label'], visible ? 'Ẩn mật khẩu' : 'Hiện mật khẩu');
    assert.equal(slashHidden, !visible);
    assert.equal(input.value, 'unchanged');
  }
});
