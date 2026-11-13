import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import vm from 'node:vm';

const source = await readFile(new URL('../../frontend/scripts/app.js', import.meta.url), 'utf8');
const start = source.indexOf('        function renderDocumentItems(');
const end = source.indexOf('        function bindDocumentActions(', start);
const context = vm.createContext({
  state: { documentView: 'grid' }, esc: value => String(value).replaceAll('<', '&lt;'),
  formatBytes: size => `${size} B`, fmtDateTime: String,
});
vm.runInContext(source.slice(start, end), context);

test('document type filters recognize uploaded formats and preserve all-file view', () => {
  for (const extension of ['pdf', 'PDF']) assert.equal(context.documentFileMatchesType({ extension }, 'pdf'), true);
  for (const extension of ['png', 'jpg', 'jpeg', 'webp']) assert.equal(context.documentFileMatchesType({ extension }, 'image'), true);
  for (const extension of ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'csv']) assert.equal(context.documentFileMatchesType({ extension }, 'office'), true);
  assert.equal(context.documentFileMatchesType({ extension: 'pdf' }, 'image'), false);
  assert.equal(context.documentFileMatchesType(null, 'pdf'), false);
  assert.equal(context.documentFileMatchesType(null, 'all'), true);
});

test('document cards preserve file actions, escape names, and distinguish empty states', () => {
  const rows = [{ id: 'doc', name: '<Tài liệu>', updated_at: '2026-11-13', pinned: true }];
  const attachments = new Map([['doc', { extension: 'pdf', size: 25 }]]);
  const grid = context.renderDocumentItems(rows, attachments, false);
  assert.match(grid, /&lt;Tài liệu>/);
  assert.match(grid, /25 B/);
  assert.match(grid, /Đã ghim/);
  for (const action of ['open', 'edit', 'delete']) assert.match(grid, new RegExp(`data-doc-${action}="doc"`));
  const trash = context.renderDocumentItems(rows, attachments, true);
  assert.match(trash, /data-doc-restore="doc"/);
  assert.match(trash, /data-doc-purge="doc"/);
  assert.doesNotMatch(trash, /data-doc-open/);
  context.state.documentView = 'list';
  assert.match(context.renderDocumentItems(rows, attachments, false), /<table>/);
  assert.match(context.renderDocumentItems([], attachments, false), /Chưa có tài liệu/);
  assert.match(context.renderDocumentItems([], attachments, true), /Thùng rác trống/);
  context.state.documentSearch = 'không tồn tại';
  assert.match(context.renderDocumentItems([], attachments, false), /Không tìm thấy tài liệu/);
});

