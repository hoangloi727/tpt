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
