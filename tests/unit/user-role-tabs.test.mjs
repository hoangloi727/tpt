import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import vm from 'node:vm';

const source = await readFile(new URL('../../frontend/scripts/app.js', import.meta.url), 'utf8');
const code = source.slice(source.indexOf('        async function renderUserManagement()'), source.indexOf('        async function showUserImport('));

test('user role tabs filter accounts, retain the selected role and hide superadmin accounts', async () => {
  const users = ['superadmin', 'admin', 'teacher', 'user'].map(role => ({
    id: role, username: `account_${role}`, role, displayName: role, root: role === 'superadmin',
  }));
  const tabs = ['all', 'admin', 'teacher', 'user'].map(role => ({ dataset: { userRole: role } }));
  const nodes = new Map();
  let html;
  const context = vm.createContext({
    state: { user: { role: 'admin' }, userRoleFilter: 'all' },
    db: { listUsers: async () => users, all: async () => [] },
    setContent: value => { html = value; }, pageHead: () => '', esc: String, graderClassLabel: () => '',
    $: selector => { if (!nodes.has(selector)) nodes.set(selector, {}); return nodes.get(selector); },
    $$: selector => selector === '[data-user-role]' ? tabs : [],
  });
  vm.runInContext(code, context);
  await context.renderUserManagement();
  assert.match(html, /Tất cả loại tài khoản \(3\)/);
  for (const user of users.filter(user => user.role !== 'superadmin')) assert.ok(html.includes(user.username));
  assert.ok(!html.includes('account_superadmin'));
  await tabs[2].onclick();
  assert.equal(context.state.userRoleFilter, 'teacher');
  assert.ok(html.includes('account_teacher'));
  for (const name of ['account_superadmin', 'account_admin', 'account_user']) assert.ok(!html.includes(name));
  assert.match(html, /data-user-role="teacher" class="active" aria-pressed="true"/);
  await context.renderUserManagement();
  assert.ok(html.includes('account_teacher'));
  context.state.userRoleFilter = 'superadmin';
  await context.renderUserManagement();
  assert.equal(context.state.userRoleFilter, 'all');
  assert.doesNotMatch(html, /data-user-role="superadmin"/);
  assert.ok(!html.includes('account_superadmin'));
  assert.doesNotMatch(html, /data-delete-user="superadmin"/);
  users.splice(users.findIndex(user => user.role === 'teacher'), 1);
  await tabs[2].onclick();
  assert.match(html, /Không có tài khoản thuộc loại đã chọn/);
  assert.match(html, /Giáo viên \(0\)/);
});
