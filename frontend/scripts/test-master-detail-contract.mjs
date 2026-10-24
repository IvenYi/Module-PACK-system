import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { build } from 'esbuild';

const root = resolve(import.meta.dirname, '..');
const require = createRequire(import.meta.url);
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const plain = value => JSON.parse(JSON.stringify(value));
const directory = 'src/pages/master-data/';
const files = {
  process: `${directory}ProcessModelingPage.tsx`,
  product: `${directory}ProductModelingPage.tsx`,
  family: `${directory}ProductFamilyModelingPage.tsx`,
  document: `${directory}DocumentManagementPage.tsx`,
  template: `${directory}TemplateModelingPage.tsx`,
};
const cache = new Map();
function source(file) {
  if (!cache.has(file)) cache.set(file, ts.createSourceFile(file, readFileSync(resolve(root, file), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX));
  return cache.get(file);
}
function collect(node, predicate) {
  const matches = [];
  const visit = current => { if (predicate(current)) matches.push(current); ts.forEachChild(current, visit); };
  visit(node);
  return matches;
}
const tag = node => ts.isJsxElement(node) ? node.openingElement.tagName.getText() : ts.isJsxSelfClosingElement(node) ? node.tagName.getText() : '';
const jsx = (node, name) => collect(node, item => tag(item) === name);
const attributes = node => ts.isJsxElement(node) ? node.openingElement.attributes.properties : node.attributes.properties;
const attribute = (node, name) => attributes(node).find(item => ts.isJsxAttribute(item) && item.name.getText() === name);
function expression(node, name) {
  const value = attribute(node, name)?.initializer;
  return value && ts.isJsxExpression(value) ? value.expression : value;
}
const variable = (file, name) => {
  const matches = collect(source(file), node => ts.isVariableDeclaration(node) && node.name.getText() === name && node.initializer);
  assert.equal(matches.length, 1, `${file}: unique ${name}`);
  return matches[0].initializer;
};

// Execute the page's real column definitions and selectors without loading its
// API clients. Resolve only the top-level symbols used by the chosen expression.
function evaluate(file, input, globals = {}) {
  const sf = source(file);
  const symbols = new Map();
  sf.statements.forEach(statement => {
    if (ts.isFunctionDeclaration(statement) && statement.name) symbols.set(statement.name.text, statement);
    if (ts.isVariableStatement(statement)) statement.declarationList.declarations.forEach(declaration => {
      if (ts.isIdentifier(declaration.name) && declaration.initializer) symbols.set(declaration.name.text, declaration);
    });
  });
  const snippets = [];
  const seen = new Set(Object.keys(globals));
  function dependencies(node) {
    collect(node, ts.isIdentifier).forEach(identifier => {
      const name = identifier.text;
      if (seen.has(name) || !symbols.has(name)) return;
      seen.add(name);
      const definition = symbols.get(name);
      dependencies(definition);
      snippets.push(ts.isVariableDeclaration(definition) ? `const ${definition.getText(sf)};` : definition.getText(sf));
    });
  }
  const node = typeof input === 'string' ? ts.createSourceFile('expression.tsx', input, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX) : input;
  dependencies(node);
  const code = ts.transpileModule(`${snippets.join('\n')}\n(${typeof input === 'string' ? input : input.getText(sf)});`, { compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } }).outputText;
  return vm.runInNewContext(code, { ...globals });
}

const popupBuild = await build({
  absWorkingDir: root, entryPoints: ['src/components/ListColumnSettingsPopover.tsx'], bundle: true, write: false,
  platform: 'node', format: 'cjs', packages: 'external',
  plugins: [{ name: 'inline-popover', setup(plugin) {
    plugin.onResolve({ filter: /^@mui\/material$/ }, () => ({ path: 'mui-inline-popover', namespace: 'test' }));
    plugin.onLoad({ filter: /.*/, namespace: 'test' }, () => ({ loader: 'js', contents: `
      export const Box = mui.Box, Checkbox = mui.Checkbox, Stack = mui.Stack, Typography = mui.Typography;
      export const Popover = ({ children, PaperProps }) => React.createElement('div', { 'data-popover-width': PaperProps.sx.width }, children);
    ` }));
  } }],
});
const module = { exports: {} };
vm.runInNewContext(popupBuild.outputFiles[0].text, { module, exports: module.exports, require, console, React, mui: require('@mui/material') });
const ColumnPopover = module.exports.default;
function renderPopup(props = {}) {
  return renderToStaticMarkup(React.createElement(ColumnPopover, {
    anchorEl: null, onClose() {}, onToggle() {}, onReorder() {}, ...props,
  }));
}
const inputFor = (html, label) => Array.from(html.matchAll(/<input\b[^>]*>/g), match => match[0]).find(input => input.includes(`aria-label="${label}字段显隐"`));

