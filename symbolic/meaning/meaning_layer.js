// Offline meaning matcher: decisions only. Pure JavaScript, no filesystem, no model runtime.
// Question vectors arrive through a synchronous lookup that an async step filled first,
// so ask() stays synchronous and getMappedAction never touches any of this.
//
// Layering, in order:
//   1. Calculators and exact references answer first (ask.js handles those before this file).
//   2. A lexical note is kept only when the meaning agrees with it.
//   3. When lexical and meaning strongly disagree, the meaning note is used if it clears the
//      threshold and margin, otherwise Ask stays silent.
//   4. When lexical found nothing, a meaning note fills the gap above a threshold plus a margin.
//   5. A care or medication note is never attached to an unrelated injury (treatment_guard.js).
// Every reply is a stored note, never generated text.

import { base64ToBytes, dot, scoreAll, topK, unpackIndex } from "./int8_index.js";
import { BLOCKING_INTENTS, FIELD_INTENTS } from "./prototypes.js";
import { entryHeadHit } from "../entries.js";
import { isCareNote, namesOwnCondition, replyAddressesCondition, treatmentGuard } from "./treatment_guard.js";

export const THRESHOLDS = Object.freeze({
  fill: 0.6,
  margin: 0.03,
  override: 0.66,
  overrideGap: 0.06,
  abstainGap: 0.16,
  agree: 0.04,
  emergency: 0.74,
  unsupportedFill: 0.7,
  intentMargin: 0.02,
  part: 0.62,
  scriptureGap: 0.04
});

export function noteTitle(symbol) {
  return String(symbol || "").replace(/_\d+$/, "").replace(/_/g, " ");
}

export function noteDocument(note) {
  return `${noteTitle(note.symbol)}: ${note.text}`;
}

const SPLIT = /\?\s+(?=\S)|;\s+|,?\s+and also\s+|,\s*also\s+|\.\s+also\s+|,?\s+and\s+(?=(?:how|what|where|when|why|which|can|could|should|is|are|do|does|she|he|they|i|my|her|his|their|we)\b)/i;

// Candidate parts of a multi-part question. Each part has at least three words.
export function splitQuestion(raw) {
  const text = String(raw || "").trim();
  if (text.length < 12) return [];
  const parts = text.split(SPLIT).map((part) => part.replace(/^(?:and|also|plus)\s+/i, "").trim()).filter(Boolean);
  if (parts.length < 2 || parts.length > 4) return [];
  if (parts.some((part) => part.split(/\s+/).length < 3)) return [];
  return parts;
}

const STOP = new Set("a an and are as at be but by can could did do does for from had has have he her his how i if in into is it its me my no not of on or our she should so that the their them there they this to up was we what when where which who why will with would you your yours about after before again also any been being both each few more most other some such than then these those through too under until very off out over own same just don dont cant wont im ive keep get got go going make made need want use used way thing things carry carrying help look put take find give tell try know think feel best good small little big long day time people person someone something".split(" "));

function stem(word) {
  return word.replace(/(?:ing|ed|es|s|ly)$/, "").replace(/(.)\1$/, "$1");
}

export function contentStems(text) {
  return new Set(String(text || "").toLowerCase().match(/[a-z]+/g)?.filter((w) => w.length > 2 && !STOP.has(w)).map(stem) || []);
}

// A filled reply needs at least one shared content word with its note, unless the meaning
// score alone is very high. This keeps unrelated questions from landing on a nearby note.
function lexicalSupport(question, note) {
  const asked = contentStems(question);
  const noteWords = contentStems(`${noteTitle(note.symbol)} ${note.text}`);
  for (const word of asked) if (noteWords.has(word)) return true;
  // A short question word that starts a note's title word also counts ("sign" for signaling).
  const titleWords = contentStems(noteTitle(note.symbol));
  for (const word of asked) {
    if (word.length < 4) continue;
    for (const title of titleWords) if (title.length > word.length && title.startsWith(word)) return true;
  }
  return false;
}

let decoded = null;
let decodedFrom = null;

function decodeIndex(payload) {
  if (decoded && decodedFrom === payload) return decoded;
  const notes = payload.notes || [];
  const bySymbol = new Map(notes.map((note, row) => [note.symbol, row]));
  decoded = {
    notes,
    bySymbol,
    noteIndex: unpackIndex(base64ToBytes(payload.noteVectors)),
    intentLabels: payload.intentLabels || [],
    intentIndex: payload.intentVectors ? unpackIndex(base64ToBytes(payload.intentVectors)) : null,
    emergencyIndex: payload.emergencyVectors ? unpackIndex(base64ToBytes(payload.emergencyVectors)) : null
  };
  decodedFrom = payload;
  return decoded;
}

