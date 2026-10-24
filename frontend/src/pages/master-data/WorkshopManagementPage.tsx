import { readRecordLocation } from '@/utils/recordLocation';
import ConfigurableListTable from '@/components/ConfigurableListTable';
import ListTablePagination from '@/components/ListTablePagination';
import ListQueryPanel, { ListQueryActions } from '@/components/ListQueryPanel';
import { managementFieldSx, managementDetailGridSx } from '@/components/managementPageStyles';
import { PackDrawer } from '@/pages/pack/packUi';
import { listTablePrimaryTextSx } from '@/components/listTableStyles';
import { getCurrentUserPreferenceStorageKey } from '@/components/ListColumnSettingsPopover';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  InputAdornment,
  MenuItem,
  Snackbar,
  Stack,
  Tab,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { Add, Delete, Edit, Search } from '@mui/icons-material';
import FormDialog from '@/components/FormDialog';
import FormDialogSection from '@/components/FormDialogSection';
import FormDialogFieldGrid from '@/components/FormDialogFieldGrid';
import ConfirmDialog from '@/components/ConfirmDialog';
import StatusBadge from '@/components/StatusBadge';
import { getAuditLogs, type AuditLogItem } from '@/api/audit';
import {
  createWorkshop,
  deleteWorkshop,
  getWorkshops,
  updateWorkshop,
  type WorkshopPayload,
  type WorkshopRecord,
} from '@/api/workshops';
import type { PageResult } from '@/types/common';
import { listProductionResources } from '@/api/production-resources';

interface WorkshopFilters {
  keyword: string;
  status: 'ALL' | 'ACTIVE' | 'INACTIVE';
}

interface WorkshopForm {
  siteId: string;
  code: string;
  name: string;
  description: string;
  status: 'ACTIVE' | 'INACTIVE';
}

interface AuditField {
  label: string;
  value: string;
}

const PAGE_SIZE_OPTIONS = [20, 50, 100, 200] as const;
const WORKSHOP_COLUMNS = [
  { id: 'name', label: '车间名称', width: 220, minWidth: 160 },
  { id: 'code', label: '车间编码', width: 180, minWidth: 128 },
  { id: 'siteName', label: '所属工厂', width: 180, minWidth: 128 },
  { id: 'description', label: '描述', width: 224, minWidth: 160 },
  { id: 'status', label: '状态', width: 100, minWidth: 96 },
  { id: 'actions', label: '操作', width: 96, minWidth: 96 },
] as const;
const emptyFilters: WorkshopFilters = { keyword: '', status: 'ALL' };
const emptyForm: WorkshopForm = { siteId: '', code: '', name: '', description: '', status: 'ACTIVE' };
const auditFieldLabels: Record<string, string> = {
  code: '车间编码',
  name: '车间名称',
  description: '描述',
  status: '状态',
  siteId: '所属工厂',
};
const actionLabels: Record<string, string> = { CREATE: '新增', UPDATE: '编辑', DELETE: '删除' };

function statusLabel(status?: string) {
  return status === 'ACTIVE' ? '启用' : status === 'INACTIVE' ? '停用' : status || '-';
}

function formatDateTime(value?: string) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.replace('T', ' ').slice(0, 16);
  const pad = (input: number) => String(input).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function parseSnapshot(value: unknown): Record<string, unknown> {
  if (!value) return {};
  if (typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value !== 'string') return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function auditFields(value: unknown): AuditField[] {
  return Object.entries(parseSnapshot(value)).map(([field, fieldValue]) => ({
    label: auditFieldLabels[field] ?? field,
    value: field === 'status' ? statusLabel(String(fieldValue)) : fieldValue === null || fieldValue === '' ? '-' : String(fieldValue),
  }));
}

function DetailSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Box sx={{ bgcolor: '#fff', border: '1px solid #e4e7ed', borderRadius: 1, overflow: 'hidden' }}>
      <Box sx={{ px: 1.5, py: 1, bgcolor: '#f8fafc', borderBottom: '1px solid #e4e7ed' }}>
        <Typography sx={{ fontWeight: 600, color: '#303133' }}>{title}</Typography>
      </Box>
      <Box sx={{ p: 1.5 }}>{children}</Box>
    </Box>
  );
}

