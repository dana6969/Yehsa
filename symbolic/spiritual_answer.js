// Quotes from the offline spiritual index. No paraphrase of scripture.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { queryTokens, textHasToken } from "./book_search.js";
import { isFieldLightQuestion, isSpiritualQuestion } from "./spiritual_route.js";

export { isFieldLightQuestion, isSpiritualQuestion };

const INDEX = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../symbolic_memory/spiritual_index.json");
let cached = null;

function load() {
  if (cached) return cached;
  cached = JSON.parse(fs.readFileSync(INDEX, "utf8"));
  return cached;
}

function scorePassage(passage, tokens) {
  const blob = `${passage.title} ${passage.text}`;
  let score = 0;
  for (const token of tokens) {
    if (textHasToken(blob, token)) score += token.length > 4 ? 3 : 2;
  }
  if (!score) return 0;
  const focus = tokens[0];
  const mentions = passage.text.toLowerCase().match(new RegExp(`\\b${focus}\\b`, "g"));
  score += mentions ? mentions.length : 0;
  if (passage.text.length < 220) score += 1;
  return score;
}

export function spiritualAnswer(raw) {
  const tokens = queryTokens(String(raw || "").replace(/[?]/g, " "));
  if (!tokens.length) return null;
  const index = load();
  const ranked = [];
  for (const passage of index.passages) {
    const score = scorePassage(passage, tokens);
    if (score > 0) ranked.push({ passage, score });
  }
  ranked.sort((a, b) => b.score - a.score || a.passage.text.length - b.passage.text.length);
  const chosen = [];
  const seenTitle = new Set();
  for (const item of ranked) {
    if (seenTitle.has(item.passage.title) && chosen.length < 2) continue;
    chosen.push(item.passage);
    seenTitle.add(item.passage.title);
    if (chosen.length === 3) break;
  }
  if (!chosen.length) return null;
  const quotes = chosen.map((passage) => `${passage.title}, ${passage.ref}: "${passage.text}"`);
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
