import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Add, Delete, Edit, Search } from '@mui/icons-material';
import { Alert, Box, Button, CircularProgress, DialogActions, DialogContent, DialogTitle, IconButton, InputAdornment, MenuItem, Snackbar, Stack, Tab, Tabs, TextField, Tooltip, Typography } from '@mui/material';
import ConfigurableListTable from '@/components/ConfigurableListTable';
import ListTablePagination from '@/components/ListTablePagination';
import ListQueryPanel, { ListQueryActions } from '@/components/ListQueryPanel';
import { managementFieldSx, managementDetailSectionSx } from '@/components/managementPageStyles';
import { PackDrawer, PackFields } from '@/pages/pack/packUi';
import { listTablePrimaryTextSx } from '@/components/listTableStyles';
import FormDialog from '@/components/FormDialog';
import FormDialogSection from '@/components/FormDialogSection';
import FormDialogFieldGrid from '@/components/FormDialogFieldGrid';
import ConfirmDialog from '@/components/ConfirmDialog';
import StatusBadge from '@/components/StatusBadge';
import { getAuditLogs, type AuditLogItem } from '@/api/audit';
import { getWorkshops } from '@/api/workshops';
import { deleteProductionResource, listProductionResources, saveProductionResource, type ProductionResource, type ResourceKind } from '@/api/production-resources';

const labels = { factories: '工厂', lines: '产线', stations: '工位' };
const modeLabels: Record<string, string> = { MANUAL: '人工工作台', SEMI_AUTO: '半自动工位', EXTERNAL_MES: '产线 MES 主责' };
const entities = { factories: 'SITE', lines: 'PRODUCTION_LINE', stations: 'PACK_WORKSTATION' };
const empty = { code: '', name: '', status: 'ACTIVE', parentId: '', address: '', description: '', executionMode: 'MANUAL' };
const fieldNames: Record<string, string> = { code: '编码', name: '名称', status: '状态', siteName: '所属工厂', parentName: '所属资源', executionMode: '执行模式', address: '地址', description: '描述', createdAt: '创建时间', updatedAt: '更新时间' };
function display(value: unknown) { return value == null || value === '' ? '-' : modeLabels[String(value)] ?? (value === 'ACTIVE' ? '启用' : value === 'INACTIVE' ? '停用' : String(value)); }
function auditSnapshot(raw: unknown) {
  try { return Object.entries(typeof raw === 'string' ? JSON.parse(raw) : raw ?? {}).filter(([key]) => key in fieldNames); } catch { return []; }
}

