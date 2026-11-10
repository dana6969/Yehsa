// One prose answer from field notes. Dictionary hits stay evidence unless no note answers.
import { textHasToken } from "./book_search.js";
import { hitIsRelevant, specificTokens, tokenCoverage } from "./relevance.js";
import { disagreementFlag } from "./premise.js";

const FIELD = new Set(["herbology", "survival", "medical", "math", "landscape"]);

const ROLES = [
  { id: "wash", test: /\b(wash|clean water|rins(?:e|ing))\b/i, kind: "medical" },
  { id: "poultice", test: /\b(poultice|plantain|plantago)\b/i, kind: "herbology" },
  { id: "identify", test: /\b(identif\w*|confirm the species)\b/i, kind: "herbology" },
  { id: "emergency", test: /\b(emergency|trouble breathing|swelling of the face)\b/i, kind: "medical" },
  { id: "prevent", test: /\b(cover skin|standing water|fewer mosquitoes)\b/i, kind: "survival" },
  { id: "use", test: /\b(analgesic|astringent|tannin|ache|aches|poultice)\b/i, kind: "herbology" },
  { id: "water", test: /\b(drinking|boiling|known-safe water|carry known-safe)\b/i, kind: "survival" }
];

const GENERIC = new Set(["unknown_plant", "toxic_vs_edible", "offline_medical_reference"]);

