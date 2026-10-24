export function operationExecutionState(view, nodeId) {
  const state = view?.operationStates?.find((item) => item.nodeId === nodeId);
  if (!state || !view.operations.some((operation) => operation.nodeId === nodeId)) {
    return {
      nodeId,
      status: "BLOCKED",
      canCheckIn: false,
      blockers: ["尚未取得工序执行状态，请刷新后重试。"],
    };
  }
  const canCheckIn = state.status === "EXECUTABLE" &&
    state.canCheckIn === true && view.allowedActions?.CHECK_IN === true;
  const blockers = [...(state.blockers || [])];
  if (state.status === "COMPLETED" && !blockers.length) {
    blockers.push("该工序已完成，重新进站需先取得返修授权。");
  } else if (state.status === "EXECUTABLE" && !canCheckIn && !blockers.length) {
    blockers.push("当前条件不允许进站，请刷新后查看最新状态。");
  }
  return {
    ...state,
    status: state.status === "EXECUTABLE" && !canCheckIn ? "BLOCKED" : state.status,
    canCheckIn,
    blockers,
  };
}

export function completedOperationNodes(view) {
  return new Set((view?.operationStates || [])
    .filter((state) => state.status === "COMPLETED")
    .map((state) => state.nodeId));
}

export function preferredExecutionNode(view, preferredNodeId) {
  const operations = view.operations || [];
  const exists = (nodeId) => operations.some((operation) => operation.nodeId === nodeId);
  if (exists(view.visit?.nodeId)) return view.visit.nodeId;
  if (exists(preferredNodeId)) return preferredNodeId;
  const executable = operations.find((operation) =>
    operationExecutionState(view, operation.nodeId).canCheckIn,
  );
  if (executable) return executable.nodeId;
  const completed = completedOperationNodes(view);
  return operations.find((operation) => !completed.has(operation.nodeId))?.nodeId ||
    operations[0]?.nodeId || "";
}
