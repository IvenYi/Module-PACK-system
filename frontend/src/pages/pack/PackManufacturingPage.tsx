import { normalizePackConfig } from "@/api/packNormalization.mjs";
// Pack manufacturing workspace retains the medical product workspace's list, version and operation editing layout.
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Add,
  ArrowDownward,
  ArrowUpward,
  ContentCopy,
  DeleteOutline,
  EditOutlined,
  PlaylistAddCheck,
  Publish,
} from "@mui/icons-material";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Checkbox,
  Chip,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  IconButton,
  List,
  ListItemButton,
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
import { managementFieldSx } from "@/components/managementPageStyles";
import ConfirmDialog from "@/components/ConfirmDialog";
import ConfigurableListTable from "@/components/ConfigurableListTable";
import { useSnackbar } from "@/components/SnackbarProvider";
import { useAuthStore } from "@/stores/authStore";
import {
  getPackCatalog,
  getPackVersions,
  getPackVersion,
  savePackVersion,
  validatePackVersion,
  publishPackVersion,
  deletePackVersion,
  type PackRow,
  type PackManufacturingConfig,
  type PackManufacturingVersion,
  type PackOperation,
  type PackAction,
  type PackCheck,
  type PackDocument,
  type PackCatalog,
} from "@/api/pack";
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
const emptyConfig = (
  siteId: string,
  productId = "",
): PackManufacturingConfig => ({
  siteId,
  productId,
  outputType: "",
  code: "",
  name: "",
  version: "",
  routeVersionId: "",
  bom: [],
  operations: [],
  documents: [],
});
const active = (row: PackRow) =>
  !["INACTIVE", "DISABLED", "EXPIRED"].includes(
    String(row.status || row.versionStatus || ""),
  );
const nodeKey = (row: PackRow) => String(row.nodeKey || row.nodeId || row.id);
const operationNodes = (version: PackRow | undefined) =>
  (version?.nodes || []).filter(
    (node: PackRow) => !["START", "END"].includes(String(node.nodeType || "")),
  );
const getDocumentOptions = (catalog?: PackCatalog): PackRow[] =>
  (catalog?.documents || []).flatMap((doc) =>
    (doc.versions || []).map((version: PackRow) => ({
      ...doc,
      ...version,
      id: String(version.id),
      title: doc.title || doc.name,
      documentCode: doc.code,
    })),
  );
