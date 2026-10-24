// Keep the original family/member maintenance workflow; Pack manufacturing is maintained by each product.
import { Fragment, useEffect, useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  InputAdornment,
  Stack,
  Tab,
  Tabs,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import {
  Add,
  Delete,
  Edit,
  ExpandLess,
  ExpandMore,
  GroupOutlined,
  Search,
  UnfoldLessRounded,
  UnfoldMoreRounded,
} from "@mui/icons-material";
import AppDialog from "@/components/AppDialog";
import ConfigurableListTable, { useListTableColumns, type ConfigurableListColumn, type ListTableColumnPreferences } from "@/components/ConfigurableListTable";
import FormDialog from "@/components/FormDialog";
import FormDialogFieldGrid from "@/components/FormDialogFieldGrid";
import FormDialogSection from "@/components/FormDialogSection";
import ConfirmDialog from "@/components/ConfirmDialog";
import TableStateCell from "@/components/TableStateCell";
import {
  ListTableShell,
  resolveListColumnWidths,
} from "@/components/ListTableShell";
import {
  listColumnResizeHandleSx,
  listTableBodyCellSx,
  listTableDetailLinkSx,
  listTableHeaderCellSx,
  listTableStickyEdgeSx,
} from "@/components/listTableStyles";
import { usePersistedListColumnWidths } from "@/components/usePersistedListColumnWidths";
import ListColumnSettingsPopover, { getCurrentUserPreferenceStorageKey, loadListColumnSettings, normalizeListColumnSettings, reorderListColumns } from "@/components/ListColumnSettingsPopover";
import ListTablePagination from "@/components/ListTablePagination";
import ListQueryPanel, { ListQueryActions } from "@/components/ListQueryPanel";
import ListToolbarIconButton, { ListColumnSettingsButton } from "@/components/ListToolbarIconButton";
import { managementFieldSx, managementDetailGridSx } from "@/components/managementPageStyles";
import { useSnackbar } from "@/components/SnackbarProvider";
import { getAuditLogs, type AuditLogItem } from "@/api/audit";
import {
  addProductFamilyMembers,
  createProductFamily,
  deleteProductFamily,
  getProductFamilies,
  getProductFamilyMemberOptions,
  removeProductFamilyMember,
  transferProductFamilyMember,
  updateProductFamily,
  type ProductFamilyMemberOption,
  type ProductFamilyModel,
  type ProductFamilyPayload,
} from "@/api/product-family-modeling";
import type { PageResult } from "@/types/common";
import {
  readRecordLocation,
  useRecordLocationAction,
} from "@/utils/recordLocation";
import { PackDrawer, PackFields, packError } from "@/pages/pack/packUi";
import { EvidenceTable, packTime } from "@/pages/pack/PackEvidence";
const PAGE_SIZE_OPTIONS = [20, 50, 100, 200] as const;
const COLUMN_STORAGE_KEY = "product-family-modeling-parent-columns:v1";
const ACTION_COLUMN_WIDTH = 128;
const FAMILY_MEMBER_COLUMNS: ConfigurableListColumn<ProductFamilyMemberOption>[] = [
  { key: "productCode", label: "产品编码", width: 180, minWidth: 80 },
  { key: "productName", label: "产品名称", width: 180, minWidth: 80 },
  { key: "materialTypeName", label: "物料类型", width: 180, minWidth: 80 },
  { key: "actions", label: "操作", action: true, width: ACTION_COLUMN_WIDTH, minWidth: ACTION_COLUMN_WIDTH },
];
const FAMILY_MEMBER_COLUMN_OPTIONS = FAMILY_MEMBER_COLUMNS.filter(column => column.key !== "actions").map(column => ({ id: column.key, label: column.label }));
type ProductFamilyColumnId =
  | "name"
  | "code"
  | "memberCount"
  | "updatedBy"
  | "updatedAt"
  | "actions";
interface ProductFamilyColumn {
  id: ProductFamilyColumnId;
  label: string;
  width: number;
  minWidth: number;
  configurable?: boolean;
}
const PRODUCT_FAMILY_COLUMNS: ProductFamilyColumn[] = [
  {
    id: "name",
    label: "产品簇名称",
    width: 260,
    minWidth: 180,
    configurable: true,
  },
  {
    id: "code",
    label: "产品簇编码",
    width: 170,
    minWidth: 128,
    configurable: true,
  },
  {
    id: "memberCount",
    label: "产品成员数",
    width: 110,
    minWidth: 96,
    configurable: true,
  },
  {
    id: "updatedBy",
    label: "更新人",
    width: 132,
    minWidth: 96,
    configurable: true,
  },
  {
    id: "updatedAt",
    label: "更新时间",
    width: 172,
    minWidth: 150,
    configurable: true,
  },
  {
    id: "actions",
    label: "操作",
    width: ACTION_COLUMN_WIDTH,
    minWidth: ACTION_COLUMN_WIDTH,
  },
];
const tableHeaderCellSx = listTableHeaderCellSx;
const tableRowSx = { "& > .MuiTableCell-root": listTableBodyCellSx };

const formatDateTime = packTime;
function DetailField({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <Box>
      <Typography variant="caption" sx={{ color: '#909399', display: 'block', mb: 0.5 }}>
        {label}
      </Typography>
      <Typography component="div" variant="body2" sx={{ color: '#303133', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
        {children ?? "—"}
      </Typography>
    </Box>
  );
}
export default function ProductFamilyModelingPage() {
  const { getColumnWidth: getPersistedColumnWidth, getResizeHandleProps } = usePersistedListColumnWidths(
    PRODUCT_FAMILY_COLUMNS,
    "product-family-modeling-column-widths:v1:",
  );
  const getColumnWidth = (column: ProductFamilyColumn) => column.id === "actions" ? ACTION_COLUMN_WIDTH : getPersistedColumnWidth(column);
  const cache = useQueryClient();
  const { showMessage } = useSnackbar();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] =
    useState<(typeof PAGE_SIZE_OPTIONS)[number]>(20);
  const [keyword, setKeyword] = useState(() => readRecordLocation().keyword);
  const [applied, setApplied] = useState(() => readRecordLocation().keyword);
  const [expanded, setExpanded] = useState<string[]>([]);
  const [detail, setDetail] = useState<ProductFamilyModel | null>(null);
  const [detailTab, setDetailTab] = useState(0);
  const [familyForm, setFamilyForm] = useState<
    ProductFamilyModel | null | undefined
  >(undefined);
  const [members, setMembers] = useState<ProductFamilyModel | null>(null);
  const [deleting, setDeleting] = useState<ProductFamilyModel | null>(null);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [columnSettingsTarget, setColumnSettingsTarget] = useState<"main" | "child">("main");
  const memberColumnPreferences = useListTableColumns(FAMILY_MEMBER_COLUMNS, "product-family-members-expanded:v1");
  const columnOptions = PRODUCT_FAMILY_COLUMNS.map(column => ({ ...column, fixed: column.id === "actions" }));
  const columnStorageKey = getCurrentUserPreferenceStorageKey("product-family-modeling-parent-columns:v2:");
  const [columnSettings, setColumnSettings] = useState(() => {
    if (localStorage.getItem(columnStorageKey)) {
      const loaded = loadListColumnSettings(columnStorageKey, columnOptions, 1);
      return { ...loaded, hidden: loaded.hidden.filter(id => id !== "actions") };
    }
    let legacyHidden: ProductFamilyColumnId[] = [];
    try {
      const stored = JSON.parse(localStorage.getItem(COLUMN_STORAGE_KEY) || "[]");
      if (Array.isArray(stored)) legacyHidden = stored.filter(id => PRODUCT_FAMILY_COLUMNS.some(column => column.id === id && column.configurable));
    } catch { /* keep default columns */ }
    return normalizeListColumnSettings(columnOptions, 1, { version: 1, order: PRODUCT_FAMILY_COLUMNS.map(column => column.id), hidden: legacyHidden });
  });
  useEffect(() => {
    localStorage.setItem(columnStorageKey, JSON.stringify(columnSettings));
  }, [columnStorageKey, columnSettings]);
  const list = useQuery({
    queryKey: ["product-family-modeling", page, pageSize, applied],
    queryFn: async () =>
      (await getProductFamilies({ page, size: pageSize, keyword: applied }))
        .data.data,
  });
  const rows = list.data?.content || [];
  useRecordLocationAction((location) => {
    if (location.type !== "product_family_member") return false;
    const family = rows.find((row) => String(row.id) === location.id);
    if (!family) return false;
    setMembers(family);
    return true;
  });
  const audit = useQuery({
    queryKey: ["product-family-audit", detail?.id],
    enabled: !!detail && detailTab === 1,
    queryFn: async () =>
      (
        await getAuditLogs({
          page: 1,
          size: 100,
          sort: "createdAt",
          order: "desc",
          entityType: "PRODUCT_FAMILY",
          entityId: detail!.id,
        })
      ).data.data as PageResult<AuditLogItem>,
  });
  const invalidate = () => {
    void cache.invalidateQueries({ queryKey: ["product-family-modeling"] });
    void cache.invalidateQueries({ queryKey: ["product-family-members"] });
  };
  const save = useMutation({
    mutationFn: ({
      target,
      payload,
    }: {
      target: ProductFamilyModel | null;
      payload: ProductFamilyPayload;
    }) =>
      target
        ? updateProductFamily(target.id, payload)
        : createProductFamily(payload),
    onSuccess: () => {
      setFamilyForm(undefined);
      invalidate();
      showMessage("产品簇已保存");
    },
    onError: (cause) => showMessage(packError(cause), "error"),
  });
  const remove = useMutation({
    mutationFn: () => deleteProductFamily(deleting!.id),
    onSuccess: () => {
      setDeleting(null);
      setDetail(null);
      invalidate();
      showMessage("产品簇已删除");
    },
    onError: (cause) => showMessage(packError(cause), "error"),
  });
  const isTableEmptyState = list.isLoading || !!list.error || !rows.length;
  const columns = useMemo(
    () => columnSettings.order.filter(id => !columnSettings.hidden.includes(id)).map(id => PRODUCT_FAMILY_COLUMNS.find(column => column.id === id)!),
    [columnSettings],
  );
  const minWidth = Math.max(memberColumnPreferences.minTableWidth, columns.reduce(
    (sum, column) => sum + getColumnWidth(column),
    0,
  ));
  const toggle = (id: string) =>
    setExpanded((old) =>
      old.includes(id) ? old.filter((value) => value !== id) : [...old, id],
    );
  useEffect(() => {
    const total = Math.max(1, list.data?.totalPages || 1);
    if (page > total) setPage(total);
  }, [list.data?.totalPages, page]);
  return (
    <Box
      sx={{
        minWidth: 0,
        height: { xs: "auto", lg: "calc(100vh - 150px)" },
        display: "flex",
        flexDirection: "column",
        gap: 1.5,
        minHeight: 0,
        overflow: "hidden",
      }}
    >
      <ListQueryPanel actions={<ListQueryActions onReset={() => { setKeyword(""); setApplied(""); setPage(1); }} onQuery={() => { setApplied(keyword.trim()); setPage(1); }} />}>
        <TextField fullWidth size="small" label="产品簇名称/编码" placeholder="请输入" value={keyword} sx={managementFieldSx}
          onChange={event => setKeyword(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { setApplied(keyword.trim()); setPage(1); } }}
          InputProps={{ startAdornment: <InputAdornment position="start"><Search fontSize="small" /></InputAdornment> }} />
      </ListQueryPanel>
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          flex: 1,
          minHeight: 0,
          border: "1px solid #e4e7ed",
          borderRadius: 1,
          bgcolor: "#fff",
          overflow: "hidden",
        }}
      >
        <Stack
          direction="row"
          justifyContent="space-between"
          alignItems="center"
          sx={{
            px: 2,
            minHeight: 48,
            height: 48,
            flexShrink: 0,
            gap: 2,
            borderBottom: "1px solid #e4e7ed",
            overflowX: "auto",
            overflowY: "hidden",
            "& > *": { flexShrink: 0 },
          }}
        >
          <Stack direction="row" spacing={1} alignItems="center">
            <ListColumnSettingsButton onClick={event => setAnchor(event.currentTarget)} />
            <ListToolbarIconButton label="全部展开" onClick={() => setExpanded(rows.map(row => row.id))}><UnfoldMoreRounded sx={{ fontSize: 20 }} /></ListToolbarIconButton>
            <ListToolbarIconButton label="全部收起" onClick={() => setExpanded([])}><UnfoldLessRounded sx={{ fontSize: 20 }} /></ListToolbarIconButton>
          </Stack>
          <Button
            variant="contained"
            size="small"
            startIcon={<Add />}
            onClick={() => setFamilyForm(null)}
          >
            新增产品簇
          </Button>
        </Stack>
        <ListTableShell
          minTableWidth={minWidth}
          sx={{ flex: 1, minHeight: 0, overflow: "auto" }}
        >
          {(width) => {
            const widths = resolveListColumnWidths(
              columns.map((column) => ({
                id: column.id,
                width: getColumnWidth(column),
              })),
              width,
              "name",
              ["actions"],
            );
            return (
              <Table
                stickyHeader
                size="small"
                sx={{ width, minWidth: width, tableLayout: "fixed", height: isTableEmptyState ? "100%" : "auto" }}
              >
                <colgroup>
                  {columns.map((column) => (
                    <col key={column.id} style={{ width: widths[column.id] }} />
                  ))}
                </colgroup>
                <TableHead>
                  <TableRow>
                    {columns.map((column) => (
                      <TableCell
                        key={column.id}
                        align={column.id === "actions" ? "center" : "left"}
                        sx={{
                          ...tableHeaderCellSx,
                          position: "sticky",
                          top: 0,
                          zIndex: column.id === "actions" ? 10 : 2,
                          ...(column.id === "actions"
                            ? { right: 0, zIndex: 10, ...listTableStickyEdgeSx }
                            : {}),
                          width: widths[column.id],
                        }}
                      >
                        {column.label}
                        {column.id !== "actions" && (
                          <Box
                            data-column-resize-handle={column.id}
                            sx={listColumnResizeHandleSx}
                            {...getResizeHandleProps(column, widths)}
                          />
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody sx={{ height: isTableEmptyState ? "100%" : "auto" }}>
                  {isTableEmptyState ? (
                    <TableRow sx={{ height: "100%" }}>
                      <TableStateCell
                        colSpan={columns.length}
                        align="center"
                        sx={{ height: "100%", py: 0, borderBottom: "1px solid #ebeef5", color: "#909399" }}
                      >
                        {list.isLoading
                          ? <CircularProgress size={24} />
                          : list.error
                            ? packError(list.error)
                            : "暂无产品簇"}
                      </TableStateCell>
                    </TableRow>
                  ) : (
                    rows.map((family) => (
                      <Fragment key={family.id}>
                        <TableRow
                          hover
                          sx={{ ...tableRowSx, cursor: "pointer" }}
                          onClick={() => toggle(family.id)}
                        >
                          {columns.map((column) => (
                            <TableCell
                              key={column.id}
                              align={column.id === "actions" ? "center" : "left"}
                              sx={
                                column.id === "actions"
                                  ? {
                                      position: "sticky",
                                      right: 0,
                                      zIndex: 5,
                                      bgcolor: "#fff",
                                      ...listTableStickyEdgeSx,
                                    }
                                  : undefined
                              }
                            >
                              <Stack direction="row" spacing={0.5} alignItems="center" sx={{ minWidth: 0, justifyContent: column.id === "actions" ? "center" : undefined }}>
                                {column.id === columns.find(item => item.id !== "actions")?.id && (
                                  <IconButton
                                    size="small"
                                    sx={{ width: 24, height: 24, flexShrink: 0, color: "#606266" }}
                                    aria-label={
                                      expanded.includes(family.id)
                                        ? "收起产品成员"
                                        : "展开产品成员"
                                    }
                                    aria-expanded={expanded.includes(family.id)}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      toggle(family.id);
                                    }}
                                  >
                                    {expanded.includes(family.id) ? (
                                      <ExpandLess fontSize="small" />
                                    ) : (
                                      <ExpandMore fontSize="small" />
                                    )}
                                  </IconButton>
                                )}
                                <Box sx={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {column.id === "name" ? (
                                  <Typography
                                    component="button"
                                    type="button"
                                    title={family.name}
                                    sx={{
                                      ...listTableDetailLinkSx,
                                      p: 0,
                                      border: 0,
                                      bgcolor: "transparent",
                                      font: "inherit",
                                      textAlign: "left",
                                      cursor: "pointer",
                                      display: "block",
                                      maxWidth: "100%",
                                      overflow: "hidden",
                                      textOverflow: "ellipsis",
                                      whiteSpace: "nowrap",
                                    }}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setDetail(family);
                                      setDetailTab(0);
                                    }}
                                  >
                                    {family.name}
                                  </Typography>
                              ) : column.id === "actions" ? (
                                <Box onClick={(e) => e.stopPropagation()}>
                                  <Tooltip title="产品成员">
                                    <IconButton
                                      size="small"
                                      aria-label="产品成员"
                                      onClick={() => setMembers(family)}
                                    >
                                      <GroupOutlined fontSize="small" />
                                    </IconButton>
                                  </Tooltip>
                                  <Tooltip title="编辑">
                                    <IconButton
                                      size="small"
                                      aria-label="编辑"
                                      onClick={() => setFamilyForm(family)}
                                    >
                                      <Edit fontSize="small" />
                                    </IconButton>
                                  </Tooltip>
                                  <Tooltip title="删除">
                                    <IconButton
                                      size="small"
                                      aria-label="删除"
                                      color="error"
                                      onClick={() => setDeleting(family)}
                                    >
                                      <Delete fontSize="small" />
                                    </IconButton>
                                  </Tooltip>
                                </Box>
                              ) : column.id === "updatedAt" ? (
                                formatDateTime(
                                  family.updatedAt || family.createdAt,
                                )
                              ) : column.id === "updatedBy" ? (
                                family.updatedBy || family.createdBy || "—"
                              ) : (
                                String((family as any)[column.id] ?? "—")
                              )}
                                </Box>
                              </Stack>
                            </TableCell>
                          ))}
                        </TableRow>
                        {expanded.includes(family.id) && (
                          <TableRow sx={{ "& .MuiTableCell-root": { borderBottom: "none" } }}>
                            <TableCell
                              colSpan={columns.length}
                              sx={{ p: 0, bgcolor: "#fafcff", borderBottom: "none" }}
                            >
                              <FamilyMemberRows family={family} columnPreferences={memberColumnPreferences} tableWidth={width} />
                            </TableCell>
                          </TableRow>
                        )}
                      </Fragment>
                    ))
                  )}
                </TableBody>
              </Table>
            );
          }}
        </ListTableShell>
        <ListTablePagination total={list.data?.totalElements || 0} page={page} size={pageSize} onPage={setPage} onSize={value => { setPageSize(value as typeof pageSize); setPage(1); }} sizeOptions={[...PAGE_SIZE_OPTIONS]} />
      </Box>
      <ListColumnSettingsPopover
        masterDetail
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        header={<Tabs value={columnSettingsTarget} onChange={(_, value: "main" | "child") => setColumnSettingsTarget(value)} aria-label="产品簇字段设置切换" sx={{ minHeight: 32, mb: 0.5, '& .MuiTab-root': { minHeight: 32, py: 0, fontSize: 13 } }}><Tab label="主表" value="main" /><Tab label="子表" value="child" /></Tabs>}
        columns={columnSettingsTarget === "main" ? columnOptions.filter(column => column.configurable) : FAMILY_MEMBER_COLUMN_OPTIONS}
        settings={columnSettingsTarget === "main" ? columnSettings : memberColumnPreferences.settings}
        canHide={id => columnSettingsTarget !== "main" || (id !== "actions" && columns.filter(column => column.id !== "actions").length > 1)}
        onToggle={id => {
          if (columnSettingsTarget === "child") {
            memberColumnPreferences.setSettings(current => ({ ...current, hidden: current.hidden.includes(id) ? current.hidden.filter(value => value !== id) : [...current.hidden, id] }));
          } else {
            const columnId = id as ProductFamilyColumnId;
            setColumnSettings(current => ({ ...current, hidden: current.hidden.includes(columnId) ? current.hidden.filter(value => value !== columnId) : [...current.hidden, columnId] }));
          }
        }}
        onReorder={(source, target) => {
          if (columnSettingsTarget === "child") memberColumnPreferences.setSettings(current => reorderListColumns(FAMILY_MEMBER_COLUMN_OPTIONS, current, source, target));
          else setColumnSettings(current => reorderListColumns(columnOptions, current, source as ProductFamilyColumnId, target as ProductFamilyColumnId));
        }}
      />
      <PackDrawer
        open={!!detail}
        onClose={() => setDetail(null)}
        title="产品簇详情"
        width={560}
      >
        {detail && (
          <>
            <Tabs
              value={detailTab}
              onChange={(_, value) => setDetailTab(value)}
            >
              <Tab label="数据信息" />
              <Tab label="数据审计" />
            </Tabs>
            {detailTab === 0 ? (
              <Stack spacing={2}>
                <Box sx={{ bgcolor: '#fff' }}><FormDialogSection title="基本信息">
                  <PackFields items={[
                    ['产品簇名称', detail.name], ['产品簇编码', detail.code], ['产品成员数', detail.memberCount], ['描述', detail.description],
                  ]} />
                </FormDialogSection></Box>
                <Box sx={{ bgcolor: '#fff' }}><FormDialogSection title="系统信息">
                  <PackFields items={[
                    ['创建人', detail.createdBy], ['创建时间', formatDateTime(detail.createdAt)], ['更新人', detail.updatedBy || detail.createdBy], ['更新时间', formatDateTime(detail.updatedAt)],
                  ]} />
                </FormDialogSection></Box>
                <Stack direction="row" justifyContent="flex-end"><Button size="small" onClick={() => setMembers(detail)}>管理产品成员</Button></Stack>
              </Stack>
            ) : audit.error ? (
              <Alert severity="error">{packError(audit.error)}</Alert>
            ) : (
              <EvidenceTable preferenceKey="product-family-audit:v1"
                rows={audit.data?.content || []}
                empty={audit.isLoading ? "正在读取审计…" : "暂无审计记录"}
                columns={[
                  {
                    key: "createdAt",
                    label: "时间",
                    render: (row) =>
                      packTime(row.createdAt || row.operationTime),
                  },
                  {
                    key: "action",
                    label: "动作",
                    render: (row) => row.actionLabel || row.action,
                  },
                  {
                    key: "operator",
                    label: "操作人",
                    render: (row) => row.operatorDisplayName || row.operatorAccount || row.operatorId || "—",
                  },
                  {
                    key: "dataSummary",
                    label: "说明",
                    render: (row) => row.dataSummary || row.functionName || "—",
                  },
                ]}
              />
            )}
          </>
        )}
      </PackDrawer>
      {familyForm !== undefined && (
        <ProductFamilyFormDialog
          target={familyForm}
          saving={save.isPending}
          onClose={() => setFamilyForm(undefined)}
          onSubmit={(payload) => save.mutate({ target: familyForm, payload })}
        />
      )}{" "}
      {members && (
        <ProductFamilyMemberDialog
          family={members}
          onClose={() => setMembers(null)}
          onChanged={invalidate}
        />
      )}
      <ConfirmDialog
        open={!!deleting}
        title="删除产品簇"
        message={`确定删除产品簇“${deleting?.name || ""}”？删除前应移除成员，服务端将校验引用。`}
        destructive
        loading={remove.isPending}
        onCancel={() => setDeleting(null)}
        onConfirm={() => remove.mutate()}
      />
    </Box>
  );
}
function FamilyMemberRows({ family, columnPreferences, tableWidth }: { family: ProductFamilyModel; columnPreferences: ListTableColumnPreferences; tableWidth: number }) {
  const navigate = useNavigate();
  const query = useQuery({
    queryKey: ["product-family-members", family.id],
    queryFn: async () =>
      (await getProductFamilyMemberOptions(family.id)).data.data,
  });
  return query.error ? (
    <Alert severity="error">{packError(query.error)}</Alert>
  ) : (
    <EvidenceTable preferenceKey="product-family-members-expanded:v1"
      columnPreferences={columnPreferences}
      embedded
      tableWidth={tableWidth}
      rows={query.data?.filter((member) => member.currentMember) || []}
      empty={query.isLoading ? "正在加载成员…" : "暂无产品成员"}
      columns={FAMILY_MEMBER_COLUMNS.map(column => column.key === "actions" ? {
          ...column,
          render: (row: ProductFamilyMemberOption) => (
            <Button
              size="small"
              onClick={() =>
                navigate(`/pack/manufacturing?productId=${row.productId}`)
              }
            >
              制造配置
            </Button>
          ),
        } : column)}
    />
  );
}
function ProductFamilyFormDialog({
  target,
  saving,
  onClose,
  onSubmit,
}: {
  target: ProductFamilyModel | null;
  saving: boolean;
  onClose: () => void;
  onSubmit: (payload: ProductFamilyPayload) => void;
}) {
  const [form, setForm] = useState<ProductFamilyPayload>(() => ({
    code: target?.code || "",
    name: target?.name || "",
    description: target?.description || "",
  }));
  useEffect(() => {
    setForm({
      code: target?.code || "",
      name: target?.name || "",
      description: target?.description || "",
    });
  }, [target]);
  return (
    <FormDialog
      open
      onClose={saving ? undefined : onClose}
      fullWidth
      maxWidth="sm"
    >
      <DialogTitle>{target ? "编辑产品簇" : "新增产品簇"}</DialogTitle>
      <DialogContent dividers sx={managementFieldSx}>
        <Stack spacing={2}>
          <FormDialogSection title="基本信息"><FormDialogFieldGrid hasTrailingFullRow>
            <TextField required size="small" label="产品簇名称" value={form.name} onChange={event => setForm(value => ({ ...value, name: event.target.value }))} />
            <TextField required size="small" label="产品簇编码" value={form.code} onChange={event => setForm(value => ({ ...value, code: event.target.value }))} />
            <TextField fullWidth size="small" label="描述" multiline minRows={3} sx={{ gridColumn: '1 / -1' }} value={form.description || ''} onChange={event => setForm(value => ({ ...value, description: event.target.value }))} />
          </FormDialogFieldGrid></FormDialogSection>
          {target && <FormDialogSection title="系统信息"><Box sx={managementDetailGridSx}>
            <DetailField label="创建时间">{formatDateTime(target.createdAt)}</DetailField>
            <DetailField label="更新时间">{formatDateTime(target.updatedAt)}</DetailField>
          </Box></FormDialogSection>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>
          取消
        </Button>
        <Button
          variant="contained"
          disabled={saving || !form.name.trim() || !form.code.trim()}
          onClick={() =>
            onSubmit({
              ...form,
              code: form.code.trim(),
              name: form.name.trim(),
              description: form.description?.trim() || null,
            })
          }
        >
          {saving ? "保存中..." : "保存"}
        </Button>
      </DialogActions>
    </FormDialog>
  );
}

function ProductFamilyMemberDialog({
  family,
  onClose,
  onChanged,
}: {
  family: ProductFamilyModel;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { showMessage } = useSnackbar();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [transferTarget, setTransferTarget] =
    useState<ProductFamilyMemberOption | null>(null);
  const optionsQuery = useQuery({
    queryKey: ["product-family-members", family.id],
    queryFn: async () =>
      (await getProductFamilyMemberOptions(family.id)).data.data,
  });
  const refresh = async () => {
    setSelectedIds([]);
    await optionsQuery.refetch();
    onChanged();
  };
  const addMutation = useMutation({
    mutationFn: () => addProductFamilyMembers(family.id, selectedIds),
    onSuccess: () => {
      void refresh();
      showMessage("产品已添加到当前产品簇");
    },
    onError: (error: Error) =>
      showMessage(error.message || "添加失败", "error"),
  });
  const transferMutation = useMutation({
    mutationFn: (item: ProductFamilyMemberOption) =>
      transferProductFamilyMember(family.id, item.productId),
    onSuccess: () => {
      setTransferTarget(null);
      void refresh();
      showMessage("产品已转移到当前产品簇");
    },
    onError: (error: Error) =>
      showMessage(error.message || "转移失败", "error"),
  });
  const removeMutation = useMutation({
    mutationFn: (item: ProductFamilyMemberOption) =>
      removeProductFamilyMember(family.id, item.productId),
    onSuccess: () => {
      void refresh();
      showMessage("产品已移出当前产品簇");
    },
    onError: (error: Error) =>
      showMessage(error.message || "移除失败", "error"),
  });
  const options = optionsQuery.data ?? [];
  const currentMembers = options.filter((item) => item.currentMember);
  const candidates = options.filter((item) => !item.currentMember);
  const toggle = (id: string) =>
    setSelectedIds((ids) =>
      ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id],
    );
  return (
    <>
      <AppDialog open onClose={onClose} fullWidth maxWidth="lg">
        <DialogTitle>产品成员 · {family.name}</DialogTitle>
        <DialogContent dividers sx={{ p: 0 }}>
          <Box
            sx={{
              px: 2,
              py: 1.25,
              bgcolor: "#fff8e6",
              borderBottom: "1px solid #f0dfb3",
            }}
          >
            <Typography variant="caption" sx={{ color: "#7a5b00" }}>
              产品簇仅用于成员分组。各产品的 Pack
              制造版本独立维护，成员转移不会改写已发布制造版本和工单依据。
            </Typography>
          </Box>
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: {
                xs: "1fr",
                md: "minmax(0, 1.25fr) minmax(320px, 0.75fr)",
              },
              minHeight: 440,
            }}
          >
            <Box
              sx={{
                minWidth: 0,
                borderRight: { md: "1px solid #e4e7ed" },
                p: 2,
              }}
            >
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                可添加产品
              </Typography>
              <ConfigurableListTable
                preferenceKey="product-family-member-candidates:v1"
                rows={candidates}
                getRowKey={row => row.productId}
                loading={optionsQuery.isLoading}
                emptyText={optionsQuery.error ? packError(optionsQuery.error) : "暂无可添加产品"}
                minHeight={160}
                maxHeight={360}
                columns={[
                  { key: 'selection', label: '选择', width: 80, render: row => <Checkbox size="small" checked={selectedIds.includes(row.productId)} disabled={Boolean(row.productFamilyId) || addMutation.isPending} onChange={() => toggle(row.productId)} inputProps={{ 'aria-label': `选择产品 ${row.productName}` }} /> },
                  { key: 'productName', label: '产品名称', width: 220 },
                  { key: 'productCode', label: '产品编码', width: 180 },
                  { key: 'materialTypeName', label: '物料类型', width: 120 },
                  { key: 'productFamilyName', label: '所属产品簇', width: 180, render: row => <Typography variant="body2" color={row.productFamilyId ? '#c17d00' : 'text.secondary'}>{row.productFamilyName || '-'}</Typography> },
                  { key: 'actions', label: '操作', width: 96, action: true, render: row => row.productFamilyId ? <Button size="small" disabled={transferMutation.isPending} onClick={() => setTransferTarget(row)}>转移</Button> : null },
                ]}
              />
            </Box>
            <Box sx={{ minWidth: 0, p: 2, bgcolor: "#fbfdff" }}>
              <Stack
                direction="row"
                justifyContent="space-between"
                alignItems="center"
                sx={{ mb: 1 }}
              >
                <Typography variant="subtitle2">当前产品簇成员</Typography>
                <Typography variant="caption" sx={{ color: "#909399" }}>
                  {currentMembers.length} 个
                </Typography>
              </Stack>
              <ConfigurableListTable
                preferenceKey="product-family-current-members:v1"
                rows={currentMembers}
                getRowKey={row => row.productId}
                loading={optionsQuery.isLoading}
                emptyText={optionsQuery.error ? packError(optionsQuery.error) : "暂无成员"}
                minHeight={160}
                maxHeight={360}
                columns={[
                  { key: 'productName', label: '产品名称', width: 220 },
                  { key: 'productCode', label: '产品编码', width: 180 },
                  { key: 'materialTypeName', label: '物料类型', width: 120 },
                  { key: 'actions', label: '操作', action: true, width: 96, render: row => <Tooltip title="移除成员" arrow><IconButton size="small" color="error" aria-label={`移除成员 ${row.productName}`} disabled={removeMutation.isPending} onClick={() => removeMutation.mutate(row)}><Delete fontSize="small" /></IconButton></Tooltip> },
                ]}
              />
            </Box>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose} disabled={addMutation.isPending}>
            取消
          </Button>
          <Button
            variant="contained"
            onClick={() => addMutation.mutate()}
            disabled={selectedIds.length === 0 || addMutation.isPending}
          >
            {addMutation.isPending
              ? "添加中..."
              : `添加${selectedIds.length ? ` (${selectedIds.length})` : ""}`}
          </Button>
        </DialogActions>
      </AppDialog>
      <ConfirmDialog
        open={Boolean(transferTarget)}
        title="转移产品成员"
        message={`确定将产品「${transferTarget?.productName || ""}（${transferTarget?.productCode || ""}）」从「${transferTarget?.productFamilyName || ""}」转移到「${family.name}」吗？转移只影响后续生产对象。`}
        confirmText="转移"
        loading={transferMutation.isPending}
        onCancel={() => setTransferTarget(null)}
        onConfirm={() => {
          if (transferTarget) transferMutation.mutate(transferTarget);
        }}
      />
    </>
  );
}
