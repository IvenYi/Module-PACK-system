import { useQueryClient } from "@tanstack/react-query";
import { refreshPackBusinessQueries } from "./packBusinessCache.mjs";
import { normalizePackExecution } from "@/api/packNormalization.mjs";
import { useEffect, useRef, useState } from "react";
import axios from "axios";
import { Alert, Button } from "@mui/material";
import type { PackCommand, PackExecution } from "@/api/pack";
import { useAuthStore } from "@/stores/authStore";
import { getSessionGeneration } from "@/utils/queryClient";
import { clearAuthStorage } from "@/utils/sessionPolicy";

// Keep the exact uncertain request: reissuing a business action with a new UUID can duplicate a committed fact.
export function usePackCommand(
  siteId: string,
  onSuccess: (execution: PackExecution, result: any) => void,
) {
  const queryClient = useQueryClient();
  const userId = useAuthStore((state) => state.user?.id);
  const key = `pack:pending-command:${userId}:${siteId}`;
  const [pending, setPending] = useState<PackCommand | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const busyRef = useRef(false);
  useEffect(() => {
    try {
      setPending(JSON.parse(sessionStorage.getItem(key) || "null"));
    } catch {
      setPending(null);
    }
    setError("");
  }, [key]);
  const remember = (body: PackCommand | null) => {
    setPending(body);
    if (body) sessionStorage.setItem(key, JSON.stringify(body));
    else sessionStorage.removeItem(key);
  };
  const send = async (body: PackCommand) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    remember(body);
    const generation = getSessionGeneration();
    try {
      const response = await axios.post("/api/v1/pack/commands", body, {
        timeout: 30000,
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token") || ""}`,
        },
      });
      if (generation !== getSessionGeneration()) return;
      if (response.data.code !== 200) {
        remember(null);
        throw new Error(response.data.message || "业务动作未执行");
      }
      remember(null);
      const execution = normalizePackExecution(response.data.data.execution);
      void refreshPackBusinessQueries(queryClient, body.siteId, execution);
      onSuccess(execution, response.data.data.result);
    } catch (cause) {
      if (generation !== getSessionGeneration()) return;
      const status = axios.isAxiosError(cause)
        ? cause.response?.status
        : undefined;
      if (status && status < 500) remember(null);
      if (status === 401) {
        clearAuthStorage();
        window.location.href = "/login";
      }
      setError(
        axios.isAxiosError(cause)
          ? cause.response?.data?.message || cause.message
          : cause instanceof Error
            ? cause.message
            : "业务动作提交失败",
      );
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };
  const run = (
    execution: PackExecution,
    stationId: string,
    action: string,
    payload: Record<string, unknown> = {},
  ) => {
    if (pending || busyRef.current) return;
    return send({
      siteId,
      requestId: crypto.randomUUID(),
      action,
      objectId: execution.object.id,
      revision: execution.revision,
      ...(stationId ? { stationId } : {}),
      payload,
    });
  };
  return {
    run,
    busy,
    pending,
    error,
    clearError: () => setError(""),
    retry: () => pending && send(pending),
    locked: busy || Boolean(pending),
  };
}
export function PackCommandNotice({
  command,
}: {
  command: ReturnType<typeof usePackCommand>;
}) {
  return (
    <>
      {command.error && <Alert severity="error">{command.error}</Alert>}
      {command.pending && (
        <Alert
          severity="warning"
          action={
            <Button
              color="inherit"
              disabled={command.busy}
              onClick={() => void command.retry()}
            >
              核实并重试原请求
            </Button>
          }
        >
          动作“{command.pending.action}
          ”正在确认。请保留当前请求，重试会沿用同一编号，避免重复记录。
        </Alert>
      )}
    </>
  );
}
