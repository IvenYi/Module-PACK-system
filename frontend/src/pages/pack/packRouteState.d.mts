import type { PackExecution, PackOperationState } from "@/api/pack";

export function operationExecutionState(
  view: PackExecution | null,
  nodeId: string,
): PackOperationState;

export function completedOperationNodes(view: PackExecution | null): Set<string>;

export function preferredExecutionNode(
  view: PackExecution,
  preferredNodeId?: string,
): string;
