import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { test } from 'node:test';
import vm from 'node:vm';
import { build } from 'esbuild';

const require = createRequire(import.meta.url);
const root = resolve(import.meta.dirname, '..');
const hookBundle = await build({
  absWorkingDir: root, entryPoints: ['src/components/usePersistedListColumnWidths.ts'], bundle: true, write: false,
  platform: 'node', format: 'cjs', packages: 'external',
  plugins: [{ name: 'hook-boundaries', setup(plugin) {
    plugin.onResolve({ filter: /^react$|^\.\/ListColumnSettingsPopover$/ }, ({ path }) => ({ path, namespace: 'stub' }));
    plugin.onLoad({ filter: /.*/, namespace: 'stub' }, ({ path }) => ({ loader: 'js', contents: path === 'react'
      ? 'export const useState = (...args) => hooks.state(...args); export const useRef = (...args) => hooks.ref(...args); export const useMemo = fn => fn(); export const useCallback = fn => fn; export const useEffect = fn => hooks.effect(fn);'
      : 'export const getCurrentUserPreferenceStorageKey = prefix => prefix + "admin";' }));
  } }],
});

function resizeHarness(initialStorage = {}) {
  let index = 0;
  const values = [];
  const effects = [];
  const listeners = new Map();
  const storage = new Map(Object.entries(initialStorage));
  const sandbox = { module: { exports: {} }, require, console, window: {},
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
    document: { addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: name => listeners.delete(name) },
    hooks: {
      state(initial) { const slot = index++; if (!(slot in values)) values[slot] = typeof initial === 'function' ? initial() : initial; return [values[slot], value => { values[slot] = typeof value === 'function' ? value(values[slot]) : value; }]; },
      ref(initial) { const slot = index++; return values[slot] ?? (values[slot] = { current: initial }); },
      effect(fn) { effects.push(fn); },
    },
  };
  sandbox.exports = sandbox.module.exports;
  vm.runInNewContext(hookBundle.outputFiles[0].text, sandbox);
  const columns = [{ id: 'name', width: 180, minWidth: 100 }, { id: 'code', width: 160 }, { id: 'actions', width: 200 }];
  const render = () => { index = 0; effects.length = 0; const hook = sandbox.module.exports.usePersistedListColumnWidths(columns, 'table:'); return hook; };
  const event = (x, pointerId = 1) => ({ clientX: x, pointerId, preventDefault() {}, stopPropagation() {}, currentTarget: { setPointerCapture() {}, hasPointerCapture: () => false, closest: () => ({ parentElement: { clientWidth: 1000 } }) } });
  return { render, columns, listeners, storage, event, persist: () => effects.forEach(fn => fn()) };
}

test('first drag starts at the displayed width and freezes the other displayed columns', () => {
  const h = resizeHarness();
  h.render().getResizeHandleProps(h.columns[0], { name: 300, code: 280, actions: 200 }).onPointerDown(h.event(400));
  h.listeners.get('pointermove')(h.event(470));
  const result = h.render();
  assert.equal(result.getColumnWidth(h.columns[0]), 370);
  assert.equal(result.getColumnWidth(h.columns[1]), 280);
  assert.equal(result.getColumnWidth(h.columns[2]), 200);
  h.persist();
  assert.equal(JSON.parse(h.storage.get('table:admin')).name, 370);
});

test('another pointer cannot resize the column and the minimum width is enforced', () => {
  const h = resizeHarness();
  h.render().getResizeHandleProps(h.columns[0]).onPointerDown(h.event(400));
  h.listeners.get('pointermove')(h.event(700, 2));
  assert.equal(h.render().getColumnWidth(h.columns[0]), 180);
  h.listeners.get('pointermove')(h.event(0));
  assert.equal(h.render().getColumnWidth(h.columns[0]), 100);
  h.listeners.get('pointercancel')(h.event(0));
  assert.equal(h.listeners.size, 0);
});

test('invalid saved widths fall back while valid widths retain each column minimum', () => {
  const h = resizeHarness({ 'table:admin': JSON.stringify({ name: 20, code: 'wide', actions: 240 }) });
  const result = h.render();
  assert.equal(result.getColumnWidth(h.columns[0]), 100);
  assert.equal(result.getColumnWidth(h.columns[1]), 160);
  assert.equal(result.getColumnWidth(h.columns[2]), 240);
});

