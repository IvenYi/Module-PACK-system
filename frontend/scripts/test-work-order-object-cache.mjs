import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { QueryClient } from '@tanstack/react-query';

function pageSource(name) {
  const path = resolve(import.meta.dirname, `../src/pages/pack/${name}.tsx`);
  const source = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const initializers = new Map();
  let editableCondition;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.initializer) initializers.set(node.name.getText(source), node.initializer.getText(source));
    if (ts.isJsxExpression(node) && node.expression && ts.isBinaryExpression(node.expression)
      && node.expression.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken
      && node.expression.getText(source).includes('row.objectCount')
      && node.expression.getText(source).includes('<Button')) editableCondition = node.expression.left.getText(source);
    ts.forEachChild(node, visit);
  }
  visit(source);
  const evaluate = (expression, globals) => vm.runInNewContext(ts.transpileModule(`(${expression});`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText, globals);
  return {
    callback(name, globals) {
      assert.ok(initializers.has(name), `missing callback ${name}`);
      return evaluate(initializers.get(name), globals);
    },
    canEdit(row) {
      assert.ok(editableCondition, 'missing actual work-order edit guard');
      return evaluate(editableCondition, { row, canManage: true });
    },
  };
}
const workOrders = pageSource('PackWorkOrderPage');
const objects = pageSource('PackObjectPage');

function cacheHarness() {
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: false } } });
  const globals = {
    queryClient: client, cache: client, siteId: '1', useMutation: options => options,
    setEdit() {}, setSelected() {}, setAccepting() {}, setError() {}, showMessage() {},
    packError: error => error.message,
  };
  globals.refresh = workOrders.callback('refresh', globals);
  return { client, globals };
}

for (const [scenario, callbackName] of [['save a new PACK order', 'save'], ['accept an order', 'accept']]) {
  test(`${scenario} immediately refreshes object-registration order candidates`, async () => {
    const { client, globals } = cacheHarness();
    const key = ['pack-order-options', '1'];
    const untouchedKey = ['pack-order-options', '2'];
    try {
      client.setQueryData(key, { content: [] });
      client.setQueryData(untouchedKey, { content: [] });
      let reads = 0;
      const query = { queryKey: key, queryFn: async () => {
        reads++;
        return { content: [{ id: 'new-pack-order', snapshot: { outputType: 'PACK' } }] };
      } };
      assert.equal((await client.fetchQuery(query)).content.length, 0);
      assert.equal(reads, 0, 'the object page candidates are fresh but outdated before the order write');
      await workOrders.callback(callbackName, globals).onSuccess({ id: 'new-pack-order' });
      assert.equal(client.getQueryState(key).isInvalidated, true);
      const fresh = await client.fetchQuery(query);
      assert.equal(fresh.content[0].snapshot.outputType, 'PACK', 'object registration derives the newly saved order output type');
      assert.equal(reads, 1);
      assert.equal(client.getQueryState(untouchedKey).isInvalidated, false);
    } finally { client.clear(); }
  });
}

test('registering an object refreshes work-order counts/details/options and removes the actual edit affordance', async () => {
  const { client, globals } = cacheHarness();
  const keys = [
    ['pack-objects', '1', '', '', 'order', 1, 20],
    ['pack-orders', '1', '', 1, 20],
    ['pack-order', '1', 'order'],
    ['pack-order-options', '1'],
  ];
  const preserved = [
    ['pack-orders', '2', '', 1, 20], ['pack-order', '2', 'order'], ['pack-order-options', '2'],
    ['pack-catalog', '1'], ['pack-release', '1', 'release'],
  ];
  try {
    const old = { id: 'order', status: 'CREATED', objectCount: 0 };
    keys.forEach(key => client.setQueryData(key, { content: [old] }));
    preserved.forEach(key => client.setQueryData(key, { content: [old] }));
    assert.equal(workOrders.canEdit(old), true);
    await objects.callback('save', globals).onSuccess({ id: 'new-object' });
    keys.forEach(key => assert.equal(client.getQueryState(key).isInvalidated, true, key.join('/')));
    const refreshed = await client.fetchQuery({ queryKey: keys[1], queryFn: async () => ({ content: [{ ...old, objectCount: 1 }] }) });
    assert.equal(workOrders.canEdit(refreshed.content[0]), false, 'the real row condition hides Edit after the first object is registered');
    preserved.forEach(key => assert.equal(client.getQueryState(key).isInvalidated, false, key.join('/')));
  } finally { client.clear(); }
});

