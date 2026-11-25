// R8: named-document answers, synthesis, learned-note recall, and their place in Ask.
import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { R8_FLOWS, runR8Flows, DOCS, ROME_Q, SYNTHESIS_Q } from "./eval/dev_r8_flows.mjs";
import { questionParts, isMultiPart, isSynthesisQuestion } from "./symbolic/reasoning/question_parts.js";
import { docReference } from "./symbolic/reasoning/doc_reference.js";
import { buildIndex, search, terms } from "./symbolic/reasoning/bm25.js";
import { reasonedAnswer } from "./symbolic/reasoning/doc_reasoner.js";
import { retrieveLearned, scrubNoteText, noteHasJunk } from "./symbolic/learned_notes.js";
import { findWebNote } from "./symbolic/web/web_notes.js";
import { cleanDocTitle } from "./symbolic/docs/doc_title.js";
import { routeAsk } from "./symbolic/reasoning/ask_route.js";
import { libraryList } from "./symbolic/library/library.js";
import { buildQuestions } from "./eval/questions.mjs";
import { DEV_SET } from "./eval/dev_set.mjs";
import { PARAPHRASE_SET } from "./eval/paraphrase_set.mjs";
import { loadRegressionV1 } from "./eval/regression/v1/load.mjs";

test("Dana's screenshot flows all pass", () => {
  const results = runR8Flows();
  assert.equal(results.length, R8_FLOWS.length);
  for (const r of results) assert.ok(r.pass, `${r.id}: ${r.why}`);
});

test("a many-part question splits into its parts, with instructions kept apart", () => {
  const { parts, instructions } = questionParts(ROME_Q);
  assert.deepEqual(parts.map((p) => p.kind), ["list", "judge", "when"]);
  assert.equal(parts[0].n, 3);
  assert.equal(parts[0].explain, true);
  assert.ok(parts[0].terms.includes("roman") && parts[0].terms.includes("empire"));
  assert.equal(instructions.length, 2);
  const s = questionParts(SYNTHESIS_Q);
  assert.equal(s.parts.length, 6);
  assert.ok(s.topic.includes("civilization"));
  assert.ok(isMultiPart(ROME_Q) && isSynthesisQuestion(SYNTHESIS_Q) && !isSynthesisQuestion(ROME_Q));
  assert.equal(isSynthesisQuestion("What patterns do deer tracks make in snow?"), false);
});

test("a saved document is found by its title, or the latest when it says 'you just read' or 'your saved encyclopedia'", () => {
  assert.equal(docReference(ROME_Q, DOCS).doc.id, "d3");
  assert.equal(docReference("from the encyclopedia, who built the pyramids?", DOCS).doc.id, "d4");
  assert.equal(docReference("what does the document you just read say about rome", DOCS).doc.id, "d4");
  assert.equal(docReference("according to the encyclopedia of world history, when did Rome fall?", DOCS).doc.id, "d3");
  assert.equal(docReference("how do I start a fire", DOCS), null);
  assert.equal(docReference("what is an encyclopedia", DOCS), null);
  assert.equal(docReference(ROME_Q, []), null, "nothing saved: nothing to name");
});

test("BM25 ranks the passage that is about the words", () => {
  const index = buildIndex([{ id: "a", text: "Boil water for a minute." }, { id: "b", text: "The Western Roman Empire fell in 476 when Odoacer deposed the emperor." }, { id: "c", text: "Empire of the ants." }]);
  assert.equal(search(index, terms("roman empire fell"))[0].chunk.id, "b");
});

test("a part the document doesn't answer says so, and a scanned PDF fails clearly", () => {
  const src = { id: "doc:x", title: "Tiny", pageKind: "page", chunks: [{ id: "c1", page: 1, text: "The Western Roman Empire came to an end in 476, when the barbarian chief Odoacer deposed the last emperor in the west." }] };
  const a = reasonedAnswer("Using Tiny you just read: when did the Western Roman Empire fall? What were the three biggest factors that contributed to the fall of the Ming dynasty?", [src]);
  assert.match(a.text, /476/);
  assert.match(a.text, /Not found: I didn't find this/);
  const pdf = fs.readFileSync("symbolic/docs/pdf_text.js", "utf8");
  assert.match(pdf, /mostly pictures of pages \(a scan\)/);
});

test("learned and web notes need the question's subject; junk is skipped and scrubbed", () => {
  const store = { notes: [{ id: "n", title: "Before you hunt", text: "Before you hunt: license, tags, orange.", source: "a chat answer", question: "before you hunt", tags: [], hidden: false }] };
  assert.equal(retrieveLearned("What were the three biggest factors that contributed to the fall of the Roman Empire?", store), null);
  assert.equal(retrieveLearned("before you hunt", store)?.id, "n");
  assert.equal(scrubNoteText("The manual covers it. com, Nov 24, 2026. _=1795557549451"), "The manual covers it.");
  assert.ok(noteHasJunk({ text: "x _=1795557549451" }));
  const web = { notes: [{ id: "w", status: "approved", title: "KUBARK manual", text: "The KUBARK manual covers counterintelligence interrogation. com, Nov 24, 2026. _=1795557549451", question: "what is kubark" }] };
  assert.equal(findWebNote(web, "Using the encyclopedia, what caused the fall of the Roman Empire?"), null);
  assert.equal(findWebNote(web, "what is kubark"), web.notes[0], "the same question still finds its kept note");
});

test("document titles read properly", () => {
  assert.equal(cleanDocTitle("First Children s Encyclopedia"), "First Children's Encyclopedia");
  assert.equal(cleanDocTitle("(PDF) An Encyclopedia of Everything | Academia"), "An Encyclopedia of Everything");
  assert.equal(cleanDocTitle("The Encyclopedia of World History"), "The Encyclopedia of World History");
});

test("no eval, dev, paraphrase or frozen v1 question is routed away from the notes, even with documents saved", () => {
  const ctx = { entries: libraryList({ docs: DOCS }), docs: DOCS };
  const all = [...buildQuestions().map((q) => q.prompt), ...DEV_SET.map((q) => q.prompt), ...PARAPHRASE_SET.map((q) => q.prompt), ...loadRegressionV1().questions.map((q) => q.prompt || q.question)].filter(Boolean);
  assert.ok(all.length > 1300);
  assert.deepEqual(all.filter((q) => routeAsk(q, ctx)), []);
});

test("Ask runs the route before the notes, the reasoner stays off the hot path, and Yes keeps only field answers", () => {
  const app = fs.readFileSync("src/phone/YehsaApp.js", "utf8");
  assert.ok(app.indexOf("routeAsk(effective") < app.indexOf("readAssistant(effective"));
  assert.match(app, /reasonedAnswer\(effective, \[source\]\)/);
  assert.match(app, /synthesize\(effective, sources\)/);
  assert.match(app, /savesAsLearned\(item\.resultKind\)/);
  for (const f of ["symbolic/reasoning/bm25.js", "symbolic/reasoning/doc_reasoner.js", "symbolic/reasoning/question_parts.js", "symbolic/reasoning/doc_reference.js", "symbolic/reasoning/concepts.js", "src/phone/reasoning_sources.js"]) {
    assert.doesNotMatch(fs.readFileSync(f, "utf8"), /\bfetch\(|XMLHttpRequest|WebSocket|anthropic|openai/i, f);
  }
  const hot = fs.readFileSync("symbolic/symbolic_dictionary.js", "utf8");
  assert.doesNotMatch(hot, /reasoning\//);
});
