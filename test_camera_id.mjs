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
  for (const g of ["plant", "tree", "mushroom", "animal", "track", "scat"]) assert.ok(groups.has(g), `group ${g}`);
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
  assert.ok(Object.keys(credits.classes).length === index.classes.length);
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
