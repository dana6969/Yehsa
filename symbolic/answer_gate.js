// Gates that sit in front of a field note: real-time questions, drug doses,
// dictionary lookups, and a question that is both a calculation and care advice.
import { calculate } from "./calculator.js";
import { lookupHeadword } from "./knowledge_index.js";

const FIELD_SUBJECT = /\b(willow|plantain|yarrow|tourniquet|frostbite|splint|dehydration|watershed|declination|triangle|mosquito|iodine|charcoal)\b/i;

export function shouldAbstain(raw) {
  const text = String(raw || "");
  const aboutNote = /\bnote\b/i.test(text);
  if (aboutNote && FIELD_SUBJECT.test(text)) return false;
  if (/\b(cure|cures|cured)\b/i.test(text) && /\b(cancer|disease|infection)\b/i.test(text)) return true;
  if (/\b(chemical formula|formula of|molecular formula)\b/i.test(text)) return true;
  if (/\b(ibuprofen|acetaminophen|paracetamol|aspirin)\b/i.test(text) && /\b(dose|mg|milligrams?)\b/i.test(text)) return true;
  if (/\bhow many (?:mg|milligrams|pills|tablets)\b/i.test(text)) return true;
  if (/\bwhat dose\b/i.test(text) && !FIELD_SUBJECT.test(text)) return true;
  if (!aboutNote && /\b(what did i (?:eat|drink|do)|did i eat|today'?s price|price right now|tomorrow'?s (?:weather|storm|river)|river level tomorrow|what time does the (?:bus|train) )\b/i.test(text)) {
    return true;
  }
  if (!aboutNote && /\b(tomorrow|tonight|right now|today)\b/i.test(text) && /\b(weather|forecast|river level|price|bus|train)\b/i.test(text)) {
    return true;
  }
  return false;
}

export function dictionaryLookup(raw) {
  const text = String(raw || "").trim();
  const patterns = [
    /\bdefine\s+([a-z][a-z' -]{1,40})/i,
    /\bwhat does\s+([a-z][a-z' -]{1,40})\s+mean\b/i,
    /\bmeaning of\s+([a-z][a-z' -]{1,40})/i,
    /\b([a-z][a-z' -]{1,40})\s+definition\b/i
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;
    const word = match[1].trim().toLowerCase().replace(/^(?:a|an|the)\s+/, "").replace(/\s+/g, " ");
    const pieces = word.split(" ").filter(Boolean);
    if (!word || pieces.length > 2 || /\bnote\b/.test(word)) return null;
    const gloss = lookupHeadword(word) || lookupHeadword(word.split(" ")[0]);
    if (!gloss) return { text: `I don't have a note on the word ${word}.`, symbol: word, kind: "dictionary" };
    const flat = String(gloss).replace(/\s+/g, " ").trim().slice(0, 280);
    return { text: flat.endsWith(".") ? flat : `${flat}.`, symbol: word, kind: "dictionary" };
  }
  return null;
}

export function compoundParts(raw) {
  const pieces = String(raw || "").split(/\s*,?\s+and\s+/i).map((part) => part.trim()).filter(Boolean);
  if (pieces.length < 2) return null;
  const math = pieces.find((part) => calculate(part));
  const other = pieces.find((part) => part !== math && !calculate(part) && part.split(/\s+/).length > 2);
  if (!math || !other) return null;
  return { math, other };
}

export function isEmergency(raw) {
  return /\b(nosebleed|choking|can'?t breathe|cannot breathe|not breathing|cpr|anaphyla|epinephrine|seizure|heart attack|chest pressure|shock|chemical.{0,12}eye|unresponsive|severe bleeding|tourniquet)\b/i.test(String(raw || ""));
}

export function reassurance() {
  return "You can be afraid and still do the next care step.";
}
