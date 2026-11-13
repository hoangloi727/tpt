import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import vm from 'node:vm';

const source = await readFile(new URL('../../frontend/scripts/app.js', import.meta.url), 'utf8');
const code = source.slice(source.indexOf('        async function showOnboarding()'), source.indexOf('        async function renderBackup()'));

test('onboarding advances, goes back, skips and finishes in four steps', async () => {
  const elements = new Map();
  const $ = selector => {
    if (!elements.has(selector)) elements.set(selector, { value: '', style: {} });
    return elements.get(selector);
  };
  const writes = [];
  let title, body, closed = false, destination;
  const context = vm.createContext({
    $, esc: String, normalizeSchoolYearName: String,
    openModal: (heading, content) => { title = heading; body = content; },
    closeModal: () => { closed = true; },
    toast: () => {}, loadContext: async () => {},
    go: async page => { destination = page; },
    setting: async (...args) => { writes.push(args); },
    db: {
      all: async store => store === 'schools' ? [{ id: 'school' }] : [],
      put: async (...args) => { writes.push(args); },
    },
  });
  await vm.runInContext(code + '\nshowOnboarding();', context);
  assert.match(title, /^1\/4/);
  $('#wSchool').value = 'Trường thử';
  $('#wizardNext').onclick();
  assert.match(title, /^2\/4/);
  $('#wizardBack').onclick();
  assert.match(title, /^1\/4/);
  $('#wizardNext').onclick();
  $('#wCampuses').value = 'Cơ sở A';
  $('#wizardSkip').onclick();
  assert.match(title, /^3\/4/);
  $('#wizardNext').onclick();
  assert.match(title, /^4\/4/);
  assert.match(body, /Danh sách lớp/);
  assert.match(body, /phê duyệt bộ tiêu chí/);
  $('#wizardNext').onclick();
  // The click handler starts the existing asynchronous save flow.
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(closed, true);
  assert.equal(destination, 'dashboard');
  assert.ok(writes.some(([store, row]) => store === 'schools' && row.name === 'Trường thử'));
  assert.ok(writes.some(([store, row]) => store === 'campuses' && row.name === 'Cơ sở A'));
  assert.ok(writes.some(([key, value]) => key === 'onboarded' && value === true));
});
