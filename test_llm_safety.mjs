// Yehsa AI (on-device): the grounding, prompt, and safety layer, tested in Node with a fake model.
// The real model never loads in Node tests (src/phone/llm_engine.js is the off stub here).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import { aiEligibility, buildMessages, cleanPartial, collectPassages, finalizeAiText, relevance, webNotePassages, SYSTEM_PROMPT, aiFooter } from "./symbolic/llm/grounding.js";
import { runAi } from "./symbolic/llm/ai_runner.js";
import { AI_LABEL, LLM_LIMITS, LLM_MODEL } from "./symbolic/llm/model_info.js";
import * as offEngine from "./src/phone/llm_engine.js";

const require = createRequire(import.meta.url);

const knots = {
  answered: true,
  kind: "survival",
  symbol: "useful_knots",
  source: "Useful knots — a field note",
  text: "Five knots cover most camp jobs.\n\n1. Bowline: a fixed loop that will not slip and unties easily. Make a small loop, pass the end up through it, around the standing line, and back down the loop.\n2. Taut-line hitch: an adjustable loop for tent lines."
};

function fakeEngine(reply, { chunks = 4 } = {}) {
  const calls = [];
  return {
    calls,
    async generate(messages, { onToken, maxTokens, stop }) {
      calls.push({ messages, maxTokens, stop });
      const size = Math.ceil(reply.length / chunks);
      for (let i = 0; i < reply.length; i += size) onToken(reply.slice(i, i + size));
      return { text: reply };
    }
  };
}

test("model choice: open license, size inside the 2 GB APK budget, plugin and app agree on the file", () => {
  assert.equal(LLM_MODEL.license, "Apache-2.0");
  assert.ok(LLM_MODEL.bytes > 0.6e9 && LLM_MODEL.bytes < 1.2e9);
  assert.match(LLM_MODEL.sha256, /^[0-9a-f]{64}$/);
  const plugin = require("./plugins/withYehsaLlm.js");
  for (const k of ["file", "bytes", "sha256", "url"]) assert.equal(plugin.MODEL[k], LLM_MODEL[k], k);
  const app = JSON.parse(fs.readFileSync("app.json", "utf8"));
  assert.ok(app.expo.plugins.includes("./plugins/withYehsaLlm.js"));
  assert.match(fs.readFileSync(".gitignore", "utf8"), /^\*\.gguf$/m, "weights are never committed");
});

test("never runs on safety, medical, emergency, dosing, plant ID, misses, or tools", () => {
  const ok = (q, r, o) => aiEligibility(q, r, o).ok;
  assert.equal(ok("how do I stop heavy bleeding", { ...knots, kind: "survival" }), false);
  assert.equal(ok("how much ibuprofen should i take", knots), false);
  assert.equal(ok("snake bite what now", knots), false);
  assert.equal(ok("is this an emergency", knots), false);
  assert.equal(ok("what is a bowline", { ...knots, kind: "medical" }), false);
  assert.equal(ok("is yarrow edible", { ...knots, kind: "herbology" }), false);
  assert.equal(ok("what is 2+2", { answered: true, kind: "calculator", text: "4" }), false);
  assert.equal(ok("weather", { answered: true, kind: "weather", text: "Pressure falling" }), false);
  assert.equal(ok("rub snow on frostbite?", { answered: true, kind: "survival", text: "The note contradicts that premise. Do not rub." }), false);
  assert.equal(ok("what is a bowline", { answered: false, text: "" }), false, "a miss is never answered from the model's own knowledge");
  assert.equal(ok("what is a bowline", knots, { enabled: false }), false, "Settings toggle off");
  assert.equal(ok("how do I make a snare", { answered: true, kind: "dictionary", text: "An instrument, a wire loop." }), false);
  assert.equal(ok("who won hastings", null, { webNote: { text: "x [1]", locked: "medical" } }), false);
});

test("a how-to numbered procedure stands alone; a what-is question about it gets the AI", () => {
  assert.deepEqual(aiEligibility("how do I tie a bowline", knots), { ok: false, reason: "procedure" });
  assert.deepEqual(aiEligibility("what is a bowline knot", knots), { ok: true, reason: "grounded" });
});

test("passages: numbered, capped, sources kept, off-topic hits dropped, paths made readable", () => {
  const r = { ...knots, hits: [
    { context: "The bowline knot makes a fixed loop at the end of a line for rescue.", source: "symbolic_books/survival/entries_knots.json" },
    { context: "Division splits a number into equal parts, as in long division.", source: "math" }
  ] };
  const p = collectPassages(r, { question: "what is a bowline knot" });
  assert.equal(p.length, 2);
  assert.deepEqual(p.map((x) => x.n), [1, 2]);
  assert.equal(p[0].source, "Useful knots — a field note");
  assert.equal(p[1].source, "Yehsa notes: knots");
  assert.ok(p.every((x) => x.text.length <= LLM_LIMITS.passageCharCap));
  assert.ok(relevance("what is a bowline knot", p[0].text) >= 0.5);
  const doc = { answered: true, kind: "document", text: "From…", sections: [{ title: null, text: "Quoted body [1]" + " more words".repeat(5) }], citations: [{ n: 1, sourceName: "Canning guide", ref: "page 4", url: "https://example.org/c.pdf" }] };
  const d = collectPassages(doc, { question: "canning guide words" });
  assert.equal(d[0].source, "Canning guide, page 4");
  assert.equal(d[0].url, "https://example.org/c.pdf");
  assert.doesNotMatch(d[0].text, /\[1\]/, "the model gets its own numbers");
});