test('master/detail settings match material geometry, omit operation fields and protect the final business field', () => {
  const columns = [{ id: 'name', label: '名称' }, { id: 'code', label: '编码' }, { id: 'actions', label: '操作', fixed: true }];
  const html = renderPopup({
    masterDetail: true, columns,
    settings: { version: 1, order: ['code', 'name', 'actions'], hidden: ['name'] },
    header: React.createElement('div', null, '主表', '子表'),
  });
  assert.match(html, /data-popover-width="220"/);
  assert.match(html, /主表.*子表/);
  assert.doesNotMatch(html, /操作字段显隐|data-list-column-setting-id="actions"|MuiCheckbox-root/);
  assert.match(inputFor(html, '编码'), /style="width:16px;height:16px"/);
  assert.match(inputFor(html, '编码'), /disabled=""/);
  assert.doesNotMatch(inputFor(html, '名称'), /disabled=""/);
  assert.ok(html.indexOf('data-list-column-setting-id="code"') < html.indexOf('data-list-column-setting-id="name"'), 'saved field order is retained');
});

test('standalone settings retain their existing checkbox and width', () => {
  const html = renderPopup({ columns: [{ id: 'name', label: '名称' }], settings: { version: 1, order: ['name'], hidden: [] } });
  assert.match(html, /data-popover-width="240"/);
  assert.match(html, /MuiCheckbox-root/);
});

const matrix = [
  { label: '物料管理', file: files.process, route: 'materials', key: 'materials', child: 'MATERIAL_VERSION_COLUMNS', popup: 'custom' },
  { label: '工艺路线', file: files.process, route: 'routes', key: 'routes', child: 'ROUTE_VERSION_COLUMNS', popup: 'custom' },
  { label: '产品管理', file: files.product, route: 'products', main: 'PARENT_COLUMNS', child: 'PACK_VERSION_COLUMNS', target: 'columnTarget', childOptions: 'PACK_VERSION_COLUMN_OPTIONS', popup: 'shared' },
  { label: '产品簇', file: files.family, route: 'product-families', main: 'PRODUCT_FAMILY_COLUMNS', child: 'FAMILY_MEMBER_COLUMNS', target: 'columnSettingsTarget', childOptions: 'FAMILY_MEMBER_COLUMN_OPTIONS', popup: 'shared' },
  { label: '文档管理', file: files.document, route: 'documents', main: 'documentColumns', child: 'documentVersionColumns', popup: 'custom' },
  { label: '表单模板', file: files.template, main: 'formTemplateColumns', child: 'templateVersionColumns', key: 'formTemplates', popup: 'custom' },
  { label: '批记录模板', file: files.template, main: 'batchTemplateColumns', child: 'dhrTemplateVersionColumns', key: 'batchRecordTemplates', popup: 'custom' },
];

function processMainColumns(entry) {
  const config = variable(entry.file, 'PROCESS_MODELING_PAGE_CONFIGS').properties.find(property => property.name.getText() === entry.key).initializer;
  return evaluate(entry.file, config.properties.find(property => property.name.getText() === 'columns').initializer);
}
function columnSet(entry, which) {
  return entry.file === files.process && which === 'main' ? processMainColumns(entry) : evaluate(entry.file, entry[which]);
}
const businessIds = columns => Array.from(columns.filter(column => (column.id ?? column.key) !== 'actions'), column => column.id ?? column.key);

