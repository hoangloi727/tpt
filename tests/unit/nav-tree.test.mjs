import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import vm from 'node:vm';

const source = await readFile(new URL('../../frontend/scripts/app.js', import.meta.url), 'utf8');
const code = source.slice(source.indexOf('        function renderNav()'), source.indexOf('        async function go('));

class Element {
  constructor() {
    this.children = [];
    this.attributes = {};
    this.dataset = {};
    this.className = '';
    this.hidden = false;
    this.classList = {
      contains: name => this.className.split(' ').includes(name),
      add: name => { this.className += ` ${name}`; },
    };
  }
  setAttribute(key, value) { this.attributes[key] = value; }
  removeAttribute(key) { delete this.attributes[key]; }
  hasAttribute(key) { return key in this.attributes; }
  replaceChildren(...children) { this.children = children; children.forEach(child => { child.nav = this; }); }
  get childElementCount() { return this.children.length; }
  after(element) { this.nav.children.push(element); element.nav = this.nav; }
  remove() { this.nav.children = this.nav.children.filter(child => child !== this); }
  querySelector(selector) { return this.children.find(child => selector.includes(`"${child.dataset.page}"`)); }
  closest() { return this.container; }
  click() { this.onclick?.(); }
  focus() {}
}

test('navigation children reuse page controls, follow selection, and collapse without navigating', () => {
  const nav = new Element();
  let sources = [], navigated;
  const context = vm.createContext({
    NAV: [['organization', '', 'Tổ chức'], ['scores', '', 'Thi đua'], ['settings', '', 'Thiết lập']],
    state: { page: 'organization' }, canAccessPage: id => id !== 'settings', esc: String,
    go: page => { navigated = page; },
    document: { createElement: () => new Element(), activeElement: null },
    $: selector => selector === '#nav' ? nav : selector === '#content'
      ? { querySelectorAll: () => sources }
      : nav.children.find(child => child.id === 'navChildren'),
  });
  const container = new Element(), all = new Element(), unit = new Element();
  for (const button of [all, unit]) { button.container = container; button.disabled = false; }
  all.className = 'active'; all.textContent = 'Tất cả'; unit.textContent = 'Đội nghi lễ';
  unit.onclick = () => { all.className = ''; unit.className = 'active'; };
  sources = [all, unit];
  vm.runInContext(code, context);
  context.renderNav();
  let group = nav.children.find(child => child.id === 'navChildren');
  assert.equal(group.children.length, 2);
  assert.equal(container.classList.contains('sidebar-tab-source'), true);
  assert.equal(nav.children.some(child => child.dataset.page === 'settings'), false);
  assert.equal(group.children[0].attributes['aria-pressed'], 'true');
  group.children[1].click();
  context.syncNavChildren();
  assert.equal(group.children[1].attributes['aria-pressed'], 'true');
  assert.equal(group.children[0].attributes['aria-pressed'], 'false');
  const parent = nav.children.find(child => child.dataset.page === 'organization');
  parent.click();
  assert.equal(group.hidden, true);
  assert.equal(parent.attributes['aria-expanded'], 'false');
  assert.equal(navigated, undefined);
  parent.click();
  assert.equal(group.hidden, false);
  unit.disabled = true;
  context.syncNavChildren();
  assert.equal(group.children[1].disabled, true);
  sources = [];
  context.syncNavChildren();
  assert.equal(nav.children.some(child => child.id === 'navChildren'), false);
  assert.equal(parent.hasAttribute('aria-expanded'), false);

  context.state.page = 'scores';
  sources = ['entry', 'ranking', 'anomaly', 'history'].map(tab => {
    const button = new Element();
    button.dataset.scoreTab = tab;
    button.textContent = tab;
    return button;
  });
  const rankingGroups = ['Tất cả nhóm', 'Khối 6'].map(label => {
    const button = new Element();
    button.setAttribute('data-ranking-group', label);
    button.textContent = label;
    return button;
  });
  let selectedGroup;
  rankingGroups[1].onclick = () => { selectedGroup = 'Khối 6'; };
  sources.push(...rankingGroups);
  context.renderNav();
  group = nav.children.find(child => child.id === 'navChildren');
  assert.deepEqual(Array.from(group.children, button => button.textContent),
    ['entry', 'ranking', 'Tất cả nhóm', 'Khối 6', 'anomaly', 'history']);
  assert.equal(group.children[2].classList.contains('nav-grandchild'), true);
  group.children[3].click();
  assert.equal(selectedGroup, 'Khối 6');
  sources = sources.filter(button => !button.hasAttribute('data-ranking-group'));
  context.syncNavChildren();
  assert.deepEqual(Array.from(group.children, button => button.textContent),
    ['entry', 'ranking', 'anomaly', 'history']);
});
