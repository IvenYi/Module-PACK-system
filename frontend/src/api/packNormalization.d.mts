import type {
  PackExecution,
  PackOperation,
  PackManufacturingConfig,
  PackManufacturingVersion,
} from "./pack";
export function normalizePackOperation(operation: any): PackOperation;
export function normalizePackConfig(config: any): PackManufacturingConfig;
export function normalizePackVersion(version: any): PackManufacturingVersion;
export function normalizePackExecution(execution: any): PackExecution;
