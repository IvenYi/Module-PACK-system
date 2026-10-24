const businessKeys = new Set([
  "pack-quality",
  "pack-quality-detail",
  "pack-orders",
  "pack-order",
  "pack-order-options",
  "pack-objects",
  "pack-trace",
  "pack-trace-search",
  "pack-release",
  "pack-dashboard-quality",
]);
export function refreshPackBusinessQueries(queryClient, siteId, execution) {
  queryClient.setQueryData(
    ["pack-quality-detail", String(siteId), execution.object.id],
    execution,
  );
  return queryClient.invalidateQueries({
    predicate: (query) =>
      businessKeys.has(query.queryKey[0]) &&
      String(query.queryKey[1]) === String(siteId),
  });
}
