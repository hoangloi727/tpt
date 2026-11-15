import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { UserStore } from '../../backend/auth.js';
import { SqliteDatabase } from '../../backend/sqlite-database.js';

test('usernames belong to schools, including after migration and reopening', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'school-usernames-'));
  const database = await new SqliteDatabase(join(directory, 'test.sqlite')).open();
  const users = await new UserStore(database, join(directory, 'missing.json'), 'one').open();
  const first = await users.create({ username: 'grader', schoolId: 'one', password: 'first-password' });
  const second = await users.create({ username: 'GRADER', schoolId: 'two', password: 'second-password' });
  assert.equal((await users.authenticate('grader', 'second-password', 'two')).id, second.id);
  assert.equal(await users.authenticate('grader', 'first-password', 'two'), null);
  await assert.rejects(users.create({ username: 'grader', schoolId: 'one', password: 'third-password' }), { status: 409 });
  const other = await users.create({ username: 'another', schoolId: 'two', password: 'third-password' });
  await assert.rejects(users.update(other.id, { username: 'grader' }), { status: 409 });
  await users.update(first.id, { username: 'another' });
  database.database.close();
  const reopened = await new SqliteDatabase(database.filePath).open();
  assert.equal(reopened.loadUsers().length, 3);
  reopened.database.close();
});
