import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import vm from 'node:vm';

const source = await readFile(new URL('../../frontend/scripts/app.js', import.meta.url), 'utf8');
const code = source.slice(source.indexOf('        function bindAccountMenu()'), source.indexOf('        function bindShell()'));

test('account menu opens profile, logs out, and closes outside or with Escape', async () => {
  let focused = false, click, keydown, destination, logout;
  const trigger = { focus() { focused = true; } };
  const menu = {
    open: true, querySelector: () => trigger,
    contains: target => target === trigger,
    addEventListener: (_name, listener) => { keydown = listener; },
  };
  const profile = {}, exit = {};
  const context = vm.createContext({
    $: selector => ({ '#accountMenu': menu, '#editPersonalInfo': profile, '#logoutMenu': exit })[selector],
    document: { addEventListener: (_name, listener) => { click = listener; } },
    go: async page => { destination = page; },
    sessionLock: { lock: async message => { logout = message; } },
  });
  vm.runInContext(code + '\nbindAccountMenu();', context);
  click({ target: trigger });
  assert.equal(menu.open, true);
  click({ target: {} });
  assert.equal(menu.open, false);
  menu.open = true;
  let prevented = false;
  keydown({ key: 'Escape', preventDefault() { prevented = true; } });
  assert.equal(menu.open, false);
  assert.equal(focused, true);
  assert.equal(prevented, true);
  menu.open = true;
  await profile.onclick();
  assert.equal(menu.open, false);
  assert.equal(destination, 'account');
  menu.open = true;
  await exit.onclick();
  assert.equal(menu.open, false);
  assert.match(logout, /Đã đăng xuất/);
});
