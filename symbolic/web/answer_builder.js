// Builds the short answer a person reviews: a few sentences lifted word for word from the sources,
// each followed by its citation number. Nothing is paraphrased, so nothing is made up; a source
// that does not say it cannot be cited for it.

import { queryTokens, textHasToken } from "../book_search.js";
import { looksLikeInstruction, sensitiveKind } from "./sanitize.js";
import { expandTokens } from "./synonyms.js";
import { outboundQuery } from "./sources.js";

export const MAX_SENTENCES = 3;
export const MAX_PER_SOURCE = 2;
export const MAX_ANSWER_CHARS = 700;

const PRIORITY = { pack: 0, gov: 1, web: 1, wikipedia: 2 };
// The Army manuals and the agencies come first when they say it; an encyclopedia page gets one line.
const BONUS = { pack: 0.4, gov: 0.2, wikipedia: 0 };
const PER_SOURCE = { pack: MAX_PER_SOURCE, gov: MAX_PER_SOURCE, web: MAX_PER_SOURCE, wikipedia: 1 };
// Open-web pages earn their bonus from the site: state and federal sites most, unknown sites least.
function bonusFor(candidate) {
  if (candidate.kind === "web") return 0.4 * Math.max(0, Math.min(1, Number(candidate.authority) || 0));
  return BONUS[candidate.kind] ?? 0;
}

const BOILERPLATE = /\b(?:click|tap here|visit (?:our|the|www|https?)|please visit|for more (?:information|info|details)|learn more|read more|sign up|subscribe|newsletter|cookies?|javascript|your browser|share this|follow us|contact us|privacy policy|terms of (?:use|service)|skip to|log ?in|download|advertis\w+|sponsored|\[link removed\])\b/i;