export default function ProductionResourcePage({ kind }: { kind: ResourceKind }) {
  const label = labels[kind];
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState({ keyword: '', status: 'ALL', parentId: '' });
  const [applied, setApplied] = useState(filters);
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(20);
  const [editing, setEditing] = useState<ProductionResource>();
  const [form, setForm] = useState(empty);
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<ProductionResource>();
  const [tab, setTab] = useState(0);
  const [deleting, setDeleting] = useState<ProductionResource>();
  const [notice, setNotice] = useState<{ text: string; error: boolean }>();
  let permissions: string[] = [];
  let builtinAdmin = false;
  try { const user = JSON.parse(localStorage.getItem('user') ?? '{}'); permissions = user.permissions ?? []; builtinAdmin = user.builtinAdmin === true; } catch { /* no authenticated profile */ }
  const canEdit = permissions.includes('master-data.edit');
  const rowsQuery = useQuery({ queryKey: ['production-resources', kind, applied, page, size], queryFn: () => listProductionResources(kind, { ...applied, status: applied.status === 'ALL' ? undefined : applied.status, parentId: applied.parentId || undefined, page, size }) });
  const workshops = useQuery({ queryKey: ['resource-workshop-options'], queryFn: () => getWorkshops({ page: 1, size: 200 }), enabled: kind === 'lines' });
  const lines = useQuery({ queryKey: ['resource-line-options'], queryFn: () => listProductionResources('lines', { page: 1, size: 200 }), enabled: kind === 'stations' });
  const parents = kind === 'lines' ? workshops.data?.content ?? [] : lines.data?.content ?? [];
  const audit = useQuery({ queryKey: ['resource-audit', kind, detail?.id], queryFn: async () => (await getAuditLogs({ entityType: entities[kind], entityId: detail?.id, page: 1, size: 100 })).data.data.content as AuditLogItem[], enabled: !!detail && tab === 1 });
  const rows = rowsQuery.data?.content ?? [];
  useEffect(() => { if (rowsQuery.data && page > Math.max(1, rowsQuery.data.totalPages)) setPage(Math.max(1, rowsQuery.data.totalPages)); }, [rowsQuery.data, page]);
  const invalidate = () => { queryClient.invalidateQueries({ queryKey: ['production-resources'] }); queryClient.invalidateQueries({ queryKey: ['resource-line-options'] }); };
  const save = useMutation({ mutationFn: () => saveProductionResource(kind, editing?.id, { code: form.code, name: form.name, status: form.status, address: form.address, description: form.description, executionMode: form.executionMode, workshopId: kind === 'lines' ? form.parentId : undefined, productionLineId: kind === 'stations' ? form.parentId : undefined }), onSuccess: saved => { invalidate(); setOpen(false); if (detail?.id === saved.id) setDetail(saved); setNotice({ text: `${label}保存成功`, error: false }); }, onError: e => setNotice({ text: e.message, error: true }) });
  const remove = useMutation({ mutationFn: () => deleteProductionResource(kind, deleting!.id), onSuccess: () => { invalidate(); if (detail?.id === deleting?.id) setDetail(undefined); setDeleting(undefined); setNotice({ text: `${label}删除成功`, error: false }); }, onError: e => setNotice({ text: e.message, error: true }) });
  const edit = (row?: ProductionResource) => { setEditing(row); setForm(row ? { code: row.code, name: row.name, status: row.status, address: row.address ?? '', description: row.description ?? '', executionMode: row.executionMode ?? 'MANUAL', parentId: (kind === 'lines' ? row.workshopId : row.productionLineId) ?? '' } : empty); setOpen(true); };
  const columns = [
    { key: 'name', label: `${label}名称`, width: 220, minWidth: 160, render: (row: ProductionResource) => <Typography sx={listTablePrimaryTextSx}>{row.name}</Typography> },
    { key: 'code', label: `${label}编码`, width: 180, minWidth: 128 },
    ...(kind === 'factories' ? [{ key: 'address', label: '地址', width: 240 }] : [{ key: 'siteName', label: '所属工厂', width: 180 }, { key: 'parentName', label: kind === 'lines' ? '所属车间' : '所属产线', width: 180 }]),
    ...(kind === 'stations' ? [{ key: 'executionMode', label: '执行模式', width: 180, render: (row: ProductionResource) => display(row.executionMode) }] : []),
    { key: 'status', label: '状态', width: 100, render: (row: ProductionResource) => <StatusBadge label={display(row.status)} color={row.status === 'ACTIVE' ? 'success' : 'default'} /> },
    { key: 'updatedAt', label: '更新时间', width: 180, render: (row: ProductionResource) => display(row.updatedAt) },
    { key: 'actions', label: '操作', action: true, width: 112, render: (row: ProductionResource) => <Box onClick={event => event.stopPropagation()}>{canEdit && <><Tooltip title="编辑"><IconButton size="small" aria-label={`编辑${label} ${row.name}`} onClick={() => edit(row)}><Edit fontSize="small" /></IconButton></Tooltip><Tooltip title={row.deletable ? '删除' : '资源已被引用，请停用'}><span><IconButton size="small" color="error" aria-label={`删除${label} ${row.name}`} disabled={!row.deletable || (kind === 'factories' && !builtinAdmin)} onClick={() => setDeleting(row)}><Delete fontSize="small" /></IconButton></span></Tooltip></>}</Box> },
  ];
  return <Box sx={{ height: { xs: 'auto', lg: 'calc(100vh - 150px)' }, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
    <ListQueryPanel actions={<ListQueryActions onReset={() => { const reset = { keyword: '', status: 'ALL', parentId: '' }; setFilters(reset); setApplied(reset); setPage(1); }} onQuery={() => { setApplied(filters); setPage(1); }} />}>
      <TextField fullWidth size="small" label={`${label}名称/编码`} placeholder="请输入" value={filters.keyword} sx={managementFieldSx} onChange={event => setFilters({ ...filters, keyword: event.target.value })} onKeyDown={event => { if (event.key === 'Enter') { setApplied(filters); setPage(1); } }} InputProps={{ startAdornment: <InputAdornment position="start"><Search fontSize="small" /></InputAdornment> }} />
      {kind !== 'factories' && <TextField fullWidth size="small" select label={kind === 'lines' ? '所属车间' : '所属产线'} value={filters.parentId} sx={managementFieldSx} onChange={event => setFilters({ ...filters, parentId: event.target.value })}><MenuItem value="">全部</MenuItem>{parents.map(parent => <MenuItem key={parent.id} value={parent.id}>{parent.name}（{parent.code}）</MenuItem>)}</TextField>}
      <TextField fullWidth size="small" select label="状态" value={filters.status} sx={managementFieldSx} onChange={event => setFilters({ ...filters, status: event.target.value })}><MenuItem value="ALL">全部</MenuItem><MenuItem value="ACTIVE">启用</MenuItem><MenuItem value="INACTIVE">停用</MenuItem></TextField>
    </ListQueryPanel>
    <Box component="section" sx={{ flex: 1, minHeight: 0, bgcolor: '#fff', border: '1px solid #e4e7ed', borderRadius: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <ConfigurableListTable
        preferenceKey={`production-resource-${kind}:v1`}
        columns={columns}
        rows={rowsQuery.error ? [] : rows}
        loading={rowsQuery.isLoading}
        emptyText={rowsQuery.error ? <Alert severity="error">{rowsQuery.error.message}</Alert> : '暂无数据'}
        onRow={row => { setDetail(row); setTab(0); }}
        toolbar={canEdit && (kind !== 'factories' || builtinAdmin) ? <Button variant="contained" startIcon={<Add />} onClick={() => edit()}>新增{label}</Button> : undefined}
      />
      <ListTablePagination total={rowsQuery.data?.totalElements ?? 0} page={page} size={size} onPage={setPage} onSize={value => { setSize(value); setPage(1); }} sizeOptions={[20, 50, 100, 200]} />
    </Box>
    <FormDialog open={open} onClose={() => !save.isPending && setOpen(false)} maxWidth="sm" fullWidth><DialogTitle>{editing ? '编辑' : '新增'}{label}</DialogTitle><DialogContent dividers sx={managementFieldSx}><FormDialogSection title="基本信息"><FormDialogFieldGrid hasTrailingFullRow>
      <TextField required size="small" label={`${label}名称`} inputProps={{ maxLength: 128 }} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
      <TextField required size="small" label={`${label}编码`} inputProps={{ maxLength: 64 }} disabled={editing?.referenced} helperText={editing?.referenced ? '已被引用，编码不可修改' : undefined} value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} />
      {kind !== 'factories' && <TextField required size="small" select disabled={editing?.referenced} label={kind === 'lines' ? '所属车间' : '所属产线'} value={form.parentId} onChange={e => setForm({ ...form, parentId: e.target.value })}><MenuItem value="">请选择</MenuItem>{parents.filter(p => p.status === 'ACTIVE' || p.id === form.parentId).map(p => <MenuItem key={p.id} value={p.id}>{p.name}（{p.code}）</MenuItem>)}</TextField>}
      {kind === 'stations' && <TextField required size="small" select label="执行模式" disabled={editing?.referenced} value={form.executionMode} onChange={e => setForm({ ...form, executionMode: e.target.value })}>{Object.entries(modeLabels).map(([value, name]) => <MenuItem key={value} value={value}>{name}</MenuItem>)}</TextField>}
      <TextField size="small" select label="状态" value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}><MenuItem value="ACTIVE">启用</MenuItem><MenuItem value="INACTIVE">停用</MenuItem></TextField>
      <TextField size="small" label={kind === 'factories' ? '地址' : '描述'} multiline minRows={3} sx={{ gridColumn: '1 / -1' }} value={kind === 'factories' ? form.address : form.description} inputProps={{ maxLength: 512 }} onChange={e => setForm({ ...form, [kind === 'factories' ? 'address' : 'description']: e.target.value })} />
      {(workshops.error || lines.error) && <Alert severity="error" sx={{ gridColumn: '1 / -1' }}>所属资源加载失败，请重试</Alert>}
    </FormDialogFieldGrid></FormDialogSection></DialogContent><DialogActions><Button disabled={save.isPending} onClick={() => setOpen(false)}>取消</Button><Button variant="contained" disabled={save.isPending || !form.code.trim() || !form.name.trim() || (kind !== 'factories' && !form.parentId)} onClick={() => save.mutate()}>{save.isPending ? '保存中...' : '保存'}</Button></DialogActions></FormDialog>
    <PackDrawer open={!!detail} onClose={() => setDetail(undefined)} title={`${label}详情`} width={560}>
      <Tabs value={tab} onChange={(_, value) => setTab(value)} aria-label={`${label}详情切换`}><Tab label="数据信息" /><Tab label="数据审计" /></Tabs>
      {tab === 0 ? <Stack spacing={2}>
        <Box sx={{ bgcolor: '#fff' }}><FormDialogSection title="基本信息"><PackFields items={[
          ...Object.entries(fieldNames).filter(([key]) => !['createdAt', 'updatedAt'].includes(key) && detail?.[key as keyof ProductionResource] != null).map(([key, name]) => [name, display(detail?.[key as keyof ProductionResource])] as [string, string]),
          ['引用说明', detail?.referenced ? '已被引用，不能删除或修改归属/执行模式' : '尚未被引用'],
        ]} /></FormDialogSection></Box>
        <Box sx={{ bgcolor: '#fff' }}><FormDialogSection title="系统信息"><PackFields items={[
          ['创建时间', display(detail?.createdAt)], ['更新时间', display(detail?.updatedAt)],
        ]} /></FormDialogSection></Box>
      </Stack> : <Stack spacing={1.5}>
        {audit.isLoading ? <CircularProgress size={22} /> : audit.error ? <Alert severity="error">{audit.error.message}</Alert> : !audit.data?.length ? <Box sx={managementDetailSectionSx}><Typography color="text.secondary">暂无审计记录</Typography></Box> : audit.data.map(log => <Box key={log.id} sx={managementDetailSectionSx}>
          <Typography variant="body2" sx={{ mb: 1 }}>{log.action === 'CREATE' ? '新增' : log.action === 'UPDATE' ? '编辑' : '删除'} · {log.operatorDisplayName} · {log.createdAt}</Typography>
          <PackFields items={auditSnapshot(log.contentAfter).map(([key, value]) => [fieldNames[key], display(value)] as [string, string])} />
        </Box>)}
      </Stack>}
    </PackDrawer>
    <ConfirmDialog open={!!deleting} title={`删除${label}`} message={`确认删除“${deleting?.name}”？已引用的资源无法删除。`} destructive loading={remove.isPending} onCancel={() => setDeleting(undefined)} onConfirm={() => remove.mutate()} />
    <Snackbar open={!!notice} autoHideDuration={5000} onClose={() => setNotice(undefined)}><Alert severity={notice?.error ? 'error' : 'success'} onClose={() => setNotice(undefined)}>{notice?.text}</Alert></Snackbar>
  </Box>;
}
