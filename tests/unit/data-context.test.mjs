import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import vm from 'node:vm';

const context = vm.createContext({ window: {} });
vm.runInContext(await readFile(new URL('../../frontend/scripts/app-utils.js', import.meta.url), 'utf8'), context);
const resolve = (data, selected = {}, date = '2026-11-13') => JSON.parse(JSON.stringify(context.window.TPTAppModules.utils.resolveDataContext(data, selected, date)));
const data = {
  years: [{ id: 'old', is_current: true, start_date: '2025-08-01', end_date: '2026-05-31' }, { id: 'year', start_date: '2026-08-01', end_date: '2027-05-31' }],
  sems: [{ id: 'first', school_year_id: 'year', start_date: '2026-08-01', end_date: '2027-01-10' }, { id: 'second', school_year_id: 'year', start_date: '2027-01-11', end_date: '2027-05-31' }],
  weeks: [
    { id: 'next', school_year_id: 'year', start_date: '2026-11-16', end_date: '2026-11-22' },
    { id: 'current', school_year_id: 'year', start_date: '2026-11-09', end_date: '2026-11-15' },
    { id: 'previous', school_year_id: 'year', start_date: '2026-11-02', end_date: '2026-11-08' },
    { id: 'january', school_year_id: 'year', start_date: '2027-01-11', end_date: '2027-01-17' },
  ],
  campuses: [{ id: 'campus' }],
};

test('defaults select the school year, semester and week containing today', () => {
  const selected = resolve(data);
  assert.equal(selected.yearId, 'year');
  assert.equal(selected.semesterId, 'first');
  assert.equal(selected.weekId, 'current');
  assert.equal(selected.campusId, 'all');
  assert.deepEqual(selected.weekOptions.map(week => week.id), ['previous', 'current', 'next']);
});

test('manual selections survive refresh and semester changes exclude weeks from other semesters', () => {
  const selected = resolve(data, { yearId: 'year', semesterId: 'second', weekId: 'current', campusId: 'campus' });
  assert.equal(selected.semesterId, 'second');
  assert.equal(selected.weekId, 'january');
  assert.equal(selected.campusId, 'campus');
  assert.deepEqual(selected.weekOptions.map(week => week.id), ['january']);
  const all = resolve(data, { yearId: 'year', semesterId: 'all', weekId: 'previous' });
  assert.equal(all.semesterId, 'all');
  assert.equal(all.weekId, 'previous');
  assert.equal(all.weekOptions.length, 4);
});

test('holidays choose the nearest configured week and stale selections cannot cross school years', () => {
  assert.equal(resolve(data, {}, '2026-11-23').weekId, 'next');
  assert.equal(resolve(data, {}, '2027-01-11').semesterId, 'second');
  const old = resolve(data, { yearId: 'old', semesterId: 'second', weekId: 'january', campusId: 'removed' });
  assert.equal(old.yearId, 'old');
  assert.equal(old.semesterId, 'all');
  assert.equal(old.weekId, '');
  assert.equal(old.campusId, 'all');
  assert.deepEqual(old.weekOptions, []);
  assert.deepEqual(resolve({ years: [], sems: [], weeks: [], campuses: [] }), { yearId: '', semesterId: 'all', weekId: '', campusId: 'all', weekOptions: [] });
});
