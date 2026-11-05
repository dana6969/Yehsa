// Passage ranking with no filesystem. book_index.js loads the corpus, then calls this.
// The phone shell calls searchPassages on the bundled field-note index.

const QUERY_STOP = new Set([
  "the", "and", "for", "with", "what", "how", "does", "about", "from", "that", "this",
  "are", "was", "who", "why", "can", "you", "your", "not", "use", "using"
]);

export function queryTokens(query) {
  return String(query || "")
    .toLowerCase()
    .split(/[^a-z0-9+]+/)
    .filter((word) => word.length > 2 && !QUERY_STOP.has(word));
}

export function sourceKind(source) {
  const value = String(source || "").toLowerCase();
  if (value.includes("herbology")) return "herbology";
  if (value.includes("landscape")) return "landscape";
  if (value.includes("survival")) return "survival";
  if (value.includes("medical")) return "medical";
  if (value.includes("math")) return "math";
  return "book";
}

function domainWeight(source) {
  const kind = sourceKind(source);
  if (kind === "herbology") return 55;
  if (kind === "landscape") return 52;
  if (kind === "survival") return 48;
  if (kind === "medical") return 42;
  if (kind === "math") return 42;
  return 0;
}

function scorePassage(passage, phrase, tokens) {
  const symbol = String(passage.symbol || "").toLowerCase();
  const title = String(passage.title || "").toLowerCase();
  const context = String(passage.context || "").toLowerCase();
  const head = `${symbol} ${title}`;
  const phraseInHead = phrase.length > 2 && head.includes(phrase);
  const phraseInBody = phrase.length > 2 && context.includes(phrase);
  const tokensInHead = tokens.filter((token) => head.includes(token));
  const tokensInBody = tokens.filter((token) => context.includes(token));
  if (!phraseInHead && !phraseInBody && tokensInHead.length === 0 && tokensInBody.length === 0) return 0;
  const longest = tokens.slice().sort((a, b) => b.length - a.length)[0];
  let score = domainWeight(passage.source);
  if (symbol === phrase || title === phrase) score += 80;
  if (longest && (symbol === longest || title === longest || symbol.startsWith(`${longest}_`) || symbol.includes(longest))) {
    score += 24;
  }
  if (phraseInHead) score += 40;
  if (phraseInBody) score += context.indexOf(phrase) < 96 ? 28 : 10;
  score += tokensInHead.length * 16;
  score += Math.min(tokensInBody.length, 3) * 6;
  if (tokens.length > 1 && tokens.every((token) => head.includes(token) || context.includes(token))) score += 18;
  if (tokens.length > 1 && longest && !head.includes(longest) && !context.includes(longest)) {
    score -= tokensInHead.length > 0 ? 8 : 30;
  }
  // A gloss that only mentions the phrase in passing, under an unrelated headword.
  if ((phraseInBody || tokensInBody.length) && tokensInHead.length === 0 && !phraseInHead) score -= 25;
  return score > 0 ? score : 0;
}

export function searchPassages(passages, query, limit = 8) {
  const phrase = String(query || "").trim().toLowerCase();
  if (phrase.length < 2) return [];
  const tokens = queryTokens(phrase);
  const list = Array.isArray(passages) ? passages : [];
  const ranked = [];
  for (const passage of list) {
    const score = scorePassage(passage, phrase, tokens);
    if (score > 0) ranked.push({ ...passage, score });
  }
  ranked.sort((a, b) => b.score - a.score || String(a.symbol).localeCompare(String(b.symbol)));
  return ranked.slice(0, limit);
}
