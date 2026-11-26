// Yehsa AI (on-device): the grounding and prompt layer, tested in Node with the model OFF.
// A fake engine stands in for llama.rn; nothing here loads a model or touches the network.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { aiEligibility, buildMessages, cleanPartial, collectPassages, contentStems, finalizeAiText, relevance, webNotePassages, SYSTEM_PROMPT } from "./symbolic/llm/grounding.js";
import { runAi } from "./symbolic/llm/ai_runner.js";
import { AI_LABEL, LLM_LIMITS, LLM_MODEL } from "./symbolic/llm/model_info.js";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

const lean = { answered: true, kind: "survival", text: "A lean-to is a sloped roof with one open side. It is quick and works well with a fire in front.", source: "Lean-to — a field note" };
const fakeEngine = (reply, calls = []) => ({
  async generate(messages, opts) {
    calls.push({ messages, opts });
    for (const piece of String(reply).match(/.{1,6}/gs) || []) opts.onToken(piece);
    return { text: reply, timings: { predicted_per_second: 7 } };
  }
});

test("medical, urgent, safety and dose questions never reach the model", async () => {
  const calls = [];
  const engine = fakeEngine("Apply pressure [1].", calls);
  const cases = [
    ["how do I stop heavy bleeding", { answered: true, kind: "medical", text: "Serious bleeding needs direct pressure with clean cloth and urgent human help." }],
    ["what is a lean-to", { ...lean, kind: "medical" }],
    ["my friend is not breathing", lean],
    ["how much ibuprofen should I take", lean],
    ["can I rub frostbite with snow", { answered: true, kind: "survival", text: "The note contradicts that premise. Do not rub frostbitten skin." }],
    ["is this mushroom edible", { answered: true, kind: "herbology", text: "Do not eat a mushroom you have not identified." }],
    ["what is 2+2", { answered: true, kind: "calculator", text: "4" }],
    ["what's the weather trend", { answered: true, kind: "weather", text: "Pressure is falling." }]
  ];
  for (const [q, r] of cases) {
    assert.equal(aiEligibility(q, r).ok, false, q);
    const out = await runAi({ question: q, result: r, engine });
    assert.equal(out.state, "skipped", q);
  }
  assert.equal(calls.length, 0);
});

test("misses, abstentions, a switched-off AI and a sensitive web quote are skipped", () => {
  assert.equal(aiEligibility("what is a lean-to", { answered: false, text: "" }).reason, "miss");
  assert.equal(aiEligibility("what is a lean-to", { ...lean, abstain: true }).reason, "abstain");
  assert.equal(aiEligibility("what is a lean-to", lean, { enabled: false }).reason, "off");
  assert.equal(aiEligibility("tylenol dose", null, { webNote: { text: "500 mg", locked: "dosing" } }).ok, false);
  assert.equal(aiEligibility("what is a lean-to", lean).ok, true);
});

test("a how-to answered by numbered steps stands alone; a 'what is' question gets the AI", () => {
  const steps = { answered: true, kind: "survival", text: "Boil it if you can.\n\n1. Boil: bring to a rolling boil for 1 minute.\n2. Filter: use a rated filter." };
  assert.equal(aiEligibility("how do I purify water", steps).reason, "procedure");
  assert.equal(aiEligibility("explain how to purify water", steps).reason, "procedure");
  assert.equal(aiEligibility("what is boiling for", steps).ok, true);
  assert.equal(aiEligibility("how do I make a snare", { answered: true, kind: "dictionary", text: "A noose for catching animals." }).reason, "dictionary-howto");
});

