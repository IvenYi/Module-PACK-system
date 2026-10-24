import { test } from "node:test";
import assert from "node:assert/strict";
import { QueryClient } from "@tanstack/react-query";
import { refreshPackBusinessQueries } from "./packBusinessCache.mjs";
test("a saved operation immediately replaces stale quality revision and invalidates linked business views in its factory", async () => {
  const cache = new QueryClient({
    defaultOptions: { queries: { staleTime: 600000 } },
  });
  const affected = [
    ["pack-quality-detail", "1", "object"],
    ["pack-quality", "1", "", 1, 20],
    ["pack-orders", "1", "", 1, 20],
    ["pack-order", "1", "order"],
    ["pack-order-options", "1"],
    ["pack-objects", "1"],
    ["pack-trace", "1", "object"],
    ["pack-trace-search", "1", "SN"],
    ["pack-release", "1", "release"],
    ["pack-dashboard-quality", "1", "todo"],
  ];
  const untouched = [
    ["pack-quality-detail", "2", "object"],
    ["pack-catalog", "1"],
    ["pack-sites", "user"],
    ["identity-profile"],
  ];
  for (const key of [...affected, ...untouched])
    cache.setQueryData(key, { revision: 16 });
  const execution = {
    object: { id: "object", productionState: "COMPLETED" },
    revision: 17,
  };
  await refreshPackBusinessQueries(cache, "1", execution);
  assert.equal(
    cache.getQueryData(["pack-quality-detail", "1", "object"]).revision,
    17,
  );
  assert.equal(
    cache.getQueryData(["pack-quality-detail", "1", "object"]).object
      .productionState,
    "COMPLETED",
  );
  for (const key of affected)
    assert.equal(cache.getQueryState(key).isInvalidated, true, key.join("/"));
  for (const key of untouched)
    assert.equal(cache.getQueryState(key).isInvalidated, false, key.join("/"));
  cache.clear();
});
