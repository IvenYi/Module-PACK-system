import { Fragment, type ReactNode } from "react";
import {
  Box,
  Chip,
  Stack,
  Typography,
} from "@mui/material";
import ConfigurableListTable, { type ListTableColumnPreferences } from "@/components/ConfigurableListTable";
import type { PackRow, PackOperation } from "@/api/pack";
import { packLabel, PackStatus } from "./packUi";
export const packTime = (value: unknown) =>
  value
    ? new Date(String(value)).toLocaleString("zh-CN", { hour12: false })
    : "—";
export function EvidenceTable({
  rows,
  columns,
  preferenceKey,
  empty = "暂无记录",
  columnPreferences,
  embedded,
  tableWidth,
}: {
  rows: any[];
  columns: {
    key: string;
    label: string;
    render?(row: any): ReactNode;
    width?: number;
    minWidth?: number;
    align?: "left" | "center" | "right";
    action?: boolean;
  }[];
  preferenceKey?: string;
  empty?: string;
  columnPreferences?: ListTableColumnPreferences;
  embedded?: boolean;
  tableWidth?: number;
}) {
  return (
    <ConfigurableListTable
      preferenceKey={
        preferenceKey ||
        `pack.evidence.${columns.map((column) => column.key).join(".")}`
      }
      columns={columns.map((column) => ({
        ...column,
        render: column.render || ((row: any) => packLabel(row[column.key])),
      }))}
      rows={rows}
      columnPreferences={columnPreferences}
      embedded={embedded}
      tableWidth={tableWidth}
      getRowKey={(row, index) => row.id || row.code || index}
      emptyText={empty}
    />
  );
}
export function TestEvidence({
  tests,
  preferenceKey = "pack.evidence.tests",
}: {
  tests: PackRow[];
  preferenceKey?: string;
}) {
  return (
    <Stack spacing={1.5}>
      {!tests.length && (
        <Typography color="text.secondary" variant="body2">
          暂无检验记录。检验需按冻结规范保存原值。
        </Typography>
      )}
      {tests.map((test) => (
        <Box
          key={test.id}
          sx={{
            border: "1px solid #e4e7ed",
            bgcolor: "#fff",
            borderRadius: 1,
            overflow: "hidden",
          }}
        >
          <Stack
            direction="row"
            spacing={1}
            alignItems="center"
            flexWrap="wrap"
            sx={{ px: 1.5, py: 1, borderBottom: "1px solid #e4e7ed" }}
          >
            <Typography fontWeight={600} variant="body2">
              {test.actionCode}
            </Typography>
            <PackStatus value={test.mesResult} />
            <Typography variant="caption" color="text.secondary">
              {test.nodeId}
            </Typography>
            <Chip
              size="small"
              label={`${packLabel(test.source)} · 装配修订 ${test.assemblyRevision}`}
            />
            {test.simulation && (
              <Chip size="small" color="warning" label="模拟证据" />
            )}
            {test.validEvidence === false && (
              <Chip
                size="small"
                color="warning"
                label={`已失效 · ${test.invalidatedBy || "历史证据"}`}
              />
            )}
            <Typography variant="caption" color="text.secondary">
              {packTime(test.createdAt)}
            </Typography>
          </Stack>
          <EvidenceTable
            preferenceKey={`${preferenceKey}.${test.id}`}
            rows={test.results || []}
            columns={[
              {
                key: "name",
                label: "测项",
                render: (row) => `${row.code} / ${row.name || ""}`,
              },
              {
                key: "spec",
                label: "冻结规范",
                render: (row) =>
                  row.spec?.kind === "NUMBER"
                    ? `${row.spec.min} ~ ${row.spec.max} ${row.spec.unit || ""}`
                    : "合格 / 不合格",
              },
              {
                key: "raw",
                label: "原始实测",
                render: (row) =>
                  row.raw
                    ? `${typeof row.raw.value === "boolean" ? (row.raw.value ? "合格" : "不合格") : String(row.raw.value ?? "未填")} ${row.raw.unit || ""}`
                    : "缺失",
              },
              {
                key: "result",
                label: "系统判定",
                render: (row) => <PackStatus value={row.result} />,
              },
              { key: "reason", label: "原因" },
            ]}
          />
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ display: "block", px: 1.5, py: 1 }}
          >
            设备判定：{packLabel(test.deviceResult)} · 来源编号：
            {test.sourceId || "人员操作"} · 外部流水：
            {test.externalRunId || "—"}
            {test.rawPayload?.note ? ` · 备注：${test.rawPayload.note}` : ""}
          </Typography>
        </Box>
      ))}
    </Stack>
  );
}
export function QualityEvidence({
  holds,
  reworks,
  operations = [],
  stations = [],
  visits = [],
  preferenceKey = "pack.evidence.quality",
}: {
  holds: PackRow[];
  reworks: PackRow[];
  operations?: PackOperation[];
  stations?: PackRow[];
  visits?: PackRow[];
  preferenceKey?: string;
}) {
  return (
    <Stack spacing={2}>
      <Typography variant="subtitle2">质量锁定</Typography>
      <EvidenceTable
        preferenceKey={`${preferenceKey}.holds`}
        rows={holds}
        columns={[
          { key: "reason", label: "原因" },
          {
            key: "status",
            label: "状态",
            render: (row) => <PackStatus value={row.status} />,
          },
          {
            key: "createdAt",
            label: "锁定时间",
            render: (row) => packTime(row.createdAt),
          },
          {
            key: "closedAt",
            label: "关闭时间",
            render: (row) => packTime(row.closedAt),
          },
        ]}
      />
      <Typography variant="subtitle2">返修及必需复测</Typography>
      {reworks.map((rework) => (
        <Fragment key={rework.id}>
          <Stack direction="row" spacing={1}>
            <PackStatus value={rework.status} />
            <Typography variant="body2">
              {rework.reason} · {packTime(rework.createdAt)}
            </Typography>
          </Stack>
          <Box sx={{ fontSize: 13, color: "text.secondary" }}>
            返修目标：
            {operations.find((op) => op.nodeId === rework.targetNodeId)?.name ||
              rework.targetNodeId ||
              "—"}{" "}
            ·{" "}
            {stations.find(
              (station) =>
                String(station.id) === String(rework.targetStationId),
            )?.name ||
              rework.targetStationId ||
              "—"}
            <br />原 NG 访问：{rework.originVisitId || "—"}
            {rework.originVisitId &&
            visits.find((visit) => visit.id === rework.originVisitId)
              ? ` · ${packLabel(visits.find((visit) => visit.id === rework.originVisitId)?.status)}`
              : ""}
          </Box>
          <EvidenceTable
            preferenceKey={`${preferenceKey}.${rework.id}.required-retest`}
            rows={rework.requiredRetest || rework.requiredTests || []}
            columns={[
              {
                key: "nodeId",
                label: "工序节点",
                render: (row) =>
                  operations.find((op) => op.nodeId === row.nodeId)?.name ||
                  row.nodeId,
              },
              { key: "actionCode", label: "必需复测动作" },
            ]}
          />
        </Fragment>
      ))}
      {!reworks.length && (
        <Typography variant="body2" color="text.secondary">
          暂无返修任务。
        </Typography>
      )}
    </Stack>
  );
}
export function HistoryEvidence({
  history,
  preferenceKey = "pack.evidence.history",
}: {
  history: PackRow[];
  preferenceKey?: string;
}) {
  return (
    <EvidenceTable
      preferenceKey={preferenceKey}
      rows={history}
      columns={[
        {
          key: "createdAt",
          label: "时间",
          render: (row) => packTime(row.createdAt),
        },
        { key: "action", label: "动作" },
        {
          key: "operatorName",
          label: "操作人",
          render: (row) => row.operatorName || row.operatorId || "—",
        },
        { key: "reason", label: "说明" },
      ]}
    />
  );
}