test("web quotes (Wikipedia / web search, free) split into one passage per cited source", () => {
  const note = { text: "Hastings was fought in 1066. [1] Harold was killed. [2]", citations: [{ n: 1, sourceName: "Wikipedia", url: "https://en.wikipedia.org/wiki/Battle_of_Hastings" }, { n: 2, sourceName: "Britannica", url: "https://www.britannica.com/x" }] };
  const p = webNotePassages(note);
  assert.equal(p.length, 2);
  assert.equal(p[1].source, "Britannica");
  assert.equal(p[0].url, "https://en.wikipedia.org/wiki/Battle_of_Hastings");
});

test("prompt: only the question and the passages, grounded-only rules, no personal data", () => {
  const passages = collectPassages(knots, { question: "what is a bowline knot" });
  const m = buildMessages("what is a bowline knot", passages);
  assert.equal(m.length, 2);
  assert.equal(m[0].content, SYSTEM_PROMPT);
  assert.match(SYSTEM_PROMPT, /ONLY from the numbered passages/);
  assert.match(SYSTEM_PROMPT, /Never give medicine doses/);
  assert.match(m[1].content, /^Passages:\n\[1\] \(Useful knots/);
  assert.match(m[1].content, /Question: what is a bowline knot/);
});

test("output: invented citations, links, made-up numbers, invented names, and meta talk are removed", () => {
  const passages = [{ n: 1, text: "A bowline is a fixed loop that will not slip and unties easily.", source: "Useful knots" }];
  assert.equal(cleanPartial("A loop [1] [7] see https://evil.example now", passages), "A loop [1] see now");
  const f = finalizeAiText("A bowline is a fixed loop that will not slip [1]. It holds 500 kg [1]. It was invented by Admiral Nelson [1]. The passages do not mention strength. It unties easily [3].", passages, "what is a bowline");
  assert.equal(f.text, "A bowline is a fixed loop that will not slip [1]. It unties easily.");
  assert.equal(f.dropped, 3);
  assert.deepEqual(f.citations.map((c) => c.n), [1]);
  assert.equal(finalizeAiText("The notes on this phone don't answer that.", passages).empty, true);
  assert.equal(finalizeAiText("Bowline is a fixed loop that will not slip.", passages, "bowline").text, "Bowline is a fixed loop that will not slip. [1]", "uncited grounded text gets its source");
  assert.match(aiFooter(f), new RegExp(`^${AI_LABEL.replace(/[()]/g, "\\$&")}\\. Sources: \\[1\\] Useful knots\\.$`));
});

test("runner: streams throttled updates, labels the result, and cites; the answer is only added to", async () => {
  const engine = fakeEngine("A bowline is a fixed loop that will not slip and unties easily [1].");
  const updates = [];
  let t = 0;
  const out = await runAi({ question: "what is a bowline knot", result: knots, engine, onUpdate: (u) => updates.push(u), now: () => (t += 100) });
  assert.equal(out.state, "done");
  assert.equal(updates[0].state, "thinking");
  assert.ok(updates.some((u) => u.state === "streaming"));
  assert.equal(updates.at(-1).state, "done");
  assert.match(out.footer, /^Yehsa AI \(on-device\)\. Sources: \[1\] Useful knots/);
  assert.equal(engine.calls[0].maxTokens, LLM_LIMITS.maxNewTokens);
  assert.ok(engine.calls[0].stop.includes("<|im_end|>"));
  assert.equal(knots.text.startsWith("Five knots"), true, "the symbolic answer object is not changed");
});

test("runner: skips without touching the engine for safety routes, off-topic retrieval, and no engine", async () => {
  const engine = fakeEngine("anything");
  assert.equal((await runAi({ question: "how do I stop heavy bleeding", result: knots, engine })).state, "skipped");
  assert.equal((await runAi({ question: "how to tan a hide", result: { answered: true, kind: "landscape", text: "Forests block the sun and slow travel. Moss is not a compass." }, engine })).reason, "off-topic");
  assert.equal((await runAi({ question: "what is a bowline knot", result: knots, engine: null })).reason, "no-engine");
  assert.equal(engine.calls.length, 0);
  const failing = { async generate() { throw new Error("out of memory"); } };
  const err = await runAi({ question: "what is a bowline knot", result: knots, engine: failing });
  assert.equal(err.state, "error");
});

test("Node/web build: the engine is the off stub, so the gates run with the LLM disabled", async () => {
  assert.equal(offEngine.llmSupported(), false);
  assert.equal(offEngine.llmEngine(), null);
  assert.equal((await offEngine.llmStatus()).available, false);
});

test("hot path and startup: nothing on the ask path or at app start imports the model", () => {
  for (const f of ["symbolic/ask.js", "symbolic/chat_turn.js", "symbolic/knowledge_index.js", "index.js", "App.js"]) {
    if (!fs.existsSync(f)) continue;
    assert.doesNotMatch(fs.readFileSync(f, "utf8"), /llama\.rn|symbolic\/llm|llm_engine/, f);
  }
  const engineSrc = fs.readFileSync("src/phone/llm_engine.native.js", "utf8");
  assert.doesNotMatch(engineSrc, /^import .*llama\.rn/m, "llama.rn is required lazily, not imported at module load");
  assert.match(engineSrc, /require\("llama\.rn"\)/);
});
