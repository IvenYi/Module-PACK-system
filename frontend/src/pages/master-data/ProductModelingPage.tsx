// Product master data is derived from material versions; Pack manufacturing replaces medical process/DHR modeling.
import { Fragment, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  IconButton,
  InputAdornment,
  MenuItem,
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
  ExpandLess,
  ExpandMore,
  PlaylistAdd,
  Search,
  UnfoldLessRounded,
  UnfoldMoreRounded,
} from "@mui/icons-material";
import TableStateCell from "@/components/TableStateCell";
import { useListTableColumns, type ListTableColumnPreferences } from "@/components/ConfigurableListTable";
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
import { managementFieldSx } from "@/components/managementPageStyles";
import FormDialogSection from "@/components/FormDialogSection";
import { getAuditLogs, type AuditLogItem } from "@/api/audit";
import { getProducts, type MaterialRecord } from "@/api/master-data";
type ProductModelSource = MaterialRecord & { id: string; name: string };
import { getPackVersions } from "@/api/pack";
import type { PageResult } from "@/types/common";
import { useAuthStore } from "@/stores/authStore";
import { readRecordLocation } from "@/utils/recordLocation";
import {
  PackDrawer,
  PackFields,
  PackStatus,
  packError,
  usePackSite,
} from "@/pages/pack/packUi";
import { EvidenceTable, packTime } from "@/pages/pack/PackEvidence";
const PAGE_SIZE_OPTIONS = [20, 50, 100, 200] as const;
const COLUMN_STORAGE_KEY = "product-modeling-parent-columns:v1";
const ACTION_COLUMN_WIDTH = 128;
type ParentColumnId =
  | "name"
  | "code"
  | "version"
  | "materialType"
  | "specification"
  | "updatedBy"
  | "actions";
interface ParentColumn {
  id: ParentColumnId;
  label: string;
  width: number;
  minWidth: number;
  configurable?: boolean;
}
const PARENT_COLUMNS: ParentColumn[] = [
  {
    id: "name",
    label: "产品名称",
    width: 236,
    minWidth: 180,
    configurable: true,
  },
  {
    id: "code",
    label: "产品编码",
    width: 170,
    minWidth: 128,
    configurable: true,
  },
  {
    id: "version",
    label: "物料版本",
    width: 140,
    minWidth: 120,
    configurable: true,
  },
  {
    id: "materialType",
    label: "物料类型",
    width: 126,
    minWidth: 105,
    configurable: true,
  },
  {
    id: "specification",
    label: "规格型号",
    width: 178,
    minWidth: 128,
    configurable: true,
  },
  {
    id: "updatedBy",
    label: "更新人",
    width: 124,
    minWidth: 96,
    configurable: true,
  },
  {
    id: "actions",
    label: "操作",
    width: ACTION_COLUMN_WIDTH,
    minWidth: ACTION_COLUMN_WIDTH,
  },
];
const PACK_VERSION_COLUMNS = [
  { key: "code", label: "制造编码" },
  { key: "name", label: "名称" },
  { key: "version", label: "版本" },
  { key: "status", label: "状态" },
  { key: "referenceCount", label: "已引用工单" },
  { key: "actions", label: "操作", action: true, width: ACTION_COLUMN_WIDTH, minWidth: ACTION_COLUMN_WIDTH },
];
const PACK_VERSION_COLUMN_OPTIONS = PACK_VERSION_COLUMNS.filter(column => column.key !== "actions").map(column => ({ id: column.key, label: column.label }));