test("passages are numbered, capped, de-duplicated, and carry their sources", () => {
  const long = "word ".repeat(600);
  const r = { answered: true, kind: "survival", text: `${long}`, source: "Big note", hits: [
    { context: "A lean-to roof sheds rain when shingled from the bottom up.", source: "symbolic_books/survival/entries_shelter.json" },
    { context: "Completely unrelated text about magnetic declination and maps.", source: "x" },
    { context: `${long}`, source: "dup" }
  ] };
  const p = collectPassages(r, { question: "lean-to roof rain" });
  assert.equal(p[0].n, 1);
  assert.ok(p[0].text.length <= LLM_LIMITS.passageCharCap);
  assert.ok(p.length <= LLM_LIMITS.maxPassages);
  assert.ok(p.some((x) => x.source === "Yehsa notes: shelter"), "file paths read as Yehsa notes");
  assert.ok(!p.some((x) => /declination/.test(x.text)), "unrelated hits are left out");
  const doc = collectPassages({ answered: true, kind: "document", text: "x", sections: [{ title: null, text: "Congress shall have power to lay taxes. [1]" }, { title: "Sources", text: "[1] ..." }], citations: [{ n: 1, sourceName: "Constitution", ref: "page 3", url: "https://www.archives.gov/" }] });
  assert.equal(doc[0].source, "Constitution, page 3");
  assert.equal(doc[0].url, "https://www.archives.gov/");
  assert.ok(!/\[1\]/.test(doc[0].text), "our own [n] marks are stripped before renumbering");
});

test("web quotes split into one passage per cited source", () => {
  const note = { text: "Hastings was fought in 1066. [1] Harold was killed. [2]", citations: [{ n: 1, sourceName: "Wikipedia", url: "https://en.wikipedia.org/wiki/Battle_of_Hastings" }, { n: 2, sourceName: "Britannica", url: "https://www.britannica.com/" }] };
  const p = webNotePassages(note);
  assert.equal(p.length, 2);
  assert.equal(p[1].source, "Britannica");
  assert.equal(collectPassages(null, { webNote: note })[0].source, "Wikipedia");
});

test("the prompt holds only the question and the numbered passages, with grounding rules", () => {
  const msgs = buildMessages("what is a lean-to", collectPassages(lean));
  assert.equal(msgs.length, 2);
  assert.equal(msgs[0].role, "system");
  assert.match(SYSTEM_PROMPT, /ONLY from the numbered passages/);
  assert.match(SYSTEM_PROMPT, /Never give medicine doses/);
  assert.match(msgs[1].content, /\[1\] \(Lean-to — a field note\) A lean-to is a sloped roof/);
  assert.match(msgs[1].content, /Question: what is a lean-to/);
  assert.ok(!/deviceId|position|latitude|owner/i.test(msgs[1].content));
});

test("invented numbers, names, links and citations are removed; 'no answer' shows nothing", () => {
  const passages = collectPassages(lean);
  const out = finalizeAiText("A lean-to has one open side [1]. Build it 40 feet tall [1]. It was invented by Bob Smith [1]. See https://evil.example [7]. Works well with a fire in front [3].", passages, "what is a lean-to");
  assert.match(out.text, /one open side \[1\]/);
  assert.ok(!/40 feet/.test(out.text));
  assert.ok(!/Bob/.test(out.text));
  assert.ok(!/https?:/.test(out.text));
  assert.ok(!/\[7\]|\[3\]/.test(out.text), "citations to passages that don't exist are dropped");
  assert.ok(out.dropped >= 2);
  assert.deepEqual(out.citations.map((c) => c.n), [1]);
  assert.equal(finalizeAiText("The notes on this phone don't answer that.", passages).empty, true);
  assert.equal(finalizeAiText("Passage [1] is not relevant to tanning.", passages, "how to tan a hide").empty, true);
  assert.equal(cleanPartial("<|im_start|>**Answer**: one open side [1] [9]", passages).includes("[9]"), false);
});

test("an uncited but grounded answer gets the citation of the passage it came from", () => {
  const out = finalizeAiText("A lean-to is a sloped roof with one open side.", collectPassages(lean), "what is a lean-to");
  assert.match(out.text, /\[1\]$/);
  assert.equal(out.grounded, true);
});

