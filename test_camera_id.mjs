import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import raw from "./assets/camera_id/index.json" with { type: "json" };
import queries from "./eval/camera_id/queries.json" with { type: "json" };
import notes from "./symbolic_books/herbology/notes.json" with { type: "json" };
import {
  BANDS,
  CAMERA_CLASSES,
  DECLINE_TEXT,
  PHOTO_WARNING,
  decodeIndex,
  decodeVector,
  identify,
  pixelsToInputs
} from "./src/phone/camera_id_match.js";
import { licenseAllowed } from "./symbolic/picture_guide.js";
import { cameraIdAvailable, embedPhoto } from "./src/phone/camera_id_native.js";

const index = decodeIndex(raw);
const noteSymbols = new Set(notes.map((n) => n.symbol));

test("every camera class is something Yehsa has a note for, with look-alike links", () => {
  assert.deepEqual([...index.classes].sort(), Object.keys(CAMERA_CLASSES).sort());
  for (const [id, meta] of Object.entries(CAMERA_CLASSES)) {
    assert.ok(noteSymbols.has(meta.note), `${id} note ${meta.note}`);
    assert.ok(noteSymbols.has(meta.lookalikeNote), `${id} look-alike note`);
    for (const other of meta.lookalikes) assert.ok(CAMERA_CLASSES[other], `${id} -> ${other}`);
  }
});

test("index, model, and credits are complete and permissively licensed", () => {
  assert.equal(raw.model.license, "Apache-2.0");
  assert.equal(raw.model.dim, 1024);
  const model = fs.statSync(`assets/camera_id/${raw.model.file}`);
  assert.ok(model.size > 3e6 && model.size < 6e6);
  assert.ok(index.refs.length >= index.sources.length);
  for (const src of index.sources) {
    assert.ok(src.sourceUrl.startsWith("https://commons.wikimedia.org/"), src.title);
    assert.ok(src.author && src.title);
    assert.equal(licenseAllowed(src.license), true, src.license);
  }
  for (const ref of index.refs) assert.equal(ref.vec.length, 1024);
});

test("a held-out reference photo gets top-3 suggestions with words, warnings, and look-alikes", () => {
  const item = queries.positives.find((p) => index.classes[p.c] === "wild_carrot");
  const result = identify(index, decodeVector(item, index.dim), { excludeSrc: item.src });
  assert.equal(result.status, "match");
  assert.equal(result.suggestions.length, 3);
  assert.equal(result.warning, PHOTO_WARNING);
  for (const s of result.suggestions) {
    assert.match(s.bandText, /^(Possible match|Weak match|Unlikely)$/);
    assert.ok(s.lookalikeNote);
    if (s.use === "edible" || s.use === "medicinal") assert.ok(s.notes.includes(PHOTO_WARNING));
    if (s.use === "deadly") assert.ok(s.notes.some((n) => /deadly/.test(n)));
  }
  const carrot = result.suggestions.find((s) => s.id === "wild_carrot");
  if (carrot) assert.ok(carrot.lookalikes.some((l) => l.deadly));
  assert.doesNotMatch(JSON.stringify(result.suggestions), /safe to eat|edible: yes|confirmed/i);
});

test("nothing close means a decline, not a guess", () => {
  const flat = new Float32Array(1024).fill(0);
  flat[7] = 1;
  const result = identify(index, flat);
  assert.equal(result.status, "declined");
  assert.equal(result.text, DECLINE_TEXT);
  assert.equal(result.suggestions.length, 0);
  assert.equal(result.warning, PHOTO_WARNING);
});

test("leave-one-out floors stay where they were measured", () => {
  let top3 = 0;
  let deadlyShown = 0;
  let deadlyMatched = 0;
  for (const item of queries.positives) {
    const result = identify(index, decodeVector(item, index.dim), { excludeSrc: item.src });
    if (result.ranked.slice(0, 3).some((r) => r.id === index.classes[item.c])) top3 += 1;
    if (result.status === "match" && CAMERA_CLASSES[index.classes[item.c]].use === "deadly") {
      deadlyMatched += 1;
      if (result.suggestions.some((s) => s.use === "deadly")) deadlyShown += 1;
    }
  }
  assert.ok(top3 / queries.positives.length >= 0.85, `top3 ${top3}`);
  assert.equal(deadlyShown, deadlyMatched, "a held-out deadly photo must keep a deadly plant in its top 3");
  let declined = 0;
  for (const item of queries.negatives) if (identify(index, decodeVector(item, index.dim)).status === "declined") declined += 1;
  assert.ok(declined / queries.negatives.length >= 0.6, `declined ${declined}`);
  assert.ok(BANDS.weak < BANDS.possible);
});

test("pixel layout matches the reference preprocessing and mirrors", () => {
  const data = new Uint8Array(224 * 224 * 4);
  data[0] = 255; data[1] = 0; data[2] = 51; data[3] = 255;
  const [plain, mirror] = pixelsToInputs({ data, channels: 4, width: 224, height: 224, depth: 8 });
  assert.equal(plain[0], 1);
  assert.ok(Math.abs(plain[2] - 0.2) < 1e-6);
  const m = 223 * 3;
  assert.equal(mirror[m], 1);
  assert.ok(Math.abs(mirror[m + 2] - 0.2) < 1e-6);
  assert.throws(() => pixelsToInputs({ data, channels: 4, width: 10, height: 10, depth: 8 }));
});

test("web and Node never pretend to run the model", async () => {
  assert.equal(cameraIdAvailable(), false);
  await assert.rejects(() => embedPhoto({ uri: "x" }));
});

test("camera ID stays off the knowledge hot path and is exported as a screen", () => {
  const hot = ["symbolic/ask.js", "symbolic/knowledge_index.js", "symbolic/phone_field.js", "src/phone/YehsaApp.js"];
  for (const file of hot) {
    if (!fs.existsSync(file)) continue;
    assert.doesNotMatch(fs.readFileSync(file, "utf8"), /camera_id|CameraIdScreen|fast-tflite/, file);
  }
  const screens = fs.readFileSync("src/phone/screens_index.js", "utf8");
  assert.match(screens, /CameraIdScreen/);
  const screen = fs.readFileSync("src/phone/CameraIdScreen.js", "utf8");
  assert.match(screen, /expo-image-picker/);
  assert.match(screen, /PHOTO_WARNING/);
  const native = fs.readFileSync("src/phone/camera_id_native.native.js", "utf8");
  assert.match(native, /function loadModel\(\)[\s\S]*require\("react-native-fast-tflite"\)/, "model loads lazily");
});