function tidy(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

function splitSentences(text) {
  return tidy(text).split(/(?<=[.!?])\s+/).map((part) => part.trim()).filter(Boolean);
}

function lowerFirst(text) {
  if (!text) return text;
  return text.charAt(0).toLowerCase() + text.slice(1);
}

function topicTokens(parsed) {
  return String(parsed?.topic || "").split(/\s+/).filter((token) => token.length > 2);
}

function isNameOnly(hit) {
  return /Listed name in /.test(hit?.text || "");
}

function isField(hit) {
  return hit && FIELD.has(hit.kind) && !isNameOnly(hit);
}

export function shouldConnect(parsed) {
  if (!parsed) return false;
  const concerns = new Set(parsed.concerns || []);
  if (parsed.isQuestion && parsed.intent === "care" && (concerns.has("plant") || concerns.has("skin") || concerns.has("insect"))) {
    return true;
  }
  if (concerns.has("plant") && (concerns.has("skin") || concerns.has("insect"))) return true;
  return false;
}

function neededRoles(parsed) {
  const concerns = new Set(parsed.concerns || []);
  const roles = [];
  if (concerns.has("skin") || concerns.has("insect") || parsed.intent === "care") roles.push("wash");
  if (concerns.has("plant") || parsed.intent === "care") roles.push("poultice");
  if (concerns.has("plant")) roles.push("identify");
  if (concerns.has("insect") || concerns.has("skin") || parsed.intent === "care") roles.push("emergency");
  if (concerns.has("insect")) roles.push("prevent");
  return roles;
}

function blob(hit) {
  return `${hit.symbol || ""} ${hit.text || ""}`.toLowerCase();
}

function roleFit(hit, role, parsed) {
  if (!role.test.test(hit.text || "")) return null;
  let score = 10;
  const text = blob(hit);
  for (const token of topicTokens(parsed)) {
    if (textHasToken(text, token)) score += 25;
  }
  if (hit.kind === role.kind) score += 15;
  if (GENERIC.has(hit.symbol)) score -= 12;
  if (role.id === "poultice" && !/\b(poultice|plantain|plantago)\b/i.test(text)) return null;
  return score;
}

function sentenceForRole(hit, role) {
  const parts = splitSentences(hit.text).filter((sentence) => role.test.test(sentence));
  if (parts.length === 0) return null;
  if (role.id === "poultice") {
    return parts.find((sentence) => /\bpoultice\b/i.test(sentence)) || parts[parts.length - 1];
  }
  if (role.id === "wash") {
    return parts.find((sentence) => /\bwash\b/i.test(sentence)) || parts[0];
  }
  if (role.id === "identify") {
    return parts.find((sentence) => /\bidentif/i.test(sentence)) || parts[0];
  }
  if (role.id === "emergency") {
    return parts.find((sentence) => /\b(emergency|trouble breathing|swelling of the face)\b/i.test(sentence)) || parts[0];
  }
  return parts[0];
}

function articleTopic(topic) {
  const value = String(topic || "").trim();
  if (!value) return "this";
  if (/^(a|an|the)\b/i.test(value)) return value;
  const parts = value.split(/\s+/);
  if (parts.length === 1) return value;
  if (/s$/i.test(parts[parts.length - 1])) return value;
  return `a ${value}`;
}

function topicCovered(body, topic) {
  const tokens = String(topic || "").split(/\s+/).filter((token) => token.length > 2);
  if (tokens.length === 0) return true;
  return tokens.every((token) => textHasToken(body, token));
}

function frame(parsed, text) {
  const body = tidy(text);
  if (!body) return body;
  if (parsed.intent === "use" && parsed.domain && !new RegExp(`\\b${parsed.domain}\\b`, "i").test(body)) {
    return `In a ${parsed.domain} setting, ${lowerFirst(body)}`;
  }
  if ((parsed.intent === "care" || shouldConnect(parsed)) && parsed.topic) {
    const tokens = String(parsed.topic).split(/\s+/).filter((token) => token.length > 2);
    if (!topicCovered(body, parsed.topic) && tokens.length === 1) {
      return `For ${articleTopic(parsed.topic)}, ${lowerFirst(body)}`;
    }
  }
  return body;
}

function connect(parsed, pieces) {
  const body = pieces.map((piece) => piece.sentence).join(" ");
  return frame(parsed, body);
}

function selectPieces(parsed, field) {
  const seen = new Set();
  const pieces = [];
  for (const role of neededRoles(parsed).map((id) => ROLES.find((item) => item.id === id)).filter(Boolean)) {
    let best = null;
    let bestScore = 0;
    for (const hit of field) {
      const score = roleFit(hit, role, parsed);
      if (score == null || score <= bestScore) continue;
      best = hit;
      bestScore = score;
    }
    if (!best) continue;
    const sentence = sentenceForRole(best, role);
    if (!sentence) continue;
    const key = sentence.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    pieces.push({ role: role.id, hit: best, sentence });
  }
  return pieces;
}

function topicScore(hit, parsed) {
  const text = blob(hit);
  const tokens = topicTokens(parsed);
  let overlap = 0;
  for (const token of tokens) {
    if (textHasToken(text, token)) overlap += 1;
  }
  const covered = tokenCoverage(hit, parsed);
  if (tokens.length && overlap === 0 && covered === 0) return 0;
  let score = (hit.score || 0) + covered * 100 + overlap * 20;
  if (GENERIC.has(hit.symbol)) score -= 35;
  return score;
}

function bestField(parsed, field) {
  let best = null;
  let bestScore = 0;
  for (const hit of field) {
    const score = topicScore(hit, parsed);
    if (score > bestScore) {
      best = hit;
      bestScore = score;
    }
  }
  return best;
}

function orderSentences(sentences, parsed) {
  if (sentences.length <= 8 && sentences.join(" ").length <= 700) return sentences;
  const { specific } = specificTokens(parsed);
  const tagged = sentences.map((sentence, index) => ({
    sentence,
    index,
    hits: specific.filter((token) => textHasToken(sentence, token)).length
  }));
  const matching = tagged.filter((item) => item.hits > 0).sort((a, b) => b.hits - a.hits || a.index - b.index);
  const rest = tagged.filter((item) => item.hits === 0);
  const chosen = [...matching, ...rest].slice(0, 4).sort((a, b) => a.index - b.index);
  const ordered = chosen.map((item) => item.sentence);
  if (parsed.intent !== "use" && parsed.intent !== "care") return ordered;
  const useRe = /\b(analgesic|astringent|tannin|ache|aches|poultice|wash|clean water)\b/i;
  const leading = ordered.filter((sentence) => useRe.test(sentence));
  const tail = ordered.filter((sentence) => !useRe.test(sentence));
  return leading.length ? [...leading, ...tail] : ordered;
}

function subjectOf(parsed) {
  const tokens = topicTokens(parsed);
  const parts = new Set(["bark", "leaf", "leaves", "root", "seed", "flower", "wood"]);
  return tokens.find((token) => !parts.has(token)) || tokens[0] || "";
}

function dictionaryUseClause(hits, subject) {
  if (!subject) return null;
  const subjectRe = new RegExp(`\\b${subject}\\b`, "i");
  for (const hit of hits) {
    if (hit.kind !== "dictionary" || !subjectRe.test(hit.text || "")) continue;
    if (/\bsalicin\b/i.test(hit.text) && /\banalgesic\b/i.test(hit.text)) {
      return `Salicin from ${subject} is described as an analgesic.`;
    }
  }
  for (const hit of hits) {
    if (hit.kind !== "dictionary") continue;
    const parts = splitSentences(hit.text).filter((sentence) => !/glucopyranoside|C\d+H\d+/i.test(sentence));
    const useful = parts.find((sentence) => subjectRe.test(sentence) && /\b(analgesic|astringent|poultice)\b/i.test(sentence));
    if (useful && useful.length <= 220) return useful.endsWith(".") ? useful : `${useful}.`;
  }
  return null;
}

function readableGloss(text) {
  let flat = tidy(text);
  const quote = flat.search(/["“]/);
  if (quote > 48) flat = flat.slice(0, quote);
  const emblem = flat.search(/\bemblem of\b/i);
  if (emblem > 48) flat = flat.slice(0, emblem);
  const glued = flat.search(/,[A-Za-z]/);
  if (glued > 40) flat = flat.slice(0, glued);
  flat = flat.replace(/[,;\s]+$/, "");
  if (flat.length > 180) {
    const slice = flat.slice(0, 180);
    const cut = slice.lastIndexOf(" ");
    flat = (cut > 40 ? slice.slice(0, cut) : slice).trim();
  }
  if (!flat) return "";
  return /[.!?]$/.test(flat) ? flat : `${flat}.`;
}

function otherContentMissed(parsed, gloss, subject) {
  const extras = topicTokens(parsed).filter((token) => token !== subject);
  if (extras.length === 0) return false;
  return !extras.some((token) => textHasToken(gloss, token));
}

function dehydrationNote(parsed, field) {
  if (!/\bdehydr/.test(`${parsed?.topic || ""} ${parsed?.text || ""}`)) return null;
  const asked = `${parsed?.topic || ""} ${parsed?.text || ""}`;
  const oral = /\b(diarrhea|oral|sugar|teaspoon)\b/i.test(asked);
  const useful = /\b(rehydrat|drink|drinking|sweating|dizzy|boil|boiling|known-safe)\b/i;
  let best = null;
  let bestScore = 0;
  for (const hit of field) {
    if (!useful.test(hit.text || "")) continue;
    if (!oral && hit.symbol === "oral_rehydration") continue;
    let score = hit.score || 0;
    if (/\b(sweating|dizzy|rehydrat)\b/i.test(hit.text || "")) score += 30;
    if (score > bestScore) {
      best = hit;
      bestScore = score;
    }
  }
  return best;
}

function dictionaryAnswer(parsed, hits) {
  const subject = subjectOf(parsed);
  const head = hits.find((hit) => hit.kind === "dictionary" && hit.symbol === subject)
    || hits.find((hit) => hit.kind === "dictionary" && subject && new RegExp(`\\b${subject}\\b`, "i").test(hit.text || ""));
  if (!head) return null;
  if (subject && otherContentMissed(parsed, head.text, subject)) return null;
  const gloss = readableGloss(head.text);
  const clause = dictionaryUseClause(hits, subject);
  const text = clause && !gloss.toLowerCase().includes("analgesic") ? `${clause} ${gloss}` : gloss;
  return { text: frame(parsed, text), used: [head] };
}

function uniqueHits(pieces) {
  const out = [];
  const seen = new Set();
  for (const piece of pieces) {
    const key = `${piece.hit.kind}:${String(piece.hit.symbol).toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(piece.hit);
  }
  return out;
}

export function reasonAnswer(parsed, hits) {
  const list = (Array.isArray(hits) ? hits : []).filter((hit) => hitIsRelevant(hit, parsed));
  const field = list.filter(isField);
  if (shouldConnect(parsed)) {
    const pieces = selectPieces(parsed, field);
    if (pieces.length) return { text: connect(parsed, pieces), used: uniqueHits(pieces) };
  }
  const overview = field.find((hit) => hit.symbol === "toxic_plant_facts");
  const identify = field.find((hit) => hit.symbol === "unknown_plant");
  const asked = `${parsed.topic || ""} ${parsed.text || ""}`;
  const namedPlant = /\b(carrot|onion|hemlock|camas|willow|yarrow|plantain)\b/i.test(asked);
  const toxicOverview = overview && !namedPlant && /\b(deadly|poisonous plants|which plants)\b/i.test(asked) ? overview : null;
  const identifyFirst = identify && /\b(taste|identif|lookalike|look-alike)\b/i.test(asked) ? identify : null;
  const best = dehydrationNote(parsed, field) || identifyFirst || toxicOverview || bestField(parsed, field);
  if (best) {
    const sentences = orderSentences(splitSentences(best.text), parsed);
    let text = frame(parsed, sentences.join(" "));
    const clause = dictionaryUseClause(list, subjectOf(parsed));
    if (clause && !/\b(analgesic|astringent|poultice)\b/i.test(text)) text = `${clause} ${text}`;
    const conflict = disagreementFlag(field);
    if (conflict) text = `${text} ${conflict}`;
    return { text, used: [best] };
  }
  return dictionaryAnswer(parsed, list) || { text: null, used: [] };
}
