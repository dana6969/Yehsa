// "Look it up later": questions the person saved after a miss. Private and on this phone only: the
// queue lives inside the sealed web-notes store (sealed_vault.js), never in logs or the network.
// Only the cleaned words from outboundQuery() ever leave the phone, and only when the person taps Fetch.

import { outboundQuery, queryAllowed } from "./sources.js";

export const MAX_QUEUE = 50;
export const MISS_OFFER = "I don't have that yet. Save it to look up next time you're online?";

let counter = 0;

function clean(raw) {
  if (!raw || typeof raw.question !== "string") return null;
  const question = raw.question.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 200);
  if (!question) return null;
  return {
    id: String(raw.id || "").slice(0, 60),
    question,
    query: outboundQuery(question),
    savedAt: String(raw.savedAt || ""),
    lastTriedAt: raw.lastTriedAt ? String(raw.lastTriedAt) : null,
    lastResult: raw.lastResult ? String(raw.lastResult).slice(0, 200) : null
  };
}

export function cleanQueue(list) {
  return (Array.isArray(list) ? list : []).map(clean).filter(Boolean).slice(-MAX_QUEUE);
}

function same(a, b) {
  return a.toLowerCase().replace(/[?!.\s]+$/, "") === b.toLowerCase().replace(/[?!.\s]+$/, "");
}

/** Save a missed question. Returns { ok, store, item } or { ok: false, reason }. A repeat is not added twice. */
export function saveForLater(store, question, now = Date.now()) {
  const item = clean({ id: `q-${now.toString(36)}-${(counter += 1).toString(36)}`, question, savedAt: new Date(now).toISOString() });
  if (!item) return { ok: false, store, reason: "There was no question to save." };
  if (!queryAllowed(item.query).ok) return { ok: false, store, reason: "I need a few plain words to look up later. Try asking it another way." };
  const queue = store.queue || [];
  const existing = queue.find((entry) => same(entry.question, item.question));
  if (existing) return { ok: true, store, item: existing, already: true };
  return { ok: true, store: { ...store, queue: [...queue, item].slice(-MAX_QUEUE) }, item };
}

export function removeQueued(store, id) {
  return { ...store, queue: (store.queue || []).filter((entry) => entry.id !== id) };
}

export function markTried(store, id, result, now = Date.now()) {
  return { ...store, queue: (store.queue || []).map((entry) => (entry.id === id ? { ...entry, lastTriedAt: new Date(now).toISOString(), lastResult: String(result || "").slice(0, 200) } : entry)) };
}

export const queued = (store) => store.queue || [];

/** The note candidate for a built answer, ready for proposeWebNote(..., { requested: true }). */
export function answerCandidate(answer, queueId = null) {
  const first = answer.citations[0];
  return {
    title: answer.question,
    question: answer.question,
    text: answer.text,
    sourceUrl: first.url,
    sourceName: first.sourceName,
    license: first.license,
    licenseUrl: first.licenseUrl,
    attribution: first.attribution,
    fetchedAt: answer.builtAt,
    query: answer.query,
    origin: "lookup",
    citations: answer.citations,
    links: answer.links,
    advice: answer.advice || null,
    queueId
  };
}
