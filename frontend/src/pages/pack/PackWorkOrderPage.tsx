import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  DialogActions,
  DialogContent,
  DialogTitle,
  Link,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { Add } from "@mui/icons-material";
import FormDialog from "@/components/FormDialog";
import FormDialogSection from "@/components/FormDialogSection";
import FormDialogFieldGrid from "@/components/FormDialogFieldGrid";
import { ListQueryActions } from "@/components/ListQueryPanel";
import { useAuthStore } from "@/stores/authStore";
import { useSnackbar } from "@/components/SnackbarProvider";
import {
  getPackCatalog,
  getPackOrder,
  getPackOrders,
  getPackVersions,
  packWrite,
  type PackOperation,
  type PackRow,
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
import { ManufacturingDetail } from "./PackManufacturingPage";

export default function PackWorkOrderPage() {
  const { siteId, setSiteId, sites } = usePackSite();
  const auth = useAuthStore();
  const canManage = auth.hasPermission("pack.production.manage");
  const canAccept = auth.hasPermission("pack.execution.operate");
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const queryClient = useQueryClient();
  const { showMessage } = useSnackbar();
  const [keyword, setKeyword] = useState("");
  const [applied, setApplied] = useState("");
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(20);
  const [selected, setSelected] = useState<string | null>(
    params.get("orderId"),
  );
  const [edit, setEdit] = useState<PackRow | null>(null);
  const [accepting, setAccepting] = useState<PackRow | null>(null);
  const [stationId, setStationId] = useState("");
  const [versionKeyword, setVersionKeyword] = useState("");
  const [selectedVersion, setSelectedVersion] = useState<PackRow | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    setPage(1);
    setSelected(null);
    setEdit(null);
    setAccepting(null);
  }, [siteId]);
  const list = useQuery({
    queryKey: ["pack-orders", siteId, applied, page, size],
    enabled: !!siteId,
    queryFn: () => getPackOrders({ siteId, keyword: applied, page, size }),
  });
  const catalog = useQuery({
    queryKey: ["pack-catalog", siteId],
    enabled: !!siteId,
    queryFn: () => getPackCatalog(siteId),
  });
  const versions = useQuery({
    queryKey: ["pack-published", siteId, versionKeyword],
    enabled: !!siteId && canManage,
    queryFn: () =>
      getPackVersions({
        siteId,
        status: "PUBLISHED",
        keyword: versionKeyword,
        page: 1,
        size: 200,
      }),
  });
  const detail = useQuery({
    queryKey: ["pack-order", siteId, selected],
    enabled: !!siteId && !!selected,
    queryFn: () => getPackOrder(selected!, siteId),
  });
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["pack-orders"] });
    void queryClient.invalidateQueries({ queryKey: ["pack-order"] });
    void queryClient.invalidateQueries({ queryKey: ["pack-order-options", siteId] });
  };
  const openEditor = (row?: PackRow) => {
    setError("");
    setVersionKeyword("");
    setSelectedVersion(row?.snapshot ? {
      id: String(row.manufacturingVersionId),
      code: row.snapshot.code,
      name: row.snapshot.name,
      version: row.snapshot.version,
      config: row.snapshot,
    } : null);
    setEdit(row ? { ...row } : {
      id: "", orderNo: "", manufacturingVersionId: "", quantity: 1,
    });
  };
  const searchVersions = (_event: unknown, value: string, reason: string) => {
    if (reason === "input" || reason === "clear")
      setVersionKeyword(reason === "clear" ? "" : value);
  };
  const chooseVersion = (_event: unknown, row: PackRow | null) => {
    setVersionKeyword("");
    setSelectedVersion(row);
    setEdit((current) => current ? {
      ...current, manufacturingVersionId: row?.id || "",
    } : current);
  };
  const save = useMutation({
    mutationFn: () =>
      packWrite<PackRow>(
        `/work-orders${edit!.id ? `/${edit!.id}` : ""}`,
        {
          siteId,
          orderNo: edit!.orderNo,
          manufacturingVersionId: edit!.manufacturingVersionId,
          quantity: Number(edit!.quantity),
          ...(edit!.id ? { revision: edit!.revision } : {}),
        },
        edit!.id ? "PUT" : "POST",
      ),
    onSuccess: (row) => {
      setEdit(null);
      setSelected(row.id);
      refresh();
      showMessage("工单已保存，制造依据已冻结。", "success");
    },
    onError: (cause) => setError(packError(cause)),
  });
  const accept = useMutation({
    mutationFn: () =>
      packWrite(`/work-orders/${accepting!.id}/accept`, {
        siteId,
        revision: accepting!.revision,
        stationId,
      }),
    onSuccess: () => {
      setAccepting(null);
      refresh();
      showMessage("工单已接单，可以建档并进站作业。", "success");
    },
    onError: (cause) => setError(packError(cause)),
  });
  const published =
    versions.data?.content.filter((row) => row.status === "PUBLISHED") || [];
  const version = selectedVersion && String(selectedVersion.id) === String(edit?.manufacturingVersionId)
    ? selectedVersion
    : published.find((row) => String(row.id) === String(edit?.manufacturingVersionId));
  const versionOptions = version && !published.some((row) => String(row.id) === String(version.id))
    ? [version, ...published]
    : published;
  const allowedStations = (accepting?.snapshot?.operations || [])
    .flatMap((op: any) => op.stationIds || [])
    .map(String);
  if (!auth.hasPermission("pack.production.view"))
    return <Alert severity="warning">无权查看生产工单。</Alert>;
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
          label="工单号"
          value={keyword}
          fullWidth
          onChange={(e) => setKeyword(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              setApplied(keyword);
              setPage(1);
            }
          }}
        />
      </PackScopeFilter>
      <PackTable
        preferenceKey="pack.work-orders.list"
        title="生产工单"
        rows={list.data?.content || []}
        loading={list.isLoading}
        error={list.error}
        page={page}
        size={size}
        total={list.data?.totalElements || 0}
        onPage={setPage}
        onSize={(value) => {
          setSize(value);
          setPage(1);
        }}
        onReload={() => void list.refetch()}
        onRow={(row) => setSelected(row.id)}
        actions={
          canManage && (
            <Button
              size="small"
              variant="contained"
              startIcon={<Add />}
              disabled={!siteId}
              onClick={() => openEditor()}
            >
              新增工单
            </Button>
          )
        }
        columns={[
          {
            key: "orderNo",
            label: "工单号",
            width: 260,
            minWidth: 180,
            render: (row) => (
              <Link
                component="button"
                type="button"
                underline="hover"
                onClick={(e) => {
                  e.stopPropagation();
                  setSelected(row.id);
                }}
                sx={{ font: "inherit", textAlign: "left" }}
              >
                {row.orderNo}
              </Link>
            ),
          },
          {
            key: "product",
            label: "产品",
            width: 320,
            minWidth: 240,
            render: (row) =>
              `${row.snapshot?.productCode || ""} / ${row.snapshot?.productName || "—"}`,
          },
          {
            key: "version",
            label: "制造版本",
            width: 280,
            minWidth: 200,
            render: (row) =>
              `${row.snapshot?.code || "—"} / ${row.snapshot?.version || "—"}`,
          },
          {
            key: "outputType",
            label: "产出层级",
            render: (row) => packLabel(row.snapshot?.outputType),
          },
          { key: "quantity", label: "计划数量" },
          {
            key: "objectCount",
            label: "已建对象",
            render: (row) => row.objectCount ?? "—",
          },
          {
            key: "status",
            label: "状态",
            render: (row) => <PackStatus value={row.status} />,
          },
          {
            key: "station",
            label: "接单工位",
            render: (row) =>
              catalog.data?.stations.find(
                (s) => String(s.id) === String(row.stationId),
              )?.name || "未接单",
          },
          {
            key: "actions",
            label: "操作",
            width: 240,
            minWidth: 240,
            render: (row) => (
              <Box onClick={(e) => e.stopPropagation()}>
                {canManage &&
                  row.status === "CREATED" &&
                  (row.objectCount ?? 0) === 0 && (
                    <Button
                      size="small"
                      onClick={() => openEditor(row)}
                    >
                      编辑
                    </Button>
                  )}
                {canAccept && row.status === "CREATED" && (
                  <Button
                    size="small"
                    onClick={() => {
                      setError("");
                      setStationId("");
                      setAccepting(row);
                    }}
                  >
                    接单
                  </Button>
                )}
                <Button
                  size="small"
                  onClick={() =>
                    navigate(`/pack/objects?orderId=${row.id}&siteId=${siteId}`)
                  }
                >
                  单件管理
                </Button>
              </Box>
            ),
          },
        ]}
      />
      <FormDialog
        open={!!edit}
        onClose={save.isPending ? undefined : () => setEdit(null)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>{edit?.id ? "编辑工单" : "新增工单"}</DialogTitle>
        <DialogContent dividers>
          {edit && (
            <Stack spacing={2}>
              {error && <Alert severity="error">{error}</Alert>}
              {versions.error && (
                <Alert severity="error">{packError(versions.error)}</Alert>
              )}
              <FormDialogSection title="工单制造依据">
                <FormDialogFieldGrid>
                  <TextField
                    required
                    size="small"
                    label="工单号"
                    value={edit.orderNo}
                    onChange={(e) =>
                      setEdit({ ...edit, orderNo: e.target.value })
                    }
                  />
                  <TextField
                    required
                    size="small"
                    type="number"
                    inputProps={{ min: 1, step: 1, max: 1000000 }}
                    label="计划生产数量"
                    value={edit.quantity}
                    onChange={(e) =>
                      setEdit({ ...edit, quantity: e.target.value })
                    }
                  />
                  <Autocomplete
                    onInputChange={searchVersions}
                    filterOptions={(options) => options}
                    options={versionOptions}
                    value={version || null}
                    getOptionLabel={(row) =>
                      `${row.code} / ${row.name} / ${row.version} · 产品版本 ${(row.config as any).productVersion || "—"}`
                    }
                    isOptionEqualToValue={(a, b) => a.id === b.id}
                    onChange={chooseVersion}
                    renderInput={(props) => (
                      <TextField
                        {...props}
                        required
                        size="small"
                        label="已发布制造版本"
                      />
                    )}
                  />
                </FormDialogFieldGrid>
              </FormDialogSection>
              {version && (
                <FormDialogSection title="制造版本摘要">
                  <PackFields
                    items={[
                      [
                        "产品",
                        (version.config as any).productName ||
                          catalog.data?.materials.find(
                            (row) =>
                              String(row.id) === version.config.productId,
                          )?.name,
                      ],
                      ["装配位置", version.config.bom.length],
                      [
                        "工序",
                        version.config.operations
                          .map((op: PackOperation) => op.name)
                          .join(" → "),
                      ],
                      ["冻结摘要", version.snapshotHash],
                    ]}
                  />
                </FormDialogSection>
              )}
              <Alert severity="info">
                工单保存时冻结所选制造版。接单或建立单件档案后，禁止改写生产依据。
              </Alert>
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button disabled={save.isPending} onClick={() => setEdit(null)}>
            取消
          </Button>
          <Button
            variant="contained"
            disabled={
              save.isPending ||
              !edit?.orderNo?.trim() ||
              !edit.manufacturingVersionId ||
              !Number.isInteger(Number(edit.quantity)) ||
              Number(edit.quantity) < 1
            }
            onClick={() => save.mutate()}
          >
            保存
          </Button>
        </DialogActions>
      </FormDialog>
      <FormDialog
        open={!!accepting}
        onClose={accept.isPending ? undefined : () => setAccepting(null)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>工单接单 · {accepting?.orderNo}</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2}>
            {error && <Alert severity="error">{error}</Alert>}
            <FormDialogSection title="接单工位">
              <FormDialogFieldGrid>
                <Autocomplete
                  options={
                    catalog.data?.stations.filter(
                      (row) =>
                        row.status === "ACTIVE" &&
                        allowedStations.includes(String(row.id)),
                    ) || []
                  }
                  value={
                    catalog.data?.stations.find(
                      (row) => String(row.id) === stationId,
                    ) || null
                  }
                  getOptionLabel={(row) => `${row.name} / ${row.code}`}
                  onChange={(_, row) => setStationId(String(row?.id || ""))}
                  renderInput={(props) => (
                    <TextField
                      {...props}
                      required
                      label="接单工位"
                      size="small"
                    />
                  )}
                />
              </FormDialogFieldGrid>
            </FormDialogSection>
            <Typography variant="body2" color="text.secondary">
              仅列出冻结制造版适用工位；后续每次进站仍核验工序、工位和前置条件。
            </Typography>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setAccepting(null)}
            disabled={accept.isPending}
          >
            取消
          </Button>
          <Button
            variant="contained"
            disabled={!stationId || accept.isPending}
            onClick={() => accept.mutate()}
          >
            确认接单
          </Button>
        </DialogActions>
      </FormDialog>
      <PackDrawer
        open={!!selected}
        onClose={() => setSelected(null)}
        title="工单详情"
        width={1080}
      >
        {detail.error ? (
          <Alert severity="error">{packError(detail.error)}</Alert>
        ) : detail.data ? (
          <>
            <FormDialogSection title="工单信息">
              <PackFields
                items={[
                  ["工单号", detail.data.orderNo],
                  ["状态", <PackStatus value={detail.data.status} />],
                  ["计划数量", detail.data.quantity],
                  ["已建对象", detail.data.objects?.length || 0],
                  [
                    "接单工位",
                    catalog.data?.stations.find(
                      (row) =>
                        String(row.id) === String(detail.data!.stationId),
                    )?.name,
                  ],
                  ["数据修订", detail.data.revision],
                ]}
              />
            </FormDialogSection>
            <Stack direction="row" spacing={1}>
              <Button
                onClick={() =>
                  navigate(`/pack/objects?orderId=${selected}&siteId=${siteId}`)
                }
              >
                单件管理
              </Button>
            </Stack>
            {detail.data.snapshot && (
              <ManufacturingDetail
                version={{
                  id: detail.data.manufacturingVersionId,
                  siteId,
                  status: "PUBLISHED",
                  config: detail.data.snapshot,
                }}
                catalog={catalog.data}
              />
            )}
          </>
        ) : (
          <Typography>正在读取…</Typography>
        )}
      </PackDrawer>
    </Stack>
  );
}
