import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import vm from 'node:vm';

const source = await readFile(new URL('../../frontend/scripts/app.js', import.meta.url), 'utf8');
const render = source.slice(source.indexOf('        async function renderEntity(key)'), source.indexOf('        function entityColumns(key)'));

test('organization tabs retain existing units and combine search with campus filtering', async () => {
  const rows = [
    { id: '1', name: 'An', unit: 'Đội nghi lễ', campus_id: 'a' },
    { id: '2', name: 'Bình', unit: 'Đội nghi lễ', campus_id: 'b' },
    { id: '3', name: 'An', unit: 'Ban cũ', campus_id: 'a' },
  ];
  const elements = { '#entitySearch': { value: '' }, '#entityCampus': { value: 'all' } };
  const tabs = ['', 'Đội nghi lễ', 'Ban cũ'].map(unit => ({
    dataset: { organizationUnit: unit }, classList: { toggle() {} }, setAttribute() {},
  }));
  let html, visible;
  const context = vm.createContext({
    ENTITY: { organization: { store: 'team_members', title: 'Tổ chức', desc: '', fields: [] } },
    state: { cache: { campuses: [] }, entityPage: 5 },
    scoped: async () => rows,
    configItems: async () => [{ label: 'Đội nghi lễ' }],
    setContent: value => { html = value; }, pageHead: () => '', esc: String,
    entityColumns: () => [],
    renderEntityRows: (key, filtered) => { visible = Array.from(filtered, row => row.id); },
    $: selector => elements[selector],
    $$: selector => selector === '[data-organization-unit]' ? tabs : [],
    debounce: fn => fn,
  });
  await vm.runInContext(`${render}\nrenderEntity('organization')`, context);
  assert.match(html, /Ban cũ/);
  assert.deepEqual(visible, ['1', '2', '3']);
  tabs[1].onclick();
  assert.deepEqual(visible, ['1', '2']);
  elements['#entityCampus'].value = 'a';
  elements['#entityCampus'].onchange();
  assert.deepEqual(visible, ['1']);
  elements['#entitySearch'].value = 'Bình';
  elements['#entitySearch'].oninput();
  assert.deepEqual(visible, []);
  assert.equal(context.state.entityPage, 0);
  elements['#entitySearch'].value = '';
  tabs[0].onclick();
  assert.deepEqual(visible, ['1', '3']);
  context.state.organizationUnit = 'Đã xóa';
  await vm.runInContext("renderEntity('organization')", context);
  assert.equal(context.state.organizationUnit, '');
});
