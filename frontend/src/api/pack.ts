import {
  normalizePackExecution,
  normalizePackVersion,
} from "./packNormalization.mjs";
import client from "./client";
import type { ApiResponse, PageResult } from "@/types/common";
export type PackRow = { id: string; [key: string]: any };
export type PackMode = "MANUAL" | "SEMI_AUTO" | "EXTERNAL_MES";
export interface PackCheck {
  code: string;
  name: string;
  kind: "NUMBER" | "BOOLEAN";
  unit?: string;
  min?: number | null;
  max?: number | null;
  required: boolean;
}
export interface PackAction {
  code: string;
  type: "ASSEMBLE" | "MEASURE" | "MANUAL_INSPECT";
  required: boolean;
  source: "HUMAN" | "DEVICE" | "MES";
  slotCodes: string[];
  checks: PackCheck[];
  retestAfterReplacement: boolean;
}
export interface PackOperation {
  nodeId: string;
  name: string;
  stationIds: string[];
  mode: PackMode;
  actions: PackAction[];
  documents?: PackDocument[];
}
export interface PackBom {
  slotCode: string;
  materialId: string;
  quantity: number;
  childType: "CELL" | "MODULE";
  materialCode?: string;
  materialName?: string;
  materialVersion?: string;
  unit?: string;
  orientation?: string;
}
export interface PackDocument {
  documentVersionId: string;
  pageStart: number;
  pageEnd: number;
}
export interface PackManufacturingConfig {
  outputType: "MODULE" | "PACK" | "";
  productCode?: string;
  productName?: string;
  siteId: string;
  productId: string;
  code: string;
  name: string;
  version: string;
  routeVersionId: string;
  bom: PackBom[];
  operations: PackOperation[];
  documents: PackDocument[];
}
export interface PackManufacturingVersion extends PackRow {
  siteId: string;
  status: string;
  revision: number;
  config: PackManufacturingConfig;
  validation?: { valid: boolean; issues: any[] };
  snapshotHash?: string;
  code?: string;
  name?: string;
  version?: string;
  productName?: string;
  referenceCount?: number;
}
export interface PackCatalog {
  materials: PackRow[];
  routes: PackRow[];
  documents: PackRow[];
  stations: PackRow[];
}
export async function packGet<T>(
  path: string,
  params?: Record<string, unknown>,
): Promise<T> {
  return (await client.get<ApiResponse<T>>(`/pack${path}`, { params })).data
    .data;
}
export async function packWrite<T>(
  path: string,
  body: Record<string, unknown> = {},
  method: "POST" | "PUT" | "DELETE" = "POST",
): Promise<T> {
  return (
    await client.request<ApiResponse<T>>({
      url: `/pack${path}`,
      method,
      data: body,
    })
  ).data.data;
}
export const getPackCatalog = (siteId: string) =>
  packGet<PackCatalog>("/catalog", { siteId });
export const getPackVersions = async (params: Record<string, unknown>) => {
  const result = await packGet<PageResult<PackManufacturingVersion>>(
    "/manufacturing-versions",
    params,
  );
  return { ...result, content: result.content.map(normalizePackVersion) };
};
export const getPackVersion = async (id: string, siteId: string) =>
  normalizePackVersion(
    await packGet<PackManufacturingVersion>(`/manufacturing-versions/${id}`, {
      siteId,
    }),
  );
export const savePackVersion = (
  id: string | null,
  config: PackManufacturingConfig,
  revision?: number,
) =>
  packWrite<PackManufacturingVersion>(
    `/manufacturing-versions${id ? `/${id}` : ""}`,
    { ...config, ...(id ? { revision } : {}) },
    id ? "PUT" : "POST",
  );
export const validatePackVersion = (
  id: string,
  siteId: string,
  revision: number,
) =>
  packWrite<{ valid: boolean; issues: any[] }>(
    `/manufacturing-versions/${id}/validate`,
    { siteId, revision },
  );
export const publishPackVersion = (
  id: string,
  siteId: string,
  revision: number,
) =>
  packWrite<PackManufacturingVersion>(`/manufacturing-versions/${id}/publish`, {
    siteId,
    revision,
  });

export interface PackRework extends PackRow {
  targetNodeId: string;
  targetStationId: string;
  originVisitId?: string;
  requiredTests?: { nodeId: string; actionCode: string }[];
  allowedTargets?: {
    nodeId: string;
    stationIds: string[];
    phase: "REPAIR" | "RETEST";
  }[];
}
export interface PackOperationState {
  nodeId: string;
  status: "RUNNING" | "EXECUTABLE" | "COMPLETED" | "BLOCKED";
  canCheckIn: boolean;
  blockers: string[];
}
export interface PackExecution {
  activeRework?: PackRework | null;
  object: PackRow;
  workOrder?: PackRow;
  operations: (PackOperation & PackRow)[];
  operationStates?: PackOperationState[];
  visit?: PackRow | null;
  visits?: PackRow[];
  slots: PackRow[];
  tests: PackRow[];
  holds: PackRow[];
  reworks: PackRow[];
  allowedActions: Record<string, boolean>;
  blockers: string[];
  history: PackRow[];
  revision: number;
}
export interface PackTrace {
  object: PackRow;
  currentChildren: PackRow[];
  currentParents: PackRow[];
  historyLinks: PackRow[];
  tests: PackRow[];
  holds: PackRow[];
  reworks: PackRow[];
  releases: PackRow[];
  events: PackRow[];
}
export interface PackCommand {
  siteId: string;
  requestId: string;
  action: string;
  objectId: string;
  stationId?: string;
  revision: number;
  payload: Record<string, unknown>;
}
export const getPackOrders = (params: Record<string, unknown>) =>
  packGet<PageResult<PackRow>>("/work-orders", params);
export const getPackOrder = (id: string, siteId: string) =>
  packGet<PackRow>(`/work-orders/${id}`, { siteId });
export const getPackObjects = (params: Record<string, unknown>) =>
  packGet<PageResult<PackRow>>("/objects", params);
export const getPackExecution = async (params: Record<string, unknown>) =>
  normalizePackExecution(await packGet<PackExecution>("/execution", params));
export const getPackTrace = (id: string, siteId: string) =>
  packGet<PackTrace>(`/trace/${id}`, { siteId });
export const deletePackVersion = (
  id: string,
  siteId: string,
  revision: number,
) =>
  client.delete(`/pack/manufacturing-versions/${id}`, {
    params: { siteId, revision },
  });
