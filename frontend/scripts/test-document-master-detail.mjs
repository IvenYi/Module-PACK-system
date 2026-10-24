import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { test } from 'node:test';
import vm from 'node:vm';
import { build } from 'esbuild';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

const root = resolve(import.meta.dirname, '..');
const require = createRequire(import.meta.url);
const path = 'src/pages/master-data/DocumentManagementPage.tsx';
const source = ts.createSourceFile(path, readFileSync(resolve(root, path), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const imports = new Set(['react', '@mui/material', '@mui/icons-material', '@/components/TableStateCell', '@/components/listTableStyles', '@/components/StatusBadge', '@/utils/rdoVersionStatus']);
const declarations = new Set(['DOCUMENT_COLUMN_SETTINGS_VERSION', 'documentColumns', 'documentVersionColumns', 'tableHeaderCellSx', 'tableRowSx', 'getOperationColumnSx', 'formatDateTime', 'configurableColumns', 'normalizeColumnSettings', 'getVisibleColumns', 'DocumentRows']);
const selected = source.statements.filter((node) => {
  if (ts.isImportDeclaration(node)) return imports.has(node.moduleSpecifier.text);
  if (ts.isFunctionDeclaration(node)) return declarations.has(node.name?.text);
  return ts.isVariableStatement(node) && node.declarationList.declarations.some((item) => declarations.has(item.name.getText(source)));
});
const output = await build({
  absWorkingDir: root,
  stdin: { contents: `${selected.map((node) => node.getText(source)).join('\n')}\nexport { ${[...declarations].join(', ')} };`, resolveDir: root, loader: 'tsx' },
  bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external', jsx: 'automatic',
});
const module = { exports: {} };
vm.runInNewContext(output.outputFiles[0].text, { module, exports: module.exports, require, console });
const api = module.exports;
const plain = (value) => JSON.parse(JSON.stringify(value));

function elements(node) {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!React.isValidElement(node)) return [];
  return [node, ...elements(node.props.children)];
}

const document = {
  id: 'fixture-document', title: '验证文档', categoryName: '工艺文件', createdBy: '测试员', updatedBy: '测试员',
  createdAt: '2026-10-24T08:00:00', updatedAt: '2026-10-24T08:00:00',
  versions: [{ id: 'fixture-version', version: 'V1.0', code: 'DOC-001', status: 'ACTIVE', fileName: '流程.pdf', description: '初版' }],
};

function fixture({ settings, versions = document.versions, expanded = true, callbacks = {} } = {}) {
  const mainColumns = api.getVisibleColumns(api.documentColumns, settings ?? api.normalizeColumnSettings(api.documentColumns));
  const versionColumns = api.getVisibleColumns(api.documentVersionColumns, api.normalizeColumnSettings(api.documentVersionColumns));
  const props = {
    document: { ...document, versions }, expanded, mainColumns, versionColumns, mainTableColumnCount: mainColumns.length, tableWidth: 1600,
    getResolvedColumnWidth: (column) => column.defaultWidth,
    onResizeColumn() {}, onToggle() {}, onOpenDetail() {}, onEdit() {}, onAddVersion() {}, onEditVersion() {}, onPreview() {}, onDelete() {}, ...callbacks,
  };
  const tree = api.DocumentRows(props);
  const markup = renderToStaticMarkup(React.createElement('table', null, React.createElement('tbody', null, tree)));
  return { props, tree, markup, mainRow: tree.props.children[0], childRow: tree.props.children[1] };
}

test('document expand control stays in the first visible business cell after hiding or reordering its name', () => {
  const defaults = api.normalizeColumnSettings(api.documentColumns);
  for (const settings of [
    defaults,
    { ...defaults, hidden: ['title'] },
    { ...defaults, order: ['updatedAt', ...defaults.order.filter((id) => id !== 'updatedAt')] },
  ]) {
    const { mainRow, markup } = fixture({ settings });
    const cells = mainRow.props.children;
    assert.equal(elements(cells[0]).filter((node) => node.props['aria-expanded'] === true).length, 1);
    assert.equal(cells.slice(1).flatMap(elements).filter((node) => 'aria-expanded' in node.props).length, 0);
    assert.equal((markup.match(/aria-label="收起文档版本"/g) ?? []).length, 1);
    assert.equal(markup.includes('data-document-name-link'), !settings.hidden.includes('title'));
  }
});

test('document visibility callback allows hiding the name and preserves the final business column', () => {
  const matches = [];
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === 'toggleColumnVisibility') matches.push(node.initializer.getText(source));
    ts.forEachChild(node, visit);
  }
  visit(source);
  assert.equal(matches.length, 1);
  let current = api.normalizeColumnSettings(api.documentColumns);
  const code = ts.transpileModule(`const callback = ${matches[0]}; callback;`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const toggle = vm.runInNewContext(code, { updateActiveColumnSettings: (updater) => { current = updater(current); } });
  toggle('title');
  assert.equal(current.hidden.includes('title'), true);
  for (const id of current.order.filter((id) => id !== 'updatedAt' && id !== 'title')) toggle(id);
  const before = plain(current);
  toggle('updatedAt');
  assert.deepEqual(plain(current), before);
  toggle('title');
  assert.equal(current.hidden.includes('title'), false);
});

