// Leave-one-out accuracy check for offline camera ID.
// Each reference photo is held out in turn (all of its views are removed from
// the index) and its query embedding is matched against the rest. Negatives
// are photos of things Yehsa has no camera notes for (dandelion, clover, oak,
// fern, lawn, granite, fly agaric, sunflower, plus the non-plant picture-guide
// images); they check how often the screen declines instead of guessing.
//   node eval/camera_id/loo.mjs            print a summary
//   node eval/camera_id/loo.mjs --write    also rewrite eval/camera_id/results.json
import fs from "node:fs";
import raw from "../../assets/camera_id/index.json" with { type: "json" };
import queries from "./queries.json" with { type: "json" };
import { CAMERA_CLASSES, decodeIndex, decodeVector, identify } from "../../src/phone/camera_id_match.js";

const index = decodeIndex(raw);
const dim = index.dim;
const pct = (n, d) => (d ? Math.round((1000 * n) / d) / 10 : 0);

const perClass = Object.fromEntries(index.classes.map((id) => [id, { n: 0, top1: 0, top3: 0, declined: 0 }]));
const bands = { possible: { n: 0, right: 0 }, weak: { n: 0, right: 0 } };
let top1 = 0;
let top3 = 0;
let declined = 0;
let deadlyInTop3 = 0;
let deadlyTrueTopNonDeadly = 0;
let deadlyTrue = 0;
let edibleTrue = 0;
let edibleWithDeadlyShown = 0;
const ms = [];
for (const item of queries.positives) {
  const truth = index.classes[item.c];
  const t0 = performance.now();
  const result = identify(index, decodeVector(item, dim), { excludeSrc: item.src });
  ms.push(performance.now() - t0);
  const rank = result.ranked.map((r) => r.id);
  const stats = perClass[truth];
  stats.n += 1;
  if (rank[0] === truth) { top1 += 1; stats.top1 += 1; }
  if (rank.slice(0, 3).includes(truth)) { top3 += 1; stats.top3 += 1; }
  if (result.status === "declined") { declined += 1; stats.declined += 1; continue; }
  const first = result.suggestions[0];
  if (bands[first.band]) { bands[first.band].n += 1; if (first.id === truth) bands[first.band].right += 1; }
  const truthDeadly = CAMERA_CLASSES[truth].use === "deadly";
  if (truthDeadly) {
    deadlyTrue += 1;
    if (result.suggestions.some((sug) => sug.use === "deadly")) deadlyInTop3 += 1;
    if (CAMERA_CLASSES[first.id].use !== "deadly") {
      deadlyTrueTopNonDeadly += 1;
    }
  }
  if (CAMERA_CLASSES[truth].use === "edible") {
    edibleTrue += 1;
    if (result.suggestions.some((s) => s.use === "deadly") || result.suggestions[0].lookalikes.some((l) => l.deadly)) edibleWithDeadlyShown += 1;
  }
}

const negBands = { declined: 0, possible: 0, weak: 0 };
for (const item of queries.negatives) {
  const result = identify(index, decodeVector(item, dim));
  if (result.status === "declined") negBands.declined += 1;
  else negBands[result.suggestions[0].band] += 1;
}

const n = queries.positives.length;
const summary = {
  model: index.model.name,
  classes: index.classes.length,
  referencePhotos: index.sources.length,
  positives: n,
  negatives: queries.negatives.length,
  top1Pct: pct(top1, n),
  top3Pct: pct(top3, n),
  positivesDeclinedPct: pct(declined, n),
  bandPrecision: Object.fromEntries(Object.entries(bands).map(([k, v]) => [k, { shown: v.n, top1RightPct: pct(v.right, v.n) }])),
  negativesTopBand: negBands,
  negativesDeclinedPct: pct(negBands.declined, queries.negatives.length),
  deadly: {
    heldOutDeadlyPhotos: deadlyTrue,
    topWasNonDeadly: deadlyTrueTopNonDeadly,
    aDeadlyPlantWasInTop3: deadlyInTop3
  },
  edible: { heldOutEdiblePhotos: edibleTrue, aDeadlyLookalikeWasShownOrLinked: edibleWithDeadlyShown },
  perClass: Object.fromEntries(Object.entries(perClass).map(([k, v]) => [k, { n: v.n, top1Pct: pct(v.top1, v.n), top3Pct: pct(v.top3, v.n), declined: v.declined }])),
  matchMsMedian: Math.round(ms.sort((a, b) => a - b)[Math.floor(ms.length / 2)] * 100) / 100
};
console.log(JSON.stringify(summary, null, 2));
if (process.argv.includes("--write")) fs.writeFileSync(new URL("./results.json", import.meta.url), JSON.stringify(summary, null, 2) + "\n");
