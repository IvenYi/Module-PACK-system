const list = (value) => (Array.isArray(value) ? value : []);
export function normalizePackOperation(operation) {
  return {
    ...operation,
    stationIds: [...list(operation.stationIds)],
    documents: list(operation.documents).map((document) => ({ ...document })),
    actions: list(operation.actions).map((action) => ({
      ...action,
      required: action.required !== false,
      retestAfterReplacement: action.retestAfterReplacement !== false,
      slotCodes: [...list(action.slotCodes)],
      checks: list(action.checks).map((check) => ({
        ...check,
        required: check.required !== false,
      })),
    })),
  };
}
export function normalizePackConfig(config) {
  return {
    ...config,
    bom: list(config?.bom).map((line) => ({ ...line })),
    operations: list(config?.operations).map(normalizePackOperation),
    documents: list(config?.documents).map((document) => ({ ...document })),
  };
}
export function normalizePackVersion(version) {
  return {
    ...version,
    config: normalizePackConfig(version.config),
    ...(version.frozen ? { frozen: normalizePackConfig(version.frozen) } : {}),
  };
}
export function normalizePackExecution(execution) {
  return {
    ...execution,
    object: {
      ...execution.object,
      ...(execution.object.snapshot
        ? { snapshot: normalizePackConfig(execution.object.snapshot) }
        : {}),
    },
    operations: list(execution.operations).map(normalizePackOperation),
    slots: list(execution.slots),
    tests: list(execution.tests),
    holds: list(execution.holds),
    reworks: list(execution.reworks),
    history: list(execution.history),
    visits: list(execution.visits),
  };
}
