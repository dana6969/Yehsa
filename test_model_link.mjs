import assert from "node:assert/strict";
import test from "node:test";
import { declineAction, proposeAction } from "./symbolic/action_gate.js";
import { sendToModel, requestParts } from "./src/phone/model_client.js";
import {
  buildOutbound,
  labelModelAnswer,
  packModelSettings,
  planModelSend,
  previewModelSend,
  redactSecrets,
  rememberModelEntry
} from "./symbolic/model_link.js";

const ollama = {
  id: "ollama",
  name: "Ollama on this network",
  baseUrl: "http://127.0.0.1:11434",
  model: "llama3.2",
  style: "ollama",
  needsKey: false,
  enabled: true
};

test("nothing is sent without approve, and an off model makes no network call", async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return { ok: true, status: 200, json: async () => ({ message: { content: "ready" } }) };
  };
  const declined = await sendToModel({ provider: ollama, outbound: { question: "ready" }, approved: false, fetchImpl });
  assert.equal(declined.ok, false);
  assert.equal(calls, 0);
  const off = await sendToModel({
    provider: { ...ollama, enabled: false },
    outbound: { question: "ready" },
    approved: true,
    fetchImpl
  });
  assert.equal(off.ok, false);
  assert.equal(calls, 0);
  const noKey = await sendToModel({
    provider: { ...ollama, style: "openai", needsKey: true, baseUrl: "https://api.openai.com/v1" },
    apiKey: "",
    outbound: { question: "ready" },
    approved: true,
    fetchImpl
  });
  assert.match(noKey.reason, /No key/);
  assert.equal(calls, 0);
  assert.equal(planModelSend({ provider: null, approved: true, hasKey: false }).send, false);
  const gate = { settings: { "ask-model": true }, log: [], pending: null };
  const proposed = proposeAction(gate, { type: "ask-model", label: "Ask", payload: { question: "water" } });
  let ran = 0;
  const declinedCard = declineAction(proposed.gate, proposed.card.id);
  assert.equal(declinedCard.applied, false);
  assert.equal(ran, 0);
});

test("a key is not logged and is not in the message body", async () => {
  const logs = [];
  const secret = "sk-test-secret-value";
  let seenAuth = "";
  const fetchImpl = async (_url, options) => {
    seenAuth = options.headers.authorization;
    assert.equal(options.body.includes(secret), false);
    return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: `echo ${secret}` } }] }) };
  };
  const provider = { id: "openai", name: "OpenAI", baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini", style: "openai", needsKey: true, enabled: true };
  const outbound = buildOutbound({ question: "What is a watershed?", include: {} });
  const result = await sendToModel({
    provider,
    apiKey: secret,
    outbound,
    approved: true,
    fetchImpl,
    log: (entry) => logs.push(JSON.stringify(entry))
  });
  assert.equal(result.ok, true);
  assert.equal(logs.join("").includes(secret), false);
  assert.equal(result.text.includes(secret), false);
  assert.match(result.text, /\[key\]/);
  assert.equal(seenAuth, `Bearer ${secret}`);
  const parts = requestParts(provider, outbound, secret);
  assert.equal(JSON.stringify(parts.body).includes(secret), false);
  assert.equal(redactSecrets(`failure ${secret}`, [secret]).includes(secret), false);
});

test("model answers are labeled and do not replace a safety note", () => {
  const labeled = labelModelAnswer({
    providerName: "Ollama on this network",
    text: "Rub the frostbite with snow.",
    offlineNote: "Do not rub frostbite with snow."
  });
  assert.match(labeled.text, /Ollama on this network answered, not Yehsa's notes/);
  assert.match(labeled.text, /does not replace that note/);
  assert.match(labeled.text, /offline note stands/);
  const saved = rememberModelEntry([], { question: "frostbite", text: labeled.text, providerName: "Ollama on this network" });
  assert.equal(saved[0].label, "from model, unverified");
  assert.equal(saved[0].flags.some((flag) => flag.agent === "curator"), true);
  assert.equal(saved[0].flags.some((flag) => flag.agent === "verifier"), true);
});

test("the preview shows the question and omits unticked private fields", () => {
  const outbound = buildOutbound({
    question: "how do I carry water",
    include: { position: false, deviceId: false, contacts: false, notes: false },
    position: { latitude: 45.1, longitude: -69.2 },
    deviceId: "device-1",
    contacts: ["Ada"],
    notes: [{ text: "a private note" }]
  });
  assert.equal(outbound.position, undefined);
  assert.equal(outbound.deviceId, undefined);
  const preview = previewModelSend({ name: "Groq" }, outbound);
  assert.match(preview, /This sends your question text to Groq/);
  assert.match(preview, /how do I carry water/);
  assert.doesNotMatch(preview, /45\.1|device-1|Ada|private note/);
  const packed = packModelSettings({ providers: [{ ...ollama, apiKey: "sk-should-not-pack" }], unverified: [] });
  assert.equal(JSON.stringify(packed).includes("sk-should-not-pack"), false);
});