test('shrinking a fitted column follows the pointer and moves only the viewport gap into another content column', () => {
  const h = resizeHarness();
  h.render().getResizeHandleProps(h.columns[0], { name: 400, code: 400, actions: 200 }, 'code').onPointerDown(h.event(400));
  h.listeners.get('pointermove')(h.event(300));
  let result = h.render();
  assert.equal(result.getColumnWidth(h.columns[0]), 300);
  assert.equal(result.getColumnWidth(h.columns[1]), 500);
  assert.equal(result.getColumnWidth(h.columns[2]), 200);
  h.listeners.get('pointermove')(h.event(450));
  result = h.render();
  assert.equal(result.getColumnWidth(h.columns[0]), 450);
  assert.equal(result.getColumnWidth(h.columns[1]), 400);
});

const columnBundle = await build({
  absWorkingDir: root, entryPoints: ['src/components/ListColumnSettingsPopover.tsx'], bundle: true, write: false,
  platform: 'node', format: 'cjs', packages: 'external',
});
const columnSandbox = { module: { exports: {} }, require, console };
columnSandbox.exports = columnSandbox.module.exports;
vm.runInNewContext(columnBundle.outputFiles[0].text, columnSandbox);
const { reorderListColumns, normalizeListColumnSettings } = columnSandbox.module.exports;

test('fields move in both directions including the last position, while fixed actions stay last', () => {
  const columns = [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }, { id: 'c', label: 'C' }, { id: 'actions', label: '操作', fixed: true }];
  const initial = normalizeListColumnSettings(columns, 1);
  const down = reorderListColumns(columns, initial, 'a', 'c');
  assert.deepEqual(Array.from(down.order), ['b', 'c', 'a', 'actions']);
  const up = reorderListColumns(columns, down, 'a', 'b');
  assert.deepEqual(Array.from(up.order), ['a', 'b', 'c', 'actions']);
  assert.equal(reorderListColumns(columns, up, 'a', 'actions'), up);
});

test('saved settings discard removed fields, add new fields, and preserve an available data column', () => {
  const columns = [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }];
  const result = normalizeListColumnSettings(columns, 1, { version: 1, order: ['removed', 'a', 'a'], hidden: ['a', 'b', 'removed'] });
  assert.deepEqual(Array.from(result.order), ['a', 'b']);
  assert.ok(result.hidden.length < result.order.length);
});

test('saved settings with fixed actions restore a data field when every data field was hidden', () => {
  const columns = [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }, { id: 'actions', label: '操作', fixed: true }];
  for (const hidden of [['a', 'b'], ['actions', 'a', 'b']]) {
    const result = normalizeListColumnSettings(columns, 1, { version: 1, order: ['b', 'a', 'actions'], hidden });
    assert.ok(columns.some(column => !column.fixed && !result.hidden.includes(column.id)), 'an operation column cannot be the only visible field');
    assert.deepEqual(Array.from(result.order), ['b', 'a', 'actions']);
  }
});

test('saved settings retain the existing visible-column fallback when all columns are fixed', () => {
  const columns = [{ id: 'a', label: 'A', fixed: true }, { id: 'b', label: 'B', fixed: true }];
  const result = normalizeListColumnSettings(columns, 1, { version: 1, order: ['a', 'b'], hidden: ['b', 'a'] });
  assert.deepEqual(Array.from(result.hidden), ['a']);
});

const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const tableBundle = await build({
  absWorkingDir: root, entryPoints: ['src/components/ConfigurableListTable.tsx'], bundle: true, write: false,
  platform: 'node', format: 'cjs', packages: 'external',
});

function tableRuntime(initialStorage = {}) {
  const storage = new Map(Object.entries(initialStorage));
  const sandbox = {
    module: { exports: {} }, require, console, window: {},
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
  };
  sandbox.exports = sandbox.module.exports;
  vm.runInNewContext(tableBundle.outputFiles[0].text, sandbox);
  return sandbox.module.exports;
}

const childColumns = [
  { key: 'code', label: '制造编码', width: 180 },
  { key: 'name', label: '名称', width: 180 },
  { key: 'version', label: '版本', width: 120 },
  { key: 'actions', label: '操作', width: 100, render: () => '进入配置' },
];
const tableSections = html => Array.from(html.matchAll(/<table\b[^>]*>[\s\S]*?<\/table>/g), match => match[0]);
const cellTexts = (html, tag) => Array.from(html.matchAll(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'g')), match => match[1]
  .replace(/<style\b[^>]*>[\s\S]*?<\/style>/g, '').replace(/<[^>]*>/g, ''));

