// Notes Yehsa fetched from the internet. A separate store from the field notes and from the notes
// you wrote. The whole store is sealed with a key in secure storage (see sealed_vault.js).
//
// Rules that live in code:
//   * Nothing is stored unless the person asked for that fetch and approved it.
//   * A fetched page waits in a review queue. It is not used as an answer until the person approves it,
//     or keeps it as "unverified", which is always labeled.
//   * Dosing and edible or toxic plant claims can never be approved. They can only be kept as unverified.
//   * The text is a quote with its source. It never changes a rule or a setting.

import { queryTokens, textHasToken } from "../book_search.js";
import { cleanFetched, sensitiveKind } from "./sanitize.js";

export const MAX_NOTES = 300;
export const MAX_WAITING = 20;
export const WEB_LABEL = "Learned from the web";

export function emptyWebStore() {
  return { v: 1, enabled: false, notes: [], vectors: {}, indexedModel: null };
}

export function openWebStore(value) {
  if (!value || typeof value !== "object" || value.v !== 1) return emptyWebStore();
  return {
    v: 1,
    enabled: value.enabled === true,
    notes: (Array.isArray(value.notes) ? value.notes : []).map(cleanNote).filter(Boolean).slice(-MAX_NOTES),
    vectors: value.vectors && typeof value.vectors === "object" ? value.vectors : {},
    indexedModel: typeof value.indexedModel === "string" ? value.indexedModel : null
  };
}

function cleanNote(raw) {
  if (!raw || typeof raw.text !== "string" || typeof raw.sourceUrl !== "string") return null;
  const status = ["waiting", "approved", "kept"].includes(raw.status) ? raw.status : "waiting";
  const title = cleanFetched(String(raw.title || "Web note"), { maxChars: 100 }).text || "Web note";
  const text = cleanFetched(raw.text, { maxChars: 1200 }).text;
  if (!text) return null;
  const locked = sensitiveKind(text, title);
  return {
    id: String(raw.id || ""),
    title,
    text,
    sourceUrl: raw.sourceUrl,
    sourceName: String(raw.sourceName || "").slice(0, 60),
    license: String(raw.license || "").slice(0, 120),
    licenseUrl: String(raw.licenseUrl || "").slice(0, 200),
    attribution: String(raw.attribution || "").slice(0, 200),
    fetchedAt: String(raw.fetchedAt || ""),
    approvedAt: raw.approvedAt ? String(raw.approvedAt) : null,
    query: String(raw.query || "").slice(0, 120),
    origin: ["wikipedia", "gov", "ai"].includes(raw.origin) ? raw.origin : "wikipedia",
    status: locked && status === "approved" ? "kept" : status,
    locked: locked || null
  };
}

export function setEnabled(store, on) {
  return { ...store, enabled: on === true };
}

let counter = 0;
function noteId(now) {
  counter += 1;
  return `web-${now.toString(36)}-${counter.toString(36)}`;
}

/** Puts a fetched page in the review queue as "waiting". Cleaned again here, in case a caller skipped it. */
export function proposeWebNote(store, candidate, now = Date.now()) {
  // A connected model's answer has its own Save step, so it may enter the queue even with web learning off.
  if (!store.enabled && candidate?.origin !== "ai") return { ok: false, store, reason: "Learn from the internet is off. Nothing was kept." };
  const note = cleanNote({ ...candidate, id: noteId(now), status: "waiting" });
  if (!note) return { ok: false, store, reason: "There was no usable text. Nothing was kept." };
  const rest = store.notes.filter((item) => !(item.sourceUrl === note.sourceUrl && item.status === "waiting"));
  const waiting = rest.filter((item) => item.status === "waiting");
  const drop = waiting.length >= MAX_WAITING ? waiting[0].id : null;
  const notes = [...rest.filter((item) => item.id !== drop), note].slice(-MAX_NOTES);
  return { ok: true, store: { ...store, notes }, note };
}

export function approveWebNote(store, id, now = new Date()) {
  const note = store.notes.find((item) => item.id === id);
  if (!note) return { ok: false, store, reason: "That note is gone." };
  if (note.locked) {
    return {
      ok: false,
      store,
      reason: note.locked === "dosing"
        ? "Doses from the web stay unverified. I can keep it labeled that way, but I will not approve it."
        : "Claims about eating or poison from the web stay unverified. I can keep it labeled that way, but I will not approve it."
    };
  }
  const notes = store.notes.map((item) => (item.id === id ? { ...item, status: "approved", approvedAt: now.toISOString() } : item));
  return { ok: true, store: { ...store, notes } };
}

