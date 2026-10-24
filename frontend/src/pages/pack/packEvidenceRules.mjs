export function latestCurrentTest(
  tests,
  visits,
  nodeId,
  actionCode,
  assemblyRevision,
) {
  return tests
    .filter(
      (test) =>
        test.actionCode === actionCode &&
        String(test.assemblyRevision) === String(assemblyRevision) &&
        test.validEvidence === true &&
        (test.nodeId ||
          visits.find((visit) => String(visit.id) === String(test.visitId))
            ?.nodeId) === nodeId,
    )
    .sort(
      (a, b) =>
        String(b.createdAt || "").localeCompare(String(a.createdAt || "")) ||
        String(b.id).localeCompare(String(a.id)),
    )[0];
}
export function reviewCurrentEvidence(view) {
  return (view.object.snapshot?.operations || []).flatMap((operation) =>
    operation.actions
      .filter((action) => action.required)
      .map((action) => {
        if (action.type === "ASSEMBLE") {
          const missing = (action.slotCodes || []).filter(
            (code) =>
              !view.slots.some((slot) => slot.slotCode === code && slot.child),
          );
          const unaccepted = (action.slotCodes || []).filter((code) =>
            view.slots.some(
              (slot) =>
                slot.slotCode === code &&
                slot.child &&
                slot.child.qualityState !== "ACCEPTED",
            ),
          );
          return {
            id: `${operation.nodeId}:${action.code}`,
            operation: operation.name,
            action: action.code,
            result: missing.length || unaccepted.length ? "INCOMPLETE" : "PASS",
            detail: missing.length
              ? `缺件 ${missing.join("、")}`
              : unaccepted.length
                ? `子件未质量合格 ${unaccepted.join("、")}`
                : "位置齐套，子件质量合格",
          };
        }
        const test = latestCurrentTest(
          view.tests,
          view.visits || [],
          operation.nodeId,
          action.code,
          view.object.assemblyRevision,
        );
        return {
          id: `${operation.nodeId}:${action.code}`,
          operation: operation.name,
          action: action.code,
          result: test?.mesResult || "INCOMPLETE",
          detail: test
            ? `${test.source} · 装配修订 ${test.assemblyRevision}`
            : "当前装配修订无有效证据",
        };
      }),
  );
}
export function humanTestPayload(action, draft, note = "") {
  if (action.source !== "HUMAN") throw new Error("该动作只能由设备或 MES 提交");
  const values = [];
  for (const check of action.checks) {
    const value = String(draft[check.code] ?? "").trim();
    if (value === "") {
      if (check.required) throw new Error(`请填写 ${check.name || check.code}`);
      continue;
    }
    if (check.kind === "BOOLEAN") {
      if (!["true", "false"].includes(value))
        throw new Error("检查结果必须明确为合格或不合格");
      values.push({ code: check.code, value: value === "true" });
    } else {
      if (!Number.isFinite(Number(value)))
        throw new Error(`${check.name || check.code} 的实测值无效`);
      // Preserve the entered decimal text; rounding is a server-side business decision.
      values.push({ code: check.code, value, unit: check.unit });
    }
  }
  return { actionCode: action.code, values, note };
}

export function controlledReworkTarget(view, nodeId, stationId) {
  if (!view.activeRework) return true;
  return (view.activeRework.allowedTargets || []).some(
    (target) =>
      target.nodeId === nodeId &&
      target.stationIds.map(String).includes(String(stationId)),
  );
}