/**
 * ctx = {
 *   index: the notes_index.js payload,
 *   queryVector(text): Float32Array | null   (question vectors, filled by the async step)
 *   passageVector(text): Float32Array | null (vector of a lexical reply text, if embedded)
 *   scripture: { index, passages } | null    (int8 scripture rows, loaded lazily)
 * }
 */
export function rankNotes(ctx, text) {
  const q = ctx?.queryVector?.(text);
  if (!q || !ctx.index) return null;
  const idx = decodeIndex(ctx.index);
  const scores = scoreAll(idx.noteIndex, q);
  const top = entryAware(topK(scores, 24).map(({ row, score }) => ({ ...idx.notes[row], score })), text).slice(0, 8);
  return {
    scores,
    top,
    scoreOf(symbol) {
      const row = idx.bySymbol.get(symbol);
      return row == null ? null : scores[row];
    }
  };
}

// Field entries (the round-4 glossary) are dense and close together in meaning, so a paraphrase can land
// on a near neighbour. An entry takes part in meaning only when the question says its name or most of its
// title (it then gets a small title boost); otherwise it is left out, both as a pick and as a margin rival.
// Older notes rank exactly as before.
export const ENTRY_TITLE_BOOST = 0.02;
function entryAware(top, text) {
  const out = [];
  for (const note of top) {
    const hit = entryHeadHit(note.symbol, text);
    if (hit === null) out.push(note);
    else if (hit) out.push({ ...note, score: note.score + ENTRY_TITLE_BOOST, titleBoost: true });
  }
  return out.sort((a, b) => b.score - a.score);
}

export function routeIntent(ctx, text) {
  const q = ctx?.queryVector?.(text);
  if (!q || !ctx.index) return null;
  const idx = decodeIndex(ctx.index);
  if (!idx.intentIndex) return null;
  const scores = scoreAll(idx.intentIndex, q);
  const best = new Map();
  idx.intentLabels.forEach((label, row) => {
    const list = best.get(label) || [];
    list.push(scores[row]);
    best.set(label, list);
  });
  const ranked = [...best.entries()].map(([label, list]) => {
    const sorted = list.sort((a, b) => b - a);
    return { intent: label, score: sorted.length > 1 ? (sorted[0] + sorted[1]) / 2 : sorted[0] };
  }).sort((a, b) => b.score - a.score);
  const top = ranked[0];
  const bestField = ranked.find((entry) => FIELD_INTENTS.has(entry.intent));
  return {
    intent: top.intent,
    score: top.score,
    margin: top.score - (ranked[1]?.score ?? 0),
    blocking: BLOCKING_INTENTS.has(top.intent) && top.score - (bestField?.score ?? 0) >= 0,
    ranked
  };
}

// Scripture questions that the word rules miss ("What does the Bible say about worry?").
export function meaningRoutesScripture(ctx, text) {
  const intent = routeIntent(ctx, text);
  if (!intent || intent.intent !== "scripture") return false;
  const bestField = intent.ranked.find((entry) => FIELD_INTENTS.has(entry.intent));
  return intent.score - (bestField?.score ?? 0) >= 0.05;
}

export function detectEmergency(ctx, text) {
  const q = ctx?.queryVector?.(text);
  if (!q || !ctx.index) return { emergency: false, score: null };
  const idx = decodeIndex(ctx.index);
  if (!idx.emergencyIndex) return { emergency: false, score: null };
  const [best] = topK(scoreAll(idx.emergencyIndex, q), 1);
  const score = best ? best.score : 0;
  return { emergency: score >= THRESHOLDS.emergency, score };
}

const FAMILY = {
  unknown_plant: "plant_caution",
  toxic_vs_edible: "plant_caution",
  toxic_plant_facts: "plant_caution",
  hemlock_carrot_lookalike: "plant_caution",
  camas_onion_lookalike: "plant_caution",
  magnetic_declination: "north",
  true_north: "north",
  camp_site: "camp",
  camp_sleep: "camp",
  camp_kitchen: "camp",
  camp_sanitation: "camp",
  camp_leave: "camp",
  mosquito_camp: "camp"
};

// Notes in one family (shelter_fire_1..4, the camp notes) answer the same topic, so the
// margin is measured against the best note from a different family.
export function noteFamily(symbol) {
  return FAMILY[symbol] || String(symbol || "").replace(/_\d+$/, "");
}

