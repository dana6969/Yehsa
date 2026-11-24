// Notes Yehsa fetched from the internet. A separate store from the field notes and from the notes
// you wrote. The whole store is sealed with a key in secure storage (see sealed_vault.js).
//
// Rules that live in code:
//   * Nothing is stored unless the person asked for that fetch and approved it.
//   * Look it up: a missed question can be saved to a private queue (lookup_queue.js). Fetch builds a
//     short cited answer (look_up.js) that waits here as "waiting" until the person taps Keep or Toss.
//     Keep makes it a learned note tagged "Learned, from [source], [date]" that answers offline.
//     Learned notes live only in this sealed store, never in the core pack, and can be edited or deleted.
//   * A fetched page waits in a review queue. It is not used as an answer until the person approves it,
//     or keeps it as "unverified", which is always labeled.
//   * Dosing and edible or toxic plant claims can never be approved. They can only be kept as unverified.
//   * The text is a quote with its source. It never changes a rule or a setting.

import { queryTokens, textHasToken } from "../book_search.js";
import { cleanFetched, sensitiveKind } from "./sanitize.js";
import { checkUrl } from "./fetch_guard.js";
import { cleanQueue } from "./lookup_queue.js";

export const MAX_NOTES = 300;
export const MAX_WAITING = 20;
export const WEB_LABEL = "Learned from the web";

export function emptyWebStore() {
  return { v: 1, enabled: false, notes: [], queue: [], vectors: {}, indexedModel: null };
}

export function openWebStore(value) {
  if (!value || typeof value !== "object" || value.v !== 1) return emptyWebStore();
  return {
    v: 1,
    enabled: value.enabled === true,
    notes: (Array.isArray(value.notes) ? value.notes : []).map(cleanNote).filter(Boolean).slice(-MAX_NOTES),
    queue: cleanQueue(value.queue),
    vectors: value.vectors && typeof value.vectors === "object" ? value.vectors : {},
    indexedModel: typeof value.indexedModel === "string" ? value.indexedModel : null
  };
}

const CITE_GROUPS = ["wikipedia", "page", "atp", "weather"];
const ADVICE = new Set(["legal", "medical"]);

function citedUrl(url, sourceId = "") {
  if (typeof url !== "string") return null;
  // Open-web citations (sourceId "web", from a web search) may name any public https site.
  for (const group of sourceId === "web" ? [...CITE_GROUPS, "open"] : CITE_GROUPS) {
    const checked = checkUrl(url, group);
    if (checked.ok) return checked.url;
  }
  return null;
}

function cleanCitation(raw, i) {
  const url = citedUrl(raw?.url, raw?.sourceId);
  if (!url) return null;
  return {
    n: Number.isInteger(raw.n) ? raw.n : i + 1,
    sourceId: String(raw.sourceId || "").slice(0, 40),
    sourceName: cleanFetched(String(raw.sourceName || ""), { maxChars: 60 }).text,
    ref: cleanFetched(String(raw.ref || ""), { maxChars: 40 }).text,
    title: cleanFetched(String(raw.title || ""), { maxChars: 100 }).text,
    url,
    license: String(raw.license || "").slice(0, 120),
    licenseUrl: String(raw.licenseUrl || "").slice(0, 200),
    attribution: String(raw.attribution || "").slice(0, 240),
    fetchedAt: String(raw.fetchedAt || "").slice(0, 40)
  };
}

function cleanLink(raw, i) {
  // Link-only citations: an https address, never fetched, never quoted.
  try {
    const url = new URL(String(raw?.url || ""));
    if (url.protocol !== "https:" || url.username || url.password) return null;
    return { n: Number.isInteger(raw.n) ? raw.n : i + 1, sourceId: "state-wildlife", sourceName: String(raw.sourceName || "").slice(0, 80), state: String(raw.state || "").slice(0, 30), url: url.toString(), linkOnly: true };
  } catch {
    return null;
  }
}

