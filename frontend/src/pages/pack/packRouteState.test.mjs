import { test } from "node:test";
import assert from "node:assert/strict";
import {
  completedOperationNodes,
  operationExecutionState,
  preferredExecutionNode,
} from "./packRouteState.mjs";

const operations = ["assembly", "inspection", "packaging"].map((nodeId) => ({ nodeId }));
const view = (states = []) => ({
  operations,
  visits: [{ nodeId: "assembly", status: "COMPLETED" }],
  allowedActions: { CHECK_IN: true },
  operationStates: states,
});
const state = (nodeId, status, canCheckIn = status === "EXECUTABLE", blockers = []) => ({
  nodeId,
  status,
  canCheckIn,
  blockers,
});

test("a later executable operation never enables check-in on a selected completed or blocked operation", () => {
  const execution = view([
    state("assembly", "COMPLETED", false, ["已完成，返回需返修授权"]),
    state("inspection", "EXECUTABLE"),
    state("packaging", "BLOCKED", false, ["前序检验尚未完成"]),
  ]);
  assert.equal(operationExecutionState(execution, "inspection").canCheckIn, true);
  assert.equal(operationExecutionState(execution, "assembly").canCheckIn, false);
  assert.deepEqual(operationExecutionState(execution, "assembly").blockers, ["已完成，返回需返修授权"]);
  assert.deepEqual(operationExecutionState(execution, "packaging").blockers, ["前序检验尚未完成"]);
});

test("an authorized rework target remains executable despite its completed historical visit", () => {
  const execution = view([
    state("assembly", "EXECUTABLE"),
    state("inspection", "BLOCKED", false, ["请先完成返修工序"]),
  ]);
  assert.equal(operationExecutionState(execution, "assembly").status, "EXECUTABLE");
  assert.equal(operationExecutionState(execution, "assembly").canCheckIn, true);
  assert.equal(preferredExecutionNode(execution), "assembly");
});

test("missing or unknown operation state and contradictory global permission fail closed", () => {
  const execution = view();
  assert.equal(operationExecutionState(execution, "inspection").canCheckIn, false);
  assert.match(operationExecutionState(execution, "inspection").blockers.join(""), /尚未取得/);
  delete execution.operationStates;
  assert.equal(operationExecutionState(execution, "inspection").canCheckIn, false);
  execution.operationStates = [state("inspection", "EXECUTABLE")];
  execution.allowedActions.CHECK_IN = false;
  assert.equal(operationExecutionState(execution, "inspection").canCheckIn, false);
  assert.equal(operationExecutionState(execution, "unknown").canCheckIn, false);
});

test("a current visit at another station remains visible with its server blocking reason", () => {
  const execution = view([
    state("inspection", "RUNNING", false, ["当前访问属于检验工位，请选择匹配工位"]),
  ]);
  execution.visit = { nodeId: "inspection", stationId: "inspection-station" };
  const current = operationExecutionState(execution, "inspection");
  assert.equal(current.status, "RUNNING");
  assert.equal(current.canCheckIn, false);
  assert.match(current.blockers.join(""), /匹配工位/);
});

test("selection prioritizes active visit, explicit view choice, then server executable operation", () => {
  const execution = view([
    state("assembly", "COMPLETED", false),
    state("inspection", "EXECUTABLE"),
    state("packaging", "BLOCKED", false, ["前序未完成"]),
  ]);
  assert.equal(preferredExecutionNode(execution), "inspection");
  assert.equal(preferredExecutionNode(execution, "assembly"), "assembly");
  assert.equal(preferredExecutionNode(execution, "unknown"), "inspection");
  execution.visit = { nodeId: "inspection" };
  assert.equal(preferredExecutionNode(execution, "packaging"), "inspection");
});

test("successful completion moves away from the old node to the next executable node", () => {
  const execution = view([
    state("assembly", "COMPLETED", false),
    state("inspection", "COMPLETED", false),
    state("packaging", "EXECUTABLE"),
  ]);
  assert.equal(preferredExecutionNode(execution), "packaging");
  assert.equal(preferredExecutionNode({ ...execution, operationStates: [] }), "assembly");
  assert.match(operationExecutionState(execution, "inspection").blockers.join(""), /返修授权/);
});

test("a pending retest is selected despite completed visits in the earlier production run", () => {
  const execution = view([
    state("assembly", "COMPLETED", false),
    state("inspection", "BLOCKED", false, ["请选择检验工位执行必需复测"]),
    state("packaging", "BLOCKED", false, ["必需复测未完成"]),
  ]);
  execution.visits = operations.map(({ nodeId }) => ({ nodeId, status: "COMPLETED" }));
  assert.equal(preferredExecutionNode(execution), "inspection");
  assert.deepEqual([...completedOperationNodes(execution)], ["assembly"]);
  assert.equal(completedOperationNodes({ ...execution, operationStates: [] }).size, 0);
  delete execution.operationStates;
  assert.equal(completedOperationNodes(execution).size, 0);
});

test("a normal running visit has no repeated check-in warning", () => {
  const execution = view([state("inspection", "RUNNING", false)]);
  const current = operationExecutionState(execution, "inspection");
  assert.equal(current.status, "RUNNING");
  assert.equal(current.canCheckIn, false);
  assert.deepEqual(current.blockers, []);
});