export function keepUnverified(store, id, now = new Date()) {
  const notes = store.notes.map((item) => (item.id === id ? { ...item, status: "kept", approvedAt: now.toISOString() } : item));
  const vectors = { ...store.vectors };
  delete vectors[id];
  return { ...store, notes, vectors };
}

export function deleteWebNote(store, id) {
  const vectors = { ...store.vectors };
  delete vectors[id];
  return { ...store, notes: store.notes.filter((item) => item.id !== id), vectors };
}

export function forgetAllWeb(store) {
  return { ...store, notes: [], vectors: {}, indexedModel: null };
}

export const waiting = (store) => store.notes.filter((note) => note.status === "waiting");
export const approved = (store) => store.notes.filter((note) => note.status === "approved");
export const keptUnverified = (store) => store.notes.filter((note) => note.status === "kept");

export function dateWord(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** The line shown under every answer that came from here. */
export function labelFor(note) {
  const where = `${note.sourceName || "the web"}${note.license ? `, ${note.license}` : ""}`;
  if (note.status === "approved") return `${WEB_LABEL} (${where}). Approved ${dateWord(note.approvedAt)}.`;
  if (note.status === "kept") return `${WEB_LABEL} (${where}). Unverified: you kept it, but nobody checked it.`;
  return `${WEB_LABEL} (${where}). Waiting for your review. Not checked.`;
}

export function originLine(note) {
  const date = dateWord(note.approvedAt || note.fetchedAt);
  if (note.status === "approved") return `From the internet · approved ${date}`;
  if (note.status === "kept") return `From the internet · kept unverified ${date}`;
  return `From the internet · fetched ${date}, waiting`;
}

function firstSentences(text, limit = 520) {
  const clean = String(text).replace(/\s+/g, " ").trim();
  if (clean.length <= limit) return clean;
  const cut = clean.slice(0, limit);
  const end = cut.lastIndexOf(". ");
  return end > limit * 0.5 ? cut.slice(0, end + 1) : `${cut.trim()}...`;
}

/** A quote with its source, never a bare statement. */
export function quoteNote(note) {
  const body = firstSentences(note.text);
  const warning = note.locked === "dosing"
    ? " Do not use this for a dose. Ask a pharmacist, a doctor or Poison Control."
    : note.locked === "plant-toxicity"
      ? " Do not use this to decide whether to eat or touch a plant or mushroom."
      : "";
  return `"${body}" ${labelFor(note)} Source: ${note.sourceUrl}${warning}`;
}

/**
 * Words in common between the question and a note, weighted toward the title.
 * Returns the best usable note or null. Waiting notes are never used.
 */
export function findWebNote(store, question, { vectorScores = null } = {}) {
  const tokens = queryTokens(question);
  if (tokens.length === 0) return null;
  let best = null;
  for (const note of store.notes) {
    if (note.status === "waiting") continue;
    let score = 0;
    for (const token of tokens) {
      if (textHasToken(note.title, token)) score += 2;
      else if (textHasToken(note.text, token)) score += 1;
    }
    const need = tokens.length === 1 ? 2 : 3;
    const vector = vectorScores?.get?.(note.id) ?? 0;
    const strong = score >= need || vector >= 0.72;
    if (!strong) continue;
    const total = score + vector * 4;
    if (!best || total > best.total) best = { note, total };
  }
  return best ? best.note : null;
}

/** Answer-shaped result for the Ask screen, or null. Used only after the local notes had nothing. */
export function webAnswer(store, question, options) {
  if (!store?.enabled) return null;
  const note = findWebNote(store, question, options);
  if (!note) return null;
  return {
    answered: true,
    text: quoteNote(note),
    kind: "web-note",
    symbol: null,
    source: labelFor(note),
    webNoteId: note.id,
    confident: note.status === "approved"
  };
}

/** An answer from the model the person connected under More, Models. Same queue, same review. */
export function aiCandidate({ providerName, question, text, now = Date.now() }) {
  const cleaned = cleanFetched(text, { maxChars: 1200 });
  return {
    title: String(question || "Model answer").slice(0, 80),
    text: cleaned.text,
    sourceUrl: `model:${String(providerName || "model").replace(/[^\w.-]+/g, "-").slice(0, 40)}`,
    sourceName: `AI model: ${String(providerName || "connected model").slice(0, 40)}`,
    license: "No license claim. A model wrote this.",
    licenseUrl: "",
    attribution: "",
    fetchedAt: new Date(now).toISOString(),
    query: String(question || "").slice(0, 120),
    origin: "ai"
  };
}