for (const entry of matrix) {
  test(`${entry.label}: main/child options contain every business field and keep operations fixed`, () => {
    for (const which of ['main', 'child']) {
      const columns = columnSet(entry, which);
      const expected = businessIds(columns);
      assert.ok(expected.length > 0, `${which} has business fields`);
      assert.equal(columns.at(-1).id ?? columns.at(-1).key, 'actions');
      if (entry.popup === 'shared') {
        const popup = jsx(source(entry.file), 'ListColumnSettingsPopover')[0];
        const columnOptions = evaluate(entry.file, variable(entry.file, 'columnOptions'));
        const options = evaluate(entry.file, expression(popup, 'columns'), {
          columnOptions, [entry.target]: which === 'main' ? 'main' : 'child',
        });
        assert.deepEqual(Array.from(options, column => column.id), expected);
        const settings = { version: 1, order: [...expected].reverse(), hidden: expected.slice(1) };
        const html = renderPopup({ masterDetail: true, columns: options, settings });
        assert.doesNotMatch(html, /操作字段显隐/);
        assert.equal(Array.from(html.matchAll(/disabled=""/g)).length, 1, 'one visible field is protected');
      } else {
        const config = entry.file === files.process ? { columns } : columns;
        const args = entry.file === files.process ? 'config' : 'columns';
        const initial = evaluate(entry.file, `normalizeColumnSettings(${args})`, { columns, config });
        const restored = evaluate(entry.file, `normalizeColumnSettings(${args}, raw)`, {
          columns, config, raw: { version: initial.version, order: ['actions', ...expected].reverse(), hidden: [...expected, 'actions'] },
        });
        const options = entry.file === files.document
          ? evaluate(entry.file, 'configurableColumns(columns)', { columns })
          : evaluate(entry.file, `getColumnSettingsItems(${args}, settings)`, { columns, config, settings: initial });
        assert.deepEqual(Array.from(options, column => column.id), expected);
        assert.ok(!restored.order.includes('actions') && !restored.hidden.includes('actions'));
        assert.ok(expected.some(id => !restored.hidden.includes(id)), 'restored settings retain a business field');
        const visible = evaluate(entry.file, `getVisibleColumns(${args}, settings)`, { columns, config, settings: restored });
        assert.equal(visible.at(-1).id, 'actions');
      }
    }
  });
}

test('all five active routes and both retained template types are included in the audit matrix', () => {
  const router = source('src/router/index.tsx');
  for (const entry of matrix.filter(entry => entry.route)) {
    const route = jsx(router, 'Route').find(node => expression(node, 'path')?.text === entry.route);
    assert.ok(route, entry.label);
    assert.ok(jsx(route, entry.file.split('/').at(-1).replace('.tsx', '')).length, `${entry.label} uses the audited component`);
  }
  assert.equal(jsx(router, 'TemplateModelingPage').length, 0, 'template sources are retained but not mounted in Pack routes');
  const nestedTables = [];
  function scanDirectory(folder) {
    readdirSync(resolve(root, folder), { withFileTypes: true }).forEach(item => {
      const file = `${folder}/${item.name}`;
      if (item.isDirectory()) return scanDirectory(file);
      if (!file.endsWith('.tsx')) return;
      jsx(source(file), 'Table').forEach(table => {
        let parent = table.parent;
        while (parent) {
          if (tag(parent) === 'TableCell') { nestedTables.push(file); break; }
          parent = parent.parent;
        }
      });
    });
  }
  scanDirectory('src');
  assert.deepEqual([...new Set(nestedTables)].sort(), [files.process, files.document, files.template].sort(), 'new embedded table implementations must be included in the audit');
  for (const [file, child] of [[files.product, 'PackProductVersions'], [files.family, 'FamilyMemberRows']]) {
    assert.equal(jsx(source(file), child).length, 1);
    const nested = jsx(source(file), 'EvidenceTable').filter(node => attribute(node, 'embedded'));
    assert.equal(nested.length, 1, `${child} uses one embedded table`);
    assert.ok(attribute(nested[0], 'columnPreferences') && attribute(nested[0], 'tableWidth'), 'expanded rows receive the shared parent preferences and canvas width');
  }
});

test('every main/child implementation has one shared settings entry, scoped tabs and material toolbar controls', () => {
  for (const file of Object.values(files)) {
    const sf = source(file);
    assert.equal(jsx(sf, 'ListColumnSettingsButton').length, 1, `${file}: one settings entry`);
    for (const label of ['全部展开', '全部收起']) {
      assert.equal(jsx(sf, 'ListToolbarIconButton').filter(node => expression(node, 'label')?.text === label).length, 1, `${file}: shared ${label} control`);
    }
    const popup = [...jsx(sf, 'ListColumnSettingsPopover'), ...jsx(sf, 'Popover')].find(node => jsx(node, 'Tabs').length || expression(node, 'header'));
    assert.ok(popup, `${file}: settings popup with tabs`);
    const labels = new Set(jsx(popup, 'Tab').map(tab => expression(tab, 'label')?.text));
    assert.deepEqual([...labels].sort(), ['主表', '子表']);
    if (tag(popup) === 'ListColumnSettingsPopover') {
      const mode = attribute(popup, 'masterDetail');
      assert.ok(mode && (!mode.initializer || evaluate(file, expression(popup, 'masterDetail')) === true), `${file}: material popup mode`);
    }
    else {
      assert.equal(evaluate(file, expression(popup, 'PaperProps')).sx.width, 220);
      const checkbox = jsx(popup, 'input').find(node => expression(node, 'type')?.text === 'checkbox');
      assert.deepEqual(plain(evaluate(file, expression(checkbox, 'style'))), { width: 16, height: 16 });
      assert.ok(expression(checkbox, 'disabled'), `${file}: final business field remains protected`);
    }
  }
});