test('embedded tables share restored parent preferences and omit their own settings entry', () => {
  const { default: ConfigurableListTable, useListTableColumns } = tableRuntime({
    user: JSON.stringify({ id: 'admin' }),
    'list-table-fields:shared-versions:admin': JSON.stringify({ version: 1, order: ['version', 'code', 'name'], hidden: ['name'] }),
    'list-table-widths:shared-versions:admin': JSON.stringify({ version: 150, actions: 99999 }),
    'list-table-fields:child-one:admin': JSON.stringify({ version: 1, order: ['name', 'code', 'version'], hidden: ['code'] }),
  });
  function ExpandedTables() {
    const preferences = useListTableColumns(childColumns, 'shared-versions');
    assert.equal(preferences.minTableWidth, 430, 'historic operation widths cannot widen every expanded table');
    return React.createElement(React.Fragment, null, ...['one', 'two'].map(id => React.createElement(ConfigurableListTable, {
      key: id, preferenceKey: `child-${id}`, columns: childColumns,
      rows: [{ id, code: `CODE-${id}`, name: `HIDDEN-${id}`, version: `V-${id}` }],
      columnPreferences: preferences, embedded: true, tableWidth: 900,
    })));
  }
  const html = renderToStaticMarkup(React.createElement(ExpandedTables));
  const tables = tableSections(html);
  assert.equal(tables.length, 2);
  assert.doesNotMatch(html, /aria-label="字段设置"/);
  const containers = Array.from(html.matchAll(/<div\b[^>]*class="([^"]*MuiTableContainer-root[^"]*)"/g));
  assert.equal(containers.length, 2, 'each embedded table uses the material table container');
  containers.forEach(container => {
    const cssClass = container[1].split(' ').find(name => name.startsWith('css-'));
    const style = new RegExp(`\\.${cssClass}\\{([^}]*)\\}`).exec(html)?.[1] || '';
    assert.equal(Array.from(style.matchAll(/(?:^|;)overflow:([^;]+)/g), match => match[1]).at(-1), 'visible', 'the parent owns scrolling');
  });
  tables.forEach((table, index) => {
    const id = index === 0 ? 'one' : 'two';
    assert.deepEqual(cellTexts(table, 'th'), ['版本', '制造编码', '操作']);
    assert.deepEqual(cellTexts(table, 'td'), [`V-${id}`, `CODE-${id}`, '进入配置']);
    assert.doesNotMatch(table, /HIDDEN-/);
    const columnWidths = Array.from(table.matchAll(/<col style="width:(\d+)px"/g), match => Number(match[1]));
    assert.equal(columnWidths.reduce((sum, width) => sum + width, 0), 900);
    assert.equal(columnWidths.at(-1), 100, 'the frozen operation column retains its declared width');
  });
});

test('standalone tables retain a settings entry and their own saved column preferences', () => {
  const { default: ConfigurableListTable } = tableRuntime({
    'list-table-fields:standalone:anonymous': JSON.stringify({ version: 1, order: ['name', 'version', 'code'], hidden: ['version'] }),
  });
  const html = renderToStaticMarkup(React.createElement(ConfigurableListTable, {
    preferenceKey: 'standalone', columns: childColumns,
    rows: [{ id: 'standalone', code: 'CODE', name: 'NAME', version: 'HIDDEN' }],
  }));
  assert.equal(Array.from(html.matchAll(/aria-label="字段设置"/g)).length, 1);
  assert.match(html, /MuiTableContainer-root/);
  assert.deepEqual(cellTexts(tableSections(html)[0], 'th'), ['名称', '制造编码', '操作']);
  assert.deepEqual(cellTexts(tableSections(html)[0], 'td'), ['NAME', 'CODE', '进入配置']);
});

test('embedded empty and loading rows retain the compact 40px row height', () => {
  const { default: ConfigurableListTable } = tableRuntime();
  for (const loading of [false, true]) {
    const html = renderToStaticMarkup(React.createElement(ConfigurableListTable, {
      preferenceKey: 'empty-child', columns: childColumns, rows: [], embedded: true,
      tableWidth: 900, loading, emptyText: '暂无版本',
    }));
    const cellClasses = /<td\b[^>]*class="([^"]*)"/.exec(html)?.[1].split(' ') || [];
    const cellClass = cellClasses.find(name => name.startsWith('css-'));
    assert.ok(cellClass, 'empty state renders a styled table cell');
    const cellStyle = new RegExp(`\\.${cellClass}\\{([^}]*)\\}`).exec(html)?.[1] || '';
    const height = Array.from(cellStyle.matchAll(/(?:^|;)height:([^;]+)/g), match => match[1]).at(-1);
    assert.equal(height, '40px');
    assert.doesNotMatch(html, /aria-label="字段设置"/);
    if (loading) assert.match(html, /role="progressbar"/);
    else assert.deepEqual(cellTexts(tableSections(html)[0], 'td'), ['暂无版本']);
  }
});