export default function ProductModelingPage() {
  const navigate = useNavigate();
  const auth = useAuthStore();
  const scope = usePackSite();
  const { siteId, setSiteId, sites } = scope;
  const canModel = auth.hasPermission("pack.manufacturing.view");
  const { getColumnWidth: getPersistedColumnWidth, getResizeHandleProps } = usePersistedListColumnWidths(
    PARENT_COLUMNS,
    "product-modeling-column-widths:v2:",
  );
  const getColumnWidth = (column: ParentColumn) => column.id === "actions" ? ACTION_COLUMN_WIDTH : getPersistedColumnWidth(column);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] =
    useState<(typeof PAGE_SIZE_OPTIONS)[number]>(20);
  const [keyword, setKeyword] = useState(() => readRecordLocation().keyword);
  const [submittedKeyword, setSubmittedKeyword] = useState(
    () => readRecordLocation().keyword,
  );
  const [expanded, setExpanded] = useState<string[]>([]);
  const [detail, setDetail] = useState<ProductModelSource | null>(null);
  const [detailTab, setDetailTab] = useState(0);
  const [columnAnchor, setColumnAnchor] = useState<HTMLElement | null>(null);
  const [columnTarget, setColumnTarget] = useState<"main" | "child">("main");
  const versionColumnPreferences = useListTableColumns(PACK_VERSION_COLUMNS, "product-pack-versions:v1");
  const columnOptions = PARENT_COLUMNS.map(column => ({ ...column, fixed: column.id === "actions" }));
  const columnStorageKey = getCurrentUserPreferenceStorageKey("product-modeling-parent-columns:v2:");
  const [columnSettings, setColumnSettings] = useState(() => {
    if (localStorage.getItem(columnStorageKey)) {
      const loaded = loadListColumnSettings(columnStorageKey, columnOptions, 1);
      return { ...loaded, hidden: loaded.hidden.filter(id => id !== "actions") };
    }
    let legacyHidden: ParentColumnId[] = [];
    try {
      const stored = JSON.parse(localStorage.getItem(COLUMN_STORAGE_KEY) || "[]");
      if (Array.isArray(stored)) legacyHidden = stored.filter(id => PARENT_COLUMNS.some(column => column.id === id && column.configurable));
    } catch { /* keep default columns */ }
    return normalizeListColumnSettings(columnOptions, 1, { version: 1, order: PARENT_COLUMNS.map(column => column.id), hidden: legacyHidden });
  });
  useEffect(() => {
    localStorage.setItem(columnStorageKey, JSON.stringify(columnSettings));
  }, [columnStorageKey, columnSettings]);
  const query = useQuery({
    queryKey: ["product-modeling-products", page, pageSize, submittedKeyword],
    queryFn: async () => {
      const result = (
        await getProducts({
          page,
          size: pageSize,
          keyword: submittedKeyword,
          status: "ALL",
        })
      ).data.data;
      return {
        ...result,
        content: result.content.map((row) => ({
          ...row,
          id: String(row.id),
          name: row.name || "",
        })),
      };
    },
  });
  const audit = useQuery({
    queryKey: ["product-source-audit", detail?.id],
    enabled: !!detail && detailTab === 1,
    queryFn: async () =>
      (
        await getAuditLogs({
          page: 1,
          size: 100,
          entityType: "MATERIAL",
          entityId: detail!.id,
          sort: "createdAt",
          order: "desc",
        })
      ).data.data as PageResult<AuditLogItem>,
  });
  const rows = query.data?.content || [];
  const isTableEmptyState = query.isLoading || !!query.error || !rows.length;
  const visible = useMemo(
    () => columnSettings.order.filter(id => !columnSettings.hidden.includes(id)).map(id => PARENT_COLUMNS.find(column => column.id === id)!),
    [columnSettings],
  );
  const minWidth = visible.reduce(
    (sum, column) => sum + getColumnWidth(column),
    0,
  );
  useEffect(() => {
    const total = Math.max(1, query.data?.totalPages || 1);
    if (page > total) setPage(total);
  }, [query.data?.totalPages, page]);
  const toggle = (id: string) =>
    setExpanded((old) =>
      old.includes(id) ? old.filter((value) => value !== id) : [...old, id],
    );
  const open = (product: ProductModelSource) => {
    setDetail(product);
    setDetailTab(0);
  };
  const modeling = (product: ProductModelSource) =>
    navigate(`/pack/manufacturing?siteId=${siteId}&productId=${product.id}`);
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
      <ListQueryPanel actions={<ListQueryActions onReset={() => { setKeyword(""); setSubmittedKeyword(""); setPage(1); }} onQuery={() => { setPage(1); setSubmittedKeyword(keyword.trim()); }} />}>
        <TextField fullWidth size="small" label="产品名称/编码" placeholder="请输入" value={keyword} sx={managementFieldSx}
          onChange={event => setKeyword(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { setPage(1); setSubmittedKeyword(keyword.trim()); } }}
          InputProps={{ startAdornment: <InputAdornment position="start"><Search fontSize="small" /></InputAdornment> }} />
        <TextField select fullWidth size="small" label="工厂" value={siteId} sx={managementFieldSx} onChange={event => setSiteId(event.target.value)}>
          {sites.map(site => <MenuItem key={site.id} value={String(site.id)}>{site.name}</MenuItem>)}
        </TextField>
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
        <Box
          sx={{
            px: 2,
            minHeight: 48,
            height: 48,
            flexShrink: 0,
            borderBottom: "1px solid #e4e7ed",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 2,
            overflowX: "auto",
            overflowY: "hidden",
            "& > *": { flexShrink: 0 },
          }}
        >
          <Stack direction="row" spacing={1} alignItems="center">
            <ListColumnSettingsButton onClick={event => setColumnAnchor(event.currentTarget)} />
            <ListToolbarIconButton label="全部展开" disabled={!canModel || !siteId} onClick={() => setExpanded(rows.map(row => row.id))}><UnfoldMoreRounded sx={{ fontSize: 20 }} /></ListToolbarIconButton>
            <ListToolbarIconButton label="全部收起" onClick={() => setExpanded([])}><UnfoldLessRounded sx={{ fontSize: 20 }} /></ListToolbarIconButton>
          </Stack>
          <Typography variant="body2" sx={{ color: "#606266" }}>
            由物料管理中“半成品、产成品”自动派生
          </Typography>
        </Box>
        <ListTableShell
          minTableWidth={Math.max(minWidth, versionColumnPreferences.minTableWidth)}
          sx={{ flex: 1, minHeight: 0, overflow: "auto" }}
        >
          {(tableWidth) => {
            const widths = resolveListColumnWidths(
              visible.map((column) => ({
                id: column.id,
                width: getColumnWidth(column),
              })),
              tableWidth,
              "name",
              ["actions"],
            );
            return (
              <Table
                stickyHeader
                size="small"
                sx={{
                  width: tableWidth,
                  minWidth: tableWidth,
                  tableLayout: "fixed",
                  height: isTableEmptyState ? "100%" : "auto",
                }}
              >
                <colgroup>
                  {visible.map((column) => (
                    <col key={column.id} style={{ width: widths[column.id] }} />
                  ))}
                </colgroup>
                <TableHead>
                  <TableRow>
                    {visible.map((column) => (
                      <TableCell
                        key={column.id}
                        align={column.id === "actions" ? "center" : "left"}
                        sx={{
                          ...listTableHeaderCellSx,
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
                            sx={listColumnResizeHandleSx}
                            data-column-resize-handle={column.id}
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
                        align="center"
                        colSpan={visible.length}
                        sx={{ height: "100%", py: 0, borderBottom: "1px solid #ebeef5", color: "#909399" }}
                      >
                        {query.isLoading
                          ? <CircularProgress size={24} />
                          : query.error
                            ? packError(query.error)
                            : "暂无派生产品，请在物料管理中维护半成品或产成品。"}
                      </TableStateCell>
                    </TableRow>
                  ) : (
                    rows.map((product) => (
                      <Fragment key={product.id}>
                        <TableRow
                          hover
                          sx={{
                            "& > .MuiTableCell-root": listTableBodyCellSx,
                            cursor: canModel && siteId ? "pointer" : undefined,
                          }}
                          onClick={() => canModel && siteId && toggle(product.id)}
                        >
                          {visible.map((column, index) => (
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
                                  : { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }
                              }
                            >
                              <Box sx={{ display: "flex", alignItems: "center", minWidth: 0, gap: 0.5 }}>
                                {index === 0 && column.id !== "actions" && (
                                  <IconButton
                                    size="small"
                                    disabled={!canModel || !siteId}
                                    aria-label={
                                      expanded.includes(product.id)
                                        ? "收起制造版本"
                                        : "展开制造版本"
                                    }
                                    aria-expanded={expanded.includes(product.id)}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      toggle(product.id);
                                    }}
                                    sx={{ width: 24, height: 24, color: "#606266", flexShrink: 0 }}
                                  >
                                    {expanded.includes(product.id) ? (
                                      <ExpandLess fontSize="small" />
                                    ) : (
                                      <ExpandMore fontSize="small" />
                                    )}
                                  </IconButton>
                                )}
                                <Box sx={{ minWidth: 0, flex: 1, ...(column.id !== "actions" ? { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } : {}) }}>
                              {column.id === "name" ? (
                                  <Typography
                                    component="button"
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      open(product);
                                    }}
                                    sx={{
                                      ...listTableDetailLinkSx,
                                      p: 0,
                                      border: 0,
                                      bgcolor: "transparent",
                                      font: "inherit",
                                      textAlign: "left",
                                      cursor: "pointer",
                                      maxWidth: "100%",
                                      overflow: "hidden",
                                      textOverflow: "ellipsis",
                                      whiteSpace: "nowrap",
                                    }}
                                  >
                                    {product.name}
                                  </Typography>
                              ) : column.id === "actions" ? (
                                <Box onClick={(e) => e.stopPropagation()}>
                                  <Button
                                    size="small"
                                    onClick={() => open(product)}
                                  >
                                    详情
                                  </Button>
                                  {canModel && (
                                    <Tooltip title="Pack 制造配置">
                                      <IconButton
                                        size="small"
                                        aria-label="Pack 制造配置"
                                        disabled={!siteId}
                                        onClick={() => modeling(product)}
                                      >
                                        <PlaylistAdd fontSize="small" />
                                      </IconButton>
                                    </Tooltip>
                                  )}
                                </Box>
                              ) : column.id === "materialType" ? (
                                product.materialTypeName || "—"
                              ) : column.id === "updatedBy" ? (
                                product.updatedBy || product.createdBy || "—"
                              ) : (
                                String((product as any)[column.id] || "—")
                              )}
                                </Box>
                              </Box>
                            </TableCell>
                          ))}
                        </TableRow>
                        {expanded.includes(product.id) && canModel && (
                          <TableRow sx={{ "& .MuiTableCell-root": { borderBottom: "none" } }}>
                            <TableCell
                              colSpan={visible.length}
                              sx={{ p: 0, bgcolor: "#fafcff", borderBottom: "none" }}
                            >
                              <PackProductVersions
                                product={product}
                                siteId={siteId}
                                onOpen={() => modeling(product)}
                                columnPreferences={versionColumnPreferences}
                                tableWidth={tableWidth}
                              />
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
        <ListTablePagination total={query.data?.totalElements || 0} page={page} size={pageSize} onPage={setPage} onSize={value => { setPageSize(value as typeof pageSize); setPage(1); }} sizeOptions={[...PAGE_SIZE_OPTIONS]} />
      </Box>
      <ListColumnSettingsPopover
        masterDetail
        anchorEl={columnAnchor}
        onClose={() => setColumnAnchor(null)}
        header={<Tabs value={columnTarget} onChange={(_, value: "main" | "child") => setColumnTarget(value)} aria-label="产品管理字段设置切换" sx={{ minHeight: 32, mb: 0.5, '& .MuiTab-root': { minHeight: 32, py: 0, fontSize: 13 } }}><Tab label="主表" value="main" /><Tab label="子表" value="child" /></Tabs>}
        columns={columnTarget === "main" ? columnOptions.filter(column => column.configurable) : PACK_VERSION_COLUMN_OPTIONS}
        settings={columnTarget === "main" ? columnSettings : versionColumnPreferences.settings}
        canHide={id => columnTarget !== "main" || (id !== "actions" && visible.filter(column => column.id !== "actions").length > 1)}
        onToggle={id => columnTarget === "child"
          ? versionColumnPreferences.setSettings(current => ({ ...current, hidden: current.hidden.includes(id) ? current.hidden.filter(value => value !== id) : [...current.hidden, id] }))
          : setColumnSettings(current => ({ ...current, hidden: current.hidden.includes(id as ParentColumnId) ? current.hidden.filter(value => value !== id) : [...current.hidden, id as ParentColumnId] }))}
        onReorder={(source, target) => columnTarget === "child"
          ? versionColumnPreferences.setSettings(current => reorderListColumns(PACK_VERSION_COLUMN_OPTIONS, current, source, target))
          : setColumnSettings(current => reorderListColumns(columnOptions, current, source as ParentColumnId, target as ParentColumnId))}
      />
      <PackDrawer
        open={!!detail}
        onClose={() => setDetail(null)}
        title="产品详情"
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
                    ['产品名称', detail.name], ['产品编码', detail.code], ['物料版本', detail.version], ['物料类型', detail.materialTypeName],
                    ['品牌', detail.brandName], ['单位', detail.unit], ['物料用途', detail.materialPurpose], ['状态', <PackStatus value={detail.status} />],
                    ['规格型号', detail.specification], ['版本说明', detail.description],
                  ]} />
                </FormDialogSection></Box>
                <Box sx={{ bgcolor: '#fff' }}><FormDialogSection title="系统信息">
                  <PackFields items={[
                    ['创建人', detail.createdBy], ['创建时间', packTime(detail.createdAt)], ['更新人', detail.updatedBy || detail.createdBy], ['更新时间', packTime(detail.updatedAt)],
                  ]} />
                </FormDialogSection></Box>
                {canModel && <Stack direction="row" justifyContent="flex-end"><Button size="small" onClick={() => modeling(detail)}>维护 Pack 制造版本</Button></Stack>}
              </Stack>
            ) : audit.error ? (
              <Alert severity="error">{packError(audit.error)}</Alert>
            ) : (
              <EvidenceTable preferenceKey="product-source-audit:v1"
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
                    render: (row) =>
                      row.operatorDisplayName ||
                      row.operatorAccount ||
                      row.operatorId ||
                      "—",
                  },
                  {
                    key: "dataSummary",
                    label: "变更说明",
                    render: (row) => row.dataSummary || row.functionName || "—",
                  },
                ]}
              />
            )}
          </>
        )}
      </PackDrawer>
    </Box>
  );
}
function PackProductVersions({
  product,
  siteId,
  onOpen,
  columnPreferences,
  tableWidth,
}: {
  product: ProductModelSource;
  siteId: string;
  onOpen(): void;
  columnPreferences: ListTableColumnPreferences;
  tableWidth: number;
}) {
  const query = useQuery({
    queryKey: ["pack-product-versions", siteId, product.id],
    enabled: !!siteId,
    queryFn: () =>
      getPackVersions({ siteId, productId: product.id, page: 1, size: 200 }),
  });
  return (
    <Box sx={{ width: "100%", bgcolor: "#fff" }}>
      {query.error ? (
        <Alert severity="error">{packError(query.error)}</Alert>
      ) : (
        <EvidenceTable preferenceKey="product-pack-versions:v1"
          columnPreferences={columnPreferences}
          embedded
          tableWidth={tableWidth}
          rows={query.data?.content || []}
          empty={query.isLoading ? "正在加载…" : "尚无 Pack 制造版本"}
          columns={[
            { key: "code", label: "制造编码" },
            { key: "name", label: "名称" },
            { key: "version", label: "版本" },
            {
              key: "status",
              label: "状态",
              render: (row) => <PackStatus value={row.status} />,
            },
            { key: "referenceCount", label: "已引用工单" },
            {
              key: "actions",
              label: "操作",
              action: true,
              width: ACTION_COLUMN_WIDTH,
              minWidth: ACTION_COLUMN_WIDTH,
              render: () => (
                <Button size="small" onClick={onOpen}>
                  进入配置
                </Button>
              ),
            },
          ]}
        />
      )}
    </Box>
  );
}
