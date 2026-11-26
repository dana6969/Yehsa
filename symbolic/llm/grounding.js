// Grounding layer for Yehsa AI (on-device). Pure JavaScript: no model, no native code, so it is
// unit-tested in Node and never loaded on the hot path (getMappedAction does not import it).
//
// The model sits AFTER the symbolic pipeline. It only ever sees the question plus the passages
// that retrieval already found (field notes, books, downloaded documents, or a web quote the user
// asked for), numbered [1]..[n]. Its reply is extra text under the existing answer, labelled
// "Yehsa AI (on-device)". It never replaces the answer and never runs for safety or medical
// routes, misses, emergencies, calculators, weather, or capability blurbs.
import { AI_LABEL, LLM_LIMITS } from "./model_info.js";

// Answer kinds that are rules, exact quotes, or tools. Rephrasing them adds risk and no value.
const SKIP_KINDS = new Set([
  "medical", "first-aid", "safety", "emergency", "sos", "dosing", "poison",
  "calculator", "math", "about", "weather", "social", "capability", "action", "map-query",
  "learned-correction", "error", "trip",
  // Plant and mushroom identification: a reworded "it's edible" is a poisoning risk.
  "herbology", "plant-id", "edible", "foraging", "mushroom"
]);

// Words that mean someone may be hurt right now, or want a dose. The note answers alone.
const URGENT = /\b(bleed(?:ing)?|hemorrhag\w*|tourniquet|unconscious|not breathing|cpr|chest pain|heart attack|stroke|seizure|anaphyla\w*|overdose|poison(?:ed|ing)?|suicid\w*|kill (?:myself|me)|self[- ]harm|choking|snake ?bite|venom\w*|burns? (?:on|over)|frostbite|hypotherm\w*|heat ?stroke|broken (?:neck|back|spine)|spinal|dose|dosage|mg\b|milligram\w*|how much (?:\w+ )?(?:should i|to) take|antibiotic\w*|insulin|epipen|sos|emergency|911|112|999)\b/i;

// Phrases the safety layer uses when a note contradicts a dangerous premise. Those stand alone.
const STANDING = /contradicts that premise|last resort|do not rub|The claim is not safe/i;

