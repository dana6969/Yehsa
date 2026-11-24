// Camera ID v2: DINOv2-small embeddings + a linear head with an "I'm not sure" outcome.
// Checks the shipped assets, the not-sure rules, the conifer regression (spruce called Water
// hemlock), hot-path isolation, and (when onnxruntime-node is present) the shipped model end to end.
import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { decode as decodePng } from "fast-png";
import credits from "./assets/camera_id/credits.json" with { type: "json" };
import meta from "./assets/camera_id/classes.json" with { type: "json" };
import raw from "./assets/camera_id/index.json" with { type: "json" };
import fixture from "./eval/camera_id/fixtures/shot8_conifer.json" with { type: "json" };
import oranges from "./eval/camera_id/fixtures/shot9_oranges.json" with { type: "json" };
import cases from "./eval/camera_id/fixtures/round4_cases.json" with { type: "json" };
import { UNSURE_TITLE, decodeIndex, identify, normalize, pixelsToInputs, rankClasses } from "./src/phone/camera_id_match.js";

const index = decodeIndex(raw, meta);
const unit = (row) => normalize(index.weights.slice(row * index.dim, (row + 1) * index.dim));
const CONIFERS = new Set(Object.entries(meta).filter(([, m]) => m.group === "tree" && /conifer|pine|spruce|fir|cedar|hemlock|larch|juniper|yew/i.test(m.title + " " + (m.look || ""))).map(([id]) => id));

test("every class has a name, a use, a look, a caution, and look-alike links that exist", () => {
  assert.equal(index.classes.length, Object.keys(meta).length);
  assert.ok(index.classes.length >= 150, `${index.classes.length} classes`);
  for (const id of index.classes) {
    const m = meta[id];
    assert.ok(m, id);
    assert.ok(m.title && m.group && m.use && m.look && typeof m.caution === "string", id);
    if (m.use === "deadly") assert.ok(m.caution, `${id} needs a caution`);
    for (const other of m.lookalikes || []) assert.ok(meta[other], `${id} -> ${other}`);
  }
  const groups = new Set(Object.values(meta).map((m) => m.group));
  for (const g of ["plant", "tree", "mushroom", "animal", "track", "scat", "everyday"]) assert.ok(groups.has(g), `group ${g}`);
});

test("mushrooms and deadly plants point at their deadly look-alikes", () => {
  for (const [id, m] of Object.entries(meta)) {
    if (m.use === "edible" && m.group === "mushroom") assert.ok((m.lookalikes || []).some((o) => meta[o]?.use === "deadly"), `${id} edible mushroom needs a deadly look-alike`);
  }
  for (const id of ["water_hemlock", "poison_hemlock", "death_camas", "death_cap", "destroying_angel"]) assert.equal(meta[id]?.use, "deadly", id);
});

test("shipped assets are small, licensed, and complete", () => {
  const model = fs.statSync(`assets/camera_id/${raw.model.file}`);
  assert.ok(model.size < 26e6, `model ${model.size}`);
  assert.equal(raw.model.dim, 384);
  assert.ok(fs.statSync("assets/camera_id/index.json").size < 400e3);
  assert.ok(raw.thresholds.possible > raw.thresholds.weak && raw.thresholds.weak > 0.1);
  const wildClasses = index.classes.filter((id) => meta[id].group !== "everyday");
  assert.ok(Object.keys(credits.classes).length === wildClasses.length);
  const sample = Object.values(credits.classes)[0];
  assert.ok(Array.isArray(sample) && sample.length > 3);
});

test("a photo that looks like a class gets that class, with the photo-hint framing", () => {
  const checked = ["yarrow", "red_maple", "balsam_fir"].filter((id) => index.classes.includes(id));
  assert.ok(checked.length >= 2);
  for (const id of checked) {
    const q = unit(index.classes.indexOf(id));
    const r = identify(index, q);
    assert.equal(r.status, "match", id);
    assert.equal(r.suggestions[0].id, id);
    assert.match(r.text, /photo hint, not an identification/);
    assert.ok(r.warning && r.emergency);
  }
});

test("a photo that looks like nothing in the set says 'I'm not sure'", () => {
  const q = unit(index.classes.length); // the "something else" row
  const r = identify(index, q);
  assert.equal(r.status, "unsure");
  assert.equal(r.title, UNSURE_TITLE);
  assert.deepEqual(r.suggestions, []);
  // A flat, featureless vector must not produce a confident match either.
  const flat = identify(index, new Float32Array(index.dim).fill(1));
  assert.ok(flat.status === "unsure" || flat.suggestions[0].band !== "possible");
});

