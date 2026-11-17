// Offline meaning matcher: tokenizer parity, index format and freshness, the treatment hard rule,
// hot-path isolation, and (when the bundled model is present) end-to-end checks through Ask.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { tokenize } from "./symbolic/meaning/embedder.js";
import { modelAvailable } from "./symbolic/meaning/embed_node.js";
import { fnv1a } from "./symbolic/meaning/hash.js";
import { base64ToBytes, bytesToBase64, packIndex, quantize, scoreAll, unpackIndex } from "./symbolic/meaning/int8_index.js";
import { splitQuestion } from "./symbolic/meaning/meaning_layer.js";
import { fieldNotes } from "./symbolic/meaning/note_corpus.js";
import notesIndex from "./symbolic/meaning/notes_index.js";
import { CARE_NOTES, MEDICATION_NOTES, namedConditions, treatmentGuard } from "./symbolic/meaning/treatment_guard.js";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const withModel = { skip: modelAvailable() ? false : "bundled meaning model not present" };

test("WordPiece ids match the reference tokenizer of the bundled model", () => {
  const cases = [
    ["How do I stop a nosebleed?", [101, 2129, 2079, 1045, 2644, 1037, 4451, 3468, 2098, 1029, 102]],
    ["Café naïve résumé — it's 5°C, don't!!", [101, 7668, 15743, 13746, 1517, 2009, 1005, 1055, 1019, 7737, 2278, 1010, 2123, 1005, 1056, 999, 999, 102]],
    ["My buddy's leg looks bent wrong after he fell off the ledge", [101, 2026, 8937, 1005, 1055, 4190, 3504, 6260, 3308, 2044, 2002, 3062, 2125, 1996, 18283, 102]],
    ["Pneumothorax & hypothermia: what's 2+2?", [101, 1052, 2638, 2819, 29288, 2527, 2595, 1004, 1044, 22571, 14573, 2121, 10092, 1024, 2054, 1005, 1055, 1016, 1009, 1016, 1029, 102]]
  ];
  for (const [text, ids] of cases) assert.deepEqual(tokenize(text, 512), ids, text);
  assert.equal(tokenize("word ".repeat(400), 96).length, 96);
});

test("int8 index packs, unpacks, and scores like the float vectors", () => {
  const a = Float32Array.from([0.6, 0.8, 0]);
  const b = Float32Array.from([0, 0.6, 0.8]);
  const index = unpackIndex(base64ToBytes(bytesToBase64(packIndex(quantize([a, b])))));
  assert.equal(index.rows, 2);
  assert.equal(index.dims, 3);
  const scores = scoreAll(index, a);
  assert.ok(Math.abs(scores[0] - 1) < 0.01);
  assert.ok(Math.abs(scores[1] - 0.48) < 0.01);
});

test("the shipped meaning index covers every approved field note with its current text", () => {
  const shipped = new Map(notesIndex.notes.map((note) => [note.symbol, note]));
  const notes = fieldNotes();
  assert.ok(notes.length >= 90);
  for (const note of notes) {
    const entry = shipped.get(note.symbol);
    assert.ok(entry, `${note.symbol} is missing; run node symbolic/tools/build_meaning_index.mjs --notes`);
    assert.equal(entry.hash, fnv1a(note.text), `${note.symbol} changed; rebuild the meaning index`);
  }
  assert.equal(notesIndex.notes.length, notes.length);
  const modelFile = path.join(ROOT, "assets/meaning", notesIndex.modelFile);
  if (fs.existsSync(modelFile)) assert.ok(fs.statSync(modelFile).size > 20e6);
});

test("hard rule: a care or medication note is not attached to an unrelated injury", () => {
  assert.equal(treatmentGuard("I twisted my ankle and it is swollen", "epinephrine_auto") !== null, true);
  assert.equal(treatmentGuard("I twisted my ankle and it is swollen", "tourniquet_last_resort") !== null, true);
  assert.equal(treatmentGuard("I twisted my ankle and it is swollen", "burn_cool_water") !== null, true);
  assert.equal(treatmentGuard("I twisted my ankle and it is swollen", "sprain_rice"), null);
  assert.equal(treatmentGuard("His lips are swelling after a bee sting and he is wheezing", "epinephrine_auto"), null);
  assert.notEqual(treatmentGuard("I feel tired after the hike", "epinephrine_auto"), null);
  assert.notEqual(treatmentGuard("My hand got a small scrape", "yarrow_achillea"), null);
  assert.equal(treatmentGuard("What plant is used on a small bleeding scrape?", "yarrow_achillea"), null);
  assert.notEqual(treatmentGuard("I have diarrhea, should I use a tourniquet?", "tourniquet_last_resort"), null);
  assert.notEqual(treatmentGuard("How many calories does a runner burn?", "epinephrine_auto"), null);
  assert.deepEqual(namedConditions("How many calories does a marathon runner burn?"), []);
  for (const symbol of MEDICATION_NOTES) assert.ok(CARE_NOTES[symbol], `${symbol} needs its conditions listed`);
});

