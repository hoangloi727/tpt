import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import vm from 'node:vm';

const context = vm.createContext({ window: {} });
vm.runInContext(await readFile(new URL('../../frontend/scripts/app-utils.js', import.meta.url), 'utf8'), context);
const { parseAccountImportText: parse, prepareBulkImportRows: prepare } = context.window.TPTAppModules.utils;
const plain = value => JSON.parse(JSON.stringify(value));
const fields = [
  { name: 'name', label: 'Họ và tên', required: true, defaultValue: '' },
  { name: 'quantity', label: 'Số lượng', type: 'number', defaultValue: '0', validate: value => value >= 0 },
  { name: 'date', label: 'Ngày', type: 'date', defaultValue: '' },
  { name: 'status', label: 'Trạng thái', defaultValue: 'draft', options: [{ value: 'draft', label: 'Dự thảo' }, { value: 'active', label: 'Đang làm' }] },
  { name: 'active', label: 'Đang dùng', type: 'checkbox', defaultValue: 'true' },
];

test('bulk import reads Vietnamese CSV headers, quoted text, dates, numbers, defaults and booleans', () => {
  const rows = parse('\ufeffHọ và tên,Số lượng,Ngày,Trạng thái,Đang dùng\r\n"An, Bình","1,5",20/11/2026,Đang làm,Có\r\nHà,,,,Không');
  const result = plain(prepare(rows, fields, { defaults: { school_year_id: 'year', campus_id: 'campus' } }));
  assert.deepEqual(result.map(item => item.errors), [[], []]);
  assert.equal(result[0].row, 2);
  assert.deepEqual(result[0].data, { name: 'An, Bình', quantity: 1.5, date: '2026-11-20', status: 'active', active: true, school_year_id: 'year', campus_id: 'campus' });
  assert.equal(result[1].data.quantity, 0);
  assert.equal(result[1].data.status, 'draft');
  assert.equal(result[1].data.active, false);
  assert.equal(prepare([['An', '']], [{ name: 'name' }, { name: 'number', type: 'number' }])[0].data.number, 0);
  const tsv = plain(prepare(parse('An\t2\t2026-11-20T00:00:00.000Z\tactive\t1'), fields));
  assert.equal(tsv[0].data.date, '2026-11-20');
  assert.deepEqual(tsv[0].errors, []);
});

test('bulk import rejects bad dates, missing fields, invalid choices, nonfinite numbers and extra columns', () => {
  const result = plain(prepare([
    ['', '-1', '31/02/2026', 'missing', 'maybe', 'extra'],
    ['An', 'Infinity', '2026-13-01', 'draft', 'true'],
    ['Bình', '2', '2024-02-29', 'draft', 'true'],
  ], fields));
  assert.ok(result[0].errors.length >= 6);
  assert.ok(result[1].errors.some(error => error.includes('số không hợp lệ')));
  assert.ok(result[1].errors.some(error => error.includes('ngày không hợp lệ')));
  assert.deepEqual(result[2].errors, []);
  assert.throws(() => prepare([['', '', '']], fields), /Chưa có dữ liệu/);
  assert.throws(() => prepare(Array.from({ length: 2001 }, () => ['An']), fields), /2.000/);
});

test('bulk import matches option IDs or unambiguous labels and prevents duplicate members across groups', () => {
  const groupFields = [
    { name: 'name', label: 'Tên nhóm', required: true },
    { name: 'class_ids', label: 'Các lớp', multiple: true, options: [
      { value: 'a', label: '6A' }, { value: 'b', label: '6B' },
      { value: 'c', label: '7A' }, { value: 'd', label: '7A' },
    ] },
  ];
  const result = plain(prepare([['Nhóm 1', '6A|b'], ['Nhóm 2', 'a'], ['Nhóm 3', '7A']], groupFields, { unique: ['class_ids'] }));
  assert.deepEqual(result[0].data.class_ids, ['a', 'b']);
  assert.deepEqual(result[0].errors, []);
  assert.ok(result[1].errors.some(error => error.includes('trùng')));
  assert.ok(result[2].errors.some(error => error.includes('trùng tên')));
});

