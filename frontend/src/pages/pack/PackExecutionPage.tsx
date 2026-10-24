// Uses the existing production workbench shell; Pack actions replace medical form runtime in the central workspace.
import {
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { useQuery } from "@tanstack/react-query";
import {
  UNSAFE_NavigationContext,
  useNavigate,
  useSearchParams,
} from "react-router-dom";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Chip,
  CircularProgress,
  Checkbox,
  FormControlLabel,
  IconButton,
  InputAdornment,
  LinearProgress,
  List,
  ListItemButton,
  MenuItem,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import {
  CheckCircleRounded,
  FactCheckRounded,
  FullscreenRounded,
  HistoryRounded,
  InfoOutlined,
  LockOutlined,
  MenuBookRounded,
  PlayArrowRounded,
  QrCodeScannerRounded,
  RefreshRounded,
} from "@mui/icons-material";
import ConfirmDialog from "@/components/ConfirmDialog";
import client from "@/api/client";
import {
  getPackCatalog,
  getPackExecution,
  type PackAction,
  type PackExecution,
  type PackOperation,
  type PackRow,
} from "@/api/pack";
import { useAuthStore } from "@/stores/authStore";
import ExecutionQuickPanel, {
  type ExecutionPanelId,
} from "@/pages/production/ExecutionQuickPanel";
import ExecutionOperationDrawer from "@/pages/production/ExecutionOperationDrawer";
import ExecutionDocumentViewer from "@/pages/production/ExecutionDocumentViewer";
import "@/pages/production/ProductionExecutionPage.css";
import { PackStatus, packError, packLabel, usePackSite } from "./packUi";
import {
  EvidenceTable,
  HistoryEvidence,
  QualityEvidence,
  TestEvidence,
  packTime,
} from "./PackEvidence";
import {
  humanTestPayload,
  controlledReworkTarget,
} from "./packEvidenceRules.mjs";
import {
  completedOperationNodes,
  operationExecutionState,
  preferredExecutionNode,
} from "./packRouteState.mjs";
import { PackCommandNotice, usePackCommand } from "./usePackCommand";

const operationStatusLabels = {
  RUNNING: "当前访问",
  EXECUTABLE: "当前可执行",
  COMPLETED: "已完成",
  BLOCKED: "已阻断",
};

export default function PackExecutionPage() {
  const scope = usePackSite();
  const { siteId, setSiteId, sites } = scope;
  const auth = useAuthStore();
  const navigate = useNavigate();
  const navigation = useContext(UNSAFE_NavigationContext);
  const [params, setParams] = useSearchParams();
  const [pendingLocation, setPendingLocation] = useState<{
    siteId: string;
    objectId: string;
    stationId: string;
    nodeId: string;
  } | null>(null);
  const [stationId, setStationId] = useState(params.get("stationId") || "");
  const [barcode, setBarcode] = useState("");
  const [view, setView] = useState<PackExecution | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [nodeId, setNodeId] = useState("");
  const [actionCode, setActionCode] = useState("");
  const [slotCode, setSlotCode] = useState("");
  const [childCode, setChildCode] = useState("");
  const [reworkReason, setReworkReason] = useState("");
  const [removedDisposition, setRemovedDisposition] = useState("QUARANTINE");
  const [orientationConfirmed, setOrientationConfirmed] = useState(false);
  const [values, setValues] = useState<Record<string, Record<string, string>>>(
    {},
  );
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [activePanel, setActivePanel] = useState<ExecutionPanelId | null>(null);
  const [section, setSection] = useState<ExecutionPanelId | null>(null);
  const [drawer, setDrawer] = useState(false);
  const [rail, setRail] = useState<HTMLDivElement | null>(null);
  const [pendingSwitch, setPendingSwitch] = useState<(() => void) | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const scanRef = useRef<HTMLInputElement>(null);
  const bindRef = useRef<HTMLInputElement>(null);
  const request = useRef(0);
  const submitted = useRef<{ action: string; code?: string } | null>(null);
  const dirty = Boolean(
    childCode.trim() ||
    reworkReason.trim() ||
    Object.values(values).some((row) =>
      Object.values(row).some((value) => value !== ""),
    ) ||
    Object.values(notes).some(Boolean),
  );
  const command = usePackCommand(siteId, (execution) => {
    setView(execution);
    setError("");
    setNotice("业务动作已保存。");
    const sent = submitted.current;
    const nextNodeId = preferredExecutionNode(execution);
    setNodeId(nextNodeId);
    if (nextNodeId !== nodeId) {
      setActionCode("");
      setSlotCode("");
    }
    if (sent?.action === "BIND") {
      setChildCode("");
      setOrientationConfirmed(false);
      const current = execution.operations.find(
        (op) => op.nodeId === execution.visit?.nodeId,
      );
      const completedAction =
        current?.actions.find((action) => action.code === actionCode) ||
        current?.actions[0];
      const configured =
        completedAction?.type === "ASSEMBLE" ? completedAction.slotCodes : [];
      setSlotCode(
        execution.slots.find(
          (slot) => configured.includes(slot.slotCode) && !slot.child,
        )?.slotCode || "",
      );
      setTimeout(() => bindRef.current?.focus(), 0);
    }
    if (sent?.action === "REPLACE") {
      setChildCode("");
      setSlotCode("");
      setReworkReason("");
      setOrientationConfirmed(false);
    }
    if (sent?.action === "RECORD_TEST" && sent.code) {
      setValues((old) => {
        const next = { ...old };
        delete next[sent.code!];
        return next;
      });
      setNotes((old) => {
        const next = { ...old };
        delete next[sent.code!];
        return next;
      });
    }
    submitted.current = null;
  });
  const busy = loading || command.locked;
  const lockRef = useRef(busy);
  lockRef.current = busy;
  const catalog = useQuery({
    queryKey: ["pack-catalog", siteId],
    enabled: !!siteId,
    queryFn: () => getPackCatalog(siteId),
  });
  const stations =
    catalog.data?.stations.filter((row) => row.status === "ACTIVE") || [];
  const station = stations.find((row) => String(row.id) === stationId);
  const operations = view?.operations || [];
  const operation = operations.find((op) => op.nodeId === nodeId);
  const operationState = operationExecutionState(view, nodeId);
  const executableOperations = operations.filter(
    (op) => operationExecutionState(view, op.nodeId).canCheckIn,
  );
  const selectedAction =
    operation?.actions.find((action) => action.code === actionCode) ||
    operation?.actions[0];
  const activeVisit = Boolean(
    view?.visit &&
    view.visit.nodeId === nodeId &&
    String(view.visit.stationId) === stationId,
  );
  const canOperate =
    auth.hasPermission("pack.execution.operate") &&
    operation?.mode !== "EXTERNAL_MES";
  const selectedSlot = view?.slots.find((slot) => slot.slotCode === slotCode);
  const completedObject =
    view?.object.productionState === "COMPLETED" &&
    view.object.qualityState !== "REWORK";
  const conditionIssues = completedObject ? [] : view?.blockers || [];
  const rework = view?.activeRework;
  const replacing = view?.object.qualityState === "REWORK" && !!rework;
  const installAction = replacing ? "REPLACE" : "BIND";
  const canInstall =
    canOperate &&
    activeVisit &&
    Boolean(view?.allowedActions[installAction]) &&
    (replacing || selectedAction?.source === "HUMAN");
  const bindReady =
    (!selectedSlot?.orientation || orientationConfirmed) &&
    (!replacing || !!reworkReason.trim());
  const bindPayload = {
    slotCode,
    childCode: childCode.trim(),
    ...(replacing
      ? {
          reworkId: rework?.id,
          reason: reworkReason.trim(),
          removedDisposition,
        }
      : {}),
    ...(selectedSlot?.orientation && orientationConfirmed
      ? { orientation: selectedSlot.orientation }
      : {}),
  };
  const done = completedOperationNodes(view);
  const load = async (
    target: { sn?: string; objectId?: string },
    nextStation = stationId,
    preferredNodeId?: string,
    syncLocation = false,
  ) => {
    if (command.locked) return;
    const stamp = ++request.current;
    setLoading(true);
    setError("");
    try {
      const next = await getPackExecution({
        siteId,
        ...target,
        ...(nextStation ? { stationId: nextStation } : {}),
      });
      if (stamp !== request.current) return;
      setView(next);
      setBarcode(next.object.objectNo);
      const nextNodeId = preferredExecutionNode(next, preferredNodeId);
      setNodeId(nextNodeId);
      setActionCode("");
      setSlotCode("");
      setChildCode("");
      setReworkReason("");
      setOrientationConfirmed(false);
      setValues({});
      setNotes({});
      setNotice("");
      if (syncLocation)
        setPendingLocation({
          siteId,
          objectId: next.object.id,
          stationId: nextStation,
          nodeId: nextNodeId,
        });
      setTimeout(() => scanRef.current?.focus(), 0);
    } catch (cause) {
      if (stamp === request.current) setError(packError(cause));
    } finally {
      if (stamp === request.current) setLoading(false);
    }
  };
  const protect = (next: () => void) => {
    if (command.locked) return;
    if (dirty) setPendingSwitch(() => next);
    else next();
  };
  const run = (action: string, payload: Record<string, unknown> = {}) => {
    if (!view) return;
    if (
      action === "CHECK_IN" &&
      (!operationState.canCheckIn ||
        !canOperate ||
        !stationId ||
        !controlledReworkTarget(view, nodeId, stationId) ||
        !operation?.stationIds.map(String).includes(stationId))
    ) {
      setError(operationState.blockers.join("；") || "当前工序不允许进站，请核对工序与工位。");
      return;
    }
    submitted.current = {
      action,
      code: payload.actionCode as string | undefined,
    };
    void command.run(view, stationId, action, payload);
  };
  const resetDraft = () => {
    setValues({});
    setNotes({});
    setChildCode("");
    setReworkReason("");
    setOrientationConfirmed(false);
  };
  useEffect(() => {
    request.current++;
    setView(null);
    resetDraft();
    setError("");
    setStationId(params.get("stationId") || "");
  }, [siteId]);
  useEffect(() => {
    const target = params.get("objectId") || params.get("sn");
    if (!siteId || !target) {
      setLoading(false);
      return;
    }
    const routeStation = params.get("stationId") || "";
    setStationId(routeStation);
    void load(
      params.get("objectId") ? { objectId: target } : { sn: target },
      routeStation,
      params.get("nodeId") || undefined,
    );
    return () => {
      request.current++;
    };
  }, [siteId, params]);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (dirty || lockRef.current) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  useEffect(() => {
    if (!navigation?.navigator || (!dirty && !busy)) return;
    const nav = navigation.navigator;
    const push = nav.push,
      replace = nav.replace,
      go = nav.go;
    const intercept = (next: () => void) => {
      if (!lockRef.current) setPendingSwitch(() => next);
    };
    nav.push = (...args) => intercept(() => push.apply(nav, args));
    nav.replace = (...args) => intercept(() => replace.apply(nav, args));
    nav.go = (...args) => intercept(() => go.apply(nav, args));
    const idx = window.history.state?.idx;
    let restoring = false;
    const pop = (event: PopStateEvent) => {
      if (restoring) {
        restoring = false;
        event.stopImmediatePropagation();
        return;
      }
      const next = event.state?.idx;
      if (typeof idx !== "number" || typeof next !== "number" || idx === next)
        return;
      if (
        lockRef.current ||
        !window.confirm("当前实测尚未提交，离开会丢弃录入。确定离开？")
      ) {
        event.stopImmediatePropagation();
        restoring = true;
        window.history.go(idx - next);
      }
    };
    window.addEventListener("popstate", pop, true);
    return () => {
      nav.push = push;
      nav.replace = replace;
      nav.go = go;
      window.removeEventListener("popstate", pop, true);
    };
  }, [navigation, dirty, busy]);
  useEffect(() => {
    if (!pendingLocation || loading || command.locked || dirty) return;
    const next = new URLSearchParams(params);
    next.set("siteId", pendingLocation.siteId);
    next.set("objectId", pendingLocation.objectId);
    next.set("stationId", pendingLocation.stationId);
    next.set("nodeId", pendingLocation.nodeId);
    next.delete("sn");
    setPendingLocation(null);
    if (next.toString() !== params.toString())
      setParams(next, { replace: true });
  }, [pendingLocation, loading, command.locked, dirty, params, setParams]);
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const resize = () => {
      const narrow = root.clientWidth < 690 || window.innerHeight < 560;
      root.style.setProperty(
        "--execution-height",
        narrow
          ? "auto"
          : `${Math.max(420, window.innerHeight - root.getBoundingClientRect().top - 16)}px`,
      );
      root.dataset.narrow = String(narrow);
      root.dataset.compact = String(
        !narrow && window.innerHeight - root.getBoundingClientRect().top < 660,
      );
    };
    const observer = new ResizeObserver(resize);
    observer.observe(root);
    window.addEventListener("resize", resize);
    document.addEventListener("fullscreenchange", resize);
    resize();
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", resize);
      document.removeEventListener("fullscreenchange", resize);
    };
  }, []);
  useEffect(
    () => () => {
      request.current++;
    },
    [],
  );
  const documents = [
    ...(view?.object.snapshot?.documents || []),
    ...(operation?.documents || []),
  ];
  const [documentIndex, setDocumentIndex] = useState(0);
  const documentBinding = documents[documentIndex];
  const [documentPage, setDocumentPage] = useState(1);
  const [documentUrl, setDocumentUrl] = useState("");
  const [documentError, setDocumentError] = useState("");
  const [documentPages, setDocumentPages] = useState(1);
  useEffect(() => {
    setDocumentIndex(0);
  }, [nodeId, view?.object.id]);
  useEffect(() => {
    setDocumentPage(documentBinding?.pageStart || 1);
  }, [documentBinding?.fileId, documentBinding?.pageStart]);
  useEffect(() => {
    setDocumentUrl("");
    setDocumentError("");
    if (!documentBinding?.fileId || !view?.object.id) return;
    let cancelled = false,
      url = "";
    client
      .get(`/pack/documents/${documentBinding.fileId}/preview`, {
        params: { siteId, objectId: view.object.id, page: documentPage },
        responseType: "blob",
      })
      .then((response) => {
        if (cancelled) return;
        url = URL.createObjectURL(response.data);
        setDocumentUrl(url);
        setDocumentPages(
          Number(response.headers["x-page-count"]) ||
            documentBinding.pageEnd ||
            1,
        );
      })
      .catch((cause) => {
        if (!cancelled) setDocumentError(packError(cause));
      });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [siteId, view?.object.id, documentBinding?.fileId, documentPage]);
  const routeNavigation = (
    <Box component="aside" className="execution-route">
      <Stack
        direction="row"
        justifyContent="space-between"
        className="execution-route-heading"
      >
        <Typography fontWeight={600}>工序导航</Typography>
        <Typography variant="caption">{operations.length} 道工序</Typography>
      </Stack>
      <List className="execution-operation-list">
        {operations.map((op, index) => {
          const state = operationExecutionState(view, op.nodeId);
          const running = state.status === "RUNNING";
          return (
            <ListItemButton
              key={op.nodeId}
              selected={nodeId === op.nodeId}
              disabled={busy}
              onClick={() =>
                protect(() => {
                  setNodeId(op.nodeId);
                  setActionCode("");
                  setSlotCode("");
                  setDrawer(false);
                  resetDraft();
                })
              }
              className={`execution-operation ${state.status === "COMPLETED" ? "is-complete" : ""} ${running ? "is-running" : ""} ${state.canCheckIn ? "is-ready" : ""}`}
            >
              <Box className="execution-operation-text">
                <Box className="execution-operation-title">
                  <Typography variant="body2" fontWeight={600}>
                    {index + 1}. {op.name}
                  </Typography>
                  {nodeId === op.nodeId && (
                    <span className="execution-viewing">查看中</span>
                  )}
                </Box>
                <Typography className="execution-operation-status">
                  {running || state.canCheckIn ? (
                    <PlayArrowRounded />
                  ) : state.status === "COMPLETED" ? (
                    <CheckCircleRounded />
                  ) : (
                    <LockOutlined />
                  )}
                  {operationStatusLabels[state.status]}{" "}
                  · {packLabel(op.mode)}
                </Typography>
                {state.blockers.map((blocker, blockerIndex) => (
                  <Typography variant="caption" display="block" color="text.secondary" key={blockerIndex}>
                    {blocker}
                  </Typography>
                ))}
                <Typography className="execution-operation-dependency">
                  {op.actions.length} 项标准动作 · 工位{" "}
                  {op.stationIds
                    .map(
                      (id) =>
                        stations.find((s) => String(s.id) === String(id))
                          ?.name || id,
                    )
                    .join("、")}
                </Typography>
              </Box>
            </ListItemButton>
          );
        })}
      </List>
    </Box>
  );
  const panels = [
    {
      id: "sop" as const,
      label: "eSOP",
      title: "工序 eSOP",
      icon: <MenuBookRounded />,
      content: (
        <Stack sx={{ height: "100%", minHeight: 0 }} spacing={1}>
          {documents.length > 0 && (
            <TextField
              select
              size="small"
              label="冻结文档版本"
              value={documentIndex}
              onChange={(e) => setDocumentIndex(Number(e.target.value))}
            >
              {documents.map((doc, index) => (
                <MenuItem
                  key={`${doc.documentVersionId}-${index}`}
                  value={index}
                >
                  {doc.title || doc.code || "工序文件"} · {doc.version} ·{" "}
                  {doc.pageStart}~{doc.pageEnd}页
                </MenuItem>
              ))}
            </TextField>
          )}
          <ExecutionDocumentViewer
            documentKey={`${view?.object.id}:${documentBinding?.fileId}`}
            url={documentUrl}
            image
            name={documentBinding?.title || "工序文件"}
            error={documentError}
            emptyMessage={
              documents.length
                ? "正在加载冻结文档页面…"
                : "当前工序未绑定 SOP 文档。"
            }
            page={documentPage}
            pages={documentPages}
            firstPage={documentBinding?.pageStart || 1}
            lastPage={Math.min(
              documentPages,
              documentBinding?.pageEnd || documentPages,
            )}
            onPageChange={setDocumentPage}
          />
        </Stack>
      ),
    },
    {
      id: "works" as const,
      label: "作业要求",
      title: "冻结动作与质量状态",
      icon: <FactCheckRounded />,
      content: (
        <Stack spacing={2}>
          <Typography variant="body2">
            {operation?.name} · {packLabel(operation?.mode)}
          </Typography>
          {operation?.actions.map((action) => (
            <Box
              key={action.code}
              sx={{ pb: 1, borderBottom: "1px solid #e4e7ed" }}
            >
              <Typography fontWeight={600} variant="body2">
                {action.code} · {packLabel(action.type)} ·{" "}
                {packLabel(action.source)}
                {action.required ? " · 必需" : ""}
              </Typography>
              {action.slotCodes?.length > 0 && (
                <Typography variant="body2">
                  位置：{action.slotCodes.join("、")}
                </Typography>
              )}
              {action.checks?.map((check) => (
                <Typography variant="caption" display="block" key={check.code}>
                  {check.name || check.code}：
                  {check.kind === "NUMBER"
                    ? `${check.min} ~ ${check.max} ${check.unit || ""}`
                    : "人工确认合格或不合格"}
                </Typography>
              ))}
            </Box>
          ))}
          <QualityEvidence
            preferenceKey="pack.execution.quality"
            holds={view?.holds || []}
            reworks={view?.reworks || []}
            operations={operations}
            stations={stations}
            visits={view?.visits}
          />
        </Stack>
      ),
    },
    {
      id: "history" as const,
      label: "历史记录",
      title: "操作与检验履历",
      icon: <HistoryRounded />,
      content: (
        <Stack spacing={2}>
          <TestEvidence
            preferenceKey="pack.execution.history.tests"
            tests={view?.tests || []}
          />
          <EvidenceTable
            preferenceKey="pack.execution.history.visits"
            rows={view?.visits || []}
            columns={[
              {
                key: "nodeId",
                label: "工序",
                render: (row) =>
                  operations.find((op) => op.nodeId === row.nodeId)?.name ||
                  row.nodeId,
              },
              {
                key: "stationId",
                label: "工位",
                render: (row) =>
                  stations.find(
                    (station) => String(station.id) === String(row.stationId),
                  )?.name || row.stationId,
              },
              {
                key: "status",
                label: "访问状态",
                render: (row) => <PackStatus value={row.status} />,
              },
              {
                key: "startedAt",
                label: "进站时间",
                render: (row) => packTime(row.startedAt),
              },
              {
                key: "endedAt",
                label: "结束 / 挂起时间",
                render: (row) => packTime(row.endedAt),
              },
            ]}
          />
          <HistoryEvidence
            preferenceKey="pack.execution.history.actions"
            history={view?.history || []}
          />
        </Stack>
      ),
    },
  ];
  const navigationContent = (
    <Box className="execution-navigation-content">
      <Box className="execution-navigation-heading">
        <Typography component="h3">
          {section === "sop"
            ? "冻结文档"
            : section === "history"
              ? "检验与历史"
              : section === "works"
                ? "工序作业依据"
                : "标准动作"}
        </Typography>
      </Box>
      <List className="execution-navigation-list">
        {section === "sop" ? (
          documents.map((binding, index) => (
            <ListItemButton
              key={`${binding.documentVersionId}-${index}`}
              selected={documentIndex === index}
              onClick={() => {
                setDocumentIndex(index);
                setActivePanel("sop");
              }}
            >
              <Typography className="execution-navigation-name">
                {binding.title || binding.code || "工序文件"}
              </Typography>
              <Typography className="execution-navigation-detail">
                {binding.version || "冻结版本"} · {binding.pageStart} ~{" "}
                {binding.pageEnd} 页
              </Typography>
            </ListItemButton>
          ))
        ) : section === "works" ? (
          <ListItemButton onClick={() => setActivePanel("works")}>
            <Typography className="execution-navigation-name">
              查看工序作业与质量要求
            </Typography>
            <Typography className="execution-navigation-detail">
              {operation?.actions.length || 0} 项冻结标准动作 ·{" "}
              {view?.holds.filter((hold) => hold.status === "OPEN").length || 0}{" "}
              项未闭锁定
            </Typography>
          </ListItemButton>
        ) : section === "history" ? (
          <ListItemButton onClick={() => setActivePanel("history")}>
            <Typography className="execution-navigation-name">
              查看检验与操作履历
            </Typography>
            <Typography className="execution-navigation-detail">
              {view?.tests.length || 0} 次检验 · {view?.history.length || 0}{" "}
              条事件
            </Typography>
          </ListItemButton>
        ) : (
          operation?.actions.map((action) => (
            <ListItemButton
              key={action.code}
              selected={selectedAction?.code === action.code}
              disabled={busy}
              onClick={() =>
                protect(() => {
                  setActionCode(action.code);
                  setSection(null);
                  setActivePanel(null);
                })
              }
            >
              <Typography className="execution-navigation-name">
                {action.code} · {packLabel(action.type)}
              </Typography>
              <Typography className="execution-navigation-detail">
                {packLabel(action.source)}
                {action.required ? " · 必需" : ""}
              </Typography>
            </ListItemButton>
          ))
        )}
        {section === "sop" && !documents.length && (
          <Typography className="execution-navigation-empty">
            当前工序没有冻结 SOP 文档。
          </Typography>
        )}
      </List>
    </Box>
  );
  const scanInput = (
    <Box className={`execution-scan ${view ? "" : "execution-scan-welcome"}`}>
      <TextField
        fullWidth
        inputRef={scanRef}
        size="small"
        placeholder="扫描电芯 / 模组 / PACK SN"
        value={barcode}
        disabled={busy || !siteId}
        onChange={(e) => setBarcode(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && barcode.trim())
            protect(() => void load({ sn: barcode.trim() }));
        }}
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <QrCodeScannerRounded />
            </InputAdornment>
          ),
        }}
      />
      <Button
        className="execution-scan-submit"
        variant="contained"
        disabled={busy || !siteId || !barcode.trim()}
        onClick={() => protect(() => void load({ sn: barcode.trim() }))}
      >
        识别对象
      </Button>
    </Box>
  );
  if (!auth.hasPermission("pack.execution.view"))
    return <Alert severity="warning">无权进入生产工作台。</Alert>;
  return (
    <Box ref={rootRef} className="execution-page">
      <Box className="execution-toolbar">
        <Box className="execution-title">
          <Typography component="h1">生产工作台</Typography>
        </Box>
        {view && scanInput}
        <Stack direction="row" className="execution-tools">
          <Tooltip title="刷新当前对象">
            <span>
              <IconButton
                disabled={busy || !view}
                onClick={() =>
                  protect(() => void load({ objectId: view!.object.id }))
                }
              >
                <RefreshRounded />
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title="全屏">
            <IconButton
              onClick={() => {
                if (document.fullscreenElement) void document.exitFullscreen();
                else void rootRef.current?.requestFullscreen();
              }}
            >
              <FullscreenRounded />
            </IconButton>
          </Tooltip>
        </Stack>
      </Box>
      <Stack direction={{ xs: "column", md: "row" }} spacing={1}>
        <TextField
          select
          size="small"
          label="工厂"
          value={siteId}
          disabled={busy}
          sx={{ minWidth: 170 }}
          onChange={(e) => protect(() => setSiteId(e.target.value))}
        >
          {sites.map((site) => (
            <MenuItem key={site.id} value={String(site.id)}>
              {site.name}
            </MenuItem>
          ))}
        </TextField>
        <Autocomplete
          sx={{ minWidth: 240 }}
          options={stations}
          value={station || null}
          disabled={busy}
          getOptionLabel={(row) =>
            `${row.name} / ${row.code} / ${packLabel(row.executionMode)}`
          }
          onChange={(_, row) =>
            protect(() => {
              setStationId(String(row?.id || ""));
              if (view)
                void load({ objectId: view.object.id }, String(row?.id || ""));
            })
          }
          renderInput={(props) => (
            <TextField {...props} required size="small" label="当前工位" />
          )}
        />
        {station && (
          <Chip
            size="small"
            sx={{ alignSelf: "center" }}
            label={`${station.code} · ${packLabel(station.executionMode)}`}
          />
        )}
      </Stack>
      <Box className="execution-notices" aria-live="polite">
        {error && (
          <Alert severity="error" onClose={() => setError("")}>
            {error}
          </Alert>
        )}
        {catalog.error && (
          <Alert severity="error">{packError(catalog.error)}</Alert>
        )}
        <PackCommandNotice command={command} />
        {notice && (
          <Alert severity="success" onClose={() => setNotice("")}>
            {notice}
          </Alert>
        )}
        {view?.visit && String(view.visit.stationId) !== stationId && (
          <Alert severity="warning">
            当前活动访问属于{" "}
            {view.visit.stationSnapshot?.name ||
              stations.find(
                (item) => String(item.id) === String(view.visit!.stationId),
              )?.name ||
              view.visit.stationId}
            ；当前所选工位为 {station?.name || "未选择"}
            。请核对现场实际工位并选择匹配工位后再操作。
          </Alert>
        )}
        {view?.object.qualityState === "HOLD" && (
          <Alert severity="error">
            当前对象已质量锁定。NG
            结果已保存；需质量人员授权返修并完成复测后继续。
          </Alert>
        )}
        {view?.object.qualityState === "REWORK" && (
          <Alert severity="warning">
            <Stack spacing={0.75}>
              <Typography variant="body2">
                返修作业中。原 NG 访问 {rework?.originVisitId || "—"}{" "}
                已挂起保留；先完成指定返修访问，再进入必需检验工序复测。
              </Typography>
              {rework?.allowedTargets?.map((target) => {
                const nextStationId =
                  target.stationIds
                    .map(String)
                    .find((id) => id === stationId) ||
                  target.stationIds
                    .map(String)
                    .find((id) =>
                      stations.some((station) => String(station.id) === id),
                    ) ||
                  "";
                const targetOp = operations.find(
                  (op) => op.nodeId === target.nodeId,
                );
                return (
                  <Stack
                    key={target.nodeId}
                    direction="row"
                    spacing={1}
                    alignItems="center"
                  >
                    <Typography variant="caption">
                      {packLabel(target.phase)}：
                      {targetOp?.name || target.nodeId}
                    </Typography>
                    <Button
                      size="small"
                      disabled={busy || !!view.visit || !nextStationId}
                      onClick={() =>
                        protect(() => {
                          setStationId(nextStationId);
                          void load(
                            { objectId: view.object.id },
                            nextStationId,
                            target.nodeId,
                            true,
                          );
                        })
                      }
                    >
                      定位工序与工位（另需明确进站）
                    </Button>
                    {targetOp?.mode === "EXTERNAL_MES" && (
                      <Typography variant="caption">
                        等待 MES 主责执行
                      </Typography>
                    )}
                  </Stack>
                );
              })}
              {view.visit && (
                <Typography variant="caption">
                  请完成当前返修 / 复测访问后再转站。
                </Typography>
              )}
              {!view.visit && !rework?.allowedTargets?.length && (
                <Typography variant="caption">
                  当前没有待进站工序，请由质量人员核查必需复测并关闭返修。
                </Typography>
              )}
            </Stack>
          </Alert>
        )}
      </Box>
      {!view ? (
        <Box className="execution-welcome">
          <Typography className="execution-eyebrow" color="primary">
            生产工作台
          </Typography>
          <Typography component="h2">扫描 SN，开始作业</Typography>
          <Typography color="text.secondary">
            选择工厂与工位，识别真实对象后进入冻结工序。
          </Typography>
          <Box className="execution-welcome-input">
            <Typography component="label" variant="body2">
              电芯 / 模组 / PACK SN
            </Typography>
            {scanInput}
          </Box>
          <Stack
            direction="row"
            className="execution-scan-help"
            justifyContent="space-between"
          >
            <Typography variant="caption">扫码枪输入后回车</Typography>
            <Typography variant="caption">识别对象后需明确进站</Typography>
          </Stack>
          {loading && <CircularProgress size={24} sx={{ mt: 2 }} />}
        </Box>
      ) : (
        <Box className="execution-workspace">
          <Box className="execution-sidebar">
            <Box
              component="section"
              className="execution-identity"
              aria-label="当前生产对象"
            >
              <Stack className="execution-identity-heading">
                <Box className="execution-object-heading">
                  <Box className="execution-object-label-row">
                    <Typography className="execution-object-label">
                      {packLabel(view.object.objectType)} SN
                    </Typography>
                    <PackStatus
                      value={view.object.qualityState}
                      kind="quality"
                    />
                  </Box>
                  <Typography component="h2">{view.object.objectNo}</Typography>
                </Box>
                <Box component="dl" className="execution-order-summary">
                  {[
                    ["工单", view.workOrder?.orderNo],
                    ["产品", view.object.materialName],
                    ["料号", view.object.materialCode],
                    ["生产状态", packLabel(view.object.productionState)],
                    [
                      "制造版本",
                      `${view.object.snapshot?.code || "—"} / ${view.object.snapshot?.version || "—"}`,
                    ],
                    ["装配修订", view.object.assemblyRevision],
                    ["业务修订", view.revision],
                  ].map(([label, value]) => (
                    <Box key={label}>
                      <Typography component="dt">{label}</Typography>
                      <Typography component="dd">{value ?? "—"}</Typography>
                    </Box>
                  ))}
                </Box>
                <Box className="execution-object-progress">
                  <Box className="execution-progress-caption">
                    <Typography>已完成工序</Typography>
                    <Typography>
                      {done.size} / {operations.length}
                    </Typography>
                  </Box>
                  <LinearProgress
                    variant="determinate"
                    value={
                      operations.length
                        ? (done.size / operations.length) * 100
                        : 0
                    }
                  />
                </Box>
                <Stack direction="row" spacing={0.5}>
                  {auth.hasPermission("pack.quality.view") && (
                    <Button
                      size="small"
                      onClick={() =>
                        protect(() =>
                          navigate(
                            `/pack/quality?siteId=${siteId}&objectId=${view.object.id}`,
                          ),
                        )
                      }
                    >
                      质量任务
                    </Button>
                  )}
                  {auth.hasPermission("pack.trace.view") && (
                    <Button
                      size="small"
                      onClick={() =>
                        protect(() =>
                          navigate(
                            `/pack/trace?siteId=${siteId}&objectId=${view.object.id}`,
                          ),
                        )
                      }
                    >
                      追溯
                    </Button>
                  )}
                </Stack>
              </Stack>
              <Box ref={setRail} className="execution-sidebar-shortcuts" />
            </Box>
          </Box>
          <ExecutionQuickPanel
            primaryLabel="标准作业"
            active={activePanel}
            onChange={setActivePanel}
            section={section}
            onSectionChange={setSection}
            navigationContent={navigationContent}
            railContainer={rail}
            context={`${view.object.objectNo} · ${operation?.name || "来料对象"}`}
            suspended={Boolean(pendingSwitch || drawer)}
            panels={panels}
          >
            <Box
              component="section"
              className="execution-workarea"
              aria-label="当前工序工作区"
            >
              <Stack
                direction="row"
                className="execution-operation-heading"
                justifyContent="space-between"
                alignItems="center"
              >
                <Box>
                  <Typography className="execution-eyebrow">
                    {operation
                      ? `工序 ${String(operations.indexOf(operation) + 1).padStart(2, "0")}`
                      : "来料对象"}
                  </Typography>
                  <Typography component="h2">
                    {operation?.name || "未冻结生产工序"}
                  </Typography>
                </Box>
                <ExecutionOperationDrawer
                  open={drawer}
                  onOpen={() => setDrawer(true)}
                  onClose={() => setDrawer(false)}
                  disabled={busy || !operations.length}
                  currentName={operation?.name || "暂无工序"}
                  currentStatus={operationStatusLabels[operationState.status]}
                  currentStatusCode={
                    operationState.status === "RUNNING" || operationState.status === "EXECUTABLE"
                      ? "IN_PROGRESS"
                      : operationState.status === "COMPLETED"
                        ? "COMPLETED"
                        : "PENDING"
                  }
                  container={() => rootRef.current}
                >
                  {routeNavigation}
                </ExecutionOperationDrawer>
                <Box className="execution-header-action">
                  {operation &&
                    (!view.visit ? (
                      <Button
                        size="small"
                        variant="contained"
                        startIcon={<PlayArrowRounded />}
                        disabled={
                          busy ||
                          dirty ||
                          !canOperate ||
                          !stationId ||
                          !operationState.canCheckIn ||
                          !controlledReworkTarget(view, nodeId, stationId) ||
                          !operation.stationIds.map(String).includes(stationId)
                        }
                        onClick={() => run("CHECK_IN", { nodeId })}
                      >
                        工序进站
                      </Button>
                    ) : (
                      <Button
                        size="small"
                        variant="contained"
                        startIcon={<CheckCircleRounded />}
                        disabled={
                          busy ||
                          dirty ||
                          !canOperate ||
                          !activeVisit ||
                          !view.allowedActions.COMPLETE_VISIT
                        }
                        onClick={() => run("COMPLETE_VISIT")}
                      >
                        工序完工
                      </Button>
                    ))}
                </Box>
              </Stack>
              {operation && (
                <Stack spacing={0.75} sx={{ px: 2.25, pb: 1.25 }} aria-live="polite">
                  <Typography variant="body2" color="text.secondary">
                    当前工位可执行工序：
                    {executableOperations.map((op) => op.name).join("、") ||
                      (view.visit ? "请先完成当前访问" : "暂无，请查看工序阻断原因")}
                  </Typography>
                  {operationState.blockers.length > 0 && (
                    <Alert severity={operationState.status === "COMPLETED" ? "info" : "warning"}>
                      <Typography variant="body2" fontWeight={600}>
                        正在查看：{operation.name} · {operationStatusLabels[operationState.status]}
                      </Typography>
                      {operationState.blockers.map((blocker, index) => (
                        <Typography variant="body2" key={index}>{blocker}</Typography>
                      ))}
                    </Alert>
                  )}
                </Stack>
              )}
              <Box
                component="details"
                className={`execution-conditions ${conditionIssues.length ? "has-issues" : ""}`}
              >
                <Box component="summary">
                  <Typography variant="body2">
                    开 / 完工条件：
                    {completedObject
                      ? view.object.qualityState === "ACCEPTED"
                        ? "制造已完成，质量合格"
                        : "制造已完成 · " +
                          (view.object.qualityState === "PENDING"
                            ? "待质量放行"
                            : packLabel(view.object.qualityState))
                      : conditionIssues.length
                        ? `${conditionIssues.length} 项待满足`
                        : "当前检查已通过"}
                  </Typography>
                </Box>
                <Box className="execution-condition-content">
                  {conditionIssues.map((blocker, index) => (
                    <Typography variant="body2" key={index}>
                      • {blocker}
                    </Typography>
                  ))}
                  {!stationId && !completedObject && (
                    <Typography variant="body2">• 请选择当前工位</Typography>
                  )}
                  {completedObject && (
                    <Typography variant="body2">
                      该对象已完成冻结工序。检验原值和质量放行依据可从历史记录与追溯中查阅。
                    </Typography>
                  )}
                  {view.visit && (
                    <Typography variant="caption">
                      当前访问：
                      {operations.find((op) => op.nodeId === view.visit!.nodeId)
                        ?.name || view.visit.nodeId}{" "}
                      ·{" "}
                      {stations.find(
                        (row) =>
                          String(row.id) === String(view.visit!.stationId),
                      )?.name || view.visit.stationId}{" "}
                      · {packTime(view.visit.startedAt)}
                    </Typography>
                  )}
                </Box>
              </Box>
              <Box
                className="execution-form-canvas is-fields pack-action-canvas"
                sx={{
                  "&&": { overflow: "auto" },
                  "& > *": { flexShrink: 0 },
                  p: 2,
                  gap: 2,
                }}
              >
                {operation?.mode === "EXTERNAL_MES" && (
                  <Alert severity="info">
                    此工序由产线 MES
                    主责执行。工作台展示接收的进站、装配与检验事实；请从消息接入页检查拒收或冲突。
                  </Alert>
                )}
                {selectedAction ? (
                  <>
                    <Stack
                      direction="row"
                      spacing={1}
                      alignItems="center"
                      flexWrap="wrap"
                    >
                      <TextField
                        select
                        size="small"
                        label="标准动作"
                        value={selectedAction.code}
                        disabled={busy}
                        sx={{ minWidth: 240 }}
                        onChange={(e) =>
                          protect(() => setActionCode(e.target.value))
                        }
                      >
                        {operation!.actions.map((action) => (
                          <MenuItem key={action.code} value={action.code}>
                            {action.code} · {packLabel(action.type)}
                          </MenuItem>
                        ))}
                      </TextField>
                      <Chip
                        size="small"
                        label={packLabel(selectedAction.source)}
                      />
                      {selectedAction.required && (
                        <Chip size="small" label="必需动作" />
                      )}
                    </Stack>
                    {selectedAction.type === "ASSEMBLE" ? (
                      <>
                        <div style={{ flex: "0 0 auto", minWidth: 0 }}>
                        <EvidenceTable
                          preferenceKey="pack.execution.assembly-slots"
                          rows={view.slots.filter((slot) =>
                            selectedAction.slotCodes.includes(slot.slotCode),
                          )}
                          columns={[
                            {
                              key: "slotCode",
                              label: "位置",
                              render: (row) => (
                                <Button
                                  size="small"
                                  disabled={
                                    busy ||
                                    (replacing ? !row.child : !!row.child)
                                  }
                                  variant={
                                    slotCode === row.slotCode
                                      ? "contained"
                                      : "text"
                                  }
                                  onClick={() => {
                                    setSlotCode(row.slotCode);
                                    setOrientationConfirmed(false);
                                    bindRef.current?.focus();
                                  }}
                                >
                                  {row.slotCode}
                                </Button>
                              ),
                            },
                            {
                              key: "material",
                              label: "要求用料",
                              render: (row) =>
                                `${row.materialCode} / ${row.materialName}`,
                            },
                            {
                              key: "childType",
                              label: "类型",
                              render: (row) => packLabel(row.childType),
                            },
                            { key: "orientation", label: "方向 / 极性" },
                            {
                              key: "child",
                              label: "当前子件 SN",
                              render: (row) => row.child?.objectNo || "待绑定",
                            },
                          ]}
                        />
                        </div>
                        <Stack
                          direction={{ xs: "column", md: "row" }}
                          spacing={1}
                        >
                          <TextField
                            select
                            required
                            label={
                              replacing ? "本次返修拆换位置" : "本次装配位置"
                            }
                            size="small"
                            sx={{ minWidth: 170 }}
                            value={slotCode}
                            disabled={busy || !canInstall}
                            onChange={(e) => {
                              setSlotCode(e.target.value);
                              setOrientationConfirmed(false);
                            }}
                          >
                            {view.slots
                              .filter(
                                (slot) =>
                                  selectedAction.slotCodes.includes(
                                    slot.slotCode,
                                  ) && (replacing ? !!slot.child : !slot.child),
                              )
                              .map((slot) => (
                                <MenuItem
                                  key={slot.slotCode}
                                  value={slot.slotCode}
                                >
                                  {slot.slotCode} · {slot.materialCode}
                                </MenuItem>
                              ))}
                          </TextField>
                          <TextField
                            inputRef={bindRef}
                            required
                            fullWidth
                            label={
                              replacing ? "扫描替换子件 SN" : "扫描子件 SN"
                            }
                            size="small"
                            value={childCode}
                            disabled={busy || !canInstall}
                            onChange={(e) => setChildCode(e.target.value)}
                            onKeyDown={(e) => {
                              if (
                                e.key === "Enter" &&
                                slotCode &&
                                childCode.trim() &&
                                bindReady &&
                                canInstall &&
                                !busy
                              )
                                run(installAction, bindPayload);
                            }}
                          />
                          <Button
                            variant="contained"
                            disabled={
                              busy ||
                              !canInstall ||
                              !slotCode ||
                              !childCode.trim() ||
                              !bindReady
                            }
                            onClick={() => run(installAction, bindPayload)}
                          >
                            {replacing
                              ? "确认拆换并保留旧件记录"
                              : "绑定并继续"}
                          </Button>
                        </Stack>
                        {replacing && (
                          <>
                            <Alert severity="warning">
                              已授权返修拆换。旧装配关系和检验保留，拆出件必须明确隔离待检或报废；换件后按新装配修订复测。
                            </Alert>
                            <Stack
                              direction={{ xs: "column", md: "row" }}
                              spacing={1}
                            >
                              <TextField
                                fullWidth
                                required
                                size="small"
                                label="拆换原因 / 处理依据"
                                value={reworkReason}
                                disabled={busy || !canInstall}
                                onChange={(event) =>
                                  setReworkReason(event.target.value)
                                }
                              />
                              <TextField
                                select
                                required
                                size="small"
                                label="拆出件去向"
                                value={removedDisposition}
                                disabled={busy || !canInstall}
                                sx={{ minWidth: 180 }}
                                onChange={(event) =>
                                  setRemovedDisposition(event.target.value)
                                }
                              >
                                <MenuItem value="QUARANTINE">隔离待检</MenuItem>
                                <MenuItem value="SCRAP">报废</MenuItem>
                              </TextField>
                            </Stack>
                          </>
                        )}
                        {selectedSlot?.orientation && (
                          <FormControlLabel
                            control={
                              <Checkbox
                                checked={orientationConfirmed}
                                disabled={busy || !canOperate || !activeVisit}
                                onChange={(e) =>
                                  setOrientationConfirmed(e.target.checked)
                                }
                              />
                            }
                            label={`已现场核对本位置方向 / 极性：${selectedSlot.orientation}`}
                          />
                        )}
                        {selectedAction.source !== "HUMAN" && !replacing && (
                          <Alert severity="info">
                            该装配动作由 {packLabel(selectedAction.source)}{" "}
                            提交，当前仅查看装配结果。
                          </Alert>
                        )}
                      </>
                    ) : (
                      <>
                        <Alert
                          severity={
                            selectedAction.source === "HUMAN"
                              ? "info"
                              : "warning"
                          }
                        >
                          {selectedAction.source === "HUMAN"
                            ? "按冻结规范录入原始结果；超限或不合格会保存证据并锁定对象。"
                            : `此动作等待 ${packLabel(selectedAction.source)} 原始记录，人员不能代填或代判。`}
                        </Alert>
                        <div style={{ flex: "0 0 auto", minWidth: 0 }}>
                        <EvidenceTable
                          preferenceKey="pack.execution.check-inputs"
                          rows={selectedAction.checks}
                          columns={[
                            {
                              key: "name",
                              label: "测项",
                              render: (row) =>
                                `${row.code} / ${row.name || ""}${row.required ? " *" : ""}`,
                            },
                            {
                              key: "spec",
                              label: "冻结规范",
                              render: (row) =>
                                row.kind === "NUMBER"
                                  ? `${row.min} ~ ${row.max} ${row.unit || ""}`
                                  : "合格 / 不合格",
                            },
                            {
                              key: "value",
                              label: "原始结果",
                              render: (row) =>
                                row.kind === "BOOLEAN" ? (
                                  <TextField
                                    select
                                    fullWidth
                                    size="small"
                                    value={
                                      values[selectedAction.code]?.[row.code] ??
                                      ""
                                    }
                                    label="检查结论"
                                    disabled={
                                      busy ||
                                      !canOperate ||
                                      !activeVisit ||
                                      !view.allowedActions.RECORD_TEST ||
                                      selectedAction.source !== "HUMAN"
                                    }
                                    onChange={(e) =>
                                      setValues((old) => ({
                                        ...old,
                                        [selectedAction.code]: {
                                          ...old[selectedAction.code],
                                          [row.code]: e.target.value,
                                        },
                                      }))
                                    }
                                  >
                                    <MenuItem value="">未填写</MenuItem>
                                    <MenuItem value="true">合格</MenuItem>
                                    <MenuItem value="false">不合格</MenuItem>
                                  </TextField>
                                ) : (
                                  <TextField
                                    fullWidth
                                    size="small"
                                    type="number"
                                    label="实测原值"
                                    value={
                                      values[selectedAction.code]?.[row.code] ??
                                      ""
                                    }
                                    disabled={
                                      busy ||
                                      !canOperate ||
                                      !activeVisit ||
                                      !view.allowedActions.RECORD_TEST ||
                                      selectedAction.source !== "HUMAN"
                                    }
                                    InputProps={{
                                      endAdornment: (
                                        <InputAdornment position="end">
                                          {row.unit}
                                        </InputAdornment>
                                      ),
                                    }}
                                    onChange={(e) =>
                                      setValues((old) => ({
                                        ...old,
                                        [selectedAction.code]: {
                                          ...old[selectedAction.code],
                                          [row.code]: e.target.value,
                                        },
                                      }))
                                    }
                                  />
                                ),
                            },
                          ]}
                        />
                        </div>
                        {selectedAction.source === "HUMAN" && (
                          <>
                            <TextField
                              size="small"
                              label="检验备注"
                              value={notes[selectedAction.code] || ""}
                              disabled={busy || !activeVisit}
                              onChange={(e) =>
                                setNotes((old) => ({
                                  ...old,
                                  [selectedAction.code]: e.target.value,
                                }))
                              }
                            />
                            <Box>
                              <Button
                                variant="contained"
                                disabled={
                                  busy ||
                                  !canOperate ||
                                  !activeVisit ||
                                  !view.allowedActions.RECORD_TEST ||
                                  selectedAction.checks.some(
                                    (check) =>
                                      check.required &&
                                      (values[selectedAction.code]?.[
                                        check.code
                                      ] ?? "") === "",
                                  )
                                }
                                onClick={() => {
                                  try {
                                    run(
                                      "RECORD_TEST",
                                      humanTestPayload(
                                        selectedAction,
                                        values[selectedAction.code] || {},
                                        notes[selectedAction.code] || "",
                                      ),
                                    );
                                  } catch (cause) {
                                    setError(packError(cause));
                                  }
                                }}
                              >
                                提交原始检验结果
                              </Button>
                            </Box>
                          </>
                        )}
                        <TestEvidence
                          preferenceKey="pack.execution.action.tests"
                          tests={view.tests.filter(
                            (test) =>
                              test.actionCode === selectedAction.code &&
                              test.nodeId === nodeId,
                          )}
                        />
                      </>
                    )}
                  </>
                ) : (
                  <Box className="execution-empty-content">
                    <InfoOutlined />
                    <Typography color="text.secondary">
                      {operations.length
                        ? "请选择工序查看标准动作。"
                        : "该对象为来料接收对象，没有生产工单冻结工序。可作为合格子件绑定，或打开追溯查看来源。"}
                    </Typography>
                  </Box>
                )}
              </Box>
              <Box className="execution-form-actions">
                <Typography
                  variant="caption"
                  color={dirty ? "warning.main" : "text.secondary"}
                >
                  {dirty
                    ? "有尚未提交的录入，请提交当前动作后再切换。"
                    : `当前对象修订 ${view.revision} · 所有动作由服务端复核`}
                </Typography>
                <Button
                  size="small"
                  sx={{ ml: "auto" }}
                  disabled={busy}
                  onClick={() =>
                    protect(() => {
                      setView(null);
                      setBarcode("");
                      resetDraft();
                      setTimeout(() => scanRef.current?.focus(), 0);
                    })
                  }
                >
                  扫描下一个
                </Button>
              </Box>
            </Box>
          </ExecutionQuickPanel>
        </Box>
      )}
      <ConfirmDialog
        open={!!pendingSwitch}
        title="当前录入尚未提交"
        message="切换将丢弃尚未保存的子件 SN 或实测值。已保存的生产事实不受影响。"
        initialFocus="cancel"
        destructive
        confirmText="放弃录入并切换"
        cancelText="继续录入"
        container={() => rootRef.current}
        onCancel={() => setPendingSwitch(null)}
        onConfirm={() => {
          const next = pendingSwitch;
          setPendingSwitch(null);
          resetDraft();
          next?.();
        }}
      />
    </Box>
  );
}
