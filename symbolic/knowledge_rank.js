// Rank field notes, medical names, and dictionary glosses. No filesystem.
// getMappedAction does not call this. Symbol dispatch stays a direct map read.

import { reasonAnswer, shouldConnect } from "./answer_reasoner.js";
import { queryTokens, sourceKind } from "./book_search.js";
import { parseQuestion } from "./question_parse.js";

function clip(text, limit) {
  const flat = String(text || "").replace(/\s+/g, " ").trim();
  if (flat.length <= limit) return flat;
  return `${flat.slice(0, limit - 1).trimEnd()}…`;
}

function addHit(bag, hit) {
  if (!hit || !hit.symbol || !hit.text || !(hit.score > 0)) return;
  const key = `${hit.kind}:${String(hit.symbol).toLowerCase()}`;
  const prev = bag.get(key);
  if (!prev || hit.score > prev.score) bag.set(key, hit);
}

const PLANT_PARTS = new Set(["bark", "leaf", "leaves", "root", "seed", "flower", "wood"]);

function subjectToken(tokens) {
  return tokens.find((token) => !PLANT_PARTS.has(token)) || tokens[0] || "";
}

function hasWord(text, word) {
  if (!word) return false;
  return new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(text);
}

export function rankKnowledge(parsed, corpora) {
  const search = corpora.search;
  const lookupMedical = corpora.lookupMedical;
  const lexical = typeof corpora.lexical === "function" ? corpora.lexical() : corpora.lexical;
  const phrase = parsed.topic || parsed.text;
  const tokens = queryTokens(phrase);
  const longest = tokens.slice().sort((a, b) => b.length - a.length)[0] || "";
  const subject = subjectToken(tokens);
  const bag = new Map();
  const boost = (kind, score) => (parsed.domain && kind === parsed.domain ? score + 16 : score);

  for (const passage of search(phrase, 8)) {
    const kind = sourceKind(passage.source);
    addHit(bag, {
      kind,
      symbol: passage.symbol,
      text: clip(passage.context, 320),
      title: passage.title || "",
      source: passage.source || "",
      score: boost(kind, passage.score)
    });
  }

  const medicalKeys = [phrase, ...tokens];
  for (const key of medicalKeys) {
    const hit = lookupMedical(key);
    if (!hit) continue;
    // Name lists are not field notes. Keep them as a weak hint, under real glosses.
    const nameOnly = /Listed name in /.test(hit.text);
    const exact = key === phrase ? 20 : (key === longest ? 12 : 4);
    addHit(bag, {
      kind: "medical",
      symbol: hit.symbol,
      text: clip(hit.text, 320),
      title: "",
      source: hit.source,
      score: boost("medical", (nameOnly ? 6 : 42) + exact)
    });
  }

  if ((phrase || tokens.length) && lexical && typeof lexical[Symbol.iterator] === "function") {
    for (const [key, text] of lexical) {
      const gloss = String(text).toLowerCase();
      const namedInQuestion = key === phrase || tokens.includes(key);
      const related = namedInQuestion || (longest && key.includes(longest));
      const plantUse = (parsed.intent === "use" || tokens.some((token) => PLANT_PARTS.has(token)))
        && subject.length >= 5
        && !namedInQuestion
        && gloss.includes(subject)
        && /\b(salix|analgesic|astringent|tannin|poultice|from a |from the )\b/.test(gloss);
      if (!related && !plantUse) continue;
      let score = 18;
      if (key === phrase) score += 70;
      else if (key === longest) score += 46;
      else if (tokens.includes(key)) score += 22;
      else if (longest && key.includes(longest)) score += 28;
      else score += 8;
      if (!namedInQuestion && longest && !gloss.includes(longest)) {
        // A nearby headword that never mentions the subject of the question.
        score -= 22;
      }
      if (plantUse) score = Math.max(score, 44);
      const statesUse = /\b(analgesic|astringent|tannin|poultice)\b/.test(gloss);
      // A headword that only mentions the subject (suede, water willow) is not an answer.
      if (!namedInQuestion && !statesUse && key !== subject) score = Math.min(score, 19);
      if (key !== subject && key !== phrase && tokens.includes(key) && subject && !hasWord(gloss, subject)) {
        score -= 30;
      }
      addHit(bag, {
        kind: "dictionary",
        symbol: key,
        text: clip(text, 320),
        title: "",
        source: "lexical-headword",
        score: boost("dictionary", score)
      });
    }
  }

  if (parsed.intent === "use" && (parsed.domain === "survival" || parsed.domain === "herbology")) {
    const caution = search("unknown plant", 1)[0];
    if (caution) {
      const kind = sourceKind(caution.source);
      addHit(bag, {
        kind,
        symbol: caution.symbol,
        text: clip(caution.context, 320),
        title: caution.title || "",
        source: caution.source || "",
        score: boost(kind, 50)
      });
    }
  }

  if (shouldConnect(parsed)) {
    const concerns = new Set(parsed.concerns || []);
    const extras = [];
    if (concerns.has("plant") || concerns.has("skin") || concerns.has("insect") || parsed.intent === "care") {
      extras.push("plantain", "unknown plant");
    }
    if (concerns.has("skin") || concerns.has("insect") || parsed.intent === "care") {
      extras.push("clean water", "mosquito");
    }
    for (const extra of extras) {
      for (const passage of search(extra, 4)) {
        const kind = sourceKind(passage.source);
        addHit(bag, {
          kind,
          symbol: passage.symbol,
          text: clip(passage.context, 480),
          title: passage.title || "",
          source: passage.source || "",
          score: passage.score
        });
      }
    }
  }

  return [...bag.values()]
    .filter((hit) => hit.score >= 20)
    .sort((a, b) => b.score - a.score || a.symbol.localeCompare(b.symbol));
}

function presentHits(used, ranked) {
  const out = [];
  const seen = new Set();
  const push = (hit) => {
    if (!hit?.symbol) return;
    const key = `${hit.kind}:${String(hit.symbol).toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(hit);
  };
  for (const hit of used || []) push(hit);
  for (const hit of ranked || []) push(hit);
  return out.slice(0, 6);
}

export function recallFromCorpora(query, corpora) {
  const raw = String(query || "").trim();
  if (raw.length < 2) return null;
  const question = parseQuestion(raw);
  const ranked = rankKnowledge(question, corpora);
  if (ranked.length === 0) return null;
  const deduction = reasonAnswer(question, ranked);
  if (!deduction.text) return null;
  const hits = presentHits(deduction.used, ranked);
  const best = deduction.used[0] || hits[0];
  return {
    kind: best.kind,
    symbol: best.symbol,
    text: deduction.text,
    title: best.title,
    source: best.source,
    hits,
    answer: deduction.text,
    question: {
      isQuestion: question.isQuestion,
      intent: question.intent,
      topic: question.topic,
      domain: question.domain,
      concerns: question.concerns || []
    }
  };
}
