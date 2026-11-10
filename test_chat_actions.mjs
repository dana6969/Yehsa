import assert from "node:assert/strict";
import test from "node:test";
import { approveAction, declineAction, proposeAction, setActionEnabled } from "./symbolic/action_gate.js";
import { readAssistant } from "./symbolic/assistant_intent.js";
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

test("natural commands are read offline and do not run by themselves", () => {
  const here = { latitude: 45.1, longitude: -69.2 };
  const drop = readAssistant("drop a waypoint here", { here, hereLabel: "the last place you tapped" });
  assert.equal(drop.kind, "action");
  assert.equal(drop.type, "waypoint");
  assert.equal(drop.payload.point.latitude, 45.1);
  assert.match(drop.understood, /I understood/);
  assert.equal(readAssistant("drop a waypoint here", {}).kind, "clarify");

  const far = readAssistant("how far to the last point", {
    held: { latitude: 45, longitude: -69 },
    waypoints: [{ name: "camp", latitude: 45.2, longitude: -69.1 }]
  });
  assert.equal(far.kind, "action");
  assert.equal(far.type, "measure");
  assert.equal(far.payload.to.name, undefined);
  assert.equal(far.payload.to.latitude, 45.2);
  assert.equal(readAssistant("how far to the last point", {}).kind, "clarify");

  const scan = readAssistant("start a mesh scan");
  assert.equal(scan.kind, "action");
  assert.equal(scan.type, "mesh-scan");
  assert.match(scan.understood, /will not invent a peer/);

  const cannot = readAssistant("open google and download a city map");
  assert.equal(cannot.kind, "cannot");
  assert.match(cannot.reply, /no internet/i);
  assert.match(cannot.reply, /can't open or control other apps/i);
  assert.deepEqual(readAssistant("What can willow bark be used for?"), { kind: "talk" });
  assert.doesNotMatch(JSON.stringify(scan), /model|openai|network request/i);
});
