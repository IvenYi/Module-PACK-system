import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const root = resolve(import.meta.dirname, '..');
const plain = (value) => JSON.parse(JSON.stringify(value));

function actualCallback(file, callbackName, setterName, setter) {
  const source = ts.createSourceFile(file, readFileSync(resolve(root, file), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const callbacks = [];
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === callbackName && node.initializer) callbacks.push(node.initializer.getText(source));
    ts.forEachChild(node, visit);
  }
  visit(source);
  assert.equal(callbacks.length, 1, `${file} must expose one ${callbackName} callback`);
  const code = ts.transpileModule(`const callback = ${callbacks[0]}; callback;`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return vm.runInNewContext(code, { [setterName]: setter });
}

const pages = [
  { label: 'material/route', file: 'src/pages/master-data/ProcessModelingPage.tsx', callback: 'moveColumnSetting', setter: 'setActiveColumnSettings', main: ['name', 'code', 'description', 'updatedAt'] },
  { label: 'form/batch template', file: 'src/pages/master-data/TemplateModelingPage.tsx', callback: 'moveColumnSetting', setter: 'setActiveColumnSettings', main: ['name', 'code', 'versionCount', 'updatedAt'] },
  { label: 'document', file: 'src/pages/master-data/DocumentManagementPage.tsx', callback: 'reorderColumn', setter: 'updateActiveColumnSettings', main: ['title', 'type', 'versionCount', 'updatedAt'] },
];

for (const page of pages) {
  function state() {
    let main = { version: 3, order: [...page.main], hidden: [page.main[2]] };
    let child = { version: 3, order: ['version', 'status', 'updatedAt'], hidden: ['status'] };
    const moveMain = actualCallback(page.file, page.callback, page.setter, (update) => { main = update(main); });
    const moveChild = actualCallback(page.file, page.callback, page.setter, (update) => { child = update(child); });
    return { get main() { return main; }, get child() { return child; }, moveMain, moveChild };
  }

  test(`${page.label}: the first field moves below its immediate neighbour`, () => {
    const current = state();
    const [first, second, ...rest] = page.main;
    current.moveMain(first, second);
    assert.deepEqual(plain(current.main.order), [second, first, ...rest]);
    assert.deepEqual(plain(current.main.hidden), [page.main[2]]);
  });

  test(`${page.label}: the first field moves to the last position and the last field moves to the first`, () => {
    const down = state();
    down.moveMain(page.main[0], page.main.at(-1));
    assert.deepEqual(plain(down.main.order), [...page.main.slice(1), page.main[0]]);
    const up = state();
    up.moveMain(page.main.at(-1), page.main[0]);
    assert.deepEqual(plain(up.main.order), [page.main.at(-1), ...page.main.slice(0, -1)]);
  });

  test(`${page.label}: main and child reordering stays isolated and keeps hidden preferences`, () => {
    const current = state();
    const originalChild = plain(current.child);
    current.moveMain(page.main[0], page.main[1]);
    assert.deepEqual(plain(current.child), originalChild);
    const changedMain = plain(current.main);
    current.moveChild('version', 'status');
    assert.deepEqual(plain(current.child.order), ['status', 'version', 'updatedAt']);
    assert.deepEqual(plain(current.child.hidden), ['status']);
    assert.deepEqual(plain(current.main), changedMain);
    current.moveChild('updatedAt', 'status');
    assert.deepEqual(plain(current.child.order), ['updatedAt', 'status', 'version']);
    const before = plain(current.child);
    current.moveChild('status', 'status');
    assert.deepEqual(plain(current.child), before);
  });
}