test('rejected order and object writes keep existing candidate and count caches', () => {
  const { client, globals } = cacheHarness();
  const keys = [['pack-orders', '1'], ['pack-order-options', '1'], ['pack-order', '1', 'order']];
  try {
    keys.forEach(key => client.setQueryData(key, { content: [] }));
    for (const name of ['save', 'accept']) workOrders.callback(name, globals).onError(new Error('rejected'));
    objects.callback('save', globals).onError(new Error('rejected'));
    keys.forEach(key => assert.equal(client.getQueryState(key).isInvalidated, false));
  } finally { client.clear(); }
});

function editorHarness() {
  const globals = { versionKeyword: 'CATL', selectedVersion: null, edit: null };
  globals.setError = () => {};
  globals.setVersionKeyword = value => { globals.versionKeyword = value; };
  globals.setSelectedVersion = value => { globals.selectedVersion = value; };
  globals.setEdit = value => { globals.edit = typeof value === 'function' ? value(globals.edit) : value; };
  return globals;
}

test('opening a BYD order after searching CATL resets the query and preserves its exact frozen selection', () => {
  const globals = editorHarness();
  const row = { id: 'order', manufacturingVersionId: 'byd-version', snapshot: {
    code: 'MP-BYD-HVM083', name: 'HVM8.3', version: '1.0', productId: 'product-1.1', bom: [], operations: [],
  } };
  workOrders.callback('openEditor', globals)(row);
  assert.equal(globals.versionKeyword, '');
  assert.equal(globals.edit.manufacturingVersionId, 'byd-version');
  assert.equal(globals.selectedVersion.config, row.snapshot);
  globals.versions = { data: { content: [{ id: 'catl-version', status: 'PUBLISHED' }] } };
  globals.published = workOrders.callback('published', globals);
  globals.version = workOrders.callback('version', globals);
  const options = workOrders.callback('versionOptions', globals);
  assert.equal(globals.version.code, 'MP-BYD-HVM083', 'selection stays visible even while the current search results do not contain it');
  assert.equal(options[0].id, 'byd-version');
  assert.equal(options.length, 2);
  workOrders.callback('openEditor', globals)();
  assert.equal(globals.edit.manufacturingVersionId, '');
  assert.equal(globals.selectedVersion, null);
});

test('choosing a full manufacturing candidate survives subsequent searches, and Clear resets search and selection', () => {
  const globals = editorHarness();
  workOrders.callback('openEditor', globals)();
  const candidate = { id: 'byd-version', code: 'MP-BYD-HVM083', config: { productVersion: '1.1' }, snapshotHash: 'hash' };
  workOrders.callback('chooseVersion', globals)(null, candidate);
  assert.equal(globals.selectedVersion, candidate);
  assert.equal(globals.edit.manufacturingVersionId, candidate.id);
  workOrders.callback('searchVersions', globals)(null, 'CATL', 'input');
  assert.equal(globals.versionKeyword, 'CATL');
  assert.equal(globals.selectedVersion, candidate);
  globals.published = [];
  globals.version = workOrders.callback('version', globals);
  assert.equal(globals.version, candidate);
  workOrders.callback('searchVersions', globals)(null, '', 'clear');
  workOrders.callback('chooseVersion', globals)(null, null);
  assert.equal(globals.versionKeyword, '');
  assert.equal(globals.selectedVersion, null);
  assert.equal(globals.edit.manufacturingVersionId, '');
  globals.version = workOrders.callback('version', globals);
  assert.equal(globals.version, undefined);
});
