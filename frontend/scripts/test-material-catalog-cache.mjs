import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { QueryClient } from '@tanstack/react-query';

const path = resolve(import.meta.dirname, '../src/pages/master-data/ProcessModelingPage.tsx');
const source = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const initializers = new Map();
function visit(node) {
  if (ts.isVariableDeclaration(node) && node.initializer) initializers.set(node.name.getText(source), node.initializer.getText(source));
  ts.forEachChild(node, visit);
}
visit(source);

// Execute the page's actual mutation callbacks with a real QueryClient.
function callback(name, globals) {
  assert.ok(initializers.has(name), `missing page callback ${name}`);
  const code = ts.transpileModule(`(${initializers.get(name)});`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return vm.runInNewContext(code, globals);
}

const linkedKeys = [
  ['product-modeling-products', 1, 20, ''],
  ['product-modeling-products', 2, 20, 'HVM'],
  ['pack-catalog', '1'],
  ['pack-catalog', '2'],
  ['product-family-members', 'family'],
  ['product-source-audit', 'material'],
];
const frozenKeys = [
  ['pack-product-versions', '1', 'material'],
  ['pack-version', '1', 'published-version'],
  ['pack-order', '1', 'order'],
  ['pack-trace', '1', 'object'],
  ['pack-release', '1', 'release'],
  ['identity-profile'],
];
function harness(pageKey = 'materials') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: false } } });
  const listKey = pageKey === 'materials' ? 'process-modeling-materials' : 'process-modeling-operations';
  for (const key of [...linkedKeys, ...frozenKeys, [listKey, 1, 20, {}]]) queryClient.setQueryData(key, { version: '1.0', description: 'before' });
  const globals = {
    queryClient, pageKey, config: { title: '物料', listQueryKey: listKey, auditQueryKey: 'process-modeling-material-audit' },
    useMutation: (options) => options,
    resetDialogState() {}, showSnackbar() {}, setMaterialImportResult() {}, setDeleteTarget() {}, setSnackbar() {},
    getApiErrorMessage: (error) => error.message,
  };
  if (initializers.has('invalidateMaterialCatalogData')) globals.invalidateMaterialCatalogData = callback('invalidateMaterialCatalogData', globals);
  return { queryClient, globals, listKey };
}

for (const [scenario, name] of [
  ['new material', 'createMutation'],
  ['new child version', 'createMutation'],
  ['edit material', 'updateMutation'],
  ['mixed-result import', 'materialImportMutation'],
  ['delete material', 'deleteMutation'],
]) {
  test(`${scenario} refreshes fresh product/catalog caches without touching frozen history`, async () => {
    const { queryClient: client, globals, listKey } = harness();
    try {
      globals.creatingMaterialVersionFrom = scenario === 'new child version' ? { id: 'material', version: '1.0' } : null;
      let reads = 0;
      const freshOptions = { queryKey: linkedKeys[0], queryFn: async () => { reads++; return { version: '1.1', description: 'after' }; } };
      assert.equal((await client.fetchQuery(freshOptions)).version, '1.0');
      assert.equal(reads, 0, 'the old catalog is still fresh before mutation');
      const frozen = frozenKeys.map((key) => client.getQueryData(key));
      await callback(name, globals).onSuccess({ data: { data: { id: 'material', version: '1.1', successCount: 1, skippedRows: [], failedRows: [] } } });
      assert.equal(client.getQueryState([listKey, 1, 20, {}]).isInvalidated, true);
      for (const key of linkedKeys) assert.equal(client.getQueryState(key).isInvalidated, true, `stale linked cache: ${key.join('/')}`);
      assert.deepEqual(await client.fetchQuery(freshOptions), { version: '1.1', description: 'after' });
      assert.equal(reads, 1, 'returning to products must fetch the changed version immediately');
      frozenKeys.forEach((key, index) => {
        assert.equal(client.getQueryState(key).isInvalidated, false, key.join('/'));
        assert.equal(client.getQueryData(key), frozen[index], 'do not rewrite frozen snapshots');
      });
    } finally { client.clear(); }
  });
}

test('failed material writes preserve existing catalog caches', () => {
  const { queryClient: client, globals } = harness();
  try {
    for (const name of ['createMutation', 'updateMutation', 'materialImportMutation', 'deleteMutation']) callback(name, globals).onError(new Error('request rejected'));
    for (const key of linkedKeys) assert.equal(client.getQueryState(key).isInvalidated, false);
  } finally { client.clear(); }
});

test('an operation mutation keeps product caches while refreshing its existing category/list scope', async () => {
  const { queryClient: client, globals, listKey } = harness('operations');
  try {
    client.setQueryData(['process-modeling-operation-categories'], []);
    await callback('createMutation', globals).onSuccess({ data: { data: { id: 'operation' } } });
    assert.equal(client.getQueryState([listKey, 1, 20, {}]).isInvalidated, true);
    assert.equal(client.getQueryState(['process-modeling-operation-categories']).isInvalidated, true);
    for (const key of linkedKeys) assert.equal(client.getQueryState(key).isInvalidated, false);
  } finally { client.clear(); }
});