function str(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

/** Whether Yehsa AI may add a line under this answer. Returns { ok, reason }. */
export function aiEligibility(question, result, { enabled = true, webNote = null } = {}) {
  if (!enabled) return { ok: false, reason: "off" };
  const asked = str(question);
  if (!asked) return { ok: false, reason: "empty" };
  if (URGENT.test(asked)) return { ok: false, reason: "urgent" };
  if (webNote) {
    if (webNote.locked) return { ok: false, reason: "sensitive-web" };
    if (!str(webNote.text)) return { ok: false, reason: "no-passages" };
    return { ok: true, reason: "web" };
  }
  if (!result || result.answered !== true || !str(result.text)) return { ok: false, reason: "miss" };
  if (result.abstain) return { ok: false, reason: "abstain" };
  const kind = String(result.kind || "").toLowerCase();
  if (SKIP_KINDS.has(kind)) return { ok: false, reason: `kind:${kind}` };
  if (STANDING.test(result.text)) return { ok: false, reason: "standing-note" };
  // A numbered field-note procedure (steps, times, amounts) asked as a how-to is already the
  // clearest form, and a reworded step can drop a minute or a warning, so the note stands alone.
  // "What is X", "why", "explain", or "difference" questions get the AI's focused answer.
  const howTo = /^\s*(how\b|what (?:are the )?steps|steps? (?:to|for)|walk me through|teach me)/i.test(asked) || /\bhow (?:do|can|should|to)\b/i.test(asked);
  const understanding = /\b(why|explain|summari[sz]e|in short|simpl(?:y|er)|compare|difference|what (?:is|are|does)|what's|define|meaning|mean)\b/i.test(asked);
  if (/(^|\n)\s*[1-9]\.\s+\S/.test(String(result.text)) && /(^|\n)\s*2\.\s+\S/.test(String(result.text)) && (howTo || !understanding)) {
    return { ok: false, reason: "procedure" };
  }
  // A dictionary definition is not a how-to: "how do I make a snare" answered by a definition is a misroute.
  if (kind === "dictionary" && /^\s*(how|what should|what do i|can i|should i)\b/i.test(asked)) return { ok: false, reason: "dictionary-howto" };
  if (result.advice === "medical" || result.locked === "medical" || result.locked === "dosing") return { ok: false, reason: "sensitive" };
  return { ok: true, reason: "grounded" };
}

function cap(text, max) {
  const t = str(text);
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("? "), cut.lastIndexOf("! "));
  return (end > max * 0.5 ? cut.slice(0, end + 1) : cut).trim();
}

// Drop our own "Sources:" blocks and inline [n] marks from a passage: the model gets its own numbers.
function bodyOnly(text) {
  return String(text || "")
    .split(/\n\s*Sources?:\s*\n/i)[0]
    .replace(/\[\d+\]/g, "")
    .replace(/\bUnverified: quoted from a document[^.]*\.[^.]*\./i, "");
}

/** Splits a web note ("quote [1] quote [2]") into one passage per cited source. */
export function webNotePassages(note) {
  if (!note || !str(note.text)) return [];
  const cites = Array.isArray(note.citations) ? note.citations : [];
  const byN = new Map(cites.map((c) => [Number(c.n), c]));
  const parts = [];
  const re = /([^[\]]+?)\s*\[(\d+)\]/g;
  let m;
  while ((m = re.exec(note.text))) {
    const n = Number(m[2]);
    const prev = parts.find((p) => p.cite === n);
    if (prev) prev.text = `${prev.text} ${str(m[1])}`;
    else parts.push({ cite: n, text: str(m[1]) });
  }
  if (!parts.length) parts.push({ cite: cites[0]?.n ?? 1, text: str(note.text) });
  return parts.map((p) => {
    const c = byN.get(p.cite) || cites[0] || {};
    return { text: p.text, source: str(c.sourceName || note.sourceName || note.title || "Web"), url: c.url || note.sourceUrl || null };
  });
}

const STOP = new Set("the and how can you get for are was why who use did does not but its it's his her she him our out own any all one two way too has had may let see say put off yes".split(" ").concat("about above after again against also because been before being below between both could does doing down during each from further have having here hers herself himself into itself just more most myself once only other ought ourselves over same should some such than that their theirs them themselves then there these they this those through under until very were what when where which while whom with would your yours yourself yourselves tell show give know need want make made like using used please thing things best good does work explain explained describe define definition meaning mean means difference different compare versus between summary summarize simple simply short".split(" ")));

// Crude stem: drop a plural "s", keep 5 letters ("knots" and "knot" match).
function stem(w) {
  return (w.length > 3 && /[^s]s$/.test(w) ? w.slice(0, -1) : w).slice(0, 5);
}

/** The question's content words (3+ letters, no filler), as 5-letter stems. */
export function contentStems(question) {
  return [...new Set((String(question || "").toLowerCase().match(/[a-z]{3,}/g) || []).filter((w) => !STOP.has(w)).map(stem))];
}

/** Share of the question's content words that a passage mentions, 0..1. */
export function relevance(question, text) {
  const stems = contentStems(question);
  if (!stems.length) return 1;
  const words = new Set((String(text || "").toLowerCase().match(/[a-z]{3,}/g) || []).map(stem));
  return stems.filter((s) => words.has(s)).length / stems.length;
}

// "symbolic_books/survival/entries_hunting.json" reads as "Yehsa notes: hunting".
function niceSource(source) {
  const s = str(source);
  if (!s || s === "lexical-headword") return s === "lexical-headword" ? "Yehsa dictionary" : "";
  if (/[\/]/.test(s) && /\.(json|txt|md|js)$/i.test(s)) {
    const base = s.split(/[\/]/).pop().replace(/\.[a-z]+$/i, "").replace(/^entries_/, "").replace(/[_-]+/g, " ");
    return `Yehsa notes: ${base}`;
  }
  return s;
}

/** The passages the model may use, numbered from 1, each with its own source. */
export function collectPassages(result, { webNote = null, question = "" } = {}) {
  const out = [];
  const push = (text, source, url = null, minRelevance = 0) => {
    const t = cap(bodyOnly(text), LLM_LIMITS.passageCharCap);
    if (t.length < 20 || out.length >= LLM_LIMITS.maxPassages) return;
    if (out.some((p) => p.text === t)) return;
    if (question && minRelevance > 0 && relevance(question, t) < minRelevance) return;
    out.push({ n: out.length + 1, text: t, source: niceSource(source) || "Yehsa notes", url: url || null });
  };
  if (webNote) {
    for (const p of webNotePassages(webNote)) push(p.text, p.source, p.url);
  } else if (result) {
    const citations = Array.isArray(result.citations) ? result.citations : [];
    const firstSection = Array.isArray(result.sections) ? result.sections.find((s) => !s.title && str(s.text)) : null;
    const main = firstSection?.text || result.text;
    const mainSource = citations[0]
      ? `${str(citations[0].sourceName || citations[0].title)}${citations[0].ref ? `, ${citations[0].ref}` : ""}`
      : (result.source || (result.symbol ? `Yehsa field note: ${String(result.symbol).replace(/_/g, " ")}` : "Yehsa notes"));
    push(main, mainSource, citations[0]?.url || null);
    // Other search hits only when they are clearly about the question.
    for (const hit of Array.isArray(result.hits) ? result.hits : []) {
      push(hit?.context || hit?.text, hit?.source || (hit?.symbol ? `Yehsa field note: ${String(hit.symbol).replace(/_/g, " ")}` : ""), null, 0.6);
    }
  }
  // Keep the whole prompt inside the budget, dropping the last passages first.
  let total = 0;
  return out.filter((p) => (total += p.text.length) <= LLM_LIMITS.promptCharBudget || p.n === 1);
}

export const SYSTEM_PROMPT = [
  "You are Yehsa AI, a careful assistant that runs offline on the user's phone.",
  "Answer ONLY from the numbered passages the user gives you. Do not use outside knowledge.",
  "Put the passage number in square brackets after each fact, like [1] or [2]. Use only numbers that exist.",
  "If the passages are about something else or do not answer the question, reply exactly: The notes on this phone don't answer that.",
  "Answer the question directly first, then add the most useful details. Use your own words but keep every warning.",
  "Never give medicine doses, never diagnose, and never contradict a warning in the passages.",
  "Write plain English in 2 to 5 short sentences. No headings, no lists, no links. Do not talk about the passages themselves."
].join(" ");

/** Chat messages for the model (llama.rn applies the model's own chat template). */
export function buildMessages(question, passages) {
  const block = passages.map((p) => `[${p.n}] (${p.source}) ${p.text}`).join("\n\n");
  return [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: `Passages:\n${block}\n\nQuestion: ${str(question)}\n\nAnswer from the passages, with [n] after each fact.` }
  ];
}

