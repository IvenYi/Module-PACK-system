import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizePackVersion,
  normalizePackExecution,
} from "../../api/packNormalization.mjs";
test("legal sparse standard actions render and copy into editable arrays without changing source snapshots", () => {
  const config = {
    outputType: "MODULE",
    productId: "material",
    operations: [
      {
        nodeId: "assembly",
        stationIds: ["s1"],
        actions: [
          { code: "BIND", type: "ASSEMBLE", source: "HUMAN", slotCodes: ["A"] },
        ],
      },
      {
        nodeId: "test",
        stationIds: ["s2"],
        actions: [
          {
            code: "V",
            type: "MEASURE",
            source: "HUMAN",
            checks: [
              { code: "voltage", kind: "NUMBER", min: 3, max: 4, unit: "V" },
            ],
          },
        ],
      },
    ],
    bom: [{ slotCode: "A", materialId: "cell" }],
  };
  const original = structuredClone(config);
  const version = normalizePackVersion({ id: "v", config, frozen: config });
  assert.deepEqual(version.config.operations[0].actions[0].checks, []);
  assert.deepEqual(version.config.operations[1].actions[0].slotCodes, []);
  assert.deepEqual(version.config.documents, []);
  assert.deepEqual(version.config.operations[0].documents, []);
  version.config.operations[0].actions[0].checks.push({ code: "draft" });
  version.config.operations[0].stationIds.push("new");
  assert.deepEqual(config, original);
  assert.deepEqual(version.frozen.operations[0].actions[0].checks, []);
  assert.equal(version.config.operations[1].actions[0].checks[0].min, 3);
  assert.equal(version.config.operations[0].actions[0].required, true);
});
test("command readback and reception-only snapshots use the same canonical optional array contract", () => {
  const execution = normalizePackExecution({
    object: {
      id: "cell",
      snapshot: { productCode: "CELL", productName: "电芯" },
    },
    operations: [
      {
        nodeId: "n",
        stationIds: [],
        actions: [
          {
            code: "I",
            type: "MANUAL_INSPECT",
            source: "HUMAN",
            checks: [],
            required: false,
          },
        ],
      },
    ],
    tests: [],
  });
  assert.deepEqual(execution.operations[0].actions[0].slotCodes, []);
  assert.equal(execution.operations[0].actions[0].required, false);
  assert.equal(execution.object.snapshot.productCode, "CELL");
  assert.deepEqual(execution.object.snapshot.operations, []);
  assert.deepEqual(execution.history, []);
});
