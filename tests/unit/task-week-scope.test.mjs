import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import vm from 'node:vm';

const source = await readFile(new URL('../../frontend/scripts/app.js', import.meta.url), 'utf8');
const code = source.slice(source.indexOf('        async function scoped(store)'), source.indexOf('        const canManageScores'));

test('other weeks show tasks by deadline while preserving date boundaries, undated tasks and other scopes', async () => {
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
  const context = vm.createContext({ state, today: () => '2026-11-23', db: { all: async () => rows } });
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

test('the current week also shows unfinished future tasks, but excludes completed future tasks and overdue tasks from older weeks', async () => {
  const rows = [
    { id: 'due-this-week', due_date: '2026-11-15', status: 'done' },
    { id: 'pending-next-week', due_date: '2026-11-19', status: 'doing' },
    { id: 'pending-later', due_date: '2026-11-30', status: 'todo' },
    { id: 'done-next-week', due_date: '2026-11-19', status: 'done' },
    { id: 'overdue-previous-week', due_date: '2026-11-08', status: 'todo' },
    { id: 'wrong-campus', due_date: '2026-11-19', campus_id: 'other' },
    { id: 'wrong-year', due_date: '2026-11-19', school_year_id: 'other' },
  ].map(row => ({ school_year_id: 'year', campus_id: 'campus', ...row }));
  const state = {
    yearId: 'year', semesterId: 'all', campusId: 'campus', weekId: 'first',
    cache: { weeks: [
      { id: 'first', school_year_id: 'year', start_date: '2026-11-09', end_date: '2026-11-15' },
      { id: 'next', school_year_id: 'year', start_date: '2026-11-16', end_date: '2026-11-22' },
    ] },
  };
  let date = '2026-11-13';
  const context = vm.createContext({ state, today: () => date, db: { all: async () => rows } });
  vm.runInContext(code, context);
  const ids = async () => Array.from(await context.scoped('tasks'), row => row.id);
  assert.deepEqual(await ids(), ['due-this-week', 'pending-next-week', 'pending-later']);
  rows.find(row => row.id === 'pending-later').status = 'done';
  assert.deepEqual(await ids(), ['due-this-week', 'pending-next-week']);
  state.weekId = 'next';
  assert.deepEqual(await ids(), ['pending-next-week', 'done-next-week']);
  date = '2026-11-17';
  state.weekId = 'first';
  assert.deepEqual(await ids(), ['due-this-week']);
});
