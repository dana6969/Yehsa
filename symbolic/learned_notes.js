// On-device retrieval memory. This does not retrain a model and does not open a network connection.
// A note is stored only when the caller approves it. Hidden notes are not retrieved.
// A trusted safety note wins over a learned one.

import { queryTokens, textHasToken } from "./book_search.js";
import { modelDangerWarning } from "./model_link.js";

const TRUSTED_SAFETY = [
  "Do not rub frostbite with snow or ice.",
  "A tourniquet is a last resort, not the first step for a small wound.",
  "Do not cut or suck a snakebite.",
  "Urine and seawater are not drinking water."
];

export function emptyLearned(deviceId = null) {
  return {
    deviceId: deviceId || null,
    notes: [],
    phrases: [],
    feedback: [],
    stats: { week: weekKey(), learnedAnswers: 0, modelAsks: 0 },
    rejected: false
  };
}

export function weekKey(date = new Date()) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function cleanNote(raw) {
  return {
    id: String(raw?.id || `learned-${Date.now()}`),
    title: String(raw?.title || "Learned note").slice(0, 80),
    text: String(raw?.text || "").slice(0, 1200),
    source: String(raw?.source || "this phone").slice(0, 80),
    date: raw?.date || new Date().toISOString(),
    tags: Array.isArray(raw?.tags) ? raw.tags.map((tag) => String(tag).slice(0, 32)).slice(0, 8) : [],
    confidence: raw?.confidence === "confirmed" || raw?.confidence === "hidden" ? raw.confidence : "unverified",
    question: String(raw?.question || "").slice(0, 300),
    helpful: Number(raw?.helpful) || 0,
    hidden: raw?.hidden === true || raw?.confidence === "hidden"
  };
}

export function proposeLearned(input) {
  const note = cleanNote(input);
  if (!note.text.trim()) return { ok: false, note: null, reason: "There is no text to learn." };
  return { ok: true, note, reason: null };
}

export function approveLearned(store, proposal) {
  const current = store || emptyLearned();
  if (!proposal?.ok || !proposal.note) return current;
  const note = cleanNote({ ...proposal.note, confidence: "unverified", hidden: false, helpful: 0 });
  return { ...current, notes: [...current.notes, note].slice(-200) };
}

export function openLearned(stored, deviceId) {
  if (!stored || typeof stored !== "object") return emptyLearned(deviceId);
  if (stored.deviceId && deviceId && stored.deviceId !== deviceId) {
    return { ...emptyLearned(deviceId), rejected: true };
  }
  const notes = (stored.notes || []).map(cleanNote);
  const phrases = (stored.phrases || []).filter((pair) => pair?.from && pair?.to).slice(-80);
  return {
    deviceId: deviceId || stored.deviceId || null,
    notes,
    phrases,
    feedback: Array.isArray(stored.feedback) ? stored.feedback.slice(-80) : [],
    stats: rollWeek(stored.stats),
    rejected: false
  };
}

export function importLearned(stored, deviceId) {
  const opened = openLearned({ ...(stored || {}), deviceId: null }, null);
  return { ...opened, deviceId: deviceId || null, rejected: false };
}

export function exportLearned(store) {
  const current = store || emptyLearned();
  return JSON.stringify({
    kind: "yehsa-learned-notes",
    deviceId: current.deviceId || null,
    notes: current.notes || [],
    phrases: current.phrases || [],
    stats: current.stats || emptyLearned().stats
  });
}

function rollWeek(stats, date = new Date()) {
  const week = weekKey(date);
  if (!stats || stats.week !== week) return { week, learnedAnswers: 0, modelAsks: 0 };
  return {
    week,
    learnedAnswers: Number(stats.learnedAnswers) || 0,
    modelAsks: Number(stats.modelAsks) || 0
  };
}

export function recordLearnedAnswer(store, date = new Date()) {
  const current = store || emptyLearned();
  const stats = rollWeek(current.stats, date);
  return { ...current, stats: { ...stats, learnedAnswers: stats.learnedAnswers + 1 } };
}

export function recordModelAsk(store, date = new Date()) {
  const current = store || emptyLearned();
  const stats = rollWeek(current.stats, date);
  return { ...current, stats: { ...stats, modelAsks: stats.modelAsks + 1 } };
}

export function learnedSummary(store) {
  const current = store || emptyLearned();
  const visible = (current.notes || []).filter((note) => !note.hidden);
  const stats = rollWeek(current.stats);
  return `Answered offline from learned notes this week vs. asked the model: ${stats.learnedAnswers} vs. ${stats.modelAsks}. ${visible.length} learned notes on this phone.`;
}

export function markHelpful(store, id) {
  const current = store || emptyLearned();
  return {
    ...current,
    notes: current.notes.map((note) => {
      if (note.id !== id || note.hidden) return note;
      const helpful = note.helpful + 1;
      return { ...note, helpful, confidence: helpful >= 2 ? "confirmed" : note.confidence };
    }),
    feedback: [...current.feedback, { id, verdict: "helpful", at: new Date().toISOString() }].slice(-80)
  };
}

export function confirmLearned(store, id) {
  const current = store || emptyLearned();
  return {
    ...current,
    notes: current.notes.map((note) => note.id === id ? { ...note, confidence: "confirmed", hidden: false } : note)
  };
}

