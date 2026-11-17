import assert from "node:assert/strict";
import test from "node:test";
import {
  AREA_LAYERS, REFUSED_LAYERS, checkRoom, coverageFor, jobProgress, pendingTiles, planArea, runJob, startJob, tileUrl, visibleBox
} from "./symbolic/area_download.js";
import { beforeYouGo, tripPlanText } from "./symbolic/before_you_go.js";

const camp = { latitude: 44.27, longitude: -71.3 };

test("one-tap area shows its size, picks only terrain and elevation, and never a road layer", () => {
  const plan = planArea({ around: { ...camp, radiusKm: 10 } });
  assert.equal(plan.ok, true);
  assert.ok(plan.tiles.length > 4 && plan.tiles.length <= 600);
  assert.ok(plan.bytes > 0);
  assert.match(plan.sizeText, /About \d+/);
  assert.match(plan.sizeText, /No roads or streets/);
  assert.match(plan.sizeText, /Nothing downloads until you tap Download/);
  assert.ok(plan.tiles.every((tile) => tile.layer === "terrain"));
  assert.ok(plan.tiles.every((tile) => /elevation-tiles-prod\/terrarium/.test(tileUrl(tile))));
  assert.ok(AREA_LAYERS.every((layer) => !/road|street|osm/i.test(`${layer.id} ${layer.urlTemplate}`)));
  for (const id of REFUSED_LAYERS) {
    const refused = planArea({ around: camp, layers: ["terrain", id] });
    assert.equal(refused.ok, false);
    assert.match(refused.reason, /Road and street layers are not in this build/);
  }
  const bigger = planArea({ around: { ...camp, radiusKm: 50 } });
  assert.ok(bigger.tiles.length <= 600);
  const vis = planArea({ box: visibleBox(camp, 12) });
  assert.equal(vis.ok, true);
  assert.equal(planArea({}).ok, false);
  assert.equal(checkRoom(plan, { freeBytes: 10 }).ok, false);
  assert.equal(checkRoom(plan, { freeBytes: 1e12 }).ok, true);
});

test("a download needs approval, resumes where it stopped, and stores every tile", async () => {
  const plan = planArea({ around: { ...camp, radiusKm: 5 } });
  assert.equal(startJob(plan, { approved: false }).ok, false);
  const { job } = startJob(plan, { approved: true });
  const saved = new Map();
  const png = new Uint8Array(200).fill(7);
  let calls = 0;
  const controller = new AbortController();
  const flaky = async (url, opts) => {
    calls += 1;
    if (calls === 4) controller.abort();
    if (opts?.signal?.aborted) {
      const err = new Error("aborted");
      err.name = "AbortError";
      throw err;
    }
    return { ok: true, arrayBuffer: async () => png.buffer };
  };
  const first = await runJob({ plan, job, fetchImpl: flaky, saveTile: async (id, key, bytes) => saved.set(key, bytes), signal: controller.signal, concurrency: 1 });
  assert.equal(first.job.status, "paused");
  assert.ok(first.job.done.length > 0 && first.job.done.length < plan.tiles.length);
  let refetched = 0;
  const second = await runJob({ plan, job: first.job, fetchImpl: async () => { refetched += 1; return { ok: true, arrayBuffer: async () => png.buffer }; }, saveTile: async (id, key, bytes) => saved.set(key, bytes) });
  assert.equal(second.job.status, "complete");
  assert.equal(saved.size, plan.tiles.length);
  assert.equal(pendingTiles(second.job, plan).length, 0);
  assert.match(jobProgress(second.job).text, /^Done/);
  assert.equal(refetched, plan.tiles.length - first.job.done.length, "resume skips tiles already stored");
});

test("before you go marks every item with a word and an icon, not colour alone", () => {
  const plan = planArea({ around: { ...camp, radiusKm: 10 } });
  const area = { ...startJob(plan, { approved: true }).job, status: "complete", done: plan.tiles.map((t) => t.key) };
  const ready = beforeYouGo({
    areas: [area],
    target: camp,
    battery: { level: 0.95 },
    gps: { status: "granted" },
    mesh: { ready: true },
    knowledge: { fieldNotes: { survival: 36 } },
    contacts: [{ name: "Sam", phone: "555 0100" }],
    plan: { where: "Mt Washington", backBy: "Sun 6 PM", toldAt: new Date().toISOString() },
    ticked: { regs: true, display: true }
  });
  assert.equal(ready.items.length, 9);
  assert.equal(ready.checks, 0);
  assert.equal(ready.missing, 0);
  for (const entry of ready.items) {
    assert.ok(["ready", "check", "missing"].includes(entry.state));
    assert.ok(entry.icon && entry.label && entry.detail);
  }
  const empty = beforeYouGo({ target: { latitude: 10, longitude: 10 }, battery: { level: 0.2 }, gps: { status: "denied" }, knowledge: { fieldNotes: 0 } });
  const states = Object.fromEntries(empty.items.map((entry) => [entry.id, entry.state]));
  assert.deepEqual(states, { maps: "missing", battery: "missing", gps: "missing", mesh: "check", knowledge: "missing", contacts: "missing", plan: "missing", regs: "check", display: "check" });
  assert.match(empty.summary, /need attention/);
  const partial = coverageFor({ areas: [area] }, { box: { south: 44.2, north: 44.9, west: -71.4, east: -71.2 } });
  assert.equal(partial.state, "check");
  const text = tripPlanText({ where: "Lake trail", backBy: "Sunday 6 PM", party: "Two of us" });
  assert.match(text, /Going to: Lake trail/);
  assert.match(text, /call emergency services/);
});