export const STOP_WORDS = ["<|im_end|>", "<|endoftext|>", "<|im_start|>", "</s>", "<|eot_id|>", "<end_of_turn>", "\nQuestion:", "\nPassages:"];

const NO_ANSWER = /notes on this phone don.t answer that/i;
// Meta talk about the passages instead of an answer.
const META = /\b(passages?|is not relevant|isn't relevant|does not mention|doesn't mention|not mentioned|no information|the text|the notes? (?:do(?:es)? not|don't))\b/i;

// Numbers written in the passages or the question. A number only the model wrote is not trusted.
function numbersIn(text) {
  return new Set((String(text || "").match(/\d+(?:[.,]\d+)?/g) || []).map((n) => n.replace(",", ".")));
}

function sentences(text) {
  return String(text || "").replace(/\s+/g, " ").trim().match(/[^.!?]+[.!?]+(?:\s*\[\d+\])*|[^.!?]+$/g) || [];
}

/** Light clean-up while tokens stream in: drop citations that point at no passage, and any link. */
export function cleanPartial(raw, passages) {
  const max = passages.length;
  return String(raw || "")
    .replace(/<\|[^|]*\|>/g, "")
    .replace(/\bhttps?:\/\/\S+/gi, "")
    .replace(/\[(\d+)\]/g, (all, n) => (Number(n) >= 1 && Number(n) <= max ? all : ""))
    .replace(/^\s*(Answer|Yehsa AI)\s*:\s*/i, "")
    .replace(/\*\*|__|^#+\s*/gm, "")
    .replace(/(^|\n)\s*(?:[-*•]|\d+\.)\s+/g, "$1")
    .replace(/[ \t]+/g, " ")
    .trimStart();
}

/**
 * Final check on the model's text. Returns { text, citations, dropped, grounded, empty }.
 * - Sentences with a number that is not in the passages or the question are dropped.
 * - Sentences that cite nothing are kept only if every content word is found in the passages.
 * - A reply that says the notes don't answer is turned into an empty result (nothing is shown).
 */
export function finalizeAiText(raw, passages, question = "") {
  const cleaned = cleanPartial(raw, passages).trim();
  if (!cleaned || NO_ANSWER.test(cleaned)) return { text: "", citations: [], dropped: 0, grounded: false, empty: true };
  const known = numbersIn(passages.map((p) => p.text).join(" ") + " " + question);
  for (const p of passages) known.add(String(p.n));
  const corpusRaw = passages.map((p) => p.text).join(" ");
  const corpus = corpusRaw.toLowerCase();
  const asked = String(question || "").toLowerCase();
  const kept = [];
  let dropped = 0;
  for (const s of sentences(cleaned)) {
    const sentence = s.trim();
    if (!sentence) continue;
    const plain = sentence.replace(/\[\d+\]/g, "");
    if (META.test(plain) || /:\s*$/.test(plain)) { dropped += 1; continue; }
    const nums = [...numbersIn(plain)];
    if (nums.some((n) => !known.has(n))) { dropped += 1; continue; }
    // Every sentence, cited or not: its content words must come from the passages (or the question).
    const words = (plain.toLowerCase().match(/[a-z]{5,}/g) || []).filter((w) => !STOP.has(w));
    const unseen = words.filter((w) => !corpus.includes(w.slice(0, 5)) && !asked.includes(w.slice(0, 5)));
    if (words.length && unseen.length / words.length > 0.25) { dropped += 1; continue; }
    // A name (a capitalised word after the first) the passages never use is invented.
    const names = (plain.match(/(?<=\S\s+)[A-Z][a-z]{2,}/g) || []).filter((w) => !corpusRaw.includes(w));
    if (names.length) { dropped += 1; continue; }
    kept.push(sentence);
  }
  let text = kept.join(" ").replace(/\s+([.,!?])/g, "$1").trim();
  // No [n] from the model: cite the passages its words actually come from.
  if (text && !/\[\d+\]/.test(text)) {
    const from = passages.filter((p) => relevance(text, p.text) >= 0.3).map((p) => `[${p.n}]`);
    if (from.length) text = `${text} ${from.join("")}`;
  }
  const used = [...new Set((text.match(/\[(\d+)\]/g) || []).map((c) => Number(c.slice(1, -1))))].sort((a, b) => a - b);
  const citations = used.map((n) => passages.find((p) => p.n === n)).filter(Boolean).map((p) => ({ n: p.n, source: p.source, url: p.url }));
  return { text, citations, dropped, grounded: citations.length > 0, empty: !text };
}

/** The footer under an AI block: its label and the sources it actually cited. */
export function aiFooter(final) {
  const cited = (final?.citations || []).map((c) => `[${c.n}] ${c.source}`).join("; ");
  return cited ? `${AI_LABEL}. Sources: ${cited}.` : `${AI_LABEL}. Drawn from the answer above; check it there.`;
}
