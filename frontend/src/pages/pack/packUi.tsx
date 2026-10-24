import ListQueryPanel from '@/components/ListQueryPanel';
import { managementDetailGridSx } from '@/components/managementPageStyles';
import { useEffect, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Alert,
  Box,
  Button,
  Drawer,
  IconButton,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { Close, Refresh } from "@mui/icons-material";
import client from "@/api/client";
import type { PackRow } from "@/api/pack";
import { useAuthStore } from "@/stores/authStore";
import ConfigurableListTable, { type ConfigurableListColumn } from "@/components/ConfigurableListTable";
import ListTablePagination from "@/components/ListTablePagination";
import StatusBadge from "@/components/StatusBadge";
export const packLabels: Record<string, string> = {
  DRAFT: "草稿",
  PUBLISHED: "已发布",
  ACTIVE: "启用",
  INACTIVE: "停用",
  CREATED: "已建档",
  RECEIVED: "已接收",
  READY: "待生产",
  IN_PROGRESS: "生产中",
  RUNNING: "进行中",
  COMPLETED: "已完工",
  RELEASED: "已放行",
  PENDING: "待执行",
  OPEN: "作业中",
  HOLD: "质量锁定",
  NG: "不合格",
  OK: "合格",
  PASS: "合格",
  FAIL: "不合格",
  PENDING_RETEST: "待复测",
  AUTHORIZED: "已授权",
  REPLACED: "已拆换",
  ACCEPTED: "已接单",
  REJECTED: "已拒收",
  CONFLICT: "内容冲突",
  CHECK_IN: "工序进站",
  BIND: "装配绑定",
  TEST_RESULT: "设备检验",
  RECORD_TEST: "记录检验",
  COMPLETE_VISIT: "工序完工",
  AUTHORIZE_REWORK: "授权返修",
  REPLACE: "返修拆换",
  CLOSE_REWORK: "关闭返修",
  RELEASE: "质量放行",
  UPSTREAM_HOLD: "子件异常联动锁定",
  REWORK: "返修中",
  RETEST_PENDING: "待复测",
  SUSPENDED: "已挂起",
  REPAIR: "返修拆换",
  RETEST: "必需复测",
  IN_PROCESS: "生产中",
  SCRAPPED: "已报废",
  QUARANTINE: "隔离待检",
  SCRAP: "报废",
  COMPONENT: "辅料 / 部件",
  INCOMPLETE: "证据不齐",
  PASSED: "已通过",
  FAILED: "未通过",
  CLOSED: "已关闭",
  MANUAL: "人工站",
  SEMI_AUTO: "半自动站",
  EXTERNAL_MES: "产线 MES",
  HUMAN: "人员",
  DEVICE: "设备",
  MES: "产线 MES",
  CELL: "电芯",
  MODULE: "模组",
  PACK: "PACK",
  ASSEMBLE: "装配绑定",
  MEASURE: "数值测量",
  MANUAL_INSPECT: "人工检验",
  NUMBER: "数值",
  BOOLEAN: "合格 / 不合格",
};
export const packLabel = (value: unknown) =>
  value == null || value === ""
    ? "—"
    : packLabels[String(value)] || String(value);
export const packError = (error: unknown) =>
  error instanceof Error ? error.message : "操作失败，请重试";
export const records = (value: any): PackRow[] =>
  Array.isArray(value) ? value : value?.content || [];
export function usePackSite() {
  const user = useAuthStore((state) => state.user);
  const key = `pack:site:${user?.id || ""}`;
  const [siteId, setSite] = useState(
    () =>
      new URLSearchParams(window.location.search).get("siteId") ||
      sessionStorage.getItem(key) ||
      "",
  );
  const query = useQuery({
    queryKey: ["pack-sites", user?.id],
    queryFn: async () =>
      records(
        (
          await client.get("/identity/sites", {
            params: { page: 1, size: 500 },
          })
        ).data.data,
      ),
  });
  const sites = query.data || [];
  useEffect(() => {
    setSite(
      new URLSearchParams(window.location.search).get("siteId") ||
        sessionStorage.getItem(key) ||
        "",
    );
  }, [key]);
  useEffect(() => {
    if (query.isSuccess && !sites.some((site) => String(site.id) === siteId))
      setSite(String(sites[0]?.id || ""));
  }, [query.isSuccess, sites, siteId]);
  const setSiteId = (id: string) => {
    setSite(id);
    sessionStorage.setItem(key, id);
  };
  return {
    siteId,
    setSiteId,
    sites,
    loading: query.isLoading,
    error: query.error,
  };
}
export function PackScopeFilter({
  siteId,
  sites,
  onChange,
  children,
  actions,
}: {
  siteId: string;
  sites: PackRow[];
  onChange(id: string): void;
  children?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <ListQueryPanel actions={actions}>
      <TextField select size="small" required label="工厂" value={siteId} onChange={(e) => onChange(e.target.value)}>
        {sites.map((site) => <MenuItem key={site.id} value={String(site.id)}>{site.name} · {site.code}</MenuItem>)}
      </TextField>
      {children}
    </ListQueryPanel>
  );
}

export function PackStatus({
  value,
  kind,
}: {
  value: unknown;
  kind?: "quality" | "message";
}) {
  const text = String(value || "");
  return (
    <StatusBadge
      label={
        kind === "quality" && text === "ACCEPTED"
          ? "质量合格"
          : kind === "quality" && text === "PENDING"
            ? "待质量放行"
            : kind === "message" && text === "ACCEPTED"
              ? "已接收"
              : packLabel(value)
      }
      color={
        ["NG", "HOLD", "FAIL", "REJECTED", "CONFLICT"].includes(text)
          ? "error"
          : [
                "COMPLETED",
                "RELEASED",
                "PUBLISHED",
                "OK",
                "PASS",
                "CLOSED",
              ].includes(text)
            ? "success"
            : ["OPEN", "IN_PROGRESS", "PENDING_RETEST", "REPLACED"].includes(
                  text,
                )
              ? "warning"
              : "default"
      }
    />
  );
}
export function PackTable<T>({
  title,
  preferenceKey,
  columns,
  rows,
  loading,
  error,
  total,
  page,
  size,
  onPage,
  onSize,
  onReload,
  actions,
  onRow,
}: {
  title: string;
  preferenceKey?: string;
  columns: ConfigurableListColumn<T>[];
  rows: T[];
  loading?: boolean;
  error?: unknown;
  total: number;
  page: number;
  size: number;
  onPage(page: number): void;
  onSize(size: number): void;
  onReload(): void;
  actions?: ReactNode;
  onRow?(row: T): void;
}) {
  return (
    <Box sx={{ flex: 1, minWidth: 0, minHeight: 0, bgcolor: "#fff", border: "1px solid #e4e7ed", borderRadius: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {Boolean(error) && <Alert severity="error">{packError(error)}</Alert>}
      <ConfigurableListTable
        title={title}
        preferenceKey={preferenceKey ?? `pack:${title}`}
        columns={columns.map((column) => ({ ...column, render: column.render ?? ((row) => packLabel((row as Record<string, unknown>)[column.key])) }))}
        rows={rows}
        loading={loading}
        onRow={onRow}
        minHeight={220}
        maxHeight="calc(100vh - 330px)"
        toolbar={<Stack direction="row" spacing={1} alignItems="center">
          <IconButton size="small" aria-label="刷新列表" onClick={onReload}><Refresh fontSize="small" /></IconButton>
          {actions}
        </Stack>}
      />
      <ListTablePagination total={total} page={page} size={size} onPage={onPage} onSize={onSize} />
    </Box>
  );
}
export function PackDrawer({
  open,
  onClose,
  title,
  children,
  width = 560,
}: {
  open: boolean;
  onClose(): void;
  title: string;
  children: ReactNode;
  width?: number;
}) {
  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      PaperProps={{
        role: "dialog",
        'aria-label': title,
        sx: {
          width: { xs: "100vw", sm: width },
          maxWidth: "100vw",
          bgcolor: "#f7f9fc",
          p: 2,
          boxSizing: "border-box",
          "& .MuiTabs-root": { minHeight: 48, borderBottom: "1px solid #e4e7ed" },
          "& .MuiTab-root": { minHeight: 48, py: 1.5 },
        },
      }}
    >
      <Stack
        direction="row"
        justifyContent="space-between"
        alignItems="center"
        sx={{ mb: 1, flexShrink: 0 }}
      >
        <Typography variant="subtitle1" sx={{ fontWeight: 600, color: "#303133", minWidth: 0, overflowWrap: "anywhere" }}>{title}</Typography>
        <IconButton size="small" aria-label="关闭详情" onClick={onClose} sx={{ flexShrink: 0 }}>
          <Close />
        </IconButton>
      </Stack>
      <Stack spacing={2}>{children}</Stack>
    </Drawer>
  );
}
export function PackFields({ items }: { items: [string, ReactNode][] }) {
  return (
    <Box
      sx={managementDetailGridSx}
    >
      {items.map(([label, value]) => (
        <Box key={label} sx={{ minWidth: 0, ...(/说明|描述|备注|规格|地址|原因|依据/.test(label) ? { gridColumn: "1 / -1" } : {}) }}>
          <Typography variant="caption" sx={{ color: "#909399", display: "block", mb: 0.5 }}>
            {label}
          </Typography>
          <Typography
            component="div"
            variant="body2"
            sx={{ overflowWrap: "anywhere" }}
          >
            {value === null || value === undefined || value === ""
              ? "—"
              : value}
          </Typography>
        </Box>
      ))}
    </Box>
  );
}