test('main/child tabs bind separate settings and the matching option set', () => {
  for (const entry of matrix.filter(entry => entry.popup === 'shared')) {
    const popup = jsx(source(entry.file), 'ListColumnSettingsPopover')[0];
    const main = { version: 1, order: ['main-only'], hidden: [] };
    const child = { version: 1, order: ['child-only'], hidden: [] };
    for (const target of ['main', 'child']) {
      const preferences = { settings: child };
      const selected = evaluate(entry.file, expression(popup, 'settings'), {
        [entry.target]: target, columnSettings: main,
        versionColumnPreferences: preferences, memberColumnPreferences: preferences,
      });
      assert.equal(selected, target === 'main' ? main : child);
    }
  }
  for (const [file, targetName, cases] of [
    [files.process, 'columnSettingsTab', [['main', 'columnSettings'], ['materialVersion', 'materialVersionColumnSettings'], ['routeVersion', 'routeVersionColumnSettings']]],
    [files.template, 'columnSettingsTab', [['main', 'columnSettings'], ['version', 'templateVersionColumnSettings']]],
    [files.document, 'columnSettingsTarget', [['main', 'mainColumnSettings'], ['version', 'versionColumnSettings']]],
  ]) {
    const globals = Object.fromEntries(cases.map(([, name]) => [name, { name }]));
    for (const [target, selected] of cases) assert.equal(evaluate(file, variable(file, 'activeColumnSettings'), { ...globals, [targetName]: target }), globals[selected]);
  }
  for (const [file, targetName, cases] of [
    [files.process, 'columnSettingsTab', [['main', 'columnSettingsItems'], ['materialVersion', 'materialVersionColumnSettingsItems'], ['routeVersion', 'routeVersionColumnSettingsItems']]],
    [files.template, 'columnSettingsTab', [['main', 'columnSettingsItems'], ['version', 'templateVersionColumnSettingsItems']]],
    [files.document, 'columnSettingsTarget', [['main', 'documentColumns'], ['version', 'documentVersionColumns']]],
  ]) {
    const globals = Object.fromEntries(cases.map(([, name]) => [name, [{ id: name }]]));
    for (const [target, selected] of cases) assert.equal(evaluate(file, variable(file, 'activeColumnSettingsItems'), { ...globals, [targetName]: target }), globals[selected]);
  }
});

test('product and family settings retain frozen operations when restoring older hidden-field preferences', () => {
  for (const entry of matrix.filter(entry => entry.popup === 'shared')) {
    const columns = evaluate(entry.file, variable(entry.file, 'columnOptions'));
    const ids = columns.map(column => column.id);
    const visibleId = ids.find(id => id !== 'actions');
    const saved = { version: 1, order: [...ids].reverse(), hidden: ids.filter(id => id !== visibleId) };
    const state = collect(source(entry.file), node => ts.isVariableDeclaration(node)
      && ts.isArrayBindingPattern(node.name)
      && node.name.elements.some(element => element.name?.getText() === 'columnSettings'))[0];
    const initialize = state.initializer.arguments[0];
    const restored = evaluate(entry.file, `(${initialize.getText()})()`, {
      columnStorageKey: 'saved-parent', columnOptions: columns,
      localStorage: { getItem: () => JSON.stringify(saved) },
      loadListColumnSettings: (_key, options, version) => module.exports.normalizeListColumnSettings(options, version, saved),
      normalizeListColumnSettings: module.exports.normalizeListColumnSettings,
    });
    assert.ok(!restored.hidden.includes('actions'), `${entry.label}: operations remain visible`);
    assert.ok(!restored.hidden.includes(visibleId), `${entry.label}: business-field preference is preserved`);
    assert.equal(restored.order.at(-1), 'actions');
  }
});
