import { useEffect, useState } from 'react';
import { getManagedSidebarModules, updateManagedSidebarModules } from '@/api/system';
import { SIDEBAR_MODULES, type SidebarMenu, type SidebarModule, type SidebarSubMenu } from '@/utils/constants';

export const MENU_MANAGEMENT_STORAGE_KEY = 'edhr:managed-sidebar-modules';
export const MENU_MANAGEMENT_EVENT = 'edhr:managed-sidebar-modules-change';
export const MAX_MENU_CHILDREN_DEPTH = 2;

export const PROJECTION_REPORT_PAGES = [
  { modelId: 'formTrace', label: '表单追溯', path: '/reports/form-trace' },
  { modelId: 'dhrTrace', label: 'DHR追溯', path: '/reports/dhr-trace' },
  { modelId: 'production', label: '报工记录', path: '/reports/production-records' },
  { modelId: 'scrap', label: '报废记录', path: '/reports/scrap-records' },
  { modelId: 'consumption', label: '消耗记录', path: '/reports/consumption-records' },
] as const;
export const isProjectionReportPath = (path: string) => path === '/reports/form-projections' || PROJECTION_REPORT_PAGES.some(page => page.path === path);

function cloneSidebarModules(modules: SidebarModule[]): SidebarModule[] {
  return JSON.parse(JSON.stringify(modules)) as SidebarModule[];
}

export const PACK_SIDEBAR_MODULES: SidebarModule[] = [
  { id: 'home', label: '首页', icon: 'Home', menus: [{ label: '首页工作台', path: '/', icon: 'Dashboard' }] },
  { id: 'data', label: '数据', icon: 'Storage', menus: [
    { label: '工艺建模', icon: 'AccountTree', children: [
      { label: '物料管理', path: '/master-data/materials' }, { label: '产品管理', path: '/master-data/products' },
      { label: '产品簇', path: '/master-data/product-families' }, { label: '工序管理', path: '/master-data/operations' },
      { label: '工艺路线', path: '/master-data/routes' }, { label: '文档管理', path: '/master-data/documents' },
      { label: '制造版本', path: '/pack/manufacturing' },
    ] },
    { label: '工厂建模', icon: 'Factory', children: [
      { label: '工厂管理', path: '/master-data/sites' }, { label: '车间管理', path: '/master-data/workshops' },
      { label: '产线管理', path: '/master-data/production-lines' }, { label: '工位管理', path: '/master-data/workstations' },
    ] },
    { label: '设备建模', icon: 'PrecisionManufacturing', children: [
      { label: '设备类型', path: '/master-data/equipment-types' }, { label: '设备列表', path: '/master-data/equipment' },
    ] },
  ] },
  { id: 'production', label: '生产', icon: 'PrecisionManufacturing', menus: [
    { label: '生产准备', icon: 'Assignment', children: [{ label: '工单管理', path: '/pack/orders' }, { label: '单件管理', path: '/pack/objects' }] },
    { label: '生产执行', icon: 'PrecisionManufacturing', children: [{ label: '生产工作台', path: '/pack/execution' }, { label: '设备消息', path: '/pack/integration' }] },
  ] },
  { id: 'quality', label: '质量', icon: 'Verified', menus: [{ label: '质量管理', icon: 'FactCheck', children: [{ label: '异常、返修与放行', path: '/pack/quality' }] }] },
  { id: 'records', label: '追溯', icon: 'FactCheck', menus: [{ label: '制造追溯', icon: 'AccountTree', children: [{ label: '单件履历与装配谱系', path: '/pack/trace' }] }] },
  { id: 'system', label: '系统', icon: 'Settings', menus: [
    { label: '权限管理', icon: 'People', children: [{ label: '组织管理', path: '/system/organization' }, { label: '用户管理', path: '/system/users' }, { label: '角色管理', path: '/system/roles' }] },
    { label: '系统管理', icon: 'Settings', children: [{ label: '菜单管理', path: '/system/menu-management' }, { label: '业务字典', path: '/system/dictionaries' }, { label: '图标管理', path: '/system/icons' }, { label: '系统设置', path: '/system/settings' }] },
    { label: '安全管理', icon: 'LockOutlined', children: [{ label: '登录日志', path: '/system/login-logs' }, { label: '审计日志', path: '/system/audit-logs' }] },
  ] },
];
const activePaths = new Set(PACK_SIDEBAR_MODULES.flatMap(module => module.menus.flatMap(menu => menu.children?.map(child => child.path) ?? [menu.path ?? ''])));
const normalizeText = (value: unknown) => typeof value === 'string' ? value.trim() : '';
const retiredPrefixes = ['/workflow', '/form-management', '/dhr-management', '/reports', '/production/work-templates', '/master-data/form-templates', '/master-data/batch-record-templates', '/system/form-lookup-items', '/system/signatures', '/gct-edhr'];
export const isRetiredSidebarPath = (path: string) => retiredPrefixes.some(prefix => path === prefix || path.startsWith(prefix + '/'));
export function normalizeSidebarSubMenu(item: Partial<SidebarSubMenu>): SidebarSubMenu | null {
  const label = normalizeText(item.label), path = normalizeText(item.path);
  return label && activePaths.has(path) ? { label, path } : null;
}
export function normalizeManagedSidebarModules(modules: SidebarModule[]): SidebarModule[] {
  return ensureRequiredMenus(modules);
}
export function ensureRequiredMenus(modules: SidebarModule[]): SidebarModule[] {
  const normalized: SidebarModule[] = modules.filter(module => PACK_SIDEBAR_MODULES.some(required => required.id === module.id)).map(module => ({ ...module,
    menus: (module.menus ?? []).map((menu): SidebarMenu | null => {
      const children = menu.children?.map(normalizeSidebarSubMenu).filter((child): child is SidebarSubMenu => child !== null);
      return children?.length ? { ...menu, path: undefined, children } : menu.path && activePaths.has(menu.path) ? { ...menu, children: undefined } : null;
    }).filter((menu): menu is SidebarMenu => menu !== null),
  }));
  for (const required of cloneSidebarModules(PACK_SIDEBAR_MODULES)) {
    let module = normalized.find(item => item.id === required.id);
    if (!module) {
      const following = PACK_SIDEBAR_MODULES.slice(PACK_SIDEBAR_MODULES.findIndex(item => item.id === required.id) + 1);
      const position = normalized.findIndex(item => following.some(next => next.id === item.id));
      if (position < 0) normalized.push(required); else normalized.splice(position, 0, required);
      continue;
    }
    module.label = required.label;
    const existing = new Set(module.menus.flatMap(menu => menu.children?.map(child => child.path) ?? [menu.path ?? '']));
    for (const menu of required.menus) {
      if (menu.children) {
        const missing = menu.children.filter(child => !existing.has(child.path));
        if (!missing.length) continue;
        const target = module.menus.find(item => item.label === menu.label && item.children);
        if (target) target.children = [...(target.children ?? []), ...missing];
        else module.menus.push({ ...menu, children: missing });
      } else if (menu.path && !existing.has(menu.path)) module.menus.push(menu);
    }
  }
  return normalized;
}
export const ensureRequiredSystemMenus = ensureRequiredMenus;

