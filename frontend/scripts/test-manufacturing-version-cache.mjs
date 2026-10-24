import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { QueryClient } from '@tanstack/react-query';

const path = resolve(import.meta.dirname, '../src/pages/pack/PackManufacturingPage.tsx');
const source = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const initializers = new Map();
function visit(node) {
  if (ts.isVariableDeclaration(node) && node.initializer) initializers.set(node.name.getText(source), node.initializer.getText(source));
  ts.forEachChild(node, visit);
}
visit(source);

function callback(name, globals) {
  assert.ok(initializers.has(name), `missing manufacturing callback ${name}`);
  const code = ts.transpileModule(`(${initializers.get(name)});`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return vm.runInNewContext(code, globals);
}

const linkedKeys = [
  ['pack-versions', '1', null, '', 1, 20],
  ['pack-version', '1', 'version'],
  ['pack-product-versions', '1', 'product'],
  ['pack-product-versions', '1', 'previous-product'],
  ['pack-published', '1', ''],
  ['pack-published', '1', 'HVM'],
];
const preservedKeys = [
  ['pack-versions', '2', null, '', 1, 20],
  ['pack-product-versions', '2', 'product'],
  ['pack-published', '2', ''],
  ['pack-catalog', '1'],
  ['pack-order', '1', 'historical-order'],
  ['pack-trace', '1', 'historical-object'],
  ['pack-release', '1', 'historical-release'],
];
function harness() {
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: false } } });
  for (const key of [...linkedKeys, ...preservedKeys]) client.setQueryData(key, { content: [], status: 'DRAFT' });
  const globals = {
    client, siteId: '1', useMutation: options => options,
    setEditing() {}, setPublishing() {}, setDeleting() {}, setError() {}, showMessage() {},
    packError: error => error.message,
  };
  globals.refresh = callback('refresh', globals);
  return { client, globals };
}

for (const [scenario, name] of [
  ['saving a new or edited draft', 'save'],
  ['publishing a manufacturing version', 'publish'],
  ['deleting an unreferenced draft', 'remove'],
]) {
  test(`${scenario} immediately refreshes product expansions and work-order candidates in its factory`, async () => {
    const { client, globals } = harness();
    try {
      let reads = 0;
      const candidateOptions = { queryKey: linkedKeys[4], queryFn: async () => { reads++; return { content: [{ id: 'new-version', status: 'PUBLISHED' }] }; } };
      assert.deepEqual(await client.fetchQuery(candidateOptions), { content: [], status: 'DRAFT' });
      assert.equal(reads, 0, 'previously opened candidates are still fresh before the write');
      const preserved = preservedKeys.map(key => client.getQueryData(key));
      await callback(name, globals).onSuccess();
      for (const key of linkedKeys) assert.equal(client.getQueryState(key).isInvalidated, true, `stale linked view: ${key.join('/')}`);
      assert.equal((await client.fetchQuery(candidateOptions)).content[0].id, 'new-version');
      assert.equal(reads, 1, 'returning to a work order must fetch newly published candidates immediately');
      let productReads = 0;
      const expansion = await client.fetchQuery({ queryKey: linkedKeys[2], queryFn: async () => { productReads++; return { content: [{ id: 'new-version', status: 'PUBLISHED' }] }; } });
      assert.equal(expansion.content[0].status, 'PUBLISHED');
      assert.equal(productReads, 1, 'returning to products must refresh its expanded manufacturing versions');
      preservedKeys.forEach((key, index) => {
        assert.equal(client.getQueryState(key).isInvalidated, false, key.join('/'));
        assert.equal(client.getQueryData(key), preserved[index], 'other factories and historical snapshots must remain unchanged');
      });
    } finally { client.clear(); }
  });
}

test('rejected manufacturing writes retain the current catalog and published candidates', () => {
  const { client, globals } = harness();
  try {
    for (const name of ['save', 'publish', 'remove']) callback(name, globals).onError(new Error('write rejected'));
    for (const key of [...linkedKeys, ...preservedKeys]) assert.equal(client.getQueryState(key).isInvalidated, false, key.join('/'));
  } finally { client.clear(); }
});
