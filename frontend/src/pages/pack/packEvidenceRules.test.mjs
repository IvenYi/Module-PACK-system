import { test } from "node:test";
import assert from "node:assert/strict";
import {
  latestCurrentTest,
  reviewCurrentEvidence,
  humanTestPayload,
} from "./packEvidenceRules.mjs";
test("current evidence isolates route node, assembly revision, invalidation and latest failed retest", () => {
  const visits = [
    { id: "v1", nodeId: "assembly" },
    { id: "v2", nodeId: "inspection" },
  ];
  const tests = [
    {
      id: "1",
      visitId: "v1",
      actionCode: "CHECK",
      assemblyRevision: 2,
      validEvidence: true,
      mesResult: "PASS",
      createdAt: "2026-10-23T10:00:00",
    },
    {
      id: "2",
      visitId: "v2",
      actionCode: "CHECK",
      assemblyRevision: 1,
      validEvidence: true,
      mesResult: "PASS",
    },
    {
      id: "3",
      visitId: "v2",
      actionCode: "CHECK",
      assemblyRevision: 2,
      validEvidence: false,
      mesResult: "PASS",
    },
    {
      id: "4",
      visitId: "v2",
      actionCode: "CHECK",
      assemblyRevision: 2,
      validEvidence: true,
      mesResult: "PASS",
      createdAt: "2026-10-23T10:01:00",
    },
    {
      id: "5",
      visitId: "v2",
      actionCode: "CHECK",
      assemblyRevision: 2,
      validEvidence: true,
      mesResult: "FAIL",
      createdAt: "2026-10-23T10:02:00",
    },
  ];
  assert.equal(
    latestCurrentTest(tests, visits, "inspection", "CHECK", 2).id,
    "5",
  );
  assert.equal(
    latestCurrentTest(tests, visits, "assembly", "CHECK", 3),
    undefined,
  );
});
test("quality review flags an installed child on hold and does not reuse old revision pass", () => {
  const result = reviewCurrentEvidence({
    object: {
      assemblyRevision: 2,
      snapshot: {
        operations: [
          {
            nodeId: "op",
            name: "装配检验",
            actions: [
              {
                code: "BIND",
                type: "ASSEMBLE",
                required: true,
                slotCodes: ["A"],
              },
              { code: "TEST", type: "MEASURE", required: true },
            ],
          },
        ],
      },
    },
    slots: [{ slotCode: "A", child: { qualityState: "HOLD" } }],
    visits: [],
    tests: [
      {
        id: "1",
        nodeId: "op",
        actionCode: "TEST",
        assemblyRevision: 1,
        validEvidence: true,
        mesResult: "PASS",
      },
    ],
  });
  assert.deepEqual(
    result.map((row) => row.result),
    ["INCOMPLETE", "INCOMPLETE"],
  );
});
test("human raw readings preserve decimal text and false is NG evidence, never a missing value", () => {
  const action = {
    code: "T",
    source: "HUMAN",
    checks: [
      { code: "V", name: "电压", kind: "NUMBER", unit: "V", required: true },
      { code: "OK", kind: "BOOLEAN", required: true },
    ],
  };
  assert.deepEqual(
    humanTestPayload(action, { V: "3.140000000000000001", OK: "false" }).values,
    [
      { code: "V", value: "3.140000000000000001", unit: "V" },
      { code: "OK", value: false },
    ],
  );
  assert.throws(
    () =>
      humanTestPayload({ ...action, source: "DEVICE" }, { V: "3", OK: "true" }),
    /设备/,
  );
  assert.throws(
    () => humanTestPayload(action, { V: "Infinity", OK: "true" }),
    /无效/,
  );
  assert.throws(() => humanTestPayload(action, { V: "3", OK: "" }), /填写/);
});

test("cross-operation rework enters only the server-approved phase and station", async () => {
  const { controlledReworkTarget } = await import("./packEvidenceRules.mjs");
  const repair = {
    activeRework: {
      allowedTargets: [
        { nodeId: "assembly", stationIds: ["repair-station"], phase: "REPAIR" },
      ],
    },
  };
  assert.equal(
    controlledReworkTarget(repair, "assembly", "repair-station"),
    true,
  );
  assert.equal(controlledReworkTarget(repair, "test", "test-station"), false);
  assert.equal(
    controlledReworkTarget(repair, "assembly", "unapproved-station"),
    false,
  );
  const retest = {
    activeRework: {
      allowedTargets: [
        { nodeId: "test", stationIds: ["test-station"], phase: "RETEST" },
      ],
    },
  };
  assert.equal(controlledReworkTarget(retest, "test", "test-station"), true);
  assert.equal(
    controlledReworkTarget(retest, "assembly", "repair-station"),
    false,
  );
  assert.equal(
    controlledReworkTarget(
      { activeRework: { allowedTargets: [] } },
      "test",
      "test-station",
    ),
    false,
  );
});