let cachedModules: SidebarModule[] | undefined;
let cacheRevision = 0;

export function loadManagedSidebarModules(): SidebarModule[] {
  if (cachedModules) return cloneSidebarModules(cachedModules);
  if (typeof window === 'undefined') return ensureRequiredSystemMenus(ensureRequiredMenus(SIDEBAR_MODULES));

  try {
    const raw = window.localStorage.getItem(MENU_MANAGEMENT_STORAGE_KEY);
    if (!raw) return ensureRequiredSystemMenus(ensureRequiredMenus(SIDEBAR_MODULES));
    const parsed = JSON.parse(raw) as SidebarModule[];
    return ensureRequiredSystemMenus(normalizeManagedSidebarModules(parsed));
  } catch {
    return ensureRequiredSystemMenus(ensureRequiredMenus(SIDEBAR_MODULES));
  }
}

function cacheManagedSidebarModules(modules: SidebarModule[]): SidebarModule[] {
  cachedModules = cloneSidebarModules(modules);
  cacheRevision += 1;
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(MENU_MANAGEMENT_STORAGE_KEY, JSON.stringify(modules));
    } catch {
      // A disabled browser cache must not turn a successful server save into a failure.
    }
    window.dispatchEvent(new CustomEvent(MENU_MANAGEMENT_EVENT));
  }
  return cloneSidebarModules(modules);
}

export async function refreshManagedSidebarModules(): Promise<SidebarModule[]> {
  const revision = cacheRevision;
  const response = await getManagedSidebarModules();
  // A read started before a completed save must not restore the older configuration.
  if (revision !== cacheRevision) return loadManagedSidebarModules();
  const modules = response.configured
    ? normalizeManagedSidebarModules(response.modules)
    : loadManagedSidebarModules();
  return cacheManagedSidebarModules(modules);
}

export async function saveManagedSidebarModules(modules: SidebarModule[]): Promise<SidebarModule[]> {
  const response = await updateManagedSidebarModules(normalizeManagedSidebarModules(modules));
  return cacheManagedSidebarModules(normalizeManagedSidebarModules(response.modules));
}

export async function resetManagedSidebarModules(): Promise<SidebarModule[]> {
  return saveManagedSidebarModules(ensureRequiredMenus(SIDEBAR_MODULES));
}

export function useManagedSidebarModules(): SidebarModule[] {
  const [modules, setModules] = useState<SidebarModule[]>(() => loadManagedSidebarModules());

  useEffect(() => {
    const refreshModules = () => setModules(loadManagedSidebarModules());
    const handleStorage = (event: StorageEvent) => {
      if (event.key === MENU_MANAGEMENT_STORAGE_KEY || event.key === null) {
        cachedModules = undefined;
        cacheRevision += 1;
        refreshModules();
      }
    };
    const refreshFromServer = () => { void refreshManagedSidebarModules().catch(() => undefined); };

    refreshFromServer();
    window.addEventListener(MENU_MANAGEMENT_EVENT, refreshModules);
    window.addEventListener('storage', handleStorage);
    window.addEventListener('focus', refreshFromServer);
    return () => {
      window.removeEventListener(MENU_MANAGEMENT_EVENT, refreshModules);
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('focus', refreshFromServer);
    };
  }, []);

  return modules;
}

export function inferPermissionCode(path: string): string | undefined {
  const pack: Record<string, string> = {
    '/pack/manufacturing': 'pack.manufacturing.view', '/pack/orders': 'pack.production.view',
    '/pack/objects': 'pack.production.view', '/pack/execution': 'pack.execution.view',
    '/pack/quality': 'pack.quality.view', '/pack/trace': 'pack.trace.view', '/pack/integration': 'pack.integration.view',
    '/production/work-orders': 'pack.production.view', '/production/batches': 'pack.production.view', '/production/execution': 'pack.execution.view',
    '/master-data/equipment-types': 'master-data.equipment', '/system/menu-management': 'system.edit', '/': 'dashboard',
  };
  return pack[path] ?? path.replace(/^\//, '').replace(/\//g, '.');
}
