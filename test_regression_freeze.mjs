import assert from "node:assert/strict";
import test from "node:test";
import { checkRegression, regressionErrors } from "./eval/regression/check.mjs";
import { loadRegressionV1 } from "./eval/regression/v1/load.mjs";

test("v1 stays frozen at 411 questions and the manifest hash matches", () => {
  const loaded = loadRegressionV1();
  assert.equal(loaded.questions.length, 411);
  assert.equal(loaded.manifest.ids.length, 411);
  assert.equal(loaded.thresholds.correctMin, 349);
  assert.equal(loaded.thresholds.incorrectConfidentMax, 0);
  assert.equal(loaded.thresholds.unnecessaryRefusalMax, 0);
  assert.equal(checkRegression(""), true);
});

test("a v1 edit without a new version folder is rejected, and a removed question is rejected", () => {
  assert.deepEqual(regressionErrors({ v1Changed: true, newVersionAdded: false, removedIds: [] }), [
    "eval/regression/v1 changed without a new version folder"
  ]);
  assert.deepEqual(regressionErrors({ v1Changed: true, newVersionAdded: true, removedIds: ["willow-1"] }), [
    "v1 questions removed: willow-1"
  ]);
  assert.deepEqual(regressionErrors({ v1Changed: false, newVersionAdded: false, removedIds: [] }), []);
});
