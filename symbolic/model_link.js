// Opt-in language-model link. Nothing here opens a network connection.
// A caller may send only after planModelSend says send: true.

export const MODEL_PRESETS = [
  { id: "openai", name: "OpenAI", baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini", style: "openai", needsKey: true },
  { id: "openrouter", name: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1", model: "openai/gpt-4o-mini", style: "openai", needsKey: true },
  { id: "groq", name: "Groq", baseUrl: "https://api.groq.com/openai/v1", model: "llama-3.1-8b-instant", style: "openai", needsKey: true },
  { id: "ollama", name: "Ollama on this network", baseUrl: "http://127.0.0.1:11434", model: "llama3.2", style: "ollama", needsKey: false },
  { id: "custom", name: "OpenAI-compatible", baseUrl: "", model: "", style: "openai", needsKey: true }
];

const SECRET_FIELDS = ["apiKey", "key", "token", "authorization", "secret"];

export function emptyModelSettings() {
  return {
    providers: [],
    selectedId: null,
    include: { position: false, deviceId: false, contacts: false, notes: false },
    unverified: []
  };
}

export function publicProvider(provider) {
  const copy = { ...(provider || {}) };
  for (const field of SECRET_FIELDS) delete copy[field];
  return {
    id: String(copy.id || ""),
    name: String(copy.name || "Model"),
    baseUrl: String(copy.baseUrl || "").trim(),
    model: String(copy.model || "").trim(),
    style: copy.style === "ollama" ? "ollama" : "openai",
    needsKey: copy.needsKey !== false,
    enabled: copy.enabled === true,
    keySaved: copy.keySaved === true
  };
}

export function packModelSettings(state) {
  const current = state || emptyModelSettings();
  return {
    providers: (current.providers || []).map(publicProvider),
    selectedId: current.selectedId || null,
    include: {
      position: current.include?.position === true,
      deviceId: current.include?.deviceId === true,
      contacts: current.include?.contacts === true,
      notes: current.include?.notes === true
    },
    unverified: Array.isArray(current.unverified) ? current.unverified : []
  };
}

export function selectedProvider(state) {
  const packed = packModelSettings(state);
  return packed.providers.find((item) => item.id === packed.selectedId && item.enabled === true)
    || packed.providers.find((item) => item.enabled === true)
    || null;
}

export function planModelSend({ provider, approved, hasKey }) {
  if (approved !== true) return { send: false, reason: "Not approved. Nothing was sent." };
  if (!provider || provider.enabled !== true) return { send: false, reason: "No model is on. Nothing was sent." };
  const needsKey = provider.needsKey !== false;
  if (needsKey && hasKey !== true) return { send: false, reason: "No key is saved. Nothing was sent." };
  if (!provider.baseUrl || !provider.model) return { send: false, reason: "That model has no endpoint or model name. Nothing was sent." };
  return { send: true, reason: null };
}

export function buildOutbound({ question, include, position, deviceId, contacts, notes }) {
  const sent = { question: String(question || "").trim().slice(0, 2000) };
  if (include?.position === true && position && Number.isFinite(Number(position.latitude))) {
    sent.position = { latitude: Number(position.latitude), longitude: Number(position.longitude) };
  }
  if (include?.deviceId === true && deviceId) sent.deviceId = String(deviceId);
  if (include?.contacts === true && Array.isArray(contacts) && contacts.length) sent.contacts = contacts.slice(0, 20);
  if (include?.notes === true && Array.isArray(notes) && notes.length) {
    sent.notes = notes.slice(0, 8).map((note) => String(note.text || note).slice(0, 400));
  }
  return sent;
}

export function renderOutbound(outbound) {
  const lines = [`Question: ${outbound?.question || ""}`];
  if (outbound?.position) lines.push(`Position: ${outbound.position.latitude}, ${outbound.position.longitude}`);
  if (outbound?.deviceId) lines.push(`Device id: ${outbound.deviceId}`);
  if (outbound?.contacts) lines.push(`Contacts: ${outbound.contacts.join(", ")}`);
  if (outbound?.notes) lines.push(`Notes: ${outbound.notes.join(" | ")}`);
  return lines.join("\n");
}

export function missModelOffer(provider, outbound) {
  const name = provider?.name || "the model";
  return `Yehsa has no offline note for this. Ask the connected model? This sends your question text to ${name}. ${previewModelSend(provider, outbound)}`;
}

export function previewModelSend(provider, outbound) {
  const name = provider?.name || "the model";
  const question = String(outbound?.question || "").replace(/[.?!\s]+$/g, "");
  const extras = [];
  if (outbound?.position) extras.push(`position ${outbound.position.latitude}, ${outbound.position.longitude}`);
  if (outbound?.deviceId) extras.push("the device id");
  if (outbound?.contacts) extras.push("contacts");
  if (outbound?.notes) extras.push("the notes you ticked");
  const held = extras.length ? `Also included because you ticked them: ${extras.join("; ")}.` : "Not included: position, device id, contacts, and notes.";
  return `This sends your question text to ${name}. Question: ${question}. ${held}`;
}

const DANGERS = [
  { test: /rub[\s\S]{0,40}\b(snow|ice)\b/i, warn: "Rubbing frostbite with snow or ice fights the field note. The model does not replace that note." },
  { test: /\btourniquet\b/i, warn: "A tourniquet is a last resort in the field notes, not the first step for a small wound. The model does not replace that note." },
  { test: /\b(cut|suck|suction)\b[\s\S]{0,48}\b(snakebite|snake bite|venom)\b|\b(snakebite|snake bite)\b[\s\S]{0,48}\b(cut|suck|suction)\b/i, warn: "Cutting or sucking a snakebite fights the field note. The model does not replace that note." },
  { test: /\b(drink|drinking)\b[\s\S]{0,32}\b(urine|seawater|sea water)\b/i, warn: "Urine and seawater are not drinking water in the field notes. The model does not replace that note." }
];

export function modelDangerWarning(text) {
  const found = DANGERS.find((item) => item.test.test(String(text || "")));
  return found ? found.warn : null;
}

export function labelModelAnswer({ providerName, text, offlineNote }) {
  const name = providerName || "The model";
  const warning = modelDangerWarning(text);
  const standing = offlineNote ? `The offline note stands and is not replaced. ${offlineNote}` : null;
  const body = `${name} answered, not Yehsa's notes. ${String(text || "").trim()}`;
  return {
    labeled: true,
    providerName: name,
    text: [standing, body, warning].filter(Boolean).join(" "),
    warning
  };
}

export function reviewModelEntry(entry) {
  const text = String(entry?.text || "");
  const flags = [
    { agent: "curator", text: "Curator: this is from a model and is unverified. It is not a trusted note." },
    { agent: "verifier", text: "Verifier: this was not in the installed field notes. It waits for your review." }
  ];
  const warning = modelDangerWarning(text);
  if (warning) flags.push({ agent: "safety", text: warning });
  return {
    id: entry?.id || `model-note-${Date.now()}`,
    question: String(entry?.question || "").slice(0, 500),
    text,
    providerName: entry?.providerName || "Model",
    label: "from model, unverified",
    flags
  };
}

export function rememberModelEntry(list, entry) {
  return [...(Array.isArray(list) ? list : []), reviewModelEntry(entry)].slice(-40);
}

export function deleteModelEntry(list, id) {
  return (Array.isArray(list) ? list : []).filter((item) => item.id !== id);
}

export function redactSecrets(text, secrets) {
  let out = String(text ?? "");
  for (const secret of secrets || []) {
    const value = String(secret || "");
    if (value.length < 4) continue;
    out = out.split(value).join("[key]");
  }
  return out;
}