export default function PackManufacturingPage() {
  const { siteId, setSiteId, sites, error: siteError } = usePackSite();
  const [params, setParams] = useSearchParams();
  const client = useQueryClient();
  const { showMessage } = useSnackbar();
  const allowed = useAuthStore((state) =>
      state.hasPermission("pack.manufacturing.view"),
    ),
    canEdit = useAuthStore((state) =>
      state.hasPermission("pack.manufacturing.manage"),
    );
  const [keyword, setKeyword] = useState(""),
    [applied, setApplied] = useState(""),
    [page, setPage] = useState(1),
    [size, setSize] = useState(20),
    [selected, setSelected] = useState<string | null>(null),
    [editing, setEditing] = useState<{
      id: string | null;
      revision?: number;
      config: PackManufacturingConfig;
    } | null>(null),
    [tab, setTab] = useState(0),
    [operationIndex, setOperationIndex] = useState(0),
    [discard, setDiscard] = useState(false),
    [publishing, setPublishing] = useState<PackManufacturingVersion | null>(
      null,
    ),
    [issues, setIssues] = useState<any[] | null>(null),
    [error, setError] = useState(""),
    [deleting, setDeleting] = useState<PackManufacturingVersion | null>(null);
  const list = useQuery({
    queryKey: [
      "pack-versions",
      siteId,
      params.get("productId"),
      applied,
      page,
      size,
    ],
    enabled: allowed && Boolean(siteId),
    queryFn: () =>
      getPackVersions({
        siteId,
        productId: params.get("productId") || undefined,
        keyword: applied,
        page,
        size,
      }),
  });
  const catalog = useQuery({
    queryKey: ["pack-catalog", siteId],
    enabled: allowed && Boolean(siteId),
    queryFn: () => getPackCatalog(siteId),
  });
  const detail = useQuery({
    queryKey: ["pack-version", siteId, selected],
    enabled: allowed && Boolean(siteId && selected),
    queryFn: () => getPackVersion(selected!, siteId),
  });
  const refresh = () => {
    client.invalidateQueries({ queryKey: ["pack-versions", siteId] });
    client.invalidateQueries({ queryKey: ["pack-version", siteId] });
    client.invalidateQueries({ queryKey: ["pack-product-versions", siteId] });
    client.invalidateQueries({ queryKey: ["pack-published", siteId] });
  };
  const save = useMutation({
    mutationFn: () =>
      savePackVersion(editing!.id, editing!.config, editing!.revision),
    onSuccess: () => {
      setEditing(null);
      refresh();
      showMessage("制造草稿已保存");
    },
    onError: (err) => setError(packError(err)),
  });
  const remove = useMutation({
    mutationFn: () =>
      deletePackVersion(deleting!.id, siteId, deleting!.revision),
    onSuccess: () => {
      setDeleting(null);
      refresh();
      showMessage("未引用草稿已删除。", "success");
    },
    onError: (cause) => showMessage(packError(cause), "error"),
  });
  const validate = useMutation({
    mutationFn: (row: PackManufacturingVersion) =>
      validatePackVersion(row.id, siteId, row.revision),
    onSuccess: (result) => {
      setIssues(result.issues || []);
      refresh();
      showMessage(
        result.valid ? "制造配置校验通过" : "配置仍有未满足项",
        result.valid ? "success" : "warning",
      );
    },
    onError: (err) => showMessage(packError(err), "error"),
  });
  const publish = useMutation({
    mutationFn: () =>
      publishPackVersion(publishing!.id, siteId, publishing!.revision),
    onSuccess: () => {
      setPublishing(null);
      refresh();
      showMessage("制造版本已发布并冻结");
    },
    onError: (err) => showMessage(packError(err), "error"),
  });
  useEffect(() => {
    setEditing(null);
    setSelected(null);
    setIssues(null);
    setPage(1);
  }, [siteId]);
  useEffect(() => {
    if (!editing) return;
    const handle = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handle);
    return () => window.removeEventListener("beforeunload", handle);
  }, [Boolean(editing)]);
  const routes = useMemo(
    () =>
      (catalog.data?.routes || []).flatMap((route) =>
        (route.versions || []).map((version: PackRow) => ({
          ...version,
          id: String(version.id),
          routeName: route.name,
          routeCode: route.code,
        })),
      ),
    [catalog.data],
  );
  const documents = getDocumentOptions(catalog.data);
  const material = (id: string) =>
    catalog.data?.materials.find((row) => String(row.id) === id);
  const versionValue = (
    row: PackManufacturingVersion,
    key: "code" | "name" | "version",
  ) => row.config?.[key] || row[key];
  const open = (row?: PackManufacturingVersion, copy = false) => {
    setError("");
    setIssues(null);
    setTab(0);
    setOperationIndex(0);
    setEditing(
      row
        ? {
            id: copy ? null : row.id,
            revision: copy ? undefined : row.revision,
            config: {
              ...structuredClone(normalizePackConfig(row.config)),
              siteId,
              ...(copy ? { code: "", version: "" } : {}),
            },
          }
        : {
            id: null,
            config: emptyConfig(siteId, params.get("productId") || ""),
          },
    );
  };
  const patch = (value: Partial<PackManufacturingConfig>) =>
    setEditing((old) =>
      old ? { ...old, config: { ...old.config, ...value } } : old,
    );
  const changeRoute = (routeVersionId: string) => {
    const route = routes.find(
      (row) => String(row.id) === String(routeVersionId),
    );
    patch({
      routeVersionId,
      operations: operationNodes(route).map((node: PackRow) => ({
        nodeId: nodeKey(node),
        name: node.operationName || node.operationCode || node.nodeKey,
        stationIds: [],
        mode: "MANUAL",
        actions: [],
      })),
    });
    setOperationIndex(0);
  };
  const form = editing?.config;
  const route = routes.find(
    (row) => String(row.id) === String(form?.routeVersionId),
  );
  const operation = form?.operations[operationIndex];
  const patchOperation = (updated: PackOperation) =>
    patch({
      operations: form!.operations.map((row, index) =>
        index === operationIndex ? updated : row,
      ),
    });
  if (!allowed)
    return (
      <Alert severity="warning">无权查看制造配置，请联系管理员授权。</Alert>
    );
  return (
    <Stack spacing={1.5} sx={{ height: "calc(100vh - 150px)", minHeight: 500 }}>
      <PackScopeFilter
        siteId={siteId}
        sites={sites}
        onChange={setSiteId}
        actions={
          <ListQueryActions
            onReset={() => {
              setKeyword("");
              setApplied("");
              setPage(1);
              const next = new URLSearchParams(params);
              next.delete("productId");
              setParams(next);
            }}
            onQuery={() => {
              setApplied(keyword);
              setPage(1);
            }}
          />
        }
      >
        <TextField
          size="small"
          label="制造版本编码 / 名称"
          fullWidth
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
      {siteError && <Alert severity="error">{packError(siteError)}</Alert>}
      {catalog.error && (
        <Alert severity="error">{packError(catalog.error)}</Alert>
      )}
      {params.get("productId") && (
        <Alert
          severity="info"
          action={
            <Button
              onClick={() => {
                const next = new URLSearchParams(params);
                next.delete("productId");
                setParams(next);
                setPage(1);
              }}
            >
              查看全部产品
            </Button>
          }
        >
          当前产品：
          {catalog.data?.materials.find(
            (row) => String(row.id) === params.get("productId"),
          )?.name || params.get("productId")}{" "}
          · 制造版本独立维护
        </Alert>
      )}
      <PackTable
        preferenceKey="pack.manufacturing.list"
        title="制造版本"
        columns={[
          {
            key: "code",
            label: "制造编码",
            width: 260,
            minWidth: 180,
            render: (row) => versionValue(row, "code"),
          },
          {
            key: "name",
            label: "制造名称",
            width: 300,
            minWidth: 220,
            render: (row) => versionValue(row, "name"),
          },
          {
            key: "outputType",
            label: "产出层级",
            render: (row) => packLabel(row.config.outputType),
          },
          {
            key: "version",
            label: "版本",
            render: (row) => versionValue(row, "version"),
          },
          {
            key: "productName",
            label: "产品",
            width: 300,
            minWidth: 220,
            render: (row) =>
              row.productName || material(row.config?.productId)?.name || "—",
          },
          {
            key: "status",
            label: "状态",
            render: (row) => <PackStatus value={row.status} />,
          },
          {
            key: "referenceCount",
            label: "引用工单",
            render: (row) => row.referenceCount ?? "服务端核验",
          },
          {
            key: "actions",
            label: "操作",
            width: 420,
            minWidth: 420,
            render: (row) => (
              <Box onClick={(e) => e.stopPropagation()}>
                <Button size="small" onClick={() => setSelected(row.id)}>
                  详情
                </Button>
                {canEdit && row.status === "DRAFT" && (
                  <>
                    <Button size="small" onClick={() => open(row)}>
                      编辑
                    </Button>
                    <Button
                      size="small"
                      disabled={validate.isPending}
                      onClick={() => validate.mutate(row)}
                    >
                      校验
                    </Button>
                    <Button size="small" onClick={() => setPublishing(row)}>
                      发布
                    </Button>
                    <Button
                      size="small"
                      color="error"
                      onClick={() => setDeleting(row)}
                    >
                      删除
                    </Button>
                  </>
                )}
                {canEdit && (
                  <Button size="small" onClick={() => open(row, true)}>
                    复制
                  </Button>
                )}
              </Box>
            ),
          },
        ]}
        rows={list.data?.content || []}
        loading={list.isLoading}
        error={list.error}
        total={list.data?.totalElements || 0}
        page={page}
        size={size}
        onPage={setPage}
        onSize={(value) => {
          setSize(value);
          setPage(1);
        }}
        onReload={() => void list.refetch()}
        onRow={(row) => setSelected(row.id)}
        actions={
          canEdit && (
            <Button
              variant="contained"
              size="small"
              startIcon={<Add />}
              disabled={!siteId || !catalog.data}
              onClick={() => open()}
            >
              新增制造版本
            </Button>
          )
        }
      />
      {issues && (
        <Alert
          severity={issues.length ? "warning" : "success"}
          onClose={() => setIssues(null)}
        >
          {issues.length
            ? issues.map((issue, index) => (
                <Typography variant="body2" key={index}>
                  {typeof issue === "string"
                    ? issue
                    : issue.message || issue.code}
                </Typography>
              ))
            : "配置校验通过，可发布制造版本。"}
        </Alert>
      )}
      <FormDialog
        open={Boolean(editing)}
        fullScreen
        onClose={save.isPending ? undefined : () => setDiscard(true)}
      >
        <DialogTitle
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span>{editing?.id ? "编辑制造版本" : "新增制造版本"}</span>
          <Typography variant="body2" color="text.secondary">
            {sites.find((site) => String(site.id) === siteId)?.name} · 草稿
          </Typography>
        </DialogTitle>
        <DialogContent
          dividers
          sx={{ bgcolor: "#f7f9fc", p: 2, ...managementFieldSx }}
        >
          {form && (
            <Stack spacing={2} sx={{ height: "100%" }}>
              {error && <Alert severity="error">{error}</Alert>}
              <Tabs
                value={tab}
                variant="scrollable"
                scrollButtons="auto"
                onChange={(_, value) => setTab(value)}
                sx={{
                  minHeight: 48,
                  bgcolor: "#fff",
                  borderBottom: "1px solid #e4e7ed",
                  "& .MuiTab-root": { minHeight: 48 },
                }}
              >
                <Tab label="产品与版本" />
                <Tab label={`装配 BOM / 位置 (${form.bom.length})`} />
                <Tab label={`工序标准动作 (${form.operations.length})`} />
                <Tab label="通用 SOP 文档" />
              </Tabs>
              {tab === 0 && (
                <FormDialogSection title="产品制造版本">
                  <FormDialogFieldGrid>
                    <TextField
                      select
                      required
                      size="small"
                      label="产出层级"
                      value={form.outputType || ""}
                      onChange={(e) =>
                        patch({
                          outputType: e.target.value as "MODULE" | "PACK",
                        })
                      }
                    >
                      <MenuItem value="MODULE">模组（电芯装配）</MenuItem>
                      <MenuItem value="PACK">PACK（模组装配）</MenuItem>
                    </TextField>
                    <Autocomplete
                      options={catalog.data?.materials || []}
                      value={material(form.productId) || null}
                      getOptionLabel={(row) =>
                        `${row.code} / ${row.name} / ${row.version || ""}`
                      }
                      isOptionEqualToValue={(left, right) =>
                        String(left.id) === String(right.id)
                      }
                      onChange={(_, value) =>
                        patch({ productId: String(value?.id || "") })
                      }
                      renderInput={(props) => (
                        <TextField
                          {...props}
                          required
                          size="small"
                          label="产品物料版本"
                        />
                      )}
                    />
                    <TextField
                      required
                      size="small"
                      label="制造版本编码"
                      value={form.code}
                      onChange={(e) => patch({ code: e.target.value })}
                    />
                    <TextField
                      required
                      size="small"
                      label="制造名称"
                      value={form.name}
                      onChange={(e) => patch({ name: e.target.value })}
                    />
                    <TextField
                      required
                      size="small"
                      label="版本号"
                      value={form.version}
                      onChange={(e) => patch({ version: e.target.value })}
                    />
                    <Autocomplete
                      options={routes}
                      value={route || null}
                      getOptionLabel={(row) =>
                        `${row.routeName} / ${row.version} / ${row.code || ""}`
                      }
                      isOptionEqualToValue={(left, right) =>
                        left.id === right.id
                      }
                      onChange={(_, value) => changeRoute(value?.id || "")}
                      renderInput={(props) => (
                        <TextField
                          {...props}
                          required
                          size="small"
                          label="工艺路线版本"
                        />
                      )}
                    />
                  </FormDialogFieldGrid>
                  <Alert severity="info" sx={{ mt: 2 }}>
                    从已维护的物料及路线版本建立制造依据。选择路线会重建工序配置，请在录入动作前确认路线。
                  </Alert>
                </FormDialogSection>
              )}
              {tab === 1 && (
                <FormDialogSection title="装配位置与用料">
                  <ConfigurableListTable
                    preferenceKey="pack.manufacturing.edit.bom"
                    rows={form.bom.map((slot, index) => ({ slot, index }))}
                    getRowKey={(row) => row.index}
                    emptyText="暂无装配位置"
                    columns={[
                      {
                        key: "slotCode",
                        label: "位置编码",
                        width: 160,
                        minWidth: 130,
                        render: ({ slot, index }) => (
                          <TextField
                            fullWidth
                            required
                            size="small"
                            value={slot.slotCode}
                            inputProps={{
                              "aria-label": `${slot.slotCode || `第${index + 1}行`}位置编码`,
                            }}
                            onChange={(e) =>
                              patch({
                                bom: form.bom.map((row, i) =>
                                  i === index
                                    ? { ...row, slotCode: e.target.value }
                                    : row,
                                ),
                              })
                            }
                          />
                        ),
                      },
                      {
                        key: "materialId",
                        label: "子件物料版本",
                        width: 320,
                        minWidth: 280,
                        render: ({ slot, index }) => (
                          <Autocomplete
                            options={
                              catalog.data?.materials.filter(active) || []
                            }
                            value={material(slot.materialId) || null}
                            getOptionLabel={(row) =>
                              `${row.code} / ${row.name} / ${row.version || ""}`
                            }
                            isOptionEqualToValue={(left, right) =>
                              String(left.id) === String(right.id)
                            }
                            onChange={(_, value) =>
                              patch({
                                bom: form.bom.map((row, i) =>
                                  i === index
                                    ? {
                                        ...row,
                                        materialId: String(value?.id || ""),
                                      }
                                    : row,
                                ),
                              })
                            }
                            renderInput={(props) => (
                              <TextField
                                {...props}
                                required
                                size="small"
                                placeholder="选择子件物料版本"
                                inputProps={{
                                  ...props.inputProps,
                                  "aria-label": `${slot.slotCode || `第${index + 1}行`}子件物料版本`,
                                }}
                              />
                            )}
                          />
                        ),
                      },
                      {
                        key: "childType",
                        label: "子件类型",
                        width: 140,
                        minWidth: 120,
                        render: ({ slot, index }) => (
                          <TextField
                            fullWidth
                            select
                            size="small"
                            value={slot.childType}
                            inputProps={{
                              "aria-label": `${slot.slotCode || `第${index + 1}行`}子件类型`,
                            }}
                            onChange={(e) =>
                              patch({
                                bom: form.bom.map((row, i) =>
                                  i === index
                                    ? {
                                        ...row,
                                        childType: e.target.value as
                                          | "CELL"
                                          | "MODULE",
                                      }
                                    : row,
                                ),
                              })
                            }
                          >
                            {["CELL", "MODULE"].map((type) => (
                              <MenuItem key={type} value={type}>
                                {packLabel(type)}
                              </MenuItem>
                            ))}
                          </TextField>
                        ),
                      },
                      {
                        key: "quantity",
                        label: "数量",
                        width: 130,
                        minWidth: 110,
                        render: ({ slot, index }) => (
                          <TextField
                            fullWidth
                            size="small"
                            type="number"
                            value={slot.quantity}
                            inputProps={{
                              min: 1,
                              step: 1,
                              "aria-label": `${slot.slotCode || `第${index + 1}行`}数量`,
                            }}
                            onChange={(e) =>
                              patch({
                                bom: form.bom.map((row, i) =>
                                  i === index
                                    ? {
                                        ...row,
                                        quantity: Number(e.target.value),
                                      }
                                    : row,
                                ),
                              })
                            }
                          />
                        ),
                      },
                      {
                        key: "orientation",
                        label: "方向 / 极性要求",
                        width: 200,
                        minWidth: 170,
                        render: ({ slot, index }) => (
                          <TextField
                            fullWidth
                            size="small"
                            value={slot.orientation || ""}
                            inputProps={{
                              "aria-label": `${slot.slotCode || `第${index + 1}行`}方向或极性要求`,
                            }}
                            onChange={(e) =>
                              patch({
                                bom: form.bom.map((row, i) =>
                                  i === index
                                    ? { ...row, orientation: e.target.value }
                                    : row,
                                ),
                              })
                            }
                          />
                        ),
                      },
                      {
                        key: "actions",
                        label: "操作",
                        action: true,
                        width: 80,
                        minWidth: 80,
                        render: ({ index }) => (
                          <IconButton
                            color="error"
                            size="small"
                            aria-label="删除装配位置"
                            onClick={() =>
                              patch({
                                bom: form.bom.filter((_, i) => i !== index),
                              })
                            }
                          >
                            <DeleteOutline fontSize="small" />
                          </IconButton>
                        ),
                      },
                    ]}
                  />
                  <Button
                    sx={{ mt: 1 }}
                    size="small"
                    variant="outlined"
                    startIcon={<Add />}
                    onClick={() =>
                      patch({
                        bom: [
                          ...form.bom,
                          {
                            slotCode: "",
                            materialId: "",
                            quantity: 1,
                            childType:
                              form.outputType === "PACK" ? "MODULE" : "CELL",
                          },
                        ],
                      })
                    }
                  >
                    添加装配位置
                  </Button>
                </FormDialogSection>
              )}
              {tab === 2 && (
                <Box
                  sx={{
                    display: "grid",
                    gridTemplateColumns: { xs: "minmax(0,1fr)", md: "260px minmax(0,1fr)" },
                    gap: 2,
                    flex: 1,
                    minHeight: 0,
                  }}
                >
                  <Box
                    sx={{
                      bgcolor: "#fff",
                      border: "1px solid #e4e7ed",
                      overflow: "auto",
                    }}
                  >
                    <Typography
                      sx={{
                        p: 1.5,
                        borderBottom: "1px solid #e4e7ed",
                        fontWeight: 600,
                      }}
                    >
                      路线工序
                    </Typography>
                    <List>
                      {form.operations.map((row, index) => (
                        <ListItemButton
                          key={row.nodeId}
                          selected={index === operationIndex}
                          onClick={() => setOperationIndex(index)}
                        >
                          <Box>
                            <Typography variant="body2" fontWeight={600}>
                              {index + 1}. {row.name}
                            </Typography>
                            <Typography
                              variant="caption"
                              color="text.secondary"
                            >
                              {packLabel(row.mode)} · {row.actions.length}{" "}
                              项动作
                            </Typography>
                          </Box>
                        </ListItemButton>
                      ))}
                    </List>
                    {!form.operations.length && (
                      <Typography sx={{ p: 2 }} color="text.secondary">
                        请先选择有工序节点的路线版本。
                      </Typography>
                    )}
                  </Box>
                  <Box sx={{ overflow: "auto" }}>
                    {operation && (
                      <OperationEditor
                        operation={operation}
                        onChange={patchOperation}
                        catalog={catalog.data!}
                        documents={documents}
                        slotCodes={form.bom
                          .map((row) => row.slotCode)
                          .filter(Boolean)}
                      />
                    )}
                  </Box>
                </Box>
              )}
              {tab === 3 && (
                <DocumentBindings
                  value={form.documents}
                  onChange={(value) => patch({ documents: value })}
                  options={documents}
                />
              )}
            </Stack>
          )}
        </DialogContent>
        <DialogActions
          sx={{
            px: 3,
            py: 1.5,
            gap: 1.5,
            bgcolor: "#fff",
            borderTop: "1px solid #e4e7ed",
            "& .MuiButton-root": { height: 32, minWidth: 64 },
          }}
        >
          <Button disabled={save.isPending} onClick={() => setDiscard(true)}>
            取消
          </Button>
          <Button
            variant="contained"
            disabled={
              save.isPending ||
              !form?.outputType ||
              !form?.productId ||
              !form.code.trim() ||
              !form.name.trim() ||
              !form.version.trim() ||
              !form.routeVersionId
            }
            onClick={() => save.mutate()}
          >
            {save.isPending ? "保存中…" : "保存草稿"}
          </Button>
        </DialogActions>
      </FormDialog>
      <ConfirmDialog
        open={discard}
        title="放弃未保存的配置？"
        message="当前尚未保存的制造配置将丢失。"
        onCancel={() => setDiscard(false)}
        onConfirm={() => {
          setDiscard(false);
          setEditing(null);
        }}
      />
      <ConfirmDialog
        open={Boolean(publishing)}
        title="发布制造版本"
        message="发布将冻结当前产品、BOM、工序动作、检验规范和文档依据。已有工单继续引用各自冻结版本。"
        loading={publish.isPending}
        onCancel={() => setPublishing(null)}
        onConfirm={() => publish.mutate()}
      />
      <ConfirmDialog
        open={!!deleting}
        title="删除未引用草稿"
        message="仅尚未发布且未被工单引用的草稿可以删除。服务端将再次校验引用和修订。"
        destructive
        loading={remove.isPending}
        onCancel={() => setDeleting(null)}
        onConfirm={() => remove.mutate()}
      />
      <PackDrawer
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title="制造版本详情"
        width={1060}
      >
        {detail.error ? (
          <Alert severity="error">{packError(detail.error)}</Alert>
        ) : detail.data ? (
          <ManufacturingDetail version={detail.data} catalog={catalog.data} />
        ) : (
          <Typography>正在读取…</Typography>
        )}
      </PackDrawer>
    </Stack>
  );
}
function OperationEditor({
  operation,
  onChange,
  catalog,
  documents,
  slotCodes,
}: {
  operation: PackOperation;
  onChange(value: PackOperation): void;
  catalog: PackCatalog;
  documents: PackRow[];
  slotCodes: string[];
}) {
  const addAction = () =>
    onChange({
      ...operation,
      actions: [
        ...operation.actions,
        {
          code: "",
          type: "MANUAL_INSPECT",
          required: true,
          source: "HUMAN",
          slotCodes: [],
          checks: [],
          retestAfterReplacement: true,
        },
      ],
    });
  const update = (index: number, patch: Partial<PackAction>) =>
    onChange({
      ...operation,
      actions: operation.actions.map((row, i) =>
        i === index ? { ...row, ...patch } : row,
      ),
    });
  return (
    <Stack spacing={2}>
      <FormDialogSection title={operation.name}>
        <FormDialogFieldGrid>
          <TextField
            select
            size="small"
            label="运行模式"
            value={operation.mode}
            onChange={(e) =>
              onChange({
                ...operation,
                mode: e.target.value as PackOperation["mode"],
                stationIds: [],
              })
            }
          >
            {["MANUAL", "SEMI_AUTO", "EXTERNAL_MES"].map((value) => (
              <MenuItem key={value} value={value}>
                {packLabel(value)}
              </MenuItem>
            ))}
          </TextField>
          <Autocomplete
            multiple
            options={catalog.stations.filter(
              (row) =>
                active(row) &&
                (!row.executionMode || row.executionMode === operation.mode),
            )}
            value={catalog.stations.filter((row) =>
              operation.stationIds.includes(String(row.id)),
            )}
            getOptionLabel={(row) => `${row.name} (${row.code})`}
            isOptionEqualToValue={(left, right) =>
              String(left.id) === String(right.id)
            }
            onChange={(_, value) =>
              onChange({
                ...operation,
                stationIds: value.map((row) => String(row.id)),
              })
            }
            renderInput={(props) => (
              <TextField {...props} size="small" required label="适用工位" />
            )}
          />
        </FormDialogFieldGrid>
      </FormDialogSection>
      {operation.actions.map((action, index) => (
        <FormDialogSection key={index} title={`动作 ${index + 1}`}>
          <Stack spacing={1.5}>
            <Stack direction="row" justifyContent="flex-end">
              <IconButton
                size="small"
                aria-label="动作上移"
                disabled={index === 0}
                onClick={() => {
                  const actions = [...operation.actions];
                  [actions[index - 1], actions[index]] = [
                    actions[index],
                    actions[index - 1],
                  ];
                  onChange({ ...operation, actions });
                }}
              >
                <ArrowUpward fontSize="small" />
              </IconButton>
              <IconButton
                size="small"
                aria-label="动作下移"
                disabled={index === operation.actions.length - 1}
                onClick={() => {
                  const actions = [...operation.actions];
                  [actions[index + 1], actions[index]] = [
                    actions[index],
                    actions[index + 1],
                  ];
                  onChange({ ...operation, actions });
                }}
              >
                <ArrowDownward fontSize="small" />
              </IconButton>
              <IconButton
                color="error"
                size="small"
                aria-label="删除动作"
                onClick={() =>
                  onChange({
                    ...operation,
                    actions: operation.actions.filter((_, i) => i !== index),
                  })
                }
              >
                <DeleteOutline fontSize="small" />
              </IconButton>
            </Stack>
            <FormDialogFieldGrid>
              <TextField
                required
                size="small"
                label="动作编码"
                value={action.code}
                onChange={(e) => update(index, { code: e.target.value })}
              />
              <TextField
                select
                size="small"
                label="标准动作"
                value={action.type}
                onChange={(e) =>
                  update(index, { type: e.target.value as PackAction["type"] })
                }
              >
                {["ASSEMBLE", "MEASURE", "MANUAL_INSPECT"].map((value) => (
                  <MenuItem key={value} value={value}>
                    {packLabel(value)}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                select
                size="small"
                label="证据来源"
                value={action.source}
                onChange={(e) =>
                  update(index, {
                    source: e.target.value as PackAction["source"],
                  })
                }
              >
                {["HUMAN", "DEVICE", "MES"].map((value) => (
                  <MenuItem key={value} value={value}>
                    {packLabel(value)}
                  </MenuItem>
                ))}
              </TextField>
              <Box>
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={action.required}
                      onChange={(e) =>
                        update(index, { required: e.target.checked })
                      }
                    />
                  }
                  label="必需动作"
                />
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={action.retestAfterReplacement}
                      onChange={(e) =>
                        update(index, {
                          retestAfterReplacement: e.target.checked,
                        })
                      }
                    />
                  }
                  label="换件后需复核"
                />
              </Box>
            </FormDialogFieldGrid>
            {action.type === "ASSEMBLE" ? (
              <Autocomplete
                multiple
                options={slotCodes}
                value={action.slotCodes}
                onChange={(_, value) => update(index, { slotCodes: value })}
                renderInput={(props) => (
                  <TextField
                    {...props}
                    size="small"
                    required
                    label="适用装配位置"
                    helperText="从本制造版 BOM 位置中选择"
                  />
                )}
              />
            ) : (
              <>
                <ConfigurableListTable
                  preferenceKey={`pack.manufacturing.edit.checks.${operation.nodeId}.${index}`}
                  rows={action.checks.map((check, ci) => ({ check, ci }))}
                  getRowKey={(row) => row.ci}
                  emptyText="暂无检验项"
                  columns={[
                    ...(["code", "name"] as const).map((key) => ({
                      key,
                      label: key === "code" ? "测项编码" : "测项名称",
                      width: 190,
                      minWidth: 150,
                      render: ({
                        check,
                        ci,
                      }: {
                        check: PackCheck;
                        ci: number;
                      }) => (
                        <TextField
                          fullWidth
                          required
                          size="small"
                          value={check[key]}
                          inputProps={{
                            "aria-label": `${operation.nodeId} ${action.code || `动作${index + 1}`} 第${ci + 1}项${key === "code" ? "测项编码" : "测项名称"}`,
                          }}
                          onChange={(e) =>
                            update(index, {
                              checks: action.checks.map((row, i) =>
                                i === ci
                                  ? { ...row, [key]: e.target.value }
                                  : row,
                              ),
                            })
                          }
                        />
                      ),
                    })),
                    {
                      key: "kind",
                      label: "类型",
                      width: 180,
                      minWidth: 160,
                      render: ({ check, ci }) => (
                        <TextField
                          fullWidth
                          select
                          size="small"
                          value={check.kind}
                          inputProps={{
                            "aria-label": `${operation.nodeId} ${action.code || `动作${index + 1}`} 第${ci + 1}项类型`,
                          }}
                          onChange={(e) =>
                            update(index, {
                              checks: action.checks.map((row, i) =>
                                i === ci
                                  ? {
                                      ...row,
                                      kind: e.target.value as
                                        | "NUMBER"
                                        | "BOOLEAN",
                                    }
                                  : row,
                              ),
                            })
                          }
                        >
                          {["NUMBER", "BOOLEAN"].map((value) => (
                            <MenuItem key={value} value={value}>
                              {packLabel(value)}
                            </MenuItem>
                          ))}
                        </TextField>
                      ),
                    },
                    ...(["unit", "min", "max"] as const).map((key) => ({
                      key,
                      label:
                        key === "unit"
                          ? "单位"
                          : key === "min"
                            ? "下限"
                            : "上限",
                      width: 140,
                      minWidth: 110,
                      render: ({
                        check,
                        ci,
                      }: {
                        check: PackCheck;
                        ci: number;
                      }) => (
                        <TextField
                          fullWidth
                          size="small"
                          disabled={check.kind !== "NUMBER"}
                          type={key === "unit" ? "text" : "number"}
                          value={check[key] ?? ""}
                          inputProps={{
                            "aria-label": `${operation.nodeId} ${action.code || `动作${index + 1}`} 第${ci + 1}项${key === "unit" ? "单位" : key === "min" ? "下限" : "上限"}`,
                          }}
                          onChange={(e) =>
                            update(index, {
                              checks: action.checks.map((row, i) =>
                                i === ci
                                  ? {
                                      ...row,
                                      [key]:
                                        key === "unit"
                                          ? e.target.value
                                          : e.target.value === ""
                                            ? null
                                            : Number(e.target.value),
                                    }
                                  : row,
                              ),
                            })
                          }
                        />
                      ),
                    })),
                    {
                      key: "required",
                      label: "必需",
                      width: 80,
                      minWidth: 80,
                      render: ({ check, ci }) => (
                        <Checkbox
                          size="small"
                          checked={check.required}
                          inputProps={{
                            "aria-label": `${operation.nodeId} ${action.code || `动作${index + 1}`} 第${ci + 1}项必需`,
                          }}
                          onChange={(e) =>
                            update(index, {
                              checks: action.checks.map((row, i) =>
                                i === ci
                                  ? { ...row, required: e.target.checked }
                                  : row,
                              ),
                            })
                          }
                        />
                      ),
                    },
                    {
                      key: "actions",
                      label: "操作",
                      action: true,
                      width: 80,
                      minWidth: 80,
                      render: ({ ci }) => (
                        <IconButton
                          size="small"
                          color="error"
                          aria-label="删除检验项"
                          onClick={() =>
                            update(index, {
                              checks: action.checks.filter((_, i) => i !== ci),
                            })
                          }
                        >
                          <DeleteOutline fontSize="small" />
                        </IconButton>
                      ),
                    },
                  ]}
                />
                <Button
                  size="small"
                  variant="outlined"
                  sx={{ alignSelf: "flex-start" }}
                  startIcon={<Add />}
                  onClick={() =>
                    update(index, {
                      checks: [
                        ...action.checks,
                        {
                          code: "",
                          name: "",
                          kind:
                            action.type === "MANUAL_INSPECT"
                              ? "BOOLEAN"
                              : "NUMBER",
                          unit: "",
                          min: null,
                          max: null,
                          required: true,
                        },
                      ],
                    })
                  }
                >
                  添加检验项
                </Button>
              </>
            )}
          </Stack>
        </FormDialogSection>
      ))}
      <Button
        size="small"
        variant="outlined"
        sx={{ alignSelf: "flex-start" }}
        startIcon={<Add />}
        onClick={addAction}
      >
        添加标准动作
      </Button>
      <DocumentBindings
        value={(operation as any).documents || []}
        onChange={(value) =>
          onChange({ ...operation, documents: value } as PackOperation)
        }
        options={documents}
      />
    </Stack>
  );
}
function DocumentBindings({
  value,
  onChange,
  options,
}: {
  value: PackDocument[];
  onChange(value: PackDocument[]): void;
  options: PackRow[];
}) {
  return (
    <FormDialogSection title="SOP 文档版本及页码">
      <Stack spacing={1.5}>
        {value.map((binding, index) => (
          <Stack key={index} spacing={1}>
            <Autocomplete
              fullWidth
              options={options.filter(active)}
              value={
                options.find(
                  (row) => String(row.id) === binding.documentVersionId,
                ) || null
              }
              getOptionLabel={(row) =>
                `${row.title || row.name} / ${row.version || ""}`
              }
              isOptionEqualToValue={(left, right) =>
                String(left.id) === String(right.id)
              }
              onChange={(_, option) =>
                onChange(
                  value.map((row, i) =>
                    i === index
                      ? { ...row, documentVersionId: String(option?.id || "") }
                      : row,
                  ),
                )
              }
              renderInput={(props) => (
                <TextField {...props} required size="small" label="文档版本" />
              )}
            />
            <FormDialogFieldGrid>
              {(["pageStart", "pageEnd"] as const).map((key) => (
                <TextField
                  key={key}
                  size="small"
                  type="number"
                  label={key === "pageStart" ? "起始页" : "结束页"}
                  value={binding[key]}
                  inputProps={{ min: 1 }}
                  onChange={(e) =>
                    onChange(
                      value.map((row, i) =>
                        i === index
                          ? { ...row, [key]: Number(e.target.value) }
                          : row,
                      ),
                    )
                  }
                />
              ))}
            </FormDialogFieldGrid>
            <Stack direction="row" justifyContent="flex-end">
              <IconButton
                size="small"
                aria-label="移除文档"
                color="error"
                onClick={() => onChange(value.filter((_, i) => i !== index))}
              >
                <DeleteOutline />
              </IconButton>
            </Stack>
          </Stack>
        ))}
        <Button
          size="small"
          variant="outlined"
          sx={{ alignSelf: "flex-start" }}
          startIcon={<Add />}
          onClick={() =>
            onChange([
              ...value,
              { documentVersionId: "", pageStart: 1, pageEnd: 1 },
            ])
          }
        >
          引用文档版本
        </Button>
      </Stack>
    </FormDialogSection>
  );
}
export function ManufacturingDetail({
  version,
  catalog,
}: {
  version: {
    id: string;
    siteId: string;
    status: string;
    config: PackManufacturingConfig;
    revision?: number;
    snapshotHash?: string;
    referenceCount?: number;
    frozen?: PackManufacturingConfig;
    productName?: string;
  };
  catalog?: PackCatalog;
}) {
  const config: PackManufacturingConfig & { productVersion?: string } =
    normalizePackConfig(
      version.status === "PUBLISHED" && version.frozen
        ? version.frozen
        : version.config,
    );
  const material = (id: string) =>
    catalog?.materials.find((row) => String(row.id) === id);
  const metadata: [string, ReactNode][] = [];
  if (version.referenceCount !== undefined)
    metadata.push(["引用工单", version.referenceCount]);
  if (version.revision !== undefined)
    metadata.push(["配置修订", version.revision]);
  if (version.snapshotHash) metadata.push(["发布摘要", version.snapshotHash]);
  else if (version.status === "DRAFT") metadata.push(["发布摘要", "尚未发布"]);
  return (
    <>
      <FormDialogSection title="发布依据">
        <PackFields
          items={[
            ["制造版本", `${config.code} / ${config.name} / ${config.version}`],
            ["状态", <PackStatus value={version.status} />],
            ["产出层级", packLabel(config.outputType)],
            [
              "产品",
              `${config.productCode || "—"} / ${config.productName || "—"} / 物料版本 ${config.productVersion || "—"}`,
            ],
            ...metadata,
          ]}
        />
      </FormDialogSection>
      <FormDialogSection title="装配位置">
        <ConfigurableListTable
          preferenceKey="pack.manufacturing.detail.bom"
          rows={config.bom}
          getRowKey={(row) => row.slotCode}
          emptyText="暂无装配位置"
          columns={[
            { key: "slotCode", label: "位置" },
            {
              key: "material",
              label: "物料",
              width: 360,
              render: (row) =>
                `${row.materialCode || material(row.materialId)?.code || ""} / ${row.materialName || material(row.materialId)?.name || row.materialId}`,
            },
            {
              key: "childType",
              label: "类型",
              render: (row) => packLabel(row.childType),
            },
            { key: "quantity", label: "数量" },
            {
              key: "orientation",
              label: "方向",
              render: (row) => row.orientation || "—",
            },
          ]}
        />
      </FormDialogSection>
      {config.operations.map((operation, index) => (
        <FormDialogSection
          key={operation.nodeId}
          title={`${index + 1}. ${operation.name}`}
        >
          <Stack spacing={1}>
            <Typography variant="body2">
              {packLabel(operation.mode)} · 工位{" "}
              {operation.stationIds
                .map(
                  (id) =>
                    catalog?.stations.find((row) => String(row.id) === id)
                      ?.name || id,
                )
                .join("、")}
            </Typography>
            {operation.actions.map((action) => (
              <Box key={action.code} sx={{ p: 1, border: "1px solid #e4e7ed" }}>
                <Typography fontWeight={600}>
                  {action.code} · {packLabel(action.type)} ·{" "}
                  {packLabel(action.source)}
                  {action.required ? " · 必需" : ""}
                </Typography>
                {action.slotCodes.length > 0 && (
                  <Typography variant="body2">
                    装配位置：{action.slotCodes.join("、")}
                  </Typography>
                )}
                {action.checks.map((check) => (
                  <Typography key={check.code} variant="body2">
                    {check.code} / {check.name} ·{" "}
                    {check.kind === "NUMBER"
                      ? `${check.min ?? "不限"} ~ ${check.max ?? "不限"} ${check.unit || ""}`
                      : "合格 / 不合格"}
                    {check.required ? " · 必填" : ""}
                  </Typography>
                ))}
                <Typography variant="caption" color="text.secondary">
                  {action.retestAfterReplacement
                    ? "换件后要求复核"
                    : "未配置换件复核"}
                </Typography>
              </Box>
            ))}
          </Stack>
        </FormDialogSection>
      ))}
    </>
  );
}
