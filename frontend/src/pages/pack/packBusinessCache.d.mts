import type { QueryClient } from "@tanstack/react-query";
import type { PackExecution } from "@/api/pack";
export function refreshPackBusinessQueries(
  queryClient: QueryClient,
  siteId: string,
  execution: PackExecution,
): Promise<void>;
