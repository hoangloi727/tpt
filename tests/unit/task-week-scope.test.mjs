import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import vm from 'node:vm';

const source = await readFile(new URL('../../frontend/scripts/app.js', import.meta.url), 'utf8');
const code = source.slice(source.indexOf('        async function scoped(store)'), source.indexOf('        const canManageScores'));

test('dated tasks appear only in the deadline week, including boundaries, while undated tasks and other scopes are preserved', async () => {
  const rows = [
    { id: 'earlier', due_date: '2026-11-08' },
    { id: 'monday', due_date: '2026-11-09' },
    { id: 'sunday', due_date: '2026-11-15', status: 'done' },
    { id: 'next', due_date: '2026-11-16' },
    { id: 'long-running', start_date: '2026-11-01', due_date: '2026-11-19' },
    { id: 'undated' },
    { id: 'old-semester-metadata', semester_id: 'second', due_date: '2026-11-15' },
    { id: 'other-year', school_year_id: 'other', due_date: '2026-11-09' },
    { id: 'other-campus', campus_id: 'other', due_date: '2026-11-09' },
  ].map(row => ({ school_year_id: 'year', campus_id: 'campus', ...row }));
  const before = structuredClone(rows);
  const state = {
    yearId: 'year', semesterId: 'first', campusId: 'campus', weekId: 'first-week',
    cache: { weeks: [
      { id: 'first-week', school_year_id: 'year', start_date: '2026-11-09', end_date: '2026-11-15' },
      { id: 'next-week', school_year_id: 'year', start_date: '2026-11-16', end_date: '2026-11-22' },
    ] },
  };
  const context = vm.createContext({ state, db: { all: async () => rows } });
  vm.runInContext(code, context);
  const ids = async store => Array.from(await context.scoped(store), row => row.id);
  assert.deepEqual(await ids('tasks'), ['monday', 'sunday', 'undated', 'old-semester-metadata']);
  state.weekId = 'next-week';
  assert.deepEqual(await ids('tasks'), ['next', 'long-running', 'undated']);
  assert.deepEqual(await ids('activities'), ['earlier', 'monday', 'sunday', 'next', 'long-running', 'undated']);
  state.weekId = 'missing';
  assert.deepEqual(await ids('tasks'), ['undated']);
  state.cache.weeks = [{ id: 'missing', school_year_id: 'other', start_date: '2026-11-09', end_date: '2026-11-15' }];
  assert.deepEqual(await ids('tasks'), ['undated']);
  assert.deepEqual(rows, before);
});
