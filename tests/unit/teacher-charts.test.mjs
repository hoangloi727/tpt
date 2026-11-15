import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import vm from 'node:vm';
const source = await readFile(new URL('../../frontend/scripts/app.js', import.meta.url), 'utf8');
const context = vm.createContext({ esc: value => String(value).replaceAll('<', '&lt;') });
vm.runInContext(source.slice(source.indexOf('        function teacherViolationChart('), source.indexOf('        async function renderTeacherClass(')), context);
test('teacher charts count negative incidents, preserve unnamed pupils and exclude rewards', () => {
  const incidents = [
    { points: -2, rule: 'Đi muộn', person_name: 'An' },
    { points: -1, rule: 'Đi muộn', person_name: '' },
    { points: -1, rule: '<Lỗi>', person_name: 'An' },
    { points: 5, rule: 'Khen', person_name: 'Bình' },
  ];
  const rules = context.teacherViolationChart(incidents, 'rule');
  assert.match(rules, /3 lượt vi phạm/);
  assert.match(rules, /2 · 66.7%/);
  assert.match(rules, /&lt;Lỗi>/);
  assert.doesNotMatch(rules, /Khen/);
  assert.match(context.teacherViolationChart(incidents, 'person_name'), /Chưa ghi tên/);
  assert.match(context.teacherViolationChart([], 'rule'), /Chưa có vi phạm/);
});