test('bulk import detects existing codes, duplicates within a file, and folder names within their parent', () => {
  const codeFields = [{ name: 'code', label: 'Mã', required: true }];
  const result = plain(prepare([['old'], ['NEW'], ['new']], codeFields, { unique: ['code'], existing: [{ code: 'OLD' }] }));
  assert.ok(result[0].errors.length);
  assert.deepEqual(result[1].errors, []);
  assert.ok(result[2].errors.length);
  const folders = plain(prepare([['root', 'Hồ sơ'], ['other', 'Hồ sơ']], [
    { name: 'parent_id', label: 'Thư mục cha' }, { name: 'name', label: 'Tên' },
  ], { unique: [['parent_id', 'name']], existing: [{ parent_id: 'root', name: 'Hồ sơ' }] }));
  assert.ok(folders[0].errors.length);
  assert.deepEqual(folders[1].errors, []);
});

test('bulk incident import appends existing records, calculates configured points, and retries without duplicate incidents', async () => {
  const source = await readFile(new URL('../../frontend/scripts/app.js', import.meta.url), 'utf8');
  const code = source.slice(source.indexOf('        async function openCategoryScoreEntry(button)'), source.indexOf('        async function saveScoreCell(ev)'));
  const nodes = new Map();
  const $ = selector => { if (!nodes.has(selector)) nodes.set(selector, {}); return nodes.get(selector); };
  const existing = { id: 'entry', revision: 2, entry_state: 'value', incidents: [{ id: 'old', criteria_id: 'rule', person_name: 'An' }] };
  const ctx = {
    criteria: [{ id: 'category', is_category: true, name: 'Nề nếp', code: 'NN' }],
    classes: [{ id: 'class', class_name: '6A', campus_id: 'campus' }],
    rules: [{ id: 'rule', criteria_group_id: 'category', code: 'NN1', name: 'Đi muộn', points: -2 }],
    sheet: { id: 'sheet' },
  };
  let importOptions, columns, saved, fail = true;
  const scope = vm.createContext({
    $, $$: () => [], scoreContext: async () => ctx, uid: () => 'new-entry',
    state: { yearId: 'year', weekId: 'week', scoreDate: '2026-11-16' },
    esc: String, fmtDate: String, openModal() {}, closeModal() {}, toast() {}, renderScores: async () => {},
    showFormBulkImport: (_title, fields, options) => { columns = fields; importOptions = options; },
    db: { get: async () => existing, put: async (_store, row) => {
      if (fail) { fail = false; throw new Error('Temporary failure'); }
      saved = plain(row); return { ...row, revision: 3 };
    } },
  });
  vm.runInContext(code, scope);
  await scope.openCategoryScoreEntry({ dataset: { category: 'category', class: 'class', entry: 'entry' } });
  $('#importIncidents').onclick();
  assert.equal(columns[0].validate('x'.repeat(121)), false);
  const incoming = [{ id: 'new', criteria_id: 'rule', person_name: 'Bình', points: 999 }];
  await assert.rejects(importOptions.save(incoming), /Temporary failure/);
  await importOptions.save(incoming);
  assert.equal(saved.incidents.length, 2);
  assert.deepEqual(saved.incidents.map(row => row.person_name), ['An', 'Bình']);
  assert.deepEqual(saved.incidents.map(row => row.points), [-2, -2]);
  assert.equal(saved.value, -4);
  assert.equal(saved.id, 'entry');
  assert.equal(saved.revision, 2);
  assert.equal(saved.sheet_id, 'sheet');
  assert.equal(saved.entry_date, '2026-11-16');
  assert.equal(saved.class_id, 'class');
  assert.equal(existing.incidents.length, 1);
  await assert.rejects(importOptions.save([{ id: 'bad', person_name: '', criteria_id: 'rule' }]), /họ tên/);
});