function DetailField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography variant="caption" sx={{ display: 'block', mb: 0.5, color: '#909399' }}>{label}</Typography>
      <Box sx={{ color: '#303133', fontSize: 14, wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}>{children || '-'}</Box>
    </Box>
  );
}

function AuditSnapshot({ title, fields }: { title: string; fields: AuditField[] }) {
  return (
    <Box sx={{ p: 1, bgcolor: '#f8fafc', border: '1px solid #e4e7ed', borderRadius: 1 }}>
      <Typography variant="caption" sx={{ display: 'block', mb: 0.75, color: '#606266', fontWeight: 600 }}>{title}</Typography>
      <Stack spacing={0.75}>
        {fields.length === 0 ? <Typography variant="caption" sx={{ color: '#909399' }}>无</Typography> : fields.map((field) => (
          <Box key={field.label} sx={{ display: 'grid', gridTemplateColumns: '88px minmax(0, 1fr)', gap: 1 }}>
            <Typography variant="caption" sx={{ color: '#606266' }}>{field.label}</Typography>
            <Typography variant="caption" sx={{ color: '#303133', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{field.value}</Typography>
          </Box>
        ))}
      </Stack>
    </Box>
  );
}

function errorMessage(error: unknown) {
  return error instanceof Error && error.message ? error.message : '操作失败，请稍后重试';
}

export default function WorkshopManagementPage() {
  const legacyColumnWidths = useMemo<Record<string, number>>(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(getCurrentUserPreferenceStorageKey('workshop-management-column-widths:v1:')) || '{}');
      return stored && typeof stored === 'object' && !Array.isArray(stored) ? stored : {};
    }
    catch { return {}; }
  }, []);
  const queryClient = useQueryClient();
  const factoriesQuery = useQuery({ queryKey: ['resource-factory-options'], queryFn: () => listProductionResources('factories', { page: 1, size: 200 }) });
  let canEdit = false;
  try { canEdit = (JSON.parse(localStorage.getItem('user') ?? '{}').permissions ?? []).includes('master-data.edit'); } catch { /* no authenticated profile */ }
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [filters, setFilters] = useState<WorkshopFilters>(() => ({ ...emptyFilters, keyword: readRecordLocation().keyword }));
  const [appliedFilters, setAppliedFilters] = useState<WorkshopFilters>(() => ({ ...emptyFilters, keyword: readRecordLocation().keyword }));
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingWorkshop, setEditingWorkshop] = useState<WorkshopRecord | null>(null);
  const [form, setForm] = useState<WorkshopForm>(emptyForm);
  const [deleteTarget, setDeleteTarget] = useState<WorkshopRecord | null>(null);
  const [selectedWorkshop, setSelectedWorkshop] = useState<WorkshopRecord | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerTab, setDrawerTab] = useState(0);
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false,
    message: '',
    severity: 'success',
  });

  const workshopsQuery = useQuery({
    queryKey: ['workshops', appliedFilters, page, pageSize],
    queryFn: () => getWorkshops({
      keyword: appliedFilters.keyword.trim() || undefined,
      status: appliedFilters.status === 'ALL' ? undefined : appliedFilters.status,
      page,
      size: pageSize,
    }),
  });
  const rows = workshopsQuery.data?.content ?? [];

  const auditQuery = useQuery({
    queryKey: ['workshop-audit', selectedWorkshop?.id],
    queryFn: async () => {
      const response = await getAuditLogs({ entityType: 'WORKSHOP', entityId: selectedWorkshop?.id, page: 1, size: 200 });
      return (response.data.data as PageResult<AuditLogItem>).content ?? [];
    },
    enabled: drawerOpen && drawerTab === 1 && Boolean(selectedWorkshop?.id),
  });

  const saveMutation = useMutation({
    mutationFn: (payload: WorkshopPayload) => editingWorkshop
      ? updateWorkshop(editingWorkshop.id, payload)
      : createWorkshop(payload),
    onSuccess: (saved) => {
      queryClient.invalidateQueries({ queryKey: ['workshops'] });
      setDialogOpen(false);
      setSelectedWorkshop((current) => current?.id === saved.id ? saved : current);
      setSnackbar({ open: true, message: editingWorkshop ? '车间编辑成功' : '车间新增成功', severity: 'success' });
    },
    onError: (error) => setSnackbar({ open: true, message: errorMessage(error), severity: 'error' }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteWorkshop(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workshops'] });
      if (selectedWorkshop?.id === deleteTarget?.id) {
        setDrawerOpen(false);
        setSelectedWorkshop(null);
      }
      setDeleteTarget(null);
      setSnackbar({ open: true, message: '车间删除成功', severity: 'success' });
    },
    onError: (error) => setSnackbar({ open: true, message: errorMessage(error), severity: 'error' }),
  });

  const totalPages = Math.max(workshopsQuery.data?.totalPages ?? 0, 1);
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);
  const canSave = !!form.siteId && form.code.trim().length > 0 && form.name.trim().length > 0 && !saveMutation.isPending;
  const auditEvents = useMemo(() => auditQuery.data ?? [], [auditQuery.data]);

  const openCreateDialog = () => {
    setEditingWorkshop(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEditDialog = (workshop: WorkshopRecord) => {
    setEditingWorkshop(workshop);
    setForm({
      siteId: workshop.siteId ?? '',
      code: workshop.code,
      name: workshop.name,
      description: workshop.description ?? '',
      status: workshop.status,
    });
    setDialogOpen(true);
  };

  const openDetail = (workshop: WorkshopRecord) => {
    setSelectedWorkshop(workshop);
    setDrawerTab(0);
    setDrawerOpen(true);
  };


  return (
    <Box data-workshop-management-page sx={{ height: { xs: 'auto', lg: 'calc(100vh - 150px)' }, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 1.5, overflow: 'hidden' }}>
      <ListQueryPanel actions={<ListQueryActions onReset={() => { setFilters(emptyFilters); setAppliedFilters(emptyFilters); setPage(1); }} onQuery={() => { setAppliedFilters(filters); setPage(1); }} />}>
        <TextField fullWidth size="small" label="车间名称/编码" placeholder="请输入" value={filters.keyword} sx={managementFieldSx}
          onChange={event => setFilters(current => ({ ...current, keyword: event.target.value }))} onKeyDown={event => { if (event.key === 'Enter') { setAppliedFilters(filters); setPage(1); } }}
          InputProps={{ startAdornment: <InputAdornment position="start"><Search fontSize="small" /></InputAdornment> }} />
        <TextField fullWidth select size="small" label="状态" value={filters.status} sx={managementFieldSx} onChange={event => setFilters(current => ({ ...current, status: event.target.value as WorkshopFilters['status'] }))}>
          <MenuItem value="ALL">全部</MenuItem><MenuItem value="ACTIVE">启用</MenuItem><MenuItem value="INACTIVE">停用</MenuItem>
        </TextField>
      </ListQueryPanel>

      <Box component="section" sx={{ flex: 1, minHeight: 0, bgcolor: '#fff', border: '1px solid #e4e7ed', borderRadius: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <ConfigurableListTable
          preferenceKey="workshop-management:v2"
          columns={WORKSHOP_COLUMNS.map(column => ({
            key: column.id, label: column.label, width: Number.isFinite(legacyColumnWidths[column.id]) ? Math.max(column.minWidth, legacyColumnWidths[column.id]) : column.width, minWidth: column.minWidth,
            action: column.id === 'actions',
            render: (workshop: WorkshopRecord) => column.id === 'name' ? <Typography sx={listTablePrimaryTextSx}>{workshop.name}</Typography>
              : column.id === 'status' ? <StatusBadge label={statusLabel(workshop.status)} color={workshop.status === 'ACTIVE' ? 'success' : 'default'} />
              : column.id === 'actions' ? <Box onClick={event => event.stopPropagation()}>
                {canEdit && <Tooltip title="编辑"><IconButton size="small" aria-label={`编辑车间 ${workshop.name}`} onClick={() => openEditDialog(workshop)}><Edit fontSize="small" /></IconButton></Tooltip>}
                <Tooltip title={workshop.deletable ? '删除' : '车间已被引用，只能停用'}><span><IconButton size="small" color="error" disabled={!canEdit || !workshop.deletable} aria-label={`删除车间 ${workshop.name}`} onClick={() => setDeleteTarget(workshop)}><Delete fontSize="small" /></IconButton></span></Tooltip>
              </Box>
              : workshop[column.id] || '-',
          }))}
          rows={workshopsQuery.isError ? [] : rows}
          loading={workshopsQuery.isLoading}
          emptyText={workshopsQuery.isError ? '加载失败，请稍后重试' : '暂无车间数据'}
          onRow={openDetail}
          toolbar={canEdit ? <Button size="small" variant="contained" startIcon={<Add />} onClick={openCreateDialog}>新增车间</Button> : undefined}
        />
        <ListTablePagination total={workshopsQuery.data?.totalElements ?? 0} page={page} size={pageSize} onPage={setPage} onSize={value => { setPageSize(value); setPage(1); }} sizeOptions={[...PAGE_SIZE_OPTIONS]} />
      </Box>

      <PackDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} title="车间详情" width={560}>
        <Tabs value={drawerTab} onChange={(_, value: number) => setDrawerTab(value)} aria-label="车间详情切换">
          <Tab label="数据信息" /><Tab label="数据审计" />
        </Tabs>
          {drawerTab === 0 ? (
            <Stack spacing={1.5}>
              <DetailSection title="基本信息">
                <Box sx={managementDetailGridSx}>
                  <DetailField label="车间名称">{selectedWorkshop?.name}</DetailField>
                  <DetailField label="车间编码">{selectedWorkshop?.code}</DetailField>
                  <DetailField label="所属工厂">{selectedWorkshop?.siteName}</DetailField>
                  <DetailField label="状态"><StatusBadge label={statusLabel(selectedWorkshop?.status)} color={selectedWorkshop?.status === 'ACTIVE' ? 'success' : 'default'} /></DetailField>
                  <DetailField label="引用情况">{selectedWorkshop?.referenced ? '已被引用，编码锁定且不能删除' : '未被引用'}</DetailField>
                  <Box sx={{ gridColumn: '1 / -1' }}><DetailField label="描述">{selectedWorkshop?.description || '-'}</DetailField></Box>
                </Box>
              </DetailSection>
              <DetailSection title="系统信息">
                <Box sx={managementDetailGridSx}>
                  <DetailField label="创建时间">{formatDateTime(selectedWorkshop?.createdAt)}</DetailField>
                  <DetailField label="更新时间">{formatDateTime(selectedWorkshop?.updatedAt)}</DetailField>
                </Box>
              </DetailSection>
            </Stack>
          ) : auditQuery.isLoading ? (
            <Box sx={{ py: 5, textAlign: 'center' }}><CircularProgress size={24} /></Box>
          ) : auditQuery.isError ? (
            <Stack spacing={1.5} alignItems="center" sx={{ py: 5, color: '#909399' }}>
              <Typography color="inherit">数据审计加载失败</Typography>
              <Button size="small" variant="outlined" onClick={() => auditQuery.refetch()}>重新加载</Button>
            </Stack>
          ) : auditEvents.length === 0 ? (
            <Box sx={{ py: 5, textAlign: 'center', color: '#909399' }}>暂无审计记录</Box>
          ) : (
            <Stack spacing={1.5}>
              {auditEvents.map((event) => (
                <Box key={String(event.id)} sx={{ p: 1.5, bgcolor: '#fff', border: '1px solid #e4e7ed', borderRadius: 1 }}>
                  <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
                    <Typography sx={{ fontWeight: 600, color: '#303133' }}>{event.actionLabel || actionLabels[(event.action ?? '').toUpperCase()] || event.action || '-'}</Typography>
                    <Typography variant="caption" sx={{ color: '#909399' }}>{formatDateTime(event.operationTime || event.createdAt)}</Typography>
                  </Stack>
                  <Typography variant="caption" sx={{ display: 'block', mb: 1, color: '#606266' }}>操作人：{event.operatorDisplayName || event.operatorAccount || '-'}</Typography>
                  <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1 }}>
                    <AuditSnapshot title="变更前" fields={auditFields(event.contentBefore)} />
                    <AuditSnapshot title="变更后" fields={auditFields(event.contentAfter)} />
                  </Box>
                </Box>
              ))}
            </Stack>
          )}
      </PackDrawer>

      <FormDialog open={dialogOpen} onClose={() => !saveMutation.isPending && setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editingWorkshop ? '编辑车间' : '新增车间'}</DialogTitle>
        <DialogContent dividers sx={managementFieldSx}><FormDialogSection title="基本信息">
          <FormDialogFieldGrid hasTrailingFullRow>
            <TextField size="small" select required label="所属工厂" value={form.siteId} disabled={!!editingWorkshop?.referenced} onChange={event => setForm(current => ({ ...current, siteId: event.target.value }))}>
              <MenuItem value="">请选择</MenuItem>
              {(factoriesQuery.data?.content ?? []).filter(factory => factory.status === 'ACTIVE' || factory.id === form.siteId).map(factory => <MenuItem key={factory.id} value={factory.id}>{factory.name}（{factory.code}）</MenuItem>)}
            </TextField>
            {factoriesQuery.error && <Alert severity="error" sx={{ gridColumn: '1 / -1' }}>工厂列表加载失败：{factoriesQuery.error.message}</Alert>}
            <TextField
              size="small"
              required
              label="车间名称"
              value={form.name}
              inputProps={{ maxLength: 128 }}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
            />
            <TextField
              size="small"
              required
              label="车间编码"
              value={form.code}
              disabled={Boolean(editingWorkshop && !editingWorkshop.codeEditable)}
              helperText={editingWorkshop && !editingWorkshop.codeEditable ? '该车间已被引用，编码不可修改' : undefined}
              inputProps={{ maxLength: 64 }}
              onChange={(event) => setForm((current) => ({ ...current, code: event.target.value }))}
            />
            <TextField size="small" select required label="状态" value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as WorkshopForm['status'] }))}>
              <MenuItem value="ACTIVE">启用</MenuItem>
              <MenuItem value="INACTIVE">停用</MenuItem>
            </TextField>
            <TextField size="small" label="描述" sx={{ gridColumn: '1 / -1' }} value={form.description} multiline minRows={3} inputProps={{ maxLength: 512 }} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} />
          </FormDialogFieldGrid></FormDialogSection>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)} disabled={saveMutation.isPending}>取消</Button>
          <Button
            variant="contained"
            disabled={!canSave}
            onClick={() => saveMutation.mutate({ siteId: form.siteId, code: form.code, name: form.name, description: form.description || undefined, status: form.status })}
          >
            {saveMutation.isPending ? '保存中...' : '保存'}
          </Button>
        </DialogActions>
      </FormDialog>

      <ConfirmDialog
        deletionTarget={deleteTarget && { type: 'workshop', id: deleteTarget.id }}
        open={Boolean(deleteTarget)}
        title="确认删除车间"
        message={`确定删除车间「${deleteTarget?.name || ''}」吗？删除后无法恢复。`}
        confirmText="删除"
        destructive
        loading={deleteMutation.isPending}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
      />

      <Snackbar open={snackbar.open} autoHideDuration={3000} onClose={() => setSnackbar((current) => ({ ...current, open: false }))} anchorOrigin={{ vertical: 'top', horizontal: 'center' }}>
        <Alert severity={snackbar.severity} onClose={() => setSnackbar((current) => ({ ...current, open: false }))}>{snackbar.message}</Alert>
      </Snackbar>
    </Box>
  );
}
