import client from './client';
import type { PageResult } from '@/types/common';

export type ResourceKind = 'factories' | 'lines' | 'stations';
export interface ProductionResource {
  id: string; tenantId: string; siteId: string; siteName?: string;
  workshopId?: string; productionLineId?: string; parentName?: string;
  code: string; name: string; status: 'ACTIVE' | 'INACTIVE';
  address?: string; description?: string; executionMode?: 'MANUAL' | 'SEMI_AUTO' | 'EXTERNAL_MES';
  referenced: boolean; deletable: boolean; createdAt?: string; updatedAt?: string;
}
const paths = { factories: '/identity/sites', lines: '/identity/production-lines', stations: '/identity/workstations' };
export async function listProductionResources(kind: ResourceKind, params: Record<string, unknown> = {}) {
  return (await client.get(paths[kind], { params })).data.data as PageResult<ProductionResource>;
}
export async function saveProductionResource(kind: ResourceKind, id: string | undefined, body: Record<string, unknown>) {
  return (id ? await client.put(`${paths[kind]}/${id}`, body) : await client.post(paths[kind], body)).data.data as ProductionResource;
}
export async function deleteProductionResource(kind: ResourceKind, id: string) {
  await client.delete(`${paths[kind]}/${id}`);
}
