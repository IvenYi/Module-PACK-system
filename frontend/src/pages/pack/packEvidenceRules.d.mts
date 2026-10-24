import type { PackAction, PackExecution, PackRow } from "@/api/pack";
export function latestCurrentTest(
  tests: PackRow[],
  visits: PackRow[],
  nodeId: string,
  actionCode: string,
  assemblyRevision: number,
): PackRow | undefined;
export function reviewCurrentEvidence(view: PackExecution): {
  id: string;
  operation: string;
  action: string;
  result: string;
  detail: string;
}[];
export function humanTestPayload(
  action: PackAction,
  draft: Record<string, string>,
  note?: string,
): {
  actionCode: string;
  values: (
    | { code: string; value: boolean }
    | { code: string; value: string; unit: string | undefined }
  )[];
  note: string;
};
export function controlledReworkTarget(
  view: PackExecution,
  nodeId: string,
  stationId: string,
): boolean;