test('document versions render a standard empty state spanning the visible child columns', () => {
  const { props, childRow, markup } = fixture({ versions: [] });
  const emptyCell = elements(childRow).find((node) => node.props.children === '暂无版本');
  assert.ok(emptyCell);
  assert.equal(emptyCell.props.colSpan, props.versionColumns.length);
  assert.equal(elements(childRow).some((node) => node.props.sx?.['& > .MuiTableCell-root']?.height === 40), true);
  assert.match(markup, /data-table-state-content/);
  assert.match(markup, /暂无版本/);
});

test('expanded document rows use a zero-padding full-width white child table with shared scrolling', () => {
  const { childRow, markup } = fixture();
  const outerCell = childRow.props.children;
  const container = outerCell.props.children;
  const table = container.props.children;
  assert.equal(outerCell.props.sx.p, 0);
  assert.equal(container.props.sx.width, '100%');
  assert.equal(container.props.sx.bgcolor, '#fff');
  assert.equal(container.props.sx.overflow, 'visible');
  assert.equal(table.props.sx.width, 1600);
  assert.equal(table.props.sx.minWidth, 1600);
  assert.equal(table.props.sx.tableLayout, 'fixed');
  assert.equal(elements(childRow).some((node) => node.props['aria-label'] === '字段设置'), false);
  assert.match(markup, /aria-label="文档版本列表"/);
  assert.match(markup, /DOC-001/);
});

test('document row and arrow expand without hijacking the independent name detail action', () => {
  let expanded = 0;
  let details = 0;
  let stopped = 0;
  const { mainRow, tree } = fixture({ callbacks: { onToggle: () => expanded++, onOpenDetail: () => details++ } });
  const arrow = elements(tree).find((node) => node.props['aria-expanded'] === true);
  const name = elements(tree).find((node) => 'data-document-name-link' in node.props);
  const event = { stopPropagation: () => stopped++ };
  mainRow.props.onClick();
  arrow.props.onClick(event);
  name.props.onClick(event);
  assert.equal(expanded, 2);
  assert.equal(details, 1);
  assert.equal(stopped, 2);
  const collapsed = fixture({ expanded: false });
  assert.equal(collapsed.childRow, null);
  assert.match(collapsed.markup, /aria-label="展开文档版本"/);
  assert.doesNotMatch(collapsed.markup, /aria-label="文档版本列表"/);
});

test('legacy document preferences filter action/unknown fields and keep one business column', () => {
  const defaults = api.documentColumns.filter((column) => column.id !== 'actions').map((column) => column.id);
  const settings = api.normalizeColumnSettings(api.documentColumns, {
    version: api.DOCUMENT_COLUMN_SETTINGS_VERSION,
    order: ['actions', 'title', 'unknown', 'title'], hidden: ['actions', 'unknown', ...defaults],
  });
  assert.equal(new Set(settings.order).size, defaults.length);
  assert.equal(settings.order.includes('actions'), false);
  assert.equal(settings.hidden.includes('actions'), false);
  assert.equal(settings.hidden.includes('unknown'), false);
  const visible = api.getVisibleColumns(api.documentColumns, settings);
  assert.equal(visible.length, 2);
  assert.equal(visible.at(-1).id, 'actions');
});
