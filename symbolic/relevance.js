// Drop a note that only shares a loose word with the question.
import { textHasToken } from "./book_search.js";

const LOOSE = new Set([
  "light", "life", "repeated", "opening", "times", "time", "city", "plant", "plants",
  "speed", "position", "traditional", "note", "notes", "field", "world", "best",
  "point", "points", "change", "used", "using", "make", "many", "much", "into",
  "which", "there", "their", "from", "have", "been", "also", "only", "such", "than",
  "them", "they", "your", "when", "where", "what", "this", "that", "with", "some",
  "these", "those", "hour", "hours", "minute", "minutes", "second", "seconds",
  "mile", "miles", "per"
]);

export function specificTokens(parsed) {
  const tokens = String(parsed?.topic || "")
    .toLowerCase()
    .split(/[^a-z0-9+]+/)
    .filter((token) => token.length > 2);
  const specific = tokens.filter((token) => !LOOSE.has(token));
  return { tokens, specific };
}

export function hitIsRelevant(hit, parsed) {
  const { tokens, specific } = specificTokens(parsed);
  const needed = specific.length ? specific : tokens;
  if (!needed.length) return true;
  const blob = `${hit?.symbol || ""} ${hit?.text || ""}`;
  if (/\bdehydr/.test(`${parsed?.topic || ""} ${parsed?.text || ""}`) && /\b(drink|sweat|shade|dizzy)\b/i.test(hit?.text || "")) {
    return true;
  }
  if (/\b(mosquito\w*|insect\w*|bite\w*)\b/i.test(`${parsed?.topic || ""} ${parsed?.text || ""}`) && /\b(plantain|plantago|poultice)\b/i.test(hit?.text || "")) {
    return true;
  }
  const symbol = String(hit?.symbol || "").toLowerCase();
  if (specific.some((token) => token.length >= 5 && symbol.includes(token))) return true;
  const matched = needed.filter((token) => textHasToken(blob, token));
  if (specific.length >= 2) return matched.length >= 2;
  if (specific.length === 1) return matched.length >= 1;
  const minimum = Math.min(2, needed.length);
  return matched.length >= minimum;
}

export function tokenCoverage(hit, parsed) {
  const { specific } = specificTokens(parsed);
  const blob = `${hit?.symbol || ""} ${hit?.text || ""}`;
  return specific.filter((token) => textHasToken(blob, token)).length;
}
