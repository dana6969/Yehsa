// Scripture retrieval by meaning. Exact references (John 3:16, chapter 1 stanza 1) stay with
// the exact lookup. Otherwise the lexical quote is kept when the meaning agrees with it, and
// the closest passages by meaning are quoted when it does not. Quotes are verbatim.

import { exactVerse, namedBook } from "../spiritual_quote.js";
import { rankScripture, scriptureVectorScore, THRESHOLDS } from "./meaning_layer.js";
import { onSubject, titleWordOnly } from "../scripture_guard.js";
import { isSpiritualQuestion } from "../spiritual_route.js";
import { cleanQuote } from "../reasoning/quote_clean.js";

const FILL_FLOOR = 0.58;

function format(chosen) {
  const quotes = chosen.map((passage) => `${passage.title}, ${passage.ref}: "${cleanQuote(passage.text)}"`);
  return {
    text: ["These lines are what the texts say. They are not a verdict.", ...quotes, "This is what these texts say, not a verdict from Yehsa."].join(" "),
    symbol: chosen[0].ref,
    kind: "spiritual",
    source: chosen[0].source,
    hits: chosen.map((passage) => ({ kind: "spiritual", symbol: passage.ref, text: passage.text, title: passage.title, source: passage.source, score: 1 }))
  };
}

export function scriptureByMeaning(ctx, raw, lexical, passages) {
  if (!ctx?.scripture || !Array.isArray(passages)) return lexical;
  if (exactVerse(raw, passages)) return lexical;
  const found = namedBook(raw);
  const book = found && !titleWordOnly(raw, found[0]) ? found : null;
  const filter = book ? (passage) => book[1].test(`${passage.title} ${passage.ref}`) : null;
  let ranked = rankScripture(ctx, raw, filter, 3);
  // R9: a question that is not plainly about the texts is quoted only where a passage has its subject words.
  if (!isSpiritualQuestion(raw) && ranked?.length) {
    const keep = new Set(onSubject(raw, ranked.map((item) => item.passage)));
    ranked = ranked.filter((item) => keep.has(item.passage));
    if (!ranked.length) return lexical;
  }
  if (!ranked?.length) return lexical;
  const best = ranked[0].score;
  const lexicalText = lexical?.hits?.[0]?.text;
  const lexicalScore = lexicalText ? scriptureVectorScore(ctx, raw, lexicalText) : null;
  if (lexical && (lexicalScore == null || best - lexicalScore < THRESHOLDS.scriptureGap)) return lexical;
  if (!lexical && best < FILL_FLOOR) return null;
  const chosen = [];
  const seen = new Set();
  for (const { passage } of ranked) {
    if (/\bbegat\b/i.test(passage.text) && !/\b(begat|genealog)/i.test(raw)) continue;
    if (passage.text.split(/\s+/).length > 80) continue;
    if (seen.has(passage.title) && chosen.length < 2) continue;
    chosen.push(passage);
    seen.add(passage.title);
    if (chosen.length === 3) break;
  }
  if (!chosen.length) return lexical;
  return { ...format(chosen), meaning: { action: lexical ? "replace" : "fill", best, lexicalScore } };
}