export function splitSentences(text) {
  return String(text || "")
    .split(/\n+/)
    .flatMap((block) => block.replace(/\s+/g, " ").split(/(?<=[.!?])\s+(?=[A-Z0-9"(])|\s*•\s*/))
    .map((part) => part.trim())
    .filter((part) => part.length >= 30 && part.length <= 420 && proseLike(part));
}

// Captions, menus and lists of names are mostly capitalised words. Prose is mostly lower case.
function proseLike(text) {
  const words = text.split(/\s+/).filter((word) => /^[A-Za-z]/.test(word));
  if (words.length < 5) return false;
  return words.filter((word) => /^[a-z]/.test(word)).length / words.length >= 0.4;
}

/** Share of the question's words (or their swaps) that appear in the text, 0..1. */
export function coverage(text, groups) {
  if (groups.length === 0) return 0;
  let hit = 0;
  for (const group of groups) if (group.some((token) => textHasToken(text, token))) hit += 1;
  return hit / groups.length;
}

const FILLER = new Set(["tell", "know", "info", "information", "anything", "something", "everything", "thing", "things", "some", "much", "many", "need", "want", "please", "learn"]);

/** The question's topic words (lead-ins like "tell me about" dropped), each with its swaps. */
export function questionGroups(question) {
  // "near me" is a place request, not a topic word. The place itself is added to the search, not here.
  const plainQuestion = String(question || "").replace(/\b(?:near me|nearby|near here|around me|around here|in my area|close to me|where i am)\b/gi, " ");
  const words = queryTokens(outboundQuery(plainQuestion) || plainQuestion).filter((word) => !FILLER.has(word));
  return expandTokens(words);
}

function near(a, b) {
  const wa = new Set(a.toLowerCase().split(/\W+/));
  const wb = b.toLowerCase().split(/\W+/);
  const same = wb.filter((w) => wa.has(w)).length;
  return same / Math.max(wb.length, 1) > 0.8;
}

/**
 * candidates: [{ sourceId, sourceName, kind: "pack"|"gov"|"wikipedia", ref, title, url, license, licenseUrl, attribution, fetchedAt, text }]
 * link: an optional link-only citation (state wildlife). Returns null when nothing answers the question.
 */
export function buildAnswer({ question, query = "", candidates = [], link = null, now = Date.now(), meaning = null, strict = false }) {
  const groups = questionGroups(question);
  if (groups.length === 0) return null;
  const need = groups.length === 1 ? 1 : 0.5;
  const pool = [];
  candidates.forEach((candidate, ci) => {
    const context = coverage(`${candidate.title || ""} ${candidate.section || ""} ${candidate.text}`, groups);
    // A page named for the topic ("Moose" for "what is a moose") leads with its definition.
    const named = coverage(candidate.title || "", groups) === 1 ? 0.4 : 0;
    const found = [];
    splitSentences(candidate.text).forEach((sentence, si) => {
      if (looksLikeInstruction(sentence)) return;
      // Page chrome on open-web pages: "For more information, visit ...", cookie and sign-up lines.
      if ((candidate.kind === "web" || candidate.kind === "gov") && BOILERPLATE.test(sentence)) return;
      const words = coverage(sentence, groups);
      // The on-device meaning matcher (when it ran) can lift a sentence that says it in other words.
      const sim = meaning?.get?.(sentence);
      const lift = Number.isFinite(sim) ? Math.max(-0.2, Math.min(0.4, (sim - 0.6) * 1.5)) : 0;
      if (Number.isFinite(sim) && sim < 0.45 && candidate.kind === "web") return;
      const score = words + (words > 0 ? lift : 0);
      // An encyclopedia page is long; one of its sentences has to name the whole topic.
      if (candidate.kind === "wikipedia" && words < 1) return;
      // Law, news and local questions: a field manual line must name the whole topic to be quoted.
      if (strict && candidate.kind === "pack" && words < 1) return;
      if (score < need && !(words > 0 && context === 1)) return;
      found.push({ sentence, ci, si, score, priority: PRIORITY[candidate.kind] ?? 3 });
    });
    // A passage that keeps talking about the topic beats one stray mention.
    const cluster = Math.min(found.length, 4) * 0.05;
    for (const item of found) pool.push({ ...item, score: item.score + context * 0.25 + cluster + bonusFor(candidate) + named + (named && item.si === 0 ? 0.2 : 0), cap: PER_SOURCE[candidate.kind] ?? 1 });
  });
  pool.sort((a, b) => b.score - a.score || a.priority - b.priority || a.ci - b.ci || a.si - b.si);
  const chosen = [];
  const perSource = new Map();
  let chars = 0;
  for (const item of pool) {
    if (chosen.length >= MAX_SENTENCES) break;
    if ((perSource.get(item.ci) || 0) >= item.cap) continue;
    if (chosen.some((other) => near(other.sentence, item.sentence))) continue;
    if (chars + item.sentence.length > MAX_ANSWER_CHARS && chosen.length > 0) continue;
    chosen.push(item);
    perSource.set(item.ci, (perSource.get(item.ci) || 0) + 1);
    chars += item.sentence.length;
  }
  if (chosen.length === 0) return null;
  // Best source first; a source's own sentences stay in their own order.
  const rank = new Map();
  chosen.forEach((item, i) => { if (!rank.has(item.ci)) rank.set(item.ci, i); });
  chosen.sort((a, b) => rank.get(a.ci) - rank.get(b.ci) || a.si - b.si);
  const numbers = new Map();
  const citations = [];
  for (const item of chosen) {
    if (numbers.has(item.ci)) continue;
    const c = candidates[item.ci];
    numbers.set(item.ci, citations.length + 1);
    citations.push({
      n: citations.length + 1,
      sourceId: c.sourceId,
      sourceName: c.sourceName,
      ref: c.ref || "",
      title: c.title || "",
      url: c.url,
      license: c.license || "",
      licenseUrl: c.licenseUrl || "",
      attribution: c.attribution || "",
      fetchedAt: c.fetchedAt || new Date(now).toISOString()
    });
  }
  const text = chosen.map((item) => `${item.sentence.replace(/\s*$/, "")} [${numbers.get(item.ci)}]`).join(" ");
  const links = link ? [{ ...link, n: citations.length + 1 }] : [];
  return {
    question: String(question).slice(0, 200),
    query,
    text,
    citations,
    links,
    primary: citations[0].sourceName,
    sensitive: sensitiveKind(text, question),
    builtAt: new Date(now).toISOString()
  };
}

/** The citation block shown under a reviewed or kept answer. */
export function citationLines(answer) {
  const lines = (answer?.citations || []).map((c) => `[${c.n}] ${c.sourceName}${c.ref ? `, ${c.ref}` : ""}${c.title && (c.sourceId === "wikipedia" || c.sourceId === "web") ? `: "${c.title}"` : ""}. ${c.url}${c.license ? ` (${c.license})` : ""}`);
  for (const link of answer?.links || []) lines.push(`[${link.n}] ${link.sourceName} (${link.state}). Link only, not read: ${link.url}`);
  return lines;
}
