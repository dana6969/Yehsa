import assert from "node:assert/strict";
import test from "node:test";
import { approveAction, declineAction, proposeAction, setActionEnabled } from "./symbolic/action_gate.js";
import { capabilitySummary, continueUtterance, isCapabilityQuestion } from "./symbolic/chat_turn.js";
import { phoneCorpusMeta } from "./symbolic/phone_corpus.js";

test("a follow-up keeps the previous question", () => {
  const next = continueUtterance("and for kids?", { utterance: "How do I treat a mosquito bite?" });
  assert.match(next, /mosquito bite/i);
  assert.match(next, /kids/i);
  assert.equal(continueUtterance("What is a watershed?", { utterance: "How do I treat a mosquito bite?" }), "What is a watershed?");
});

test("capabilities stay inside what is installed", () => {
  assert.equal(isCapabilityQuestion("what are your capabilities"), true);
  const text = capabilitySummary(phoneCorpusMeta);
  assert.match(text, /scripture/i);
  assert.match(text, /Approve/);
  assert.match(text, /no live city/i);
  assert.match(text, /cannot reach the internet/i);
  assert.match(text, new RegExp(String(phoneCorpusMeta.headwords)));
  assert.doesNotMatch(text, /\banything\b/i);
  assert.doesNotMatch(text, /NATO|cipher grade|I can control other apps/i);
});

test("nothing runs without approve, decline is a no-op, and a switch blocks the action", () => {
  let ran = 0;
  const gate = { settings: { waypoint: true, measure: true, "position-hold": true, "position-unlock": true, "mesh-scan": true, calculate: true, speak: true, "field-note": true }, log: [], pending: null };
  const proposed = proposeAction(gate, { type: "waypoint", label: "Save waypoint", payload: { name: "camp" } });
  assert.equal(ran, 0);
  assert.equal(proposed.card.status, "pending");
  const declined = declineAction(proposed.gate, proposed.card.id);
  assert.equal(declined.applied, false);
  assert.equal(ran, 0);
  assert.equal(declined.gate.log.some((item) => item.status === "declined"), true);

  const again = proposeAction(declined.gate, { type: "waypoint", label: "Save waypoint", payload: { name: "camp" } });
  const approved = approveAction(again.gate, again.card.id, () => {
    ran += 1;
    return { ok: true, text: "saved", undo: { type: "waypoint", name: "camp" } };
  });
  assert.equal(approved.applied, true);
  assert.equal(ran, 1);
  assert.equal(approved.gate.log.some((item) => item.status === "approved"), true);

  const off = setActionEnabled(approved.gate, "mesh-scan", false);
  const blocked = proposeAction(off, { type: "mesh-scan", label: "Scan" });
  assert.equal(blocked.card, null);
  assert.equal(blocked.gate.log.at(-1).status, "blocked");
});