test("getMappedAction does not import the meaning matcher or any model runtime", () => {
  const seen = new Set();
  const visit = (file) => {
    if (seen.has(file)) return;
    seen.add(file);
    const source = fs.readFileSync(file, "utf8");
    const specs = [...source.matchAll(/(?:import\s[^"']*?from\s*|import\s*\(\s*|require\(\s*)["']([^"']+)["']/g)].map((m) => m[1]);
    for (const spec of specs) {
      assert.ok(!/onnxruntime|meaning\//.test(spec), `${path.relative(ROOT, file)} imports ${spec}`);
      if (!spec.startsWith(".")) continue;
      const next = path.resolve(path.dirname(file), spec);
      if (fs.existsSync(next) && fs.statSync(next).isFile()) visit(next);
    }
  };
  visit(path.join(ROOT, "symbolic/symbolic_dictionary.js"));
  assert.ok(seen.size >= 1);
});

test("multi-part questions split into parts of three or more words", () => {
  assert.deepEqual(splitQuestion("How do I make stream water safe, and also how do I signal a helicopter?"), [
    "How do I make stream water safe",
    "how do I signal a helicopter?"
  ]);
  assert.deepEqual(splitQuestion("How do I stop a nosebleed?"), []);
  assert.deepEqual(splitQuestion("salt and pepper"), []);
});

test("Ask with meaning: never pairs a treatment note with an unrelated injury", withModel, async () => {
  const { askWithMeaning } = await import("./symbolic/ask.js");
  const cases = [
    ["I twisted my knee playing soccer and it hurts", ["epinephrine", "tourniquet", "abdominal thrusts", "chest thrusts"]],
    ["I rolled my ankle on a rock and it's swollen", ["epinephrine", "tourniquet", "butter"]],
    ["My sunburn stings, what can I do?", ["epinephrine", "tourniquet", "abdominal"]],
    ["I have a small scrape on my hand from a rock", ["epinephrine", "tourniquet", "cpr", "yarrow"]],
    ["How do I use a tourniquet to treat dehydration?", ["tourniquet is a last resort for"]],
    ["My kid has a nosebleed after bumping his nose", ["tourniquet", "epinephrine"]]
  ];
  for (const [question, banned] of cases) {
    const result = await askWithMeaning(question, { agents: false });
    const text = String(result.text || "").toLowerCase();
    for (const word of banned) assert.ok(!text.includes(word), `${question} -> ${text.slice(0, 120)}`);
    if (result.symbol && CARE_NOTES[result.symbol]) assert.equal(treatmentGuard(question, result.symbol), null, question);
  }
});

test("Ask with meaning: fills reworded questions and stays silent off topic", withModel, async () => {
  const { askWithMeaning, ask } = await import("./symbolic/ask.js");
  const filled = await askWithMeaning("Blood keeps dripping out of my kid's nostrils, what should I do?", { agents: false });
  assert.match(filled.text, /lean forward/i);
  assert.equal(ask("Blood keeps dripping out of my kid's nostrils, what should I do?", { agents: false }).answered, false);
  for (const question of ["How do I knit a cable sweater?", "What is a good recipe for chocolate cake?", "How do I summon a helicopter strike?"]) {
    const result = await askWithMeaning(question, { agents: false });
    assert.equal(result.answered, false, `${question} -> ${result.text}`);
  }
  const both = await askWithMeaning("How do I make stream water safe, and also how do I signal a helicopter?", { agents: false });
  assert.match(both.text, /boil/i);
  assert.match(both.text, /three/i);
});

test("Ask with meaning: emergencies are detected from described signs", withModel, async () => {
  const { askWithMeaning } = await import("./symbolic/ask.js");
  assert.equal((await askWithMeaning("His lips are turning blue and he won't wake up", { agents: false })).emergency, true);
  assert.equal((await askWithMeaning("How do I tie a knot for a tarp ridge line?", { agents: false })).emergency, false);
});

test("Ask with meaning: scripture by meaning keeps exact references", withModel, async () => {
  const { askWithMeaning } = await import("./symbolic/ask.js");
  const exact = await askWithMeaning("What does John 3:16 say in the KJV?", { agents: false });
  assert.match(exact.text, /God so loved/);
  const water = await askWithMeaning("What does the Tao Te Ching say about water being soft?", { agents: false });
  assert.match(water.text, /soft and weak than water/);
  const shepherd = await askWithMeaning("Is there a psalm about God being my shepherd?", { agents: false });
  assert.match(shepherd.text, /The LORD is my shepherd/);
});

test("phone ask path uses the same meaning layer", withModel, async () => {
  const { prepareMeaning } = await import("./symbolic/meaning/meaning_node.js");
  const { askField } = await import("./symbolic/phone_field.js");
  const books = JSON.parse(fs.readFileSync(path.join(ROOT, "symbolic_memory/books_index.json"), "utf8"));
  const question = "She collapsed and isn't breathing, how hard and fast do I push on her chest?";
  const lexical = askField(question, books.passages);
  const meaning = await prepareMeaning(question, { replies: [lexical.text].filter(Boolean) });
  const result = askField(question, books.passages, { meaning });
  assert.match(result.text, /100 to 120/);
  assert.equal(result.emergency, true);
  const sprain = askField("I twisted my knee playing soccer and it hurts", books.passages, {
    meaning: await prepareMeaning("I twisted my knee playing soccer and it hurts")
  });
  assert.ok(!/epinephrine|tourniquet/i.test(String(sprain.text || "")));
});
