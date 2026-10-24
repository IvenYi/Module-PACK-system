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
  MenuItem,
  Stack,
  TextField,
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
  getPackObjects,
  getPackOrders,
  packWrite,
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

export default function PackObjectPage() {
  const scope = usePackSite();
  const { siteId, setSiteId, sites } = scope;
  const auth = useAuthStore();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { showMessage } = useSnackbar();
  const cache = useQueryClient();
  const [keyword, setKeyword] = useState("");
  const [applied, setApplied] = useState("");
  const [type, setType] = useState("");
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(20);
  const [selected, setSelected] = useState<PackRow | null>(null);
  const [edit, setEdit] = useState<PackRow | null>(null);
  const [error, setError] = useState("");
  const [orderFilter, setOrderFilter] = useState(params.get("orderId") || "");
  useEffect(() => {
    if (
      params.get("siteId") &&
      sites.some((row) => String(row.id) === params.get("siteId"))
    )
      setSiteId(params.get("siteId")!);
  }, [sites, params]);
  useEffect(() => {
    setPage(1);
    setSelected(null);
    setEdit(null);
  }, [siteId, type]);
  const list = useQuery({
    queryKey: ["pack-objects", siteId, applied, type, orderFilter, page, size],
    enabled: !!siteId,
    queryFn: () =>
      getPackObjects({
        siteId,
        keyword: applied,
        type,
        workOrderId: orderFilter,
        page,
        size,
      }),
  });
  const catalog = useQuery({
    queryKey: ["pack-catalog", siteId],
    enabled: !!siteId,
    queryFn: () => getPackCatalog(siteId),
  });
  const orders = useQuery({
    queryKey: ["pack-order-options", siteId],
    enabled: !!siteId,
    queryFn: () => getPackOrders({ siteId, page: 1, size: 200 }),
  });
  const order = orders.data?.content.find(
    (row) => row.id === edit?.workOrderId,
  );
  const material = catalog.data?.materials.find(
    (row) => String(row.id) === edit?.materialId,
  );
  const save = useMutation({
    mutationFn: () =>
      packWrite<PackRow>("/objects", {
        ...edit,
        siteId,
        type: order?.snapshot?.outputType || edit!.type,
      }),
    onSuccess: (row) => {
      setEdit(null);
      setSelected(row);
      void cache.invalidateQueries({ queryKey: ["pack-objects"] });
      void cache.invalidateQueries({ queryKey: ["pack-orders", siteId] });
      void cache.invalidateQueries({ queryKey: ["pack-order", siteId] });
      void cache.invalidateQueries({ queryKey: ["pack-order-options", siteId] });
      showMessage("序列对象已建档。", "success");
    },
    onError: (cause) => setError(packError(cause)),
  });
  if (!auth.hasPermission("pack.production.view"))
    return <Alert severity="warning">无权查看序列对象。</Alert>;
  const filtered = list.data?.content || [];
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
              setType("");
              setOrderFilter("");
              setPage(1);
              const next = new URLSearchParams(params);
              next.delete("orderId");
              setParams(next, { replace: true });
            }}
            onQuery={() => {
              setApplied(keyword);
              setPage(1);
            }}
          />
        }
      >
        <TextField
          select
          size="small"
          label="对象类型"
          value={type}
          onChange={(e) => setType(e.target.value)}
        >
          <MenuItem value="">全部</MenuItem>
          {["CELL", "MODULE", "PACK"].map((value) => (
            <MenuItem key={value} value={value}>
              {packLabel(value)}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          fullWidth
          size="small"
          label="序列号 / SN"
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
      {orderFilter && (
        <Alert
          severity="info"
          action={
            <Button onClick={() => setOrderFilter("")}>查看全部对象</Button>
          }
        >
          正在查看工单{" "}
          {orders.data?.content.find((row) => row.id === orderFilter)
            ?.orderNo || orderFilter}{" "}
          的对象。
        </Alert>
      )}
      <PackTable<PackRow>
        preferenceKey="pack.objects.list"
        title="电芯 / 模组 / PACK 序列对象"
        rows={filtered}
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
        onRow={(row) => setSelected(row)}
        actions={
          auth.hasPermission("pack.execution.operate") && (
            <Button
              startIcon={<Add />}
              size="small"
              variant="contained"
              disabled={!siteId}
              onClick={() => {
                setError("");
                setEdit({
                  id: "",
                  objectNo: "",
                  type: orderFilter
                    ? orders.data?.content.find((row) => row.id === orderFilter)
                        ?.snapshot?.outputType || "MODULE"
                    : "CELL",
                  materialId: "",
                  workOrderId: orderFilter,
                  supplierBatch: "",
                  supplier: "",
                  evidenceNote: "",
                });
              }}
            >
              对象建档
            </Button>
          )
        }
        columns={[
          { key: "objectNo", label: "序列号", width: 260, minWidth: 180 },
          {
            key: "objectType",
            label: "类型",
            render: (row) => packLabel(row.objectType),
          },
          { key: "materialCode", label: "料号", width: 240, minWidth: 180 },
          { key: "materialName", label: "物料名称", width: 300, minWidth: 220 },
          {
            key: "workOrder",
            label: "工单",
            width: 260,
            minWidth: 180,
            render: (row) =>
              orders.data?.content.find((order) => order.id === row.workOrderId)
                ?.orderNo || "来料接收",
          },
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
            key: "actions",
            label: "操作",
            width: 240,
            minWidth: 240,
            render: (row) => (
              <Box onClick={(e) => e.stopPropagation()}>
                <Button size="small" onClick={() => setSelected(row)}>
                  详情
                </Button>
                {auth.hasPermission("pack.execution.view") && (
                  <Button
                    size="small"
                    onClick={() =>
                      navigate(
                        `/pack/execution?siteId=${siteId}&objectId=${row.id}`,
                      )
                    }
                  >
                    作业
                  </Button>
                )}
                {auth.hasPermission("pack.trace.view") && (
                  <Button
                    size="small"
                    onClick={() =>
                      navigate(
                        `/pack/trace?siteId=${siteId}&objectId=${row.id}`,
                      )
                    }
                  >
                    追溯
                  </Button>
                )}
              </Box>
            ),
          },
        ]}
      />
      <FormDialog
        open={!!edit}
        onClose={save.isPending ? undefined : () => setEdit(null)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>序列对象建档</DialogTitle>
        <DialogContent dividers>
          {edit && (
            <Stack spacing={2}>
              {error && <Alert severity="error">{error}</Alert>}
              {catalog.error && (
                <Alert severity="error">{packError(catalog.error)}</Alert>
              )}
              <FormDialogSection title="对象身份">
                <FormDialogFieldGrid>
                  <TextField
                    required
                    size="small"
                    label="序列号 / SN"
                    value={edit.objectNo}
                    inputProps={{ maxLength: 64 }}
                    onChange={(e) =>
                      setEdit({ ...edit, objectNo: e.target.value })
                    }
                  />
                  <TextField
                    select
                    size="small"
                    label={
                      edit.workOrderId ? "对象类型（工单冻结）" : "对象类型"
                    }
                    disabled={!!edit.workOrderId}
                    value={order?.snapshot?.outputType || edit.type}
                    onChange={(e) =>
                      setEdit({
                        ...edit,
                        type: e.target.value,
                        workOrderId: "",
                        materialId: "",
                      })
                    }
                  >
                    {["CELL", "MODULE", "PACK"].map((value) => (
                      <MenuItem key={value} value={value}>
                        {packLabel(value)}
                      </MenuItem>
                    ))}
                  </TextField>
                  {["MODULE", "PACK"].includes(edit.type) && (
                    <Autocomplete
                      options={
                        orders.data?.content.filter((row) =>
                          ["CREATED", "ACCEPTED", "IN_PROCESS"].includes(
                            row.status,
                          ),
                        ) || []
                      }
                      value={order || null}
                      getOptionLabel={(row) =>
                        `${row.orderNo} / ${row.snapshot?.productName || ""} / 产品版本 ${row.snapshot?.productVersion || "—"} / 计划 ${row.quantity}`
                      }
                      onChange={(_, row) =>
                        setEdit({
                          ...edit,
                          workOrderId: row?.id || "",
                          type: row?.snapshot?.outputType || edit.type,
                          materialId: "",
                        })
                      }
                      renderInput={(props) => (
                        <TextField
                          {...props}
                          required={edit.type === "PACK"}
                          size="small"
                          label="生产工单（制造版冻结）"
                        />
                      )}
                    />
                  )}
                  <Autocomplete
                    disabled={!!edit.workOrderId}
                    options={
                      catalog.data?.materials.filter(
                        (row) => row.status !== "INACTIVE",
                      ) || []
                    }
                    value={
                      edit.workOrderId
                        ? catalog.data?.materials.find(
                            (row) =>
                              String(row.id) === order?.snapshot?.productId,
                          ) || null
                        : material || null
                    }
                    getOptionLabel={(row) =>
                      `${row.code} / ${row.name} / ${row.version || ""}`
                    }
                    onChange={(_, row) =>
                      setEdit({ ...edit, materialId: String(row?.id || "") })
                    }
                    renderInput={(props) => (
                      <TextField
                        {...props}
                        required
                        size="small"
                        label="物料版本"
                      />
                    )}
                  />
                </FormDialogFieldGrid>
              </FormDialogSection>
              {!edit.workOrderId && (
                <FormDialogSection title="来料依据">
                  <FormDialogFieldGrid>
                    <TextField
                      size="small"
                      label="供应商批次"
                      value={edit.supplierBatch}
                      onChange={(e) =>
                        setEdit({ ...edit, supplierBatch: e.target.value })
                      }
                    />
                    <TextField
                      size="small"
                      label="供应商"
                      value={edit.supplier}
                      onChange={(e) =>
                        setEdit({ ...edit, supplier: e.target.value })
                      }
                    />
                    <TextField
                      size="small"
                      label="接收依据 / 说明"
                      multiline
                      minRows={3}
                      sx={{ gridColumn: "1 / -1" }}
                      value={edit.evidenceNote}
                      onChange={(e) =>
                        setEdit({ ...edit, evidenceNote: e.target.value })
                      }
                    />
                  </FormDialogFieldGrid>
                </FormDialogSection>
              )}
              <Alert severity="info">
                电芯及外购件按来料接收。自制模组和 PACK
                应选择真实工单，产品料号及制造依据由工单派生；外购模组保留供应商来源边界。
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
              !edit?.objectNo?.trim() ||
              (!edit.materialId && !edit.workOrderId) ||
              (edit.type === "PACK" && !edit.workOrderId)
            }
            onClick={() => save.mutate()}
          >
            确认建档
          </Button>
        </DialogActions>
      </FormDialog>
      <PackDrawer
        open={!!selected}
        onClose={() => setSelected(null)}
        title="序列对象详情"
      >
        {selected && (
          <>
            <FormDialogSection title="对象信息">
              <PackFields
                items={[
                  ["序列号", selected.objectNo],
                  ["类型", packLabel(selected.objectType)],
                  ["料号", selected.materialCode],
                  ["物料", selected.materialName],
                  ["生产状态", <PackStatus value={selected.productionState} />],
                  [
                    "质量状态",
                    <PackStatus value={selected.qualityState} kind="quality" />,
                  ],
                  ["装配修订", selected.assemblyRevision],
                  ["业务修订", selected.revision],
                  ["供应商批次", selected.supplierBatch],
                  [
                    "来源",
                    selected.source?.traceDepth === "SUPPLIER_MODULE"
                      ? "外购模组（供应商追溯边界）"
                      : selected.workOrderId
                        ? "工单生产"
                        : "来料接收",
                  ],
                  ["供应商", selected.source?.supplier],
                  ["接收说明", selected.source?.evidenceNote],
                ]}
              />
            </FormDialogSection>
            <Stack direction="row" spacing={1}>
              {auth.hasPermission("pack.execution.view") && (
                <Button
                  variant="contained"
                  onClick={() =>
                    navigate(
                      `/pack/execution?siteId=${siteId}&objectId=${selected.id}`,
                    )
                  }
                >
                  打开生产工作台
                </Button>
              )}
              {auth.hasPermission("pack.trace.view") && (
                <Button
                  onClick={() =>
                    navigate(
                      `/pack/trace?siteId=${siteId}&objectId=${selected.id}`,
                    )
                  }
                >
                  双向追溯
                </Button>
              )}
            </Stack>
          </>
        )}
      </PackDrawer>
    </Stack>
  );
}
