import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Checkbox,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  MenuItem,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import FormDialog from "@/components/FormDialog";
import FormDialogSection from "@/components/FormDialogSection";
import FormDialogFieldGrid from "@/components/FormDialogFieldGrid";
import { ListQueryActions } from "@/components/ListQueryPanel";
import { useAuthStore } from "@/stores/authStore";
import {
  getPackCatalog,
  getPackExecution,
  packGet,
  type PackExecution,
  type PackRow,
} from "@/api/pack";
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
import {
  EvidenceTable,
  HistoryEvidence,
  QualityEvidence,
  TestEvidence,
} from "./PackEvidence";
import { reviewCurrentEvidence } from "./packEvidenceRules.mjs";
import { PackCommandNotice, usePackCommand } from "./usePackCommand";

export default function PackQualityPage() {
  const { siteId, setSiteId, sites } = usePackSite();
  const auth = useAuthStore();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [keyword, setKeyword] = useState("");
  const [applied, setApplied] = useState("");
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(20);
  const [selected, setSelected] = useState(params.get("objectId") || "");
  const [tab, setTab] = useState(0);
  const [view, setView] = useState<PackExecution | null>(null);
  const [stationId, setStationId] = useState("");
  const [action, setAction] = useState("");
  const [reason, setReason] = useState("");
  const [targetNodeId, setTargetNodeId] = useState("");
  const [targetStationId, setTargetStationId] = useState("");
  const [slotCode, setSlotCode] = useState("");
  const [childCode, setChildCode] = useState("");
  const [orientationConfirmed, setOrientationConfirmed] = useState(false);
  const [disposition, setDisposition] = useState("QUARANTINE");
  const [confirmed, setConfirmed] = useState<boolean[]>([
    false,
    false,
    false,
    false,
  ]);
  const canManage = auth.hasPermission("pack.quality.manage");
  const canReplace = auth.hasPermission("pack.execution.operate");
  useEffect(() => {
    setPage(1);
    setSelected(params.get("objectId") || "");
    setView(null);
    setAction("");
  }, [siteId]);
  const list = useQuery({
    queryKey: ["pack-quality", siteId, applied, page, size],
    enabled: !!siteId,
    queryFn: () =>
      packGet<PageResult<PackRow>>("/quality", {
        siteId,
        keyword: applied,
        page,
        size,
      }),
  });
  const detail = useQuery({
    queryKey: ["pack-quality-detail", siteId, selected],
    refetchOnMount: "always",
    enabled: !!siteId && !!selected,
    queryFn: () => getPackExecution({ siteId, objectId: selected }),
  });
  useEffect(() => {
    if (detail.data) {
      setView(detail.data);
      setStationId(String(detail.data.visit?.stationId || ""));
    }
  }, [detail.data]);
  const catalog = useQuery({
    queryKey: ["pack-catalog", siteId],
    enabled: !!siteId,
    queryFn: () => getPackCatalog(siteId),
  });
  const command = usePackCommand(siteId, (execution) => {
    setView(execution);
    setSelected(execution.object.id);
    setAction("");
    setReason("");
  });
  const openAction = (next: string) => {
    setAction(next);
    setReason("");
    setTargetNodeId("");
    setTargetStationId("");
    setSlotCode("");
    setChildCode("");
    setOrientationConfirmed(false);
    setConfirmed([false, false, false, false]);
    command.clearError();
  };
  const rework =
    view?.activeRework || view?.reworks.find((row) => row.status !== "CLOSED");
  const repairOperations =
    view?.operations.filter((op) =>
      op.actions.some((action) => action.type === "ASSEMBLE"),
    ) || [];
  const targetOperation = repairOperations.find(
    (op) => op.nodeId === targetNodeId,
  );
  const targetStations =
    catalog.data?.stations.filter(
      (station) =>
        station.status === "ACTIVE" &&
        targetOperation?.stationIds.map(String).includes(String(station.id)) &&
        station.executionMode === targetOperation.mode,
    ) || [];
  const snapshot = view?.object.snapshot;
  const tests = view?.tests || [];
  const checks = view ? reviewCurrentEvidence(view) : [];
  const actionNames: Record<string, string> = {
    HOLD: "质量锁定",
    AUTHORIZE_REWORK: "授权返修",
    REPLACE: "返修拆换子件",
    CLOSE_REWORK: "关闭返修",
    RELEASE: "质量放行",
  };
  const execute = () => {
    if (!view) return;
    let payload: Record<string, unknown> = { reason: reason.trim() };
    if (action === "AUTHORIZE_REWORK")
      payload = { ...payload, targetNodeId, targetStationId };
    if (action === "REPLACE")
      payload = {
        ...payload,
        reworkId: rework?.id,
        slotCode,
        childCode: childCode.trim(),
        removedDisposition: disposition,
        ...(view.slots.find((slot) => slot.slotCode === slotCode)
          ?.orientation && orientationConfirmed
          ? {
              orientation: view.slots.find(
                (slot) => slot.slotCode === slotCode,
              )!.orientation,
            }
          : {}),
      };
    if (action === "CLOSE_REWORK") payload = { reworkId: rework?.id };
    void command.run(view, stationId, action, payload);
  };
  if (!auth.hasPermission("pack.quality.view"))
    return <Alert severity="warning">无权查看质量任务。</Alert>;
  return (
    <Stack spacing={1.5} sx={{ height: "calc(100vh - 150px)", minHeight: 500 }}>
      <PackScopeFilter
        siteId={siteId}
        sites={sites}
        onChange={(id) => {
          if (!command.locked) setSiteId(id);
        }}
        actions={
          <ListQueryActions
            disabled={command.locked}
            onReset={() => {
              setKeyword("");
              setApplied("");
              setPage(1);
            }}
            onQuery={() => {
              setApplied(keyword);
              setPage(1);
            }}
          />
        }
      >
        <TextField
          fullWidth
          size="small"
          label="对象 SN"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              setApplied(keyword);
              setPage(1);
            }
          }}
        />
      </PackScopeFilter>
      <PackCommandNotice command={command} />
      <PackTable
        preferenceKey="pack.quality.list"
        title="质量任务与放行"
        rows={list.data?.content || []}
        page={page}
        size={size}
        total={list.data?.totalElements || 0}
        loading={list.isLoading}
        error={list.error}
        onPage={setPage}
        onSize={(value) => {
          setSize(value);
          setPage(1);
        }}
        onReload={() => void list.refetch()}
        onRow={(row) => {
          if (!command.locked) {
            setSelected(row.id);
            setTab(0);
          }
        }}
        columns={[
          { key: "objectNo", label: "对象 SN", width: 260, minWidth: 180 },
          {
            key: "objectType",
            label: "类型",
            render: (row) => packLabel(row.objectType),
          },
          { key: "materialName", label: "物料", width: 300, minWidth: 220 },
          {
            key: "productionState",
            label: "生产状态",
            render: (row) => <PackStatus value={row.productionState} />,
          },
          {
            key: "qualityState",
            label: "质量状态",
            render: (row) => (
              <PackStatus value={row.qualityState} kind="quality" />
            ),
          },
          {
            key: "holds",
            label: "未闭锁定",
            render: (row) =>
              row.holds?.filter((hold: any) => hold.status === "OPEN").length ||
              0,
          },
          {
            key: "rework",
            label: "返修任务",
            render: (row) =>
              row.reworks?.find((work: any) => work.status !== "CLOSED") ? (
                <PackStatus
                  value={
                    row.reworks.find((work: any) => work.status !== "CLOSED")
                      .status
                  }
                />
              ) : (
                "—"
              ),
          },
          {
            key: "actions",
            label: "操作",
            width: 160,
            minWidth: 160,
            render: (row) => (
              <Button
                size="small"
                disabled={command.locked}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelected(row.id);
                  setTab(0);
                }}
              >
                查看并处理
              </Button>
            ),
          },
        ]}
      />
      <PackDrawer
        open={!!selected}
        onClose={() => {
          if (!command.locked) {
            setSelected("");
            setView(null);
          }
        }}
        title={`质量详情${view ? ` · ${view.object.objectNo}` : ""}`}
        width={1080}
      >
        {detail.error ? (
          <Alert severity="error">{packError(detail.error)}</Alert>
        ) : view && view.object.id === selected ? (
          <>
            <FormDialogSection title="当前对象">
              <PackFields
                items={[
                  ["对象 SN", view.object.objectNo],
                  ["类型", packLabel(view.object.objectType)],
                  [
                    "产品 / 物料",
                    `${view.object.materialCode} / ${view.object.materialName}`,
                  ],
                  [
                    "生产状态",
                    <PackStatus value={view.object.productionState} />,
                  ],
                  [
                    "质量状态",
                    <PackStatus
                      value={view.object.qualityState}
                      kind="quality"
                    />,
                  ],
                  [
                    "装配修订 / 业务修订",
                    `${view.object.assemblyRevision} / ${view.revision}`,
                  ],
                ]}
              />
            </FormDialogSection>
            <Stack direction="row" spacing={1} flexWrap="wrap">
              {canManage &&
                ["HOLD", "AUTHORIZE_REWORK", "CLOSE_REWORK", "RELEASE"].map(
                  (code) => (
                    <Button
                      key={code}
                      size="small"
                      variant={code === "RELEASE" ? "contained" : "outlined"}
                      color={code === "HOLD" ? "error" : "primary"}
                      disabled={command.locked || !view.allowedActions[code]}
                      onClick={() => openAction(code)}
                    >
                      {actionNames[code]}
                    </Button>
                  ),
                )}
              {canReplace && (
                <Button
                  size="small"
                  variant="outlined"
                  disabled={
                    command.locked || !view.allowedActions.REPLACE || !rework
                  }
                  onClick={() => openAction("REPLACE")}
                >
                  返修拆换
                </Button>
              )}
              {auth.hasPermission("pack.execution.view") && (
                <Button
                  disabled={command.locked}
                  onClick={() =>
                    navigate(
                      `/pack/execution?siteId=${siteId}&objectId=${view.object.id}&stationId=${view.visit?.stationId || rework?.allowedTargets?.[0]?.stationIds?.[0] || ""}&nodeId=${view.visit?.nodeId || rework?.allowedTargets?.[0]?.nodeId || ""}`,
                    )
                  }
                >
                  进入复测工作台
                </Button>
              )}
              {auth.hasPermission("pack.trace.view") && (
                <Button
                  onClick={() =>
                    navigate(
                      `/pack/trace?siteId=${siteId}&objectId=${view.object.id}`,
                    )
                  }
                >
                  双向追溯
                </Button>
              )}
            </Stack>
            <Tabs
              value={tab}
              variant="scrollable"
              scrollButtons="auto"
              onChange={(_, value) => setTab(value)}
              sx={{
                minHeight: 48,
                borderBottom: "1px solid #e4e7ed",
                "& .MuiTab-root": { minHeight: 48 },
              }}
            >
              <Tab label="锁定与返修" />
              <Tab label="检验原值" />
              <Tab label="放行核查" />
              <Tab label="操作履历" />
            </Tabs>
            {tab === 0 && (
              <FormDialogSection title="质量处理记录">
                <QualityEvidence
                  preferenceKey="pack.quality.detail.quality"
                  holds={view.holds}
                  reworks={view.reworks}
                  operations={view.operations}
                  stations={catalog.data?.stations}
                  visits={view.visits}
                />
              </FormDialogSection>
            )}
            {tab === 1 && (
              <TestEvidence
                preferenceKey="pack.quality.detail.tests"
                tests={view.tests}
              />
            )}{" "}
            {tab === 2 && (
              <>
                <FormDialogSection title="当前装配与必需证据">
                  <EvidenceTable
                    preferenceKey="pack.quality.detail.releases"
                    rows={checks}
                    columns={[
                      { key: "operation", label: "工序" },
                      { key: "action", label: "动作" },
                      {
                        key: "result",
                        label: "当前依据",
                        render: (row) => <PackStatus value={row.result} />,
                      },
                      { key: "detail", label: "依据说明" },
                    ]}
                  />
                </FormDialogSection>
                <Alert
                  severity={view.object.qualityState === "ACCEPTED" ? "success" : view.allowedActions.RELEASE ? "info" : "warning"}
                >
                  {view.object.qualityState === "ACCEPTED"
                    ? "当前对象质量合格，无需重复申请放行。可在双向追溯中核查接收或放行依据。"
                    : view.allowedActions.RELEASE
                    ? "对象已完工且当前质量状态允许申请放行。提交时服务端仍复核全部冻结规范、子件和返修状态。"
                    : "当前对象尚不满足申请放行状态，请处理质量锁定、生产完工和返修任务。"}
                </Alert>
              </>
            )}
            {tab === 3 && (
              <HistoryEvidence
                preferenceKey="pack.quality.detail.history"
                history={view.history}
              />
            )}
          </>
        ) : (
          <Typography>正在读取对象及质量依据…</Typography>
        )}
      </PackDrawer>
      <FormDialog
        open={!!action}
        onClose={command.locked ? undefined : () => setAction("")}
        fullWidth
        maxWidth={action === "HOLD" ? "sm" : "md"}
      >
        <DialogTitle>
          {actionNames[action]} · {view?.object.objectNo}
        </DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2}>
            <PackCommandNotice command={command} />
            {action === "AUTHORIZE_REWORK" && (
              <FormDialogSection title="返修目标">
                <Stack spacing={2}>
                  <Alert severity="warning">
                    授权将挂起并保留当前 NG
                    访问，失效旧检验。作业员须显式进入指定返修工序与工位，拆换并完工后，再按必需工序形成新修订复测证据。
                  </Alert>
                  <FormDialogFieldGrid>
                    <TextField
                      select
                      required
                      size="small"
                      label="返修目标装配工序"
                      value={targetNodeId}
                      onChange={(event) => {
                        setTargetNodeId(event.target.value);
                        setTargetStationId("");
                      }}
                    >
                      {repairOperations.map((op) => (
                        <MenuItem key={op.nodeId} value={op.nodeId}>
                          {op.name} · {packLabel(op.mode)}
                        </MenuItem>
                      ))}
                    </TextField>
                    <Autocomplete
                      options={targetStations}
                      value={
                        targetStations.find(
                          (station) => String(station.id) === targetStationId,
                        ) || null
                      }
                      getOptionLabel={(station) =>
                        `${station.name} / ${station.code}`
                      }
                      onChange={(_, station) =>
                        setTargetStationId(String(station?.id || ""))
                      }
                      renderInput={(props) => (
                        <TextField
                          {...props}
                          required
                          size="small"
                          label="返修目标适用工位"
                        />
                      )}
                    />
                  </FormDialogFieldGrid>
                  {targetOperation?.mode === "EXTERNAL_MES" && (
                    <Alert severity="info">
                      目标工序由产线 MES
                      主责执行，人工工作台只查看转站与拆换结果。
                    </Alert>
                  )}
                  {!repairOperations.length && (
                    <Alert severity="error">
                      冻结制造版中没有可授权的装配工序。
                    </Alert>
                  )}
                </Stack>
              </FormDialogSection>
            )}
            {action === "REPLACE" && (
              <FormDialogSection title="拆换子件">
                <Stack spacing={2}>
                  <Alert severity="warning">
                    仅用于已授权返修。拆出件的历史装配关系会关闭，去向须明确为隔离待检或报废；已受影响检验将失效。
                  </Alert>
                  <FormDialogFieldGrid>
                    <Autocomplete
                      options={
                        catalog.data?.stations.filter(
                          (row) => row.status === "ACTIVE",
                        ) || []
                      }
                      value={
                        catalog.data?.stations.find(
                          (row) => String(row.id) === stationId,
                        ) || null
                      }
                      onChange={(_, row) => setStationId(String(row?.id || ""))}
                      getOptionLabel={(row) => `${row.name} / ${row.code}`}
                      renderInput={(props) => (
                        <TextField
                          {...props}
                          required
                          size="small"
                          label="返修工位（须与当前访问一致）"
                        />
                      )}
                    />
                    <TextField
                      select
                      required
                      size="small"
                      label="拆换位置"
                      value={slotCode}
                      onChange={(e) => {
                        setSlotCode(e.target.value);
                        setOrientationConfirmed(false);
                      }}
                    >
                      {view?.slots
                        .filter((row) => row.child)
                        .map((row) => (
                          <MenuItem key={row.slotCode} value={row.slotCode}>
                            {row.slotCode} · {row.child.objectNo} ·{" "}
                            {row.materialCode}
                          </MenuItem>
                        ))}
                    </TextField>
                    <TextField
                      required
                      size="small"
                      label="替换子件 SN"
                      value={childCode}
                      onChange={(e) => setChildCode(e.target.value)}
                    />
                    <TextField
                      select
                      required
                      size="small"
                      label="拆出件去向"
                      value={disposition}
                      onChange={(e) => setDisposition(e.target.value)}
                    >
                      <MenuItem value="QUARANTINE">隔离待检</MenuItem>
                      <MenuItem value="SCRAP">报废</MenuItem>
                    </TextField>
                    {view?.slots.find((slot) => slot.slotCode === slotCode)
                      ?.orientation && (
                      <FormControlLabel
                        sx={{ gridColumn: "1 / -1" }}
                        control={
                          <Checkbox
                            checked={orientationConfirmed}
                            onChange={(e) =>
                              setOrientationConfirmed(e.target.checked)
                            }
                          />
                        }
                        label={`已现场核对替换件方向 / 极性：${view.slots.find((slot) => slot.slotCode === slotCode)?.orientation}`}
                      />
                    )}
                  </FormDialogFieldGrid>
                </Stack>
              </FormDialogSection>
            )}
            {action === "CLOSE_REWORK" && (
              <FormDialogSection title="复测依据">
                <Stack spacing={2}>
                  <Alert severity="info">
                    关闭返修前，服务端复核所有必需复测。关闭后恢复为待质量放行，保留完整拆换、失效和复测履历。
                  </Alert>
                  <EvidenceTable
                    preferenceKey="pack.quality.close-rework.checks"
                    rows={checks}
                    columns={[
                      { key: "operation", label: "工序" },
                      { key: "action", label: "动作" },
                      {
                        key: "result",
                        label: "复测结果",
                        render: (row) => <PackStatus value={row.result} />,
                      },
                      { key: "detail", label: "依据" },
                    ]}
                  />
                </Stack>
              </FormDialogSection>
            )}
            {action === "RELEASE" && (
              <FormDialogSection title="放行核对">
                <Stack spacing={2}>
                  <Alert severity="info">
                    质量放行冻结当前装配谱系及有效证据快照。后续改动不重写本次出厂依据。
                  </Alert>
                  <EvidenceTable
                    preferenceKey="pack.quality.release.checks"
                    rows={checks}
                    columns={[
                      { key: "operation", label: "工序" },
                      { key: "action", label: "动作" },
                      {
                        key: "result",
                        label: "当前结果",
                        render: (row) => <PackStatus value={row.result} />,
                      },
                    ]}
                  />
                  {[
                    "已核对对象、工单和制造版本",
                    "已核对当前装配齐套及子件身份",
                    "已核对检验原值、来源和当前有效性",
                    "已核对全部锁定解除和返修关闭",
                  ].map((text, index) => (
                    <FormControlLabel
                      key={text}
                      control={
                        <Checkbox
                          checked={confirmed[index]}
                          onChange={(e) =>
                            setConfirmed((old) =>
                              old.map((value, i) =>
                                i === index ? e.target.checked : value,
                              ),
                            )
                          }
                        />
                      }
                      label={text}
                    />
                  ))}
                </Stack>
              </FormDialogSection>
            )}
            {action !== "CLOSE_REWORK" && (
              <FormDialogSection title="处理依据">
                <FormDialogFieldGrid>
                  <TextField
                    required
                    size="small"
                    multiline
                    minRows={3}
                    sx={{ gridColumn: "1 / -1" }}
                    label={
                      action === "RELEASE"
                        ? "放行依据 / 说明"
                        : "原因 / 处理依据"
                    }
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                </FormDialogFieldGrid>
              </FormDialogSection>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button disabled={command.locked} onClick={() => setAction("")}>
            取消
          </Button>
          <Button
            variant="contained"
            disabled={
              command.locked ||
              (action === "AUTHORIZE_REWORK" &&
                (!targetNodeId || !targetStationId)) ||
              (action !== "CLOSE_REWORK" && !reason.trim()) ||
              (action === "REPLACE" &&
                (!slotCode ||
                  !childCode.trim() ||
                  !stationId ||
                  (!!view?.slots.find((slot) => slot.slotCode === slotCode)
                    ?.orientation &&
                    !orientationConfirmed))) ||
              (action === "RELEASE" && confirmed.some((value) => !value))
            }
            onClick={execute}
          >
            确认{actionNames[action]}
          </Button>
        </DialogActions>
      </FormDialog>
    </Stack>
  );
}
