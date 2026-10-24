import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Alert,
  Box,
  Button,
  List,
  ListItemButton,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import { AccountTree } from "@mui/icons-material";
import FormDialogSection from "@/components/FormDialogSection";
import { ListQueryActions } from "@/components/ListQueryPanel";
import { useAuthStore } from "@/stores/authStore";
import {
  getPackObjects,
  getPackTrace,
  packGet,
  type PackRow,
  type PackTrace,
} from "@/api/pack";
import {
  PackDrawer,
  PackFields,
  PackScopeFilter,
  PackStatus,
  packError,
  packLabel,
  usePackSite,
} from "./packUi";
import {
  EvidenceTable,
  HistoryEvidence,
  QualityEvidence,
  TestEvidence,
  packTime,
} from "./PackEvidence";

export default function PackTracePage() {
  const { siteId, setSiteId, sites } = usePackSite();
  const auth = useAuthStore();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [keyword, setKeyword] = useState(params.get("sn") || "");
  const [applied, setApplied] = useState(params.get("sn") || "");
  const [objectId, setObjectId] = useState(params.get("objectId") || "");
  const [tab, setTab] = useState(0);
  const [releaseId, setReleaseId] = useState("");
  useEffect(() => {
    setObjectId(params.get("objectId") || "");
    setReleaseId("");
  }, [siteId, params]);
  const search = useQuery({
    queryKey: ["pack-trace-search", siteId, applied],
    enabled: !!siteId && !!applied,
    queryFn: () =>
      getPackObjects({ siteId, keyword: applied, page: 1, size: 100 }),
  });
  const trace = useQuery({
    queryKey: ["pack-trace", siteId, objectId],
    enabled: !!siteId && !!objectId,
    queryFn: () => getPackTrace(objectId, siteId),
  });
  const release = useQuery({
    queryKey: ["pack-release", siteId, releaseId],
    enabled: !!siteId && !!releaseId,
    queryFn: () => packGet<PackRow>(`/releases/${releaseId}`, { siteId }),
  });
  const select = (id: string) => {
    setObjectId(id);
    setReleaseId("");
    setParams({ siteId, objectId: id }, { replace: true });
  };
  if (!auth.hasPermission("pack.trace.view"))
    return <Alert severity="warning">无权查看对象追溯。</Alert>;
  const value = trace.data;
  return (
    <Stack spacing={1.5} sx={{ minHeight: 500 }}>
      <PackScopeFilter
        siteId={siteId}
        sites={sites}
        onChange={(id) => {
          setObjectId("");
          setParams({ siteId: id }, { replace: true });
          setSiteId(id);
        }}
        actions={
          <ListQueryActions
            onReset={() => {
              setKeyword("");
              setApplied("");
              setObjectId("");
              setReleaseId("");
              setTab(0);
              setParams({ siteId }, { replace: true });
            }}
            onQuery={() => setApplied(keyword.trim())}
          />
        }
      >
        <TextField
          fullWidth
          size="small"
          label="电芯 / 模组 / PACK SN"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") setApplied(keyword.trim());
          }}
        />
      </PackScopeFilter>
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", md: "280px minmax(0,1fr)" },
          gap: 2,
          minHeight: 450,
        }}
      >
        <Box
          sx={{
            bgcolor: "#fff",
            border: "1px solid #e4e7ed",
            borderRadius: 1,
            overflow: "auto",
            maxHeight: "calc(100vh - 270px)",
          }}
        >
          <Typography
            sx={{ p: 1.5, fontWeight: 600, borderBottom: "1px solid #e4e7ed" }}
          >
            查询对象
          </Typography>
          {search.error && (
            <Alert severity="error">{packError(search.error)}</Alert>
          )}
          <List>
            {search.data?.content.map((row) => (
              <ListItemButton
                key={row.id}
                selected={row.id === objectId}
                onClick={() => select(row.id)}
              >
                <Box>
                  <Typography variant="body2" fontWeight={600}>
                    {row.objectNo}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {packLabel(row.objectType)} · {row.materialCode}
                  </Typography>
                </Box>
              </ListItemButton>
            ))}
          </List>
          {search.isLoading ? (
            <Typography sx={{ p: 2 }}>正在查询…</Typography>
          ) : (
            !search.data?.content.length && (
              <Typography sx={{ p: 2 }} color="text.secondary" variant="body2">
                {applied
                  ? "未找到匹配对象。"
                  : "输入 SN 查询，或从工作台打开对象追溯。"}
              </Typography>
            )
          )}
          {(search.data?.totalElements || 0) > 100 && (
            <Alert severity="info">结果超过100条，请输入更完整的 SN。</Alert>
          )}
        </Box>
        <Stack spacing={2} sx={{ minWidth: 0 }}>
          {trace.error && (
            <Alert severity="error">{packError(trace.error)}</Alert>
          )}
          {trace.isFetching && (
            <Typography variant="body2">正在读取追溯事实…</Typography>
          )}
          {value && (
            <>
              <FormDialogSection title={`对象追溯 · ${value.object.objectNo}`}>
                <PackFields
                  items={[
                    ["对象类型", packLabel(value.object.objectType)],
                    [
                      "产品 / 物料",
                      `${value.object.materialCode} / ${value.object.materialName}`,
                    ],
                    [
                      "生产状态",
                      <PackStatus value={value.object.productionState} />,
                    ],
                    [
                      "质量状态",
                      <PackStatus
                        value={value.object.qualityState}
                        kind="quality"
                      />,
                    ],
                    [
                      "制造版本",
                      `${value.object.snapshot?.code || "来料接收"} / ${value.object.snapshot?.version || "—"}`,
                    ],
                    ["当前装配修订", value.object.assemblyRevision],
                    [
                      "来源",
                      value.object.source?.traceDepth === "SUPPLIER_MODULE"
                        ? "供应商模组（内部电芯不在本系统追溯边界）"
                        : value.object.workOrderId
                          ? "工单生产"
                          : "序列化来料",
                    ],
                    ["供应商批次", value.object.supplierBatch],
                  ]}
                />
                <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                  <Button onClick={() => void trace.refetch()}>刷新事实</Button>
                  {auth.hasPermission("pack.execution.view") && (
                    <Button
                      onClick={() =>
                        navigate(
                          `/pack/execution?siteId=${siteId}&objectId=${objectId}`,
                        )
                      }
                    >
                      生产工作台
                    </Button>
                  )}
                  {auth.hasPermission("pack.quality.view") && (
                    <Button
                      onClick={() =>
                        navigate(
                          `/pack/quality?siteId=${siteId}&objectId=${objectId}`,
                        )
                      }
                    >
                      质量详情
                    </Button>
                  )}
                </Stack>
              </FormDialogSection>
              <Tabs
                value={tab}
                onChange={(_, next) => setTab(next)}
                variant="scrollable"
                scrollButtons="auto"
                sx={{
                  minHeight: 48,
                  borderBottom: "1px solid #e4e7ed",
                  "& .MuiTab-root": { minHeight: 48 },
                }}
              >
                <Tab label="当前装配树" />
                <Tab label="历史装配关系" />
                <Tab label="检验与质量" />
                <Tab label="出厂快照" />
                <Tab label="事件履历" />
              </Tabs>
              {tab === 0 && (
                <>
                  <FormDialogSection title="向上追溯 · 当前父件">
                    <EvidenceTable
                      preferenceKey="pack.trace.current-parents"
                      rows={value.currentParents}
                      columns={[
                        {
                          key: "parentCode",
                          label: "父件 SN",
                          render: (row) => (
                            <Button
                              size="small"
                              onClick={() => select(row.parentId)}
                            >
                              {row.parentCode || row.parentId}
                            </Button>
                          ),
                        },
                        { key: "slotCode", label: "所在位置" },
                        {
                          key: "assembledAt",
                          label: "绑定时间",
                          render: (row) => packTime(row.assembledAt),
                        },
                      ]}
                    />
                  </FormDialogSection>
                  <FormDialogSection title="向下追溯 · 当前装配谱系">
                    <AssemblyTree trace={value} onSelect={select} />
                  </FormDialogSection>
                </>
              )}
              {tab === 1 && (
                <FormDialogSection title="全部装配 / 拆换历史">
                  <EvidenceTable
                    preferenceKey="pack.trace.assembly-history"
                    rows={value.historyLinks}
                    columns={[
                      {
                        key: "parentCode",
                        label: "父件 SN",
                        render: (row) => (
                          <Button
                            size="small"
                            onClick={() => select(row.parentId)}
                          >
                            {row.parentCode}
                          </Button>
                        ),
                      },
                      { key: "slotCode", label: "位置" },
                      {
                        key: "childCode",
                        label: "子件 SN",
                        render: (row) => (
                          <Button
                            size="small"
                            onClick={() => select(row.childId)}
                          >
                            {row.childCode}
                          </Button>
                        ),
                      },
                      {
                        key: "activeKey",
                        label: "关系",
                        render: (row) =>
                          row.activeKey ? "当前有效" : "历史已拆除",
                      },
                      {
                        key: "assembledAt",
                        label: "装配时间",
                        render: (row) => packTime(row.assembledAt),
                      },
                      {
                        key: "removedAt",
                        label: "拆出时间",
                        render: (row) => packTime(row.removedAt),
                      },
                      { key: "removedDisposition", label: "拆出件去向" },
                      { key: "reason", label: "原因" },
                    ]}
                  />
                </FormDialogSection>
              )}
              {tab === 2 && (
                <>
                  <TestEvidence
                    preferenceKey="pack.trace.tests"
                    tests={value.tests}
                  />
                  <FormDialogSection title="锁定及返修履历">
                    <QualityEvidence
                      preferenceKey="pack.trace.quality"
                      holds={value.holds}
                      reworks={value.reworks}
                    />
                  </FormDialogSection>
                </>
              )}
              {tab === 3 && (
                <FormDialogSection title="质量放行 / 出厂依据">
                  <EvidenceTable
                    preferenceKey="pack.trace.releases"
                    rows={value.releases}
                    columns={[
                      {
                        key: "releasedAt",
                        label: "放行时间",
                        render: (row) => packTime(row.releasedAt),
                      },
                      { key: "assemblyRevision", label: "装配修订" },
                      { key: "snapshotHash", label: "冻结摘要" },
                      { key: "reason", label: "放行说明" },
                      {
                        key: "actions",
                        label: "操作",
                        width: 200,
                        minWidth: 200,
                        render: (row) => (
                          <Button
                            size="small"
                            onClick={() => setReleaseId(row.id)}
                          >
                            查看冻结出厂谱系
                          </Button>
                        ),
                      },
                    ]}
                    empty="尚未形成质量放行快照。"
                  />
                </FormDialogSection>
              )}
              {tab === 4 && (
                <HistoryEvidence
                  preferenceKey="pack.trace.history"
                  history={value.events}
                />
              )}
            </>
          )}
        </Stack>
      </Box>
      <PackDrawer
        open={!!releaseId}
        onClose={() => setReleaseId("")}
        title="不可改写的放行快照"
        width={1120}
      >
        {release.error ? (
          <Alert severity="error">{packError(release.error)}</Alert>
        ) : release.data ? (
          <>
            <FormDialogSection title="放行依据">
              <PackFields
                items={[
                  ["放行时间", packTime(release.data.releasedAt)],
                  ["放行说明", release.data.reason],
                  ["装配修订", release.data.assemblyRevision],
                  ["冻结摘要", release.data.snapshotHash],
                ]}
              />
            </FormDialogSection>
            <Alert severity="info">
              本次放行记录已完成；以下展示放行核查时状态，当前状态请查看对象追溯。
            </Alert>
            {release.data.snapshot?.object && (
              <>
                <FormDialogSection title="放行核查时装配谱系">
                  <AssemblyTree
                    trace={release.data.snapshot}
                    onSelect={(id) => {
                      setReleaseId("");
                      select(id);
                    }}
                    historical
                  />
                </FormDialogSection>
                <TestEvidence
                  preferenceKey="pack.trace.release.tests"
                  tests={release.data.snapshot.tests || []}
                />
                <FormDialogSection title="出厂时质量处理依据">
                  <QualityEvidence
                    preferenceKey="pack.trace.release.quality"
                    holds={release.data.snapshot.holds || []}
                    reworks={release.data.snapshot.reworks || []}
                  />
                </FormDialogSection>
              </>
            )}
          </>
        ) : (
          <Typography>正在读取冻结快照…</Typography>
        )}
      </PackDrawer>
    </Stack>
  );
}
function AssemblyTree({
  trace,
  onSelect,
  historical = false,
  depth = 0,
}: {
  trace: PackTrace;
  onSelect(id: string): void;
  historical?: boolean;
  depth?: number;
}) {
  return (
    <Box
      sx={{
        ml: depth ? 2 : 0,
        borderLeft: depth ? "2px solid #dbe5f0" : undefined,
        pl: depth ? 1.5 : 0,
      }}
    >
      <Stack direction="row" spacing={1} alignItems="center" sx={{ py: 1 }}>
        <AccountTree fontSize="small" color="action" />
        <Button size="small" onClick={() => onSelect(trace.object.id)}>
          {trace.object.objectNo}
        </Button>
        <Typography variant="caption">
          {packLabel(trace.object.objectType)} · {trace.object.materialCode} /{" "}
          {trace.object.materialName}
        </Typography>
        {historical && (
          <Typography variant="caption" color="text.secondary">
            核查时状态
          </Typography>
        )}
        <PackStatus value={trace.object.qualityState} kind="quality" />
      </Stack>
      {trace.currentChildren.map((link) => (
        <Box key={link.id}>
          <Typography variant="caption" color="text.secondary" sx={{ ml: 2 }}>
            位置 {link.slotCode} · {historical ? "放行时装配" : "当前装配"} ·{" "}
            {packTime(link.assembledAt)}
          </Typography>
          {link.child?.object ? (
            <AssemblyTree
              trace={link.child}
              onSelect={onSelect}
              historical={historical}
              depth={depth + 1}
            />
          ) : (
            <Typography variant="body2" sx={{ ml: 3 }}>
              {link.childCode || link.childId}
            </Typography>
          )}
        </Box>
      ))}
      {!trace.currentChildren.length && (
        <Typography variant="caption" color="text.secondary" sx={{ ml: 2 }}>
          {trace.object.source?.traceDepth === "SUPPLIER_MODULE"
            ? "供应商模组：保留来料边界，不推断电芯谱系。"
            : "无已绑定子件。"}
        </Typography>
      )}
    </Box>
  );
}
