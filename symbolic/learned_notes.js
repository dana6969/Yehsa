// Notes this phone keeps (saved answers, corrections). Lookup only: no model is retrained, nothing is sent.
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
    feedback: current.feedback || [],
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
  const count = visible.length === 1 ? "1 saved note" : `${visible.length} saved notes`;
  const used = stats.learnedAnswers === 1 ? "used once this week" : `used ${stats.learnedAnswers} times this week`;
  return `${count} on this phone, ${used}.`;
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

function firstSentence(text) {
  const flat = String(text || "").replace(/\s+/g, " ").trim();
  const match = flat.match(/^(.{8,120}?[.!?])(\s|$)/);
  const line = match ? match[1] : flat.slice(0, 80);
  return line.replace(/[.!?]$/, "").slice(0, 80) || "Saved answer";
}

/**
 * The user tapped Yes under a trusted answer. Keep that answer as a learned note on this
 * phone so it shows on "What Yehsa has learned". A second Yes on the same question counts
 * up instead of adding a duplicate. Learned notes are only retrieved when no trusted note
 * answers, so this never overrides a field note.
 */
export function saveHelpfulAnswer(store, answer) {
  const current = store || emptyLearned();
  const text = String(answer?.text || "").trim();
  if (!text) return current;
  const question = String(answer?.question || "").trim().slice(0, 300);
  const key = question.toLowerCase();
  const existing = (current.notes || []).find((note) => !note.hidden && key && note.question.toLowerCase() === key && note.source === "a chat answer");
  if (existing) return markHelpful(current, existing.id);
  const note = cleanNote({
    id: `learned-${Date.now()}-${(current.notes || []).length}`,
    title: answer?.title && !/^guide_|_\d+$/.test(String(answer.title)) ? answer.title : firstSentence(text),
    text,
    source: "a chat answer",
    question,
    tags: answer?.symbol ? [String(answer.symbol)] : [],
    helpful: 1
  });
  return {
    ...current,
    notes: [...(current.notes || []), note].slice(-200),
    feedback: [...(current.feedback || []), { id: note.id, verdict: "helpful", at: new Date().toISOString() }].slice(-80)
  };
}

export function recordFeedback(store, entry) {
  const current = store || emptyLearned();
  const item = {
    id: String(entry?.symbol || entry?.id || "answer").slice(0, 80),
    verdict: String(entry?.verdict || "not-quite").slice(0, 20),
    reason: entry?.reason ? String(entry.reason).slice(0, 60) : null,
    question: String(entry?.question || "").slice(0, 300),
    at: new Date().toISOString()
  };
  return { ...current, feedback: [...(current.feedback || []), item].slice(-80) };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function shortDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

// "From a chat answer · 17 Nov 2026"
export function noteOrigin(note) {
  const source = String(note?.source || "");
  let from = "From this phone";
  if (/correction/i.test(source)) from = "From your correction";
  else if (/chat answer/i.test(source)) from = "From a chat answer";
  else if (/model/i.test(source)) from = "From a connected model";
  else if (/field note|you saved|your note/i.test(source)) from = "From a note you saved";
  else if (/import/i.test(source)) from = "From a file you imported";
  else if (/mesh|peer/i.test(source)) from = "From a nearby phone";
  const when = shortDate(note?.date);
  return when ? `${from} · ${when}` : from;
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