function confidentNote(ranked, question, floor = THRESHOLDS.fill) {
  if (!ranked?.top?.length) return { note: null, reason: "no ranking" };
  const allowed = [];
  let blockedSymbol = null;
  let blockedReason = null;
  for (const note of ranked.top) {
    const blocked = treatmentGuard(question, note.symbol);
    if (blocked) {
      if (!blockedSymbol) {
        blockedSymbol = note.symbol;
        blockedReason = blocked;
      }
      continue;
    }
    allowed.push(note);
  }
  const first = allowed[0];
  if (!first) return { note: null, reason: blockedReason || "no candidate", blockedSymbol };
  // A blocked note that outranked the pick by a lot means the question is about something else.
  if (blockedSymbol && ranked.top[0].symbol === blockedSymbol && ranked.top[0].score - first.score > 0.08) {
    return { note: null, reason: blockedReason, blockedSymbol };
  }
  const confirmed = isCareNote(first.symbol) && namesOwnCondition(question, first.symbol);
  const needed = confirmed ? floor - 0.08 : floor;
  if (first.score < needed) return { note: null, reason: "below threshold" };
  // The margin is scoped by note type: a field entry is measured against other entries, an older note
  // against older notes, so a named entry and the older note on the same topic do not cancel each other out.
  const isEntry = (note) => entryHeadHit(note.symbol, "") !== null;
  const rival = allowed.find((note) => noteFamily(note.symbol) !== noteFamily(first.symbol) && isEntry(note) === isEntry(first));
  if (!confirmed && rival && first.score - rival.score < THRESHOLDS.margin) return { note: null, reason: "no clear margin" };
  return { note: first, reason: confirmed ? "confident; question names this note's condition" : "confident" };
}

/**
 * Decide what to do with a lexical knowledge reply.
 * lexical: { text, symbol, kind } or null.
 * Returns { action: "keep" | "replace" | "fill" | "abstain" | "none", note?, reason, scores? }.
 */
export function decideNote(ctx, question, lexical) {
  const ranked = rankNotes(ctx, question);
  if (!ranked) return { action: "none", reason: "no question vector" };
  const intent = routeIntent(ctx, question);
  const best = ranked.top[0];
  const info = { top: ranked.top.map(({ symbol, score }) => ({ symbol, score: round(score) })), intent: intent?.intent || null };

  if (!lexical?.text) {
    if (intent?.blocking) return { action: "none", reason: `intent ${intent.intent}`, ...info };
    const pick = confidentNote(ranked, question);
    if (!pick.note) return { action: "none", reason: pick.reason, ...info };
    const confirmed = isCareNote(pick.note.symbol) && namesOwnCondition(question, pick.note.symbol);
    if (!confirmed && pick.note.score < THRESHOLDS.unsupportedFill && !lexicalSupport(question, pick.note)) {
      return { action: "none", reason: "no shared word and the meaning score is not high enough", ...info };
    }
    return { action: "fill", note: pick.note, reason: "meaning filled a lexical gap", ...info };
  }

  const lexicalSymbol = lexical.symbol || null;
  const lexicalGuard = lexicalSymbol && isCareNote(lexicalSymbol) ? treatmentGuard(question, lexicalSymbol) : null;
  if (lexicalGuard) {
    const pick = confidentNote(ranked, question);
    if (pick.note && pick.note.symbol !== lexicalSymbol) {
      return { action: "replace", note: pick.note, reason: `lexical care note refused: ${lexicalGuard}`, ...info };
    }
    return { action: "abstain", reason: `lexical care note refused: ${lexicalGuard}`, ...info };
  }

  // A lexical reply can join several notes, so its own text vector counts as well as its note.
  let lexicalScore = lexicalSymbol ? ranked.scoreOf(lexicalSymbol) : null;
  const replyVector = ctx.passageVector?.(lexical.text);
  const q = ctx.queryVector(question);
  if (replyVector && q) lexicalScore = Math.max(lexicalScore ?? -1, dot(replyVector, q));
  if (lexicalScore == null) return { action: "keep", reason: "no vector for the lexical reply", ...info };
  info.lexicalScore = round(lexicalScore);
  // The question names the condition of the top care note, and the lexical note is not that care.
  if (best.symbol !== lexicalSymbol && isCareNote(best.symbol) && namesOwnCondition(question, best.symbol)
    && !(lexicalSymbol && namesOwnCondition(question, lexicalSymbol))
    && !replyAddressesCondition(question, best.symbol, lexical.text) && !intent?.blocking) {
    const pick = confidentNote(ranked, question);
    if (pick.note && pick.note.symbol === best.symbol) {
      return { action: "replace", note: pick.note, reason: "meaning and the named condition point to another care note", ...info };
    }
  }
  if (best.symbol === lexicalSymbol || lexicalScore >= best.score - THRESHOLDS.agree) {
    return { action: "keep", reason: "meaning agrees", ...info };
  }
  const gap = best.score - lexicalScore;
  if (gap >= THRESHOLDS.overrideGap && best.score >= THRESHOLDS.override && !intent?.blocking) {
    const pick = confidentNote(ranked, question, THRESHOLDS.override);
    if (pick.note) return { action: "replace", note: pick.note, reason: "lexical and meaning disagree; meaning is clear", ...info };
  }
  if (gap >= THRESHOLDS.abstainGap && best.score >= THRESHOLDS.override) {
    return { action: "abstain", reason: "lexical and meaning strongly disagree", ...info };
  }
  return { action: "keep", reason: "disagreement too small to act on", ...info };
}

