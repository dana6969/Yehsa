// Quote indexed lines. No filesystem, so the phone can use the same words.
import { queryTokens, textHasToken } from "./book_search.js";
import { onSubject, titleWordOnly } from "./scripture_guard.js";
import { isSpiritualQuestion } from "./spiritual_route.js";
import { cleanQuote } from "./reasoning/quote_clean.js";

const BOOKS = [
  ["gita", /gita/i],
  ["dhammapada", /dhammapada/i],
  ["kybalion", /kybalion/i],
  ["hermetica", /hermes|hermetica/i],
  ["hermes", /hermes|hermetica/i],
  ["tao", /tao te ching/i],
  ["barddas", /barddas/i],
  ["kjv", /bible|kjv/i],
  ["bible", /bible|kjv/i],
  ["genesis", /genesis/i],
  ["exodus", /exodus/i],
  ["psalm", /psalm/i],
  ["matthew", /matthew/i],
  ["mark", /mark/i],
  ["luke", /luke/i],
  ["john", /john/i],
  ["isaiah", /isaiah/i],
  ["proverbs", /proverbs/i],
  ["romans", /to the romans/i],
  ["acts", /acts of the apostles/i],
  ["corinthians", /corinthians/i],
  ["galatians", /galatians/i],
  ["ephesians", /ephesians/i],
  ["hebrews", /hebrews/i],
  ["revelation", /revelation/i],
  ["kings", /book of the kings|kings/i]
];

export function namedBook(raw) {
  const text = String(raw || "");
  return BOOKS.find(([word]) => new RegExp(`\\b${word}\\b`, "i").test(text)) || null;
}

function toRoman(value) {
  const n = Number(value);
  const table = [[10, "x"], [9, "ix"], [5, "v"], [4, "iv"], [1, "i"]];
  let left = n;
  let out = "";
  for (const [step, glyph] of table) {
    while (left >= step) {
      out += glyph;
      left -= step;
    }
  }
  return out;
}

export function exactVerse(raw, passages) {
  const text = String(raw || "");
  const chapter = text.match(/\bchapter\s+(\d+|[ivx]+)\b.{0,24}\bstanza\s+(\d+)\b/i);
  if (chapter) {
    const roman = /^\d+$/.test(chapter[1]) ? toRoman(chapter[1]) : chapter[1].toLowerCase();
    const stanza = chapter[2];
    const hit = passages.find((passage) => {
      const hay = `${passage.title} ${passage.ref}`.toLowerCase();
      return hay.includes(`chapter ${roman}`) && new RegExp(`stanza ${stanza}(?:[^0-9]|$)`).test(hay);
    });
    if (hit) return hit;
  }
  const match = text.match(/\b([a-z]+)\s+(\d{1,3}):(\d{1,3})\b/i);
  if (!match) return null;
  const book = match[1].toLowerCase();
  const refRe = new RegExp(`(?:^|[^0-9])${match[2]}:${match[3]}(?:[^0-9]|$)`);
  const hit = passages.find((passage) => {
    const hay = `${passage.title} ${passage.ref}`;
    if (!refRe.test(hay)) return false;
    return hay.toLowerCase().includes(book);
  });
  return hit || null;
}

function scorePassage(passage, tokens, raw) {
  const blob = `${passage.title} ${passage.ref} ${passage.text}`;
  let score = 0;
  for (const token of tokens) {
    // "Romans" in "Muslims and Romans" is a people, not the Epistle: a title word counts in the text only.
    const hay = titleWordOnly(raw, token) ? passage.text : blob;
    if (textHasToken(hay, token)) score += token.length > 4 ? 3 : 2;
  }
  const book = namedBook(raw);
  if (book && !titleWordOnly(raw, book[0]) && book[1].test(`${passage.title} ${passage.ref}`)) score += 12;
  if (/\bbegat\b/i.test(passage.text) && !/\b(begat|genealog)/i.test(raw)) score -= 20;
  if (/\b(grief|grieving|heartbroken|angry|anger)\b/i.test(raw)) {
    if (/\b(comfort|peace|sorrow|merciful|forgiv|wrath)\b/i.test(passage.text)) score += 8;
    if (/\b(thorn|brier|shekel|cubit|begat)\b/i.test(passage.text)) score -= 12;
  }
  const words = passage.text.split(/\s+/).length;
  if (words > 80 && !/\b\d{1,3}:\d{1,3}\b/.test(raw)) score -= 6;
  if (!score) return 0;
  const focus = tokens[0];
  const mentions = passage.text.toLowerCase().match(new RegExp(`\\b${focus}\\b`, "g"));
  score += mentions ? mentions.length : 0;
  if (passage.text.length < 220) score += 1;
  return score;
}

export function quoteSpiritual(raw, passages) {
  const tokens = queryTokens(String(raw || "").replace(/[?]/g, " "));
  const list = Array.isArray(passages) ? passages : [];
  if (!list.length) return null;
  const exact = exactVerse(raw, list);
  if (exact) {
    const quotes = [`${exact.title}, ${exact.ref}: "${cleanQuote(exact.text)}"`];
    return {
      text: `These lines are what the texts say. They are not a verdict. ${quotes[0]} This is what these texts say, not a verdict from Yehsa.`,
      symbol: exact.ref,
      kind: "spiritual",
      source: exact.source,
      hits: [{ kind: "spiritual", symbol: exact.ref, text: exact.text, title: exact.title, source: exact.source, score: 1 }]
    };
  }
  if (!tokens.length) return null;
  const ranked = [];
  for (const passage of list) {
    const score = scorePassage(passage, tokens, raw);
    if (score > 0) ranked.push({ passage, score });
  }
  ranked.sort((a, b) => b.score - a.score || a.passage.text.length - b.passage.text.length);
  // A question that is not plainly about the texts gets only passages that contain its subject.
  if (!isSpiritualQuestion(raw)) {
    const keep = new Set(onSubject(raw, ranked.map((item) => item.passage)));
    for (let i = ranked.length - 1; i >= 0; i -= 1) if (!keep.has(ranked[i].passage)) ranked.splice(i, 1);
  }
  // "Romans chapter 8": that book's chapter first.
  const book = namedBook(raw);
  const chapter = String(raw || "").match(/\bchapter\s+(\d{1,3})\b/i);
  if (book && chapter && !/\bstanza\b/i.test(raw)) {
    const inChapter = (p) => book[1].test(`${p.title} ${p.ref}`) && new RegExp(`(?:^|\\D)${chapter[1]}:\\d`).test(p.ref);
    const hits = ranked.filter((item) => inChapter(item.passage));
    if (hits.length) ranked.splice(0, ranked.length, ...hits, ...ranked.filter((item) => !inChapter(item.passage)));
  }
  const chosen = [];
  const seenTitle = new Set();
  for (const item of ranked) {
    if (seenTitle.has(item.passage.title) && chosen.length < 2) continue;
    chosen.push(item.passage);
    seenTitle.add(item.passage.title);
    if (chosen.length === 3) break;
  }
  if (!chosen.length) return null;
  const quotes = chosen.map((passage) => `${passage.title}, ${passage.ref}: "${cleanQuote(passage.text)}"`);
  const text = [
    "These lines are what the texts say. They are not a verdict.",
    ...quotes,
    "This is what these texts say, not a verdict from Yehsa."
  ].join(" ");
  return {
    text,
    symbol: chosen[0].ref,
    kind: "spiritual",
    source: chosen[0].source,
    hits: chosen.map((passage) => ({
      kind: "spiritual",
      symbol: passage.ref,
      text: passage.text,
      title: passage.title,
      source: passage.source,
      score: 1
    }))
  };
}
