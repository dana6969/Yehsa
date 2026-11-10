import assert from "node:assert/strict";
import test from "node:test";
import { askField } from "./symbolic/phone_field.js";
import { sendToModel } from "./src/phone/model_client.js";
import {
  applyLearnedReview,
  approveLearned,
  emptyLearned,
  learnedSummary,
  markHelpful,
  markNotRight,
  openLearned,
  proposeLearned,
  rememberPhrase,
  resetLearned,
  retrieveLearned,
  reviewLearned
} from "./symbolic/learned_notes.js";

const passages = [{
  symbol: "frostbite_note",
  title: "Frostbite",
  source: "symbolic_memory/survival_skills.txt",
  context: "Do not rub frostbite with snow. Warm the skin against your body instead."
}];

test("a learned note is retrieved for a paraphrase only after approval", () => {
  const store = emptyLearned("phone-a");
  const proposal = proposeLearned({
    title: "Tarp cache",
    text: "The blue tarp cache is behind the north boulder.",
    source: "your correction",
    question: "where is the tarp cache",
    tags: ["camp"]
  });
  assert.equal(store.notes.length, 0);
  assert.equal(retrieveLearned("where is the tarp cache", store), null);
  const saved = rememberPhrase(approveLearned(store, proposal), "blue stash", "tarp cache");
  const hit = askField("where is the blue stash", passages, { learned: saved });
  assert.equal(hit.kind, "learned");
  assert.match(hit.text, /Learned on this device from your correction/);
  assert.match(hit.text, /north boulder/);
});

test("Not right hides a learned note, a safety note wins, and reset clears the store", () => {
  const proposal = proposeLearned({
    id: "bad-frost",
    title: "Frostbite tip",
    text: "Rub the frostbite with snow.",
    source: "a connected model",
    question: "Should I rub frostbite with snow?"
  });
  const saved = approveLearned(emptyLearned("phone-a"), proposal);
  const asked = askField("Should I rub frostbite with snow?", passages, { learned: saved });
  assert.match(asked.text, /Do not rub frostbite with snow/);
  assert.doesNotMatch(asked.text, /Learned on this device/);
  const good = approveLearned(emptyLearned("phone-a"), proposeLearned({
    id: "cache",
    title: "Tarp cache",
    text: "The cache is behind the north boulder.",
    source: "your field log",
    question: "where is the tarp cache"
  }));
  const hidden = markNotRight(good, "cache");
  assert.equal(retrieveLearned("where is the tarp cache", hidden), null);
  const confirmed = markHelpful(markHelpful(good, "cache"), "cache");
  assert.equal(confirmed.notes[0].confidence, "confirmed");
  const cleared = resetLearned("phone-a");
  assert.equal(cleared.notes.length, 0);
  assert.match(learnedSummary(cleared), /0 vs\. 0/);
  const review = reviewLearned(saved);
  assert.equal(review.some((item) => item.agent === "verifier" || item.agent === "corpus"), true);
  const applied = applyLearnedReview(saved, review.find((item) => item.kind === "remove"), true);
  assert.equal(applied.notes[0].hidden, true);
  assert.equal(applyLearnedReview(saved, review[0], false).notes[0].hidden, false);
});

test("another device's notes are not opened, and learning makes no network call", async () => {
  const foreign = openLearned({ deviceId: "phone-b", notes: [{ id: "x", title: "Secret", text: "other phone", source: "your correction", question: "secret cache" }] }, "phone-a");
  assert.equal(foreign.rejected, true);
  assert.equal(foreign.notes.length, 0);
  let calls = 0;
  const answer = askField("where is the tarp cache", passages, {
    learned: approveLearned(emptyLearned("phone-a"), proposeLearned({
      title: "Tarp cache",
      text: "The cache is behind the north boulder.",
      source: "your correction",
      question: "where is the tarp cache"
    }))
  });
  assert.match(answer.text, /north boulder/);
  assert.equal(calls, 0);
  const skipped = await sendToModel({
    provider: { id: "ollama", name: "Ollama", baseUrl: "http://127.0.0.1:11434", model: "llama3.2", style: "ollama", needsKey: false, enabled: false },
    outbound: { question: "where is the tarp cache" },
    approved: true,
    fetchImpl: async () => { calls += 1; return { ok: true, status: 200, json: async () => ({}) }; }
  });
  assert.match(skipped.reason, /Nothing was sent/);
  assert.equal(calls, 0);
});
