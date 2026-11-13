import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { test } from 'node:test';
import { createApiHandler } from '../../backend/api.js';
import { SessionManager, UserStore } from '../../backend/auth.js';
import { SqliteDatabase } from '../../backend/sqlite-database.js';

test('superadmin is hidden and protected in user administration while self-service profile and password changes work', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'tpt-root-profile-'));
  const database = await new SqliteDatabase(join(directory, 'test.sqlite')).open();
  const users = await new UserStore(database, join(directory, 'absent.json'), 'school').open();
  const password = randomBytes(20).toString('hex');
  const root = await users.setupRoot({ username: 'root', displayName: 'Root', password });
  const admin = await users.create({ username: 'school_admin', displayName: 'Admin', role: 'admin', schoolId: 'school', password });
  const regular = await users.create({ username: 'grader', role: 'user', schoolId: 'school', password });
  const sessions = new SessionManager();
  const tokens = Object.fromEntries([root, admin].map(account => [account.role, sessions.create({ ...account, selectedSchoolId: 'school' }).token]));
  const handler = createApiHandler({ users, sessions, repository: {
    all: () => [], school: id => ({ id, name: 'School' }),
  } });
  const request = async (role, method, path, body) => {
    const token = tokens[role];
    const incoming = Readable.from(body ? [Buffer.from(JSON.stringify(body))] : []);
    incoming.method = method;
    incoming.socket = { encrypted: false };
    incoming.headers = { authorization: `Bearer ${token}`, 'x-destructive-authorization': sessions.authorizeDestructive(token) };
    let status, result;
    await handler(incoming, {
      writeHead(value) { status = value; },
      end(value) { result = JSON.parse(value); },
    }, new URL(`http://localhost/api${path}`));
    return { status, result };
  };
  for (const role of ['superadmin', 'admin']) {
    const list = await request(role, 'GET', '/admin/users');
    assert.equal(list.status, 200);
    assert.deepEqual(list.result.map(account => account.id).sort(), [admin.id, regular.id].sort());
    assert.equal((await request(role, 'PATCH', `/admin/users/${root.id}`, { displayName: 'Changed through admin' })).status, 403);
    assert.equal((await request(role, 'DELETE', `/admin/users/${root.id}`)).status, 403);
    assert.equal((await request(role, 'PATCH', `/admin/users/${regular.id}`, { role: 'superadmin' })).status, 403);
    assert.equal((await request(role, 'POST', '/admin/users', { username: 'another_root', role: 'superadmin', password })).status, 403);
  }
  assert.equal(users.get(root.id).displayName, 'Root');
  assert.equal(users.get(regular.id).role, 'user');
  assert.equal((await request('superadmin', 'PATCH', `/admin/users/${admin.id}`, { displayName: 'Updated admin' })).status, 200);
  assert.equal(users.get(admin.id).displayName, 'Updated admin');
  const ownProfile = await request('superadmin', 'PATCH', '/account', { displayName: 'Own updated name' });
  assert.equal(ownProfile.status, 200);
  assert.equal(users.get(root.id).displayName, 'Own updated name');
  assert.equal((await request('superadmin', 'PATCH', '/account', { role: 'admin' })).status, 400);
  const nextPassword = randomBytes(20).toString('hex');
  assert.equal((await request('superadmin', 'PATCH', '/account', { currentPassword: randomBytes(20).toString('hex'), password: nextPassword })).status, 400);
  assert.equal((await request('superadmin', 'PATCH', '/account', { currentPassword: password, password: nextPassword })).status, 200);
  assert.equal(sessions.verify(tokens.superadmin), null);
  assert.equal(await users.authenticate('root', password, 'school'), null);
  assert.equal((await users.authenticate('root', nextPassword, 'school')).id, root.id);
});