function cleanNote(raw) {
  if (!raw || typeof raw.text !== "string" || typeof raw.sourceUrl !== "string") return null;
  const status = ["waiting", "approved", "kept"].includes(raw.status) ? raw.status : "waiting";
  const title = cleanFetched(String(raw.title || "Web note"), { maxChars: 100 }).text || "Web note";
  const text = cleanFetched(raw.text, { maxChars: 1200 }).text;
  if (!text) return null;
  // Law and health answers from the internet stay unverified, like doses: "check the source".
  const advice = ADVICE.has(raw.advice) ? raw.advice : null;
  const locked = sensitiveKind(text, title) || advice;
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
    origin: ["wikipedia", "gov", "ai", "lookup"].includes(raw.origin) ? raw.origin : "wikipedia",
    status: locked && status === "approved" ? "kept" : status,
    locked: locked || null,
    advice,
    question: raw.question ? cleanFetched(String(raw.question), { maxChars: 200 }).text : "",
    citations: (Array.isArray(raw.citations) ? raw.citations : []).slice(0, 8).map(cleanCitation).filter(Boolean),
    links: (Array.isArray(raw.links) ? raw.links : []).slice(0, 2).map(cleanLink).filter(Boolean),
    queueId: raw.queueId ? String(raw.queueId).slice(0, 60) : null,
    edited: raw.edited === true,
    editedAt: raw.editedAt ? String(raw.editedAt) : null
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

/**
 * Puts a fetched page or a built answer in the review queue as "waiting". Cleaned again here.
 * requested: the person tapped Fetch or Look it up for this one question. That tap is the consent,
 * so it may enter review even with live web learning off.
 */
export function proposeWebNote(store, candidate, now = Date.now(), { requested = false } = {}) {
  // A connected model's answer has its own Save step, so it may enter the queue even with web learning off.
  if (!store.enabled && !requested && candidate?.origin !== "ai") return { ok: false, store, reason: "Learn from the internet is off. Nothing was kept." };
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
        : note.locked === "legal" || note.locked === "medical"
          ? `Legal and medical answers from the web stay unverified. Check the source; this is not ${note.locked} advice.`
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

/** Review step for a looked-up answer. Keep: it becomes a learned note. Dosing or eat/poison claims stay unverified. */
export function keepAnswer(store, id, now = new Date()) {
  const note = store.notes.find((item) => item.id === id);
  if (!note) return { ok: false, store, reason: "That answer is gone." };
  if (note.status !== "waiting") return { ok: true, store, note };
  if (note.locked) {
    const next = keepUnverified(store, id, now);
    return { ok: true, store: next, note: next.notes.find((item) => item.id === id), unverified: true };
  }
  const approvedResult = approveWebNote(store, id, now);
  return { ok: true, store: approvedResult.store, note: approvedResult.store.notes.find((item) => item.id === id) };
}

/** Toss: the answer is gone, as if it was never fetched. */
export function tossAnswer(store, id) {
  return deleteWebNote(store, id);
}

/** Change a learned note's words. The source tag stays, and it says you edited it. */
export function editWebNote(store, id, { text, title } = {}, now = new Date()) {
  const note = store.notes.find((item) => item.id === id);
  if (!note) return { ok: false, store, reason: "That note is gone." };
  const nextText = text == null ? note.text : cleanFetched(String(text), { maxChars: 1200 }).text;
  if (!nextText) return { ok: false, store, reason: "A note needs some words. Use Delete to remove it." };
  const nextTitle = title == null ? note.title : (cleanFetched(String(title), { maxChars: 100 }).text || note.title);
  const locked = sensitiveKind(nextText, nextTitle) || note.advice || null;
  const notes = store.notes.map((item) => (item.id === id
    ? { ...item, text: nextText, title: nextTitle, edited: true, editedAt: now.toISOString(), locked: locked || null, status: locked && item.status === "approved" ? "kept" : item.status }
    : item));
  const vectors = { ...store.vectors };
  delete vectors[id];
  return { ok: true, store: { ...store, notes, vectors } };
}

export function deleteWebNote(store, id) {
  const vectors = { ...store.vectors };
  delete vectors[id];
  return { ...store, notes: store.notes.filter((item) => item.id !== id), vectors };
}

export function forgetAllWeb(store) {
  return { ...store, notes: [], queue: [], vectors: {}, indexedModel: null };
}

export const waiting = (store) => store.notes.filter((note) => note.status === "waiting");
export const approved = (store) => store.notes.filter((note) => note.status === "approved");
export const keptUnverified = (store) => store.notes.filter((note) => note.status === "kept");

export function dateWord(iso, { year = false } = {}) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-US", year ? { month: "short", day: "numeric", year: "numeric" } : { month: "short", day: "numeric" });
}

/** The tag every kept answer carries: "Learned, from ATP 3-50.21, Nov 24, 2026". */
export function learnedTag(note) {
  const sources = note.citations?.length
    ? [...new Set(note.citations.map((c) => c.sourceName).filter(Boolean))].slice(0, 3).join(" and ")
    : (note.sourceName || "the web");
  return `Learned, from ${sources}, ${dateWord(note.approvedAt || note.fetchedAt, { year: true })}`;
}

/** The line shown under every answer that came from here. */
export function labelFor(note) {
  const license = note.citations?.length
    ? [...new Set(note.citations.map((c) => c.license).filter((l) => /CC BY-SA/.test(l)))].join(", ")
    : (note.license || "");
  const tail = `${license ? ` ${license}.` : ""}${note.edited ? " Edited by you." : ""}`;
  if (note.status === "approved") return `${learnedTag(note)}.${tail}`;
  if (note.status === "kept") return `${learnedTag(note)}. Unverified: you kept it, but nobody checked it.${tail}`;
  return `From the web (${note.sourceName || "the web"}${note.license ? `, ${note.license}` : ""}). Waiting for your review. Not checked.`;
}

export function originLine(note) {
  const date = dateWord(note.approvedAt || note.fetchedAt);
  if (note.status === "approved") return `${learnedTag(note)}${note.edited ? " · edited by you" : ""}`;
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

export function adviceWarning(kind) {
  return kind === "legal"
    ? "Check the source; this is not legal advice. Laws change, so confirm with the state or a lawyer."
    : "Check the source; this is not medical advice. For your own health, ask a doctor or your state health department.";
}

/** A quote with its source, never a bare statement. */
export function quoteNote(note) {
  const body = firstSentences(note.text);
  const warning = note.locked === "dosing"
    ? " Do not use this for a dose. Ask a pharmacist, a doctor or Poison Control."
    : note.locked === "plant-toxicity"
      ? " Do not use this to decide whether to eat or touch a plant or mushroom."
      : note.locked === "legal" || note.locked === "medical"
        ? ` ${adviceWarning(note.locked)}`
        : "";
  if (note.citations?.length) {
    const cites = note.citations.map((c) => `[${c.n}] ${c.sourceName}${c.ref ? `, ${c.ref}` : ""}: ${c.url}`).join(" ");
    const links = (note.links || []).map((l) => `[${l.n}] ${l.sourceName} (link only): ${l.url}`).join(" ");
    return `${body} ${labelFor(note)} Sources: ${cites}${links ? ` ${links}` : ""}${warning}`;
  }
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
    // A kept answer to this very question answers it again.
    if (note.question && note.question.toLowerCase().replace(/[?!.\s]+$/, "") === String(question).toLowerCase().replace(/[?!.\s]+$/, "")) score += 10;
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

/**
 * Answer-shaped result for the Ask screen, or null. Used only after the local notes had nothing.
 * Kept notes answer offline whether or not live web learning is on: they were reviewed and kept.
 */
export function webAnswer(store, question, options) {
  if (!store?.notes?.length) return null;
  const note = findWebNote(store, question, options);
  if (!note) return null;
  return {
    answered: true,
    text: quoteNote(note),
    kind: "web-note",
    symbol: null,
    source: labelFor(note),
    webNoteId: note.id,
    citations: note.citations || [],
    links: note.links || [],
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