test("runAi streams, labels the block 'Yehsa AI (on-device)', and keeps the answer on screen", async () => {
  const updates = [];
  let t = 0;
  const calls = [];
  const out = await runAi({ question: "what is a lean-to", result: lean, engine: fakeEngine("A lean-to is a sloped roof with one open side [1]. It works well with a fire in front [1].", calls), onUpdate: (u) => updates.push(u), throttleMs: 1, now: () => (t += 5) });
  assert.equal(out.state, "done");
  assert.equal(updates[0].state, "thinking");
  assert.ok(updates.some((u) => u.state === "streaming" && u.text.length > 0));
  assert.equal(updates.at(-1).state, "done");
  assert.ok(out.footer.startsWith(AI_LABEL));
  assert.match(out.footer, /\[1\] Lean-to — a field note/);
  assert.equal(calls[0].opts.maxTokens, LLM_LIMITS.maxNewTokens);
  assert.ok(calls[0].opts.stop.includes("<|im_end|>"));
  assert.equal(lean.text.startsWith("A lean-to"), true, "the result object is not changed");
});

test("runAi stays quiet on an off-topic retrieval and reports engine errors without throwing", async () => {
  const misroute = { answered: true, kind: "landscape", text: "Forests hide the sun and the distant ridge. Moss is not a compass." };
  assert.equal((await runAi({ question: "how to tan a hide", result: misroute, engine: fakeEngine("x") })).reason, "off-topic");
  const bad = { async generate() { throw new Error("out of memory"); } };
  const updates = [];
  const out = await runAi({ question: "what is a lean-to", result: lean, engine: bad, onUpdate: (u) => updates.push(u) });
  assert.equal(out.state, "error");
  assert.equal(updates.at(-1).state, "error");
  assert.equal((await runAi({ question: "what is a lean-to", result: lean, engine: null })).reason, "no-engine");
});

test("relevance and content words ignore filler", () => {
  assert.deepEqual(contentStems("how do I tan a hide"), ["tan", "hide"]);
  assert.equal(relevance("tan a hide", "Forests hide the sun"), 0.5);
});

test("the model is bundled by a config plugin with a pinned hash, and is not committed", () => {
  const app = JSON.parse(read("app.json"));
  assert.ok(app.expo.plugins.includes("./plugins/withYehsaLlm.js"));
  const plugin = read("plugins/withYehsaLlm.js");
  for (const v of [LLM_MODEL.file, LLM_MODEL.sha256, LLM_MODEL.url, String(LLM_MODEL.bytes)]) assert.ok(plugin.includes(v), v);
  assert.match(plugin, /noCompress/);
  // AGP reads each asset into the Gradle heap; 2 GB fails on a 1 GB model ("Java heap space").
  assert.match(plugin, /org\.gradle\.jvmargs/);
  assert.match(plugin, /-Xmx6g/);
  assert.match(read(".gitignore"), /^\*\.gguf$/m);
  assert.equal(LLM_MODEL.license, "Apache-2.0");
  assert.ok(LLM_MODEL.bytes < 1.2e9);
});

test("the model stays off the hot path and off app start", () => {
  // Only the native engine touches llama.rn, and only inside a function (lazy require).
  const engine = read("src/phone/llm_engine.native.js");
  assert.ok(!/^import .*llama\.rn/m.test(engine));
  assert.match(engine, /\n\s+const \{ initLlama \} = require\("llama\.rn"\);/);
  for (const f of ["symbolic/ask.js", "symbolic/chat_turn.js", "src/phone/YehsaApp.js", "src/phone/useYehsaAI.js"]) {
    assert.ok(!/llama\.rn/.test(read(f)), `${f} must not import llama.rn`);
  }
  const hot = fs.readdirSync(path.join(ROOT, "symbolic")).filter((f) => /\.(m?js|cjs)$/.test(f));
  for (const f of hot) assert.ok(!/from "\.\/llm\//.test(read(`symbolic/${f}`)), `${f} must not import the AI layer`);
});

test("web and Node builds have no model: the AI reports unavailable", async () => {
  const stub = await import("./src/phone/llm_engine.js");
  assert.equal(stub.llmSupported(), false);
  assert.equal((await stub.llmStatus()).available, false);
  assert.equal(stub.llmEngine(), null);
});

test("More lists Yehsa AI, with a title and a search word", async () => {
  const nav = await import("./src/phone/nav_model.js");
  assert.ok(nav.MORE_ITEMS.some((i) => i.id === "ai"));
  assert.equal(nav.SCREEN_TITLES.ai, "Yehsa AI");
  assert.ok(nav.DESTINATIONS.some((d) => d.id === "ai" && /\bai\b/.test(d.words)));
});