test("a deadly plant is flagged when it is in the top three", () => {
  const id = "water_hemlock";
  const r = identify(index, unit(index.classes.indexOf(id)));
  assert.equal(r.status, "match");
  assert.ok(r.suggestions[0].notes.some((n) => /deadly/i.test(n)));
});

test("regression: a balsam-fir / spruce shot is never called Water hemlock", () => {
  const q = normalize(Float32Array.from(fixture.embedding));
  const r = identify(index, q);
  const { ranked } = rankClasses(index, q);
  const deadlyUmbels = new Set(["water_hemlock", "poison_hemlock", "death_camas"]);
  if (r.status === "match") {
    assert.ok(!deadlyUmbels.has(r.suggestions[0].id), `top was ${r.suggestions[0].id}`);
    assert.ok(CONIFERS.has(r.suggestions[0].id), `top was ${r.suggestions[0].id}`);
  }
  assert.ok(!deadlyUmbels.has(ranked[0].id));
});

test("camera, compass and radio modules are not reachable from the Ask hot path", () => {
  for (const file of ["symbolic/ask.js", "symbolic/knowledge_index.js", "symbolic/knowledge_rank.js", "symbolic/field_guide.js"]) {
    if (!fs.existsSync(file)) continue;
    const imports = fs.readFileSync(file, "utf8").split("\n").filter((line) => /^\s*(import|export)\b.*\bfrom\b|\brequire\(|\bimport\(/.test(line)).join("\n");
    assert.ok(!/camera_id|compass|radio|wmm|onnxruntime/.test(imports), file);
  }
});

let ort = null;
try {
  ort = await import("onnxruntime-node");
} catch {
  ort = null;
}

test("the shipped ONNX model reproduces the stored embedding of the conifer photo", { skip: ort ? false : "onnxruntime-node not installed" }, async () => {
  const png = decodePng(fs.readFileSync("eval/camera_id/fixtures/shot8_conifer_224.png"));
  const [plain, mirror] = pixelsToInputs(png, raw.model);
  const session = await ort.InferenceSession.create(`assets/camera_id/${raw.model.file}`);
  const run = async (data) => {
    const out = await session.run({ pixel_values: new ort.Tensor("float32", data, [1, 3, 224, 224]) });
    return normalize(out.last_hidden_state.data.slice(0, raw.model.dim));
  };
  const a = await run(plain);
  const b = await run(mirror);
  const mean = new Float32Array(a.length);
  for (let i = 0; i < a.length; i += 1) mean[i] = (a[i] + b[i]) / 2;
  const q = normalize(mean);
  const ref = normalize(Float32Array.from(fixture.embedding));
  let dot = 0;
  for (let i = 0; i < q.length; i += 1) dot += q[i] * ref[i];
  assert.ok(dot > 0.995, `cosine to the Python embedding was ${dot}`);
  const r = identify(index, q);
  assert.ok(r.status === "unsure" || CONIFERS.has(r.suggestions[0].id), r.status === "match" ? r.suggestions[0].id : "");
});

// ---- Round 4: grocery oranges, the everyday domain gate, and no verdicts from the camera ----

const WILD_GROUPS = new Set(["plant", "tree", "mushroom", "animal", "track", "scat"]);
const EVERYDAY = index.classes.filter((id) => meta[id].group === "everyday");

test("round 4 regression: a bag of supermarket oranges is 'I'm not sure', never a mushroom", () => {
  const q = normalize(Float32Array.from(oranges.embedding));
  const r = identify(index, q);
  const { ranked, everydayTop } = rankClasses(index, q);
  assert.equal(r.status, "unsure");
  assert.equal(r.title, UNSURE_TITLE);
  assert.deepEqual(r.suggestions, []);
  assert.equal(r.domain, "everyday");
  assert.equal(everydayTop.id, "ev_citrus", `everyday top was ${everydayTop.id}`);
  assert.ok(ranked[0].id === "ev_citrus", `top class was ${ranked[0].id}`);
  assert.match(r.text, /Grocery food and household objects are not in the set/);
  // No species name, no toxicity, no emergency line on a grocery photo.
  // Values only: the key names ("deadlyLine") are not shown to anyone.
  const shown = [r.title, r.text, r.quiet, r.deadlyLine, r.emergency].join(" | ");
  assert.ok(!/Jack-o|Omphalotus|toxic|deadly|edible|mushroom/i.test(shown), shown);
  assert.deepEqual(r.deadlyNearby, []);
});

test("everyday photos (food, packaging, household things, hands, pets) never get a species name", () => {
  assert.ok(EVERYDAY.length >= 12, `${EVERYDAY.length} everyday classes`);
  assert.ok(cases.everyday.length >= 30);
  for (const item of cases.everyday) {
    const r = identify(index, normalize(Float32Array.from(item.embedding)));
    assert.equal(r.status, "unsure", `${item.id} photo ${item.photo}`);
    assert.deepEqual(r.suggestions, [], `${item.id} photo ${item.photo}`);
  }
});

test("New England look-alike pairs stay in domain and keep their true class in the top three", () => {
  assert.ok(cases.lookalikes.length >= 20);
  let kept = 0;
  let gated = 0;
  for (const item of cases.lookalikes) {
    const q = normalize(Float32Array.from(item.embedding));
    const r = identify(index, q);
    if (r.domain === "everyday") gated += 1;
    const wild = rankClasses(index, q).ranked.filter((x) => WILD_GROUPS.has(meta[x.id].group)).slice(0, 3).map((x) => x.id);
    if (wild.includes(item.id)) kept += 1;
  }
  assert.equal(gated, 0, "a wild photo was called an everyday thing");
  assert.ok(kept / cases.lookalikes.length >= 0.8, `true class in top three for ${kept}/${cases.lookalikes.length}`);
});

test("toxic and deadly classes need a higher score than the weak bar", () => {
  const th = raw.thresholds;
  assert.ok(th.toxic >= th.possible && th.weak >= 0.4, JSON.stringify(th));
  // A synthetic query that scores just above weak for a toxic class must not be a match.
  const id = "jack_o_lantern";
  const row = index.classes.indexOf(id);
  const q = unit(row);
  const strong = identify(index, q);
  assert.ok(strong.status === "match" || strong.status === "unsure");
  const blend = new Float32Array(index.dim);
  const flat = unit(index.classes.indexOf("balsam_fir"));
  for (let i = 0; i < blend.length; i += 1) blend[i] = 0.35 * q[i] + 0.65 * flat[i];
  const r = identify(index, normalize(blend));
  if (r.status === "match") assert.notEqual(r.suggestions[0].id, id);
});

test("a match never says the thing is safe to eat, and a grocery result carries no toxicity text", () => {
  for (const id of ["yarrow", "wild_carrot", "chanterelle", "red_maple"].filter((x) => index.classes.includes(x))) {
    const r = identify(index, unit(index.classes.indexOf(id)));
    if (r.status !== "match") continue;
    const text = JSON.stringify(r);
    assert.ok(!/you can eat|safe to eat|is edible|edible\b.*photo/i.test(r.text + (r.warning || "")), text);
    assert.match(r.warning, /Never eat|never eat/i);
  }
});

test("the shipped ONNX model reproduces the stored embedding of the oranges photo and declines it", { skip: ort ? false : "onnxruntime-node not installed" }, async () => {
  const png = decodePng(fs.readFileSync("eval/camera_id/fixtures/shot9_oranges_224.png"));
  const [plain, mirror] = pixelsToInputs(png, raw.model);
  const session = await ort.InferenceSession.create(`assets/camera_id/${raw.model.file}`);
  const run = async (data) => {
    const out = await session.run({ pixel_values: new ort.Tensor("float32", data, [1, 3, 224, 224]) });
    return normalize(out.last_hidden_state.data.slice(0, raw.model.dim));
  };
  const a = await run(plain);
  const b = await run(mirror);
  const mean = new Float32Array(a.length);
  for (let i = 0; i < a.length; i += 1) mean[i] = (a[i] + b[i]) / 2;
  const q = normalize(mean);
  const ref = normalize(Float32Array.from(oranges.embedding));
  let dot = 0;
  for (let i = 0; i < q.length; i += 1) dot += q[i] * ref[i];
  assert.ok(dot > 0.995, `cosine to the Python embedding was ${dot}`);
  const r = identify(index, q);
  assert.equal(r.status, "unsure");
  assert.deepEqual(r.suggestions, []);
});
