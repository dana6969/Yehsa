// Drop a note that only shares a loose word with the question.
import fs from "fs";
import path from "path";
import { textHasToken } from "./book_search.js";

const LOOSE = new Set([
  "light", "life", "repeated", "opening", "times", "time", "city", "plant", "plants",
  "speed", "position", "traditional", "note", "notes", "field", "world", "best",
  "point", "points", "change", "used", "using", "make", "many", "much", "into",
  "which", "there", "their", "from", "have", "been", "also", "only", "such", "than",
  "them", "they", "your", "when", "where", "what", "this", "that", "with", "some",
  "these", "those", "hour", "hours", "minute", "minutes", "second", "seconds",
  "mile", "miles", "per", "scared", "afraid", "fear", "dark", "angry", "anger",
  "worried", "worry", "panic", "terrified", "heavy", "scream", "someone", "anyone",
  "looks", "like", "they", "them", "remove", "removing", "recipe", "splashed",
  "splash", "carry", "stop", "cool", "tell", "signs", "sign", "adult", "child",
  "infant", "person", "people", "large", "small", "look", "having", "getting",
  "going", "doing", "giving", "taking", "seeing", "being"
]);

const CARE_SUBJECT = new Set([
  "water", "bleeding", "bleed", "burn", "burns", "bite", "bites", "frostbite",
  "tourniquet", "splint", "willow", "yarrow", "plantain", "dehydration", "dehydrated",
  "watershed", "declination", "triangle", "iodine", "mosquito",
  "tick", "ticks", "nosebleed", "choking", "seizure", "seizures", "shock",
  "sprain", "altitude", "epinephrine", "anaphylaxis", "stitches", "hemlock",
  "camas", "bearing", "shelter", "signal"
]);

const CARE_SYMBOLS = new Set([
  "clean_water_before_care",
  "insect_bite_skin",
  "plantain_plantago",
  "unknown_plant"
]);

export function specificTokens(parsed) {
  const tokens = String(parsed?.topic || "")
    .toLowerCase()
    .split(/[^a-z0-9+]+/)
    .filter((token) => token.length > 2);
  const specific = tokens.filter((token) => !LOOSE.has(token));
  return { tokens, specific };
}

const GLUE = new Set([
  "applies", "before", "after", "record", "goes", "warmed", "warming", "travel",
  "happen", "relative", "replaces", "getting", "ignore", "always", "identification",
  "limit", "uses", "using", "between", "should", "would", "could", "about", "during",
  "repair", "carry", "carrying", "weave", "weaving", "appropriate", "belongs",
  "according", "serious", "medical", "formula", "think", "confused", "injury",
  "without", "within", "still", "only", "also", "just", "very", "more", "most",
  "other", "same", "such", "than", "then", "into", "over", "under", "from", "with",
  "your", "their", "anyone", "anything", "something", "which", "what", "when"
]);

let fieldVocab = null;

function fieldHas(token) {
  if (!fieldVocab) {
    fieldVocab = new Set();
    const files = [
      "symbolic_books/medical/reference.json",
      "symbolic_books/herbology/notes.json",
      "symbolic_books/landscape/notes.json",
      "symbolic_books/survival/camp.json"
    ];
    for (const rel of files) {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(process.cwd(), rel), "utf8"));
        const blob = JSON.stringify(data).toLowerCase();
        for (const word of blob.split(/[^a-z0-9+]+/)) {
          if (word.length >= 4) fieldVocab.add(word);
        }
      } catch {
        // A missing note file just leaves the vocab smaller.
      }
    }
  }
  return fieldVocab.has(token);
}

function careLink(parsed, symbol) {
  const concerns = new Set(parsed?.concerns || []);
  const insect = parsed?.intent === "care" && (concerns.has("insect") || concerns.has("skin"));
  return insect && CARE_SYMBOLS.has(symbol);
}

export function hitIsRelevant(hit, parsed) {
  const { tokens, specific } = specificTokens(parsed);
  const needed = specific.length ? specific : tokens;
  if (!needed.length) return true;
  const blob = `${hit?.symbol || ""} ${hit?.text || ""}`;
  const symbol = String(hit?.symbol || "").toLowerCase();
  if (/\bdehydr/.test(`${parsed?.topic || ""} ${parsed?.text || ""}`) && /\b(drink|sweat|shade|dizzy)\b/i.test(hit?.text || "")) {
    return true;
  }
  if (/\b(mosquito\w*|insect\w*|bite\w*)\b/i.test(`${parsed?.topic || ""} ${parsed?.text || ""}`) && /\b(plantain|plantago|poultice)\b/i.test(hit?.text || "")) {
    return true;
  }
  if (careLink(parsed, symbol)) return true;
  const content = specific.filter((token) => token.length >= 4);
  const has = (token) => {
    if (textHasToken(blob, token) || symbol.includes(token)) return true;
    if (token.length >= 5 && token.endsWith("e")) {
      return new RegExp(`\\b${token.slice(0, -1)}al(?:[^a-z]|$)`, "i").test(blob);
    }
    return false;
  };
  const matched = content.filter(has);
  if (!content.length) {
    const fallback = needed.filter(has);
    return fallback.length >= Math.min(2, needed.length);
  }
  if (!matched.length) return false;
  const extra = content.filter((token) => !GLUE.has(token) && !has(token) && token.length >= 5);
  if (extra.length) {
    const topical = content.filter((token) => !GLUE.has(token) && token.length >= 5);
    const matchedTopical = topical.filter(has);
    if (!matchedTopical.length) return false;
    const unknown = extra.filter((token) => !fieldHas(token));
    const water = matchedTopical.includes("water") && /\b(boil|boiling|treat|drinking|filter)\b/i.test(hit?.text || "");
    if (!water && unknown.some((token) => token.length >= Math.max(...matchedTopical.map((item) => item.length)))) return false;
  }
  return true;
}

export function tokenCoverage(hit, parsed) {
  const { specific } = specificTokens(parsed);
  const blob = `${hit?.symbol || ""} ${hit?.text || ""}`;
  return specific.filter((token) => textHasToken(blob, token)).length;
}