export function markNotRight(store, id) {
  const current = store || emptyLearned();
  return {
    ...current,
    notes: current.notes.map((note) => note.id === id ? { ...note, hidden: true, confidence: "hidden" } : note),
    feedback: [...current.feedback, { id, verdict: "not-right", at: new Date().toISOString() }].slice(-80)
  };
}

export function rememberPhrase(store, from, to) {
  const current = store || emptyLearned();
  const left = String(from || "").trim().toLowerCase();
  const right = String(to || "").trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9 '-]{1,40}$/.test(left) || !/^[a-z0-9][a-z0-9 '-]{1,40}$/.test(right)) return current;
  if (left === right) return current;
  const phrases = current.phrases.filter((pair) => pair.from !== left);
  return { ...current, phrases: [...phrases, { from: left, to: right }].slice(-80) };
}

export function phraseFromFeedback(question, symbol) {
  const tokens = queryTokens(question);
  if (tokens.length < 1 || tokens.length > 4) return null;
  if (!symbol || !/^[a-z0-9_-]{3,32}$/i.test(symbol)) return null;
  return { from: tokens.join(" "), to: String(symbol).replace(/_/g, " ") };
}

export function conflictsTrustedSafety(noteText) {
  return Boolean(modelDangerWarning(noteText));
}

export function retrieveLearned(question, store) {
  const current = store || emptyLearned();
  const tokens = queryTokens(question);
  if (!tokens.length) return null;
  let best = null;
  let bestScore = 0;
  for (const note of current.notes || []) {
    if (note.hidden || note.confidence === "hidden") continue;
    if (conflictsTrustedSafety(note.text)) continue;
    const hay = `${note.title} ${note.text} ${note.question} ${(note.tags || []).join(" ")}`;
    let score = 0;
    for (const token of tokens) {
      if (textHasToken(hay, token)) score += 1;
    }
    if (score > bestScore) {
      best = note;
      bestScore = score;
    }
  }
  const need = tokens.length === 1 ? 1 : Math.min(2, tokens.length);
  if (!best || bestScore < need) return null;
  return best;
}

export function learnedShareText(note) {
  return `Learned on this device from ${note?.source || "this phone"}. ${note?.title || "Note"}: ${note?.text || ""}`.slice(0, 500);
}

export function formatLearned(note) {
  return `Learned on this device from ${note.source}. ${note.text}`;
}

export function editLearned(store, id, patch) {
  const current = store || emptyLearned();
  return {
    ...current,
    notes: current.notes.map((note) => note.id === id ? cleanNote({ ...note, ...patch, id }) : note)
  };
}

export function deleteLearned(store, id) {
  const current = store || emptyLearned();
  return { ...current, notes: current.notes.filter((note) => note.id !== id) };
}

export function resetLearned(deviceId) {
  return emptyLearned(deviceId);
}

export function searchLearned(store, query) {
  const tokens = queryTokens(query);
  const notes = (store?.notes || []);
  if (!tokens.length) return notes;
  return notes.filter((note) => {
    const hay = `${note.title} ${note.text} ${note.question} ${(note.tags || []).join(" ")}`;
    return tokens.every((token) => textHasToken(hay, token));
  });
}

export function reviewLearned(store) {
  const notes = store?.notes || [];
  const proposals = [];
  const seen = new Map();
  for (const note of notes) {
    if (note.hidden) continue;
    const key = note.title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    if (key && seen.has(key)) {
      proposals.push({
        id: `merge-${note.id}`,
        agent: "curator",
        kind: "merge",
        noteIds: [seen.get(key).id, note.id],
        text: `Curator: “${note.title}” repeats another learned note. Approve to merge them. Nothing changes until you approve.`
      });
    } else if (key) seen.set(key, note);
    if (conflictsTrustedSafety(note.text)) {
      proposals.push({
        id: `safety-${note.id}`,
        agent: "verifier",
        kind: "remove",
        noteIds: [note.id],
        text: "Verifier: this learned note conflicts with a trusted safety note. Approve to hide it. The trusted note stays."
      });
    }
    if (modelDangerWarning(note.text)) {
      proposals.push({
        id: `corpus-${note.id}`,
        agent: "corpus",
        kind: "remove",
        noteIds: [note.id],
        text: "Corpus health: this learned note makes a first-aid claim. Approve to remove it from retrieval. It was never a trusted note."
      });
    }
  }
  return proposals;
}

export function applyLearnedReview(store, proposal, approved) {
  if (approved !== true || !proposal) return store || emptyLearned();
  const current = store || emptyLearned();
  if (proposal.kind === "remove") {
    const ids = new Set(proposal.noteIds || []);
    return {
      ...current,
      notes: current.notes.map((note) => ids.has(note.id) ? { ...note, hidden: true, confidence: "hidden" } : note)
    };
  }
  if (proposal.kind === "merge") {
    const ids = proposal.noteIds || [];
    const parts = current.notes.filter((note) => ids.includes(note.id));
    if (parts.length < 2) return current;
    const [keep, ...rest] = parts;
    const merged = {
      ...keep,
      text: [keep.text, ...rest.map((note) => note.text)].join(" "),
      tags: [...new Set(parts.flatMap((note) => note.tags || []))].slice(0, 8)
    };
    const drop = new Set(rest.map((note) => note.id));
    return { ...current, notes: current.notes.filter((note) => !drop.has(note.id)).map((note) => note.id === keep.id ? merged : note) };
  }
  return current;
}

export const TRUSTED_SAFETY_LINES = TRUSTED_SAFETY;
