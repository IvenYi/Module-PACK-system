import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  Alert,
  Box,
  Button,
  Stack,
  Tab,
  Tabs,
  Typography,
} from "@mui/material";
import FormDialogSection from "@/components/FormDialogSection";
import { ListQueryActions } from "@/components/ListQueryPanel";
import { useAuthStore } from "@/stores/authStore";
import { packGet, type PackRow } from "@/api/pack";
import type { PageResult } from "@/types/common";
import {
  PackDrawer,
  PackFields,
  PackScopeFilter,
  PackStatus,
  PackTable,
  packError,
  packLabel,
  usePackSite,
} from "./packUi";
import { EvidenceTable, TestEvidence, packTime } from "./PackEvidence";

export default function PackIntegrationPage() {
  const { siteId, setSiteId, sites } = usePackSite();
  const auth = useAuthStore();
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(20);
  const [tab, setTab] = useState(0);
  const [conflictPage, setConflictPage] = useState(1);
  const [selected, setSelected] = useState<PackRow | null>(null);
  useEffect(() => {
    setPage(1);
    setConflictPage(1);
    setSelected(null);
  }, [siteId]);
  const query = useQuery({
    queryKey: ["pack-messages", siteId, page, size],
    enabled: !!siteId && auth.hasPermission("pack.integration.view"),
    queryFn: () =>
      packGet<PageResult<PackRow> & { conflicts: PackRow[] }>("/messages", {
        siteId,
        page,
        size,
      }),
  });
  const conflicts = query.data?.conflicts || [];
  const payload = selected?.payload || {};
  if (!auth.hasPermission("pack.integration.view"))
    return <Alert severity="warning">无权查看设备与产线接入消息。</Alert>;
  return (
    <Stack spacing={1.5} sx={{ height: "calc(100vh - 150px)", minHeight: 500 }}>
      <PackScopeFilter
        siteId={siteId}
        sites={sites}
        onChange={setSiteId}
        actions={
          <ListQueryActions
            onReset={() => {
              setPage(1);
              setConflictPage(1);
            }}
            onQuery={() => {
              setPage(1);
              setConflictPage(1);
              if (page === 1) void query.refetch();
            }}
          />
        }
      />
      <Alert severity="info">
        设备与产线 MES
        使用独立机器账号提交事件。此处查看真实收件与冲突，拒收消息不会被人工改为成功；来源系统应核实原因后按协议重试。
      </Alert>
      <Tabs
        value={tab}
        onChange={(_, value) => setTab(value)}
        sx={{
          minHeight: 48,
          bgcolor: "#fff",
          borderBottom: "1px solid #e4e7ed",
          "& .MuiTab-root": { minHeight: 48 },
        }}
      >
        <Tab label="设备 / MES 收件" />
        <Tab label={`内容冲突 (${conflicts.length})`} />
      </Tabs>
      {tab === 0 ? (
        <PackTable
          preferenceKey="pack.integration.messages"
          title="设备 / 产线消息"
          rows={query.data?.content || []}
          page={page}
          size={size}
          total={query.data?.totalElements || 0}
          loading={query.isLoading}
          error={query.error}
          onPage={setPage}
          onSize={(value) => {
            setSize(value);
            setPage(1);
          }}
          onReload={() => void query.refetch()}
          onRow={(row) => setSelected(row)}
          columns={[
            {
              key: "receivedAt",
              label: "接收时间",
              render: (row) => packTime(row.receivedAt),
            },
            { key: "sourceId", label: "来源身份", width: 240, minWidth: 180 },
            {
              key: "messageId",
              label: "来源消息号",
              width: 280,
              minWidth: 200,
            },
            {
              key: "event",
              label: "事件",
              render: (row) => packLabel(row.payload?.eventType),
            },
            {
              key: "run",
              label: "业务运行号",
              width: 260,
              minWidth: 180,
              render: (row) => row.payload?.externalRunId || "—",
            },
            {
              key: "status",
              label: "收件状态",
              render: (row) => <PackStatus value={row.status} kind="message" />,
            },
            {
              key: "result",
              label: "处理说明",
              width: 320,
              minWidth: 240,
              render: (row) =>
                row.result?.message ||
                (row.status === "ACCEPTED" ? "已形成业务事实" : "—"),
            },
            {
              key: "actions",
              label: "操作",
              width: 180,
              minWidth: 180,
              render: (row) => (
                <Button
                  size="small"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelected(row);
                  }}
                >
                  查看信封与结果
                </Button>
              ),
            },
          ]}
        />
      ) : (
        <PackTable
          preferenceKey="pack.integration.conflicts"
          title="同一消息号的内容冲突"
          rows={conflicts.slice((conflictPage - 1) * size, conflictPage * size)}
          page={conflictPage}
          size={size}
          total={conflicts.length}
          loading={query.isLoading}
          error={query.error}
          onPage={setConflictPage}
          onSize={(value) => {
            setSize(value);
            setConflictPage(1);
          }}
          onReload={() => void query.refetch()}
          onRow={(row) =>
            setSelected({ ...row, conflict: true, status: "CONFLICT" })
          }
          columns={[
            {
              key: "receivedAt",
              label: "冲突时间",
              render: (row) => packTime(row.receivedAt),
            },
            { key: "inboxId", label: "原始收件记录" },
            {
              key: "messageId",
              label: "来源消息号",
              width: 280,
              minWidth: 200,
              render: (row) => row.payload?.messageId,
            },
            {
              key: "sourceId",
              label: "来源",
              width: 240,
              minWidth: 180,
              render: (row) => row.payload?.sourceId,
            },
            {
              key: "hash",
              label: "冲突内容摘要",
              width: 300,
              minWidth: 220,
              render: (row) => row.payloadHash,
            },
            {
              key: "event",
              label: "事件",
              render: (row) => packLabel(row.payload?.eventType),
            },
            {
              key: "actions",
              label: "操作",
              width: 180,
              minWidth: 180,
              render: (row) => (
                <Button
                  size="small"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelected({ ...row, conflict: true, status: "CONFLICT" });
                  }}
                >
                  查看冲突内容
                </Button>
              ),
            },
          ]}
        />
      )}
      <PackDrawer
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected?.conflict ? "消息内容冲突" : "设备 / MES 收件详情"}
        width={1000}
      >
        {selected && (
          <>
            <FormDialogSection title="来源信封">
              <PackFields
                items={[
                  [
                    "收件状态",
                    <PackStatus value={selected.status} kind="message" />,
                  ],
                  ["接收时间", packTime(selected.receivedAt)],
                  ["来源身份", selected.sourceId || payload.sourceId],
                  ["来源消息号", selected.messageId || payload.messageId],
                  ["业务运行号", payload.externalRunId],
                  ["事件类型", packLabel(payload.eventType)],
                  ["对象编号", payload.objectId],
                  ["工位编号", payload.stationId],
                  ["对象修订", payload.revision],
                  ["来源内容摘要", selected.payloadHash],
                ]}
              />
            </FormDialogSection>
            {payload.simulation && (
              <Alert severity="warning">
                此消息显式标记为模拟证据，不能代表现场设备联调结果。
              </Alert>
            )}
            {selected.conflict && (
              <Alert severity="error">
                同一来源消息号出现不同内容。原消息及其业务结果保留，此冲突内容没有覆盖原事实。
              </Alert>
            )}
            {selected.status === "REJECTED" && (
              <Alert severity="error">
                {selected.result?.message || "消息被业务校验拒收。"}
              </Alert>
            )}
            <FormDialogSection title="标准动作内容">
              <PackFields
                items={[
                  ["工序节点", payload.nodeId],
                  ["动作编码", payload.actionCode],
                  ["装配位置", payload.slotCode],
                  ["子件 SN", payload.childCode],
                  ["方向 / 极性", payload.orientation],
                  ["设备原判", packLabel(payload.deviceResult)],
                ]}
              />
              {payload.values?.length > 0 && (
                <Box sx={{ mt: 2 }}>
                  <EvidenceTable
                    preferenceKey="pack.integration.detail.raw-values"
                    rows={payload.values}
                    columns={[
                      { key: "code", label: "原始测项" },
                      {
                        key: "value",
                        label: "原始值",
                        render: (row) =>
                          typeof row.value === "boolean"
                            ? row.value
                              ? "合格"
                              : "不合格"
                            : String(row.value ?? "缺失"),
                      },
                      { key: "unit", label: "原始单位" },
                    ]}
                  />
                </Box>
              )}
            </FormDialogSection>
            {selected.result?.mesResult && (
              <TestEvidence
                preferenceKey="pack.integration.detail.tests"
                tests={[selected.result]}
              />
            )}
            <Stack direction="row" spacing={1}>
              {auth.hasPermission("pack.execution.view") &&
                payload.objectId && (
                  <Button
                    onClick={() =>
                      navigate(
                        `/pack/execution?siteId=${siteId}&objectId=${payload.objectId}&stationId=${payload.stationId || ""}`,
                      )
                    }
                  >
                    查看对象工作台
                  </Button>
                )}
              {auth.hasPermission("pack.trace.view") && payload.objectId && (
                <Button
                  onClick={() =>
                    navigate(
                      `/pack/trace?siteId=${siteId}&objectId=${payload.objectId}`,
                    )
                  }
                >
                  查看对象履历
                </Button>
              )}
            </Stack>
          </>
        )}
      </PackDrawer>
    </Stack>
  );
}