/**
 * Multi-part questions: each part that clearly matches its own note gets that note.
 * Returns the notes in question order, or null when fewer than two parts are clear.
 */
export function splitAnswer(ctx, question) {
  const parts = splitQuestion(question);
  if (parts.length < 2) return null;
  const chosen = [];
  const seen = new Set();
  for (const part of parts) {
    const ranked = rankNotes(ctx, part);
    if (!ranked) return null;
    const intent = routeIntent(ctx, part);
    if (intent?.blocking) continue;
    const pick = confidentNote(ranked, part, THRESHOLDS.part);
    if (!pick.note || seen.has(pick.note.symbol)) continue;
    seen.add(pick.note.symbol);
    chosen.push({ part, note: pick.note });
  }
  return chosen.length >= 2 ? chosen : null;
}

/**
 * Scripture retrieval by meaning. passages are the spiritual_index.json passages in row order.
 * filter(passage) can limit the search to a named book. Returns up to `limit` passages.
 */
export function rankScripture(ctx, question, filter = null, limit = 3) {
  const q = ctx?.queryVector?.(question);
  const scripture = ctx?.scripture;
  if (!q || !scripture?.index || !Array.isArray(scripture.passages)) return null;
  if (scripture.index.rows !== scripture.passages.length) return null;
  const scores = scoreAll(scripture.index, q, filter ? (row) => filter(scripture.passages[row]) : null);
  return topK(scores, Math.max(limit * 4, 12)).map(({ row, score }) => ({ passage: scripture.passages[row], score }));
}

export function scriptureVectorScore(ctx, question, passageText) {
  const q = ctx?.queryVector?.(question);
  const vec = ctx?.passageVector?.(passageText);
  return q && vec ? dot(q, vec) : null;
}

function round(value) {
  return Math.round(value * 1000) / 1000;
}

function noteHit(note) {
  return { kind: note.kind, symbol: note.symbol, text: note.text, title: noteTitle(note.symbol), source: note.source, score: round(note.score) };
}

/**
 * One knowledge reply after the meaning layer. lexical is { text, symbol, kind, hits } or null.
 * Returns { text, symbol, kind, hits, meaning } where meaning explains what happened.
 */
export function meaningReply(ctx, question, lexical) {
  const decision = decideNote(ctx, question, lexical);
  let text = lexical?.text || null;
  let symbol = lexical?.symbol || null;
  let kind = lexical?.kind || null;
  let hits = lexical?.hits || [];
  if (decision.action === "abstain") {
    text = null;
    symbol = null;
    kind = null;
    hits = [];
  } else if (decision.action === "fill" || decision.action === "replace") {
    text = decision.note.text;
    symbol = decision.note.symbol;
    kind = decision.note.kind;
    hits = [noteHit(decision.note)];
  }
  const split = decision.action === "none" && decision.reason === "no question vector" ? null : splitAnswer(ctx, question);
  if (split) {
    const covered = (note) => Boolean(text) && text.includes(note.text.slice(0, 60));
    const missing = split.filter(({ note }) => !covered(note.note || note));
    const anchored = split.some(({ note }) => note.symbol === symbol);
    if (missing.length && (!text || anchored)) {
      text = [text, ...missing.map(({ note }) => note.text)].filter(Boolean).join(" ");
      if (!symbol) {
        symbol = split[0].note.symbol;
        kind = split[0].note.kind;
      }
      hits = [...hits, ...missing.map(({ note }) => noteHit(note))];
    } else if (missing.length === split.length && text && !anchored) {
      text = split.map(({ note }) => note.text).join(" ");
      symbol = split[0].note.symbol;
      kind = split[0].note.kind;
      hits = split.map(({ note }) => noteHit(note));
    }
  }
  return {
    text,
    symbol,
    kind,
    hits,
    meaning: {
      action: split && text !== (lexical?.text || null) && decision.action !== "fill" && decision.action !== "replace" ? "split" : decision.action,
      reason: decision.reason,
      top: decision.top || [],
      intent: decision.intent || null,
      lexicalScore: decision.lexicalScore ?? null,
      split: split ? split.map(({ note }) => note.symbol) : null
    }
  };
}
