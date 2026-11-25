// R8: break a long question into the parts it asks for, so each part gets its own answer:
// "What were the three biggest factors in the fall of Rome? Explain each briefly, identify which
// factor had the greatest impact, and tell me approximately when the Western Empire fell."
//   -> [{ kind: "list", n: 3, explain: true, ... }, { kind: "judge" }, { kind: "when" }]
// Kinds: list (N factors, causes, patterns), judge (which mattered most / what do you think),
// when (a date), ask (anything else). Instructions about sources ("use your saved encyclopedia",
// "distinguish facts from deductions") are kept apart as instructions, not parts.
import { STOP, stem } from "./bm25.js";

const NUMBER = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, several: 3, few: 3, main: 3, key: 3, major: 3, biggest: 3 };
const LIST_NOUN = /\b(factors?|causes?|reasons?|patterns?|lessons?|themes?|trends?|things|ways|effects?|consequences?|events?|ideas?|mistakes?|forces?|drivers?)\b/i;
const INSTRUCTION = /^(?:please\s+)?(?:use|using|cite|quote|distinguish|separate|label|base|rely|draw on|answer from|keep|be (?:honest|clear|specific)|don't|do not|only use|refer)\b/i;
const EXPLAIN_EACH = /^(?:and\s+)?(?:briefly\s+)?(?:explain|describe|discuss|summari[sz]e)\s+(?:each|them|each one|all of them|why)(?:\s+briefly)?\b/i;
const JUDGE = /\b(?:which\b.*\b(?:greatest|biggest|most|strongest|largest|least|main|primary)\b|you (?:believe|think|consider)|in your (?:view|opinion|judg(?:e)?ment)|most important|mattered most|had the (?:greatest|biggest|most))\b/i;
const WHEN = /\b(?:when|what year|which year|what date|what century|approximately when|roughly when|how long ago)\b/i;

// Words that say what kind of answer is wanted, not what it is about.
export const ASK_WORDS = new Set(("explain describe tell give show list identify answer question use using saved save read reading just source "
  + "sources primary document encyclopedia book books manual pdf note notes yehsa please brief briefly each biggest greatest most main major "
  + "three two four five several first second third factor reason cause contributed contribute contributing impact believe think approximately "
  + "roughly about when what which where why how who different across look pattern repeatedly consistently emerge conclusion draw explicitly "
  + "stated actually distinguish fact deduction own yet understand understood really also know say said thing kind way time times year "
  + "happened happen there been were importance important mattered matter played role biggest largest").split(" ").map(stem));

// Words a source may use for the same event ("fell" -> "end", "collapse"; "western" -> "west").
const EXPAND = {
  fell: ["fall", "end", "collaps", "overthrow", "sack"], fall: ["fell", "end", "collaps", "declin"], collaps: ["fall", "end"],
  western: ["west"], eastern: ["east"], rise: ["grew", "growth", "rose"], war: ["warfare"], cause: ["caus"],
  roman: ["rome"], rome: ["roman"], greek: ["greece"], greece: ["greek"], egyptian: ["egypt"], egypt: ["egyptian"]
};

export function expandTerms(list) {
  const out = new Set(list);
  for (const t of list) for (const x of EXPAND[t] || []) out.add(stem(x));
  return [...out];
}

export function subjectTerms(text) {
  const out = [];
  for (const raw of String(text || "").toLowerCase().split(/[^a-z0-9]+/)) {
    if (raw.length < 3 || STOP.has(raw)) continue;
    const t = stem(raw);
    if (ASK_WORDS.has(t) || ASK_WORDS.has(raw)) continue;
    out.push(t);
  }
  return [...new Set(out)];
}

function sentencesOf(text) {
  const flat = String(text || "").replace(/\s+/g, " ").trim();
  // Numbered items ("1. What ... 2. What ...") start new parts even without a question mark.
  const numbered = flat.split(/\s(?=\(?\d{1,2}[.)]\s+[A-Z])/);
  const out = [];
  for (const block of numbered) {
    for (const s of block.split(/(?<=[?!.])\s+(?=[A-Z0-9(])/)) {
      const t = s.replace(/^\(?\d{1,2}[.)]\s+/, "").trim();
      if (t) out.push(t);
    }
  }
  return out;
}

function clauses(sentence) {
  // "..., identify which factor ..., and tell me when ..." -> three clauses.
  return sentence
    .split(/,\s*(?:and\s+)?(?=(?:explain|describe|identify|tell me|say|list|name|give|which|when|what|how|why|compare|note|show)\b)|;\s*|\s+and\s+(?=(?:tell me|identify|explain|say|which|when)\b)/i)
    .map((c) => c.replace(/^(?:and|also|then)\s+/i, "").replace(/[,;:]+$/, "").trim())
    .filter((c) => c.length > 3);
}

function numberIn(text) {
  const m = /\b(one|two|three|four|five|six|seven|several|few|main|key|major|biggest|\d{1,2})\b/i.exec(text);
  if (!m) return 3;
  const w = m[1].toLowerCase();
  return /^\d+$/.test(w) ? Math.min(7, Math.max(1, Number(w))) : NUMBER[w] || 3;
}

/**
 * Returns { parts: [{ kind, text, n?, explain?, terms }], instructions: [text], topic: [terms] }.
 * Each part's terms fall back to the question's main topic when the part names none ("explain each").
 */
export function questionParts(question) {
  const raw = String(question || "").replace(/^(?:hey |ok(?:ay)? )?yehsa[,:]?\s+/i, "").trim();
  const parts = [];
  const instructions = [];
  const pieces = [];
  for (const sentence of sentencesOf(raw)) {
    // "using The Encyclopedia of World History you just read: What were ..." -> instruction + question.
    const lead = /^((?:using|use|from|based on|according to|drawing on|with)\b[^:?]{3,140}):\s*(.+)$/i.exec(sentence);
    if (lead) {
      instructions.push(lead[1]);
      pieces.push(lead[2]);
    } else pieces.push(sentence);
  }
  for (const sentence of pieces) {
    // "Look across different eras, cultures ... civilizations." frames the question: its topic.
    if (!/\?$/.test(sentence) && /^(?:look|consider|think about|thinking about|taking|take|across|considering)\b/i.test(sentence)) {
      parts.push({ kind: "frame", text: sentence.replace(/[.]$/, ""), terms: subjectTerms(sentence) });
      continue;
    }
    for (const clause of clauses(sentence)) {
      if (INSTRUCTION.test(clause)) {
        instructions.push(clause);
        continue;
      }
      const last = parts[parts.length - 1];
      if (EXPLAIN_EACH.test(clause) && last?.kind === "list") {
        last.explain = true;
        continue;
      }
      let kind = "ask";
      if (JUDGE.test(clause)) kind = "judge";
      else if (WHEN.test(clause) && !LIST_NOUN.test(clause)) kind = "when";
      else if (LIST_NOUN.test(clause) && /\b(?:what|which|name|list|give|identify)\b/i.test(clause)) kind = "list";
      const part = { kind, text: clause.replace(/\?$/, "").trim(), terms: subjectTerms(clause) };
      if (kind === "list") part.n = numberIn(clause);
      parts.push(part);
    }
  }
  const topic = parts.find((p) => p.kind === "frame")?.terms || parts.find((p) => p.terms.length >= 2)?.terms || parts.find((p) => p.terms.length)?.terms || [];
  for (const p of parts) {
    if (p.kind === "frame") continue;
    // "which factor had the greatest impact" is about the topic too; keep its own words first.
    p.terms = [...new Set([...p.terms, ...(p.terms.length < 2 || p.kind === "judge" ? topic : [])])];
  }
  return { parts: parts.filter((p) => p.kind !== "frame"), frame: parts.find((p) => p.kind === "frame")?.text || null, instructions, topic };
}

/** A question long and many-sided enough for the multi-part or synthesis answer (never short asks). */
export function isMultiPart(question) {
  const q = String(question || "");
  if (q.length < 90) return false;
  const marks = (q.match(/\?/g) || []).length;
  const numbered = (q.match(/(?:^|\s)\(?\d{1,2}[.)]\s+[A-Z]/g) || []).length;
  const asks = (q.match(/\b(?:explain|identify|tell me|describe|compare|which|when|what)\b/gi) || []).length;
  return numbered >= 2 || marks >= 2 || asks >= 3;
}

const ANALYSIS = /\b(?:look across|across (?:different|many|all)|patterns?\b.*\b(?:emerge|repeat|recur)|synthes(?:is|ize|ise)|draw (?:your own )?conclusions|what (?:do|can) you (?:think|conclude|deduce|infer)|independent(?:ly)? reason|compare (?:across|the sources)|recurring themes?|not explicitly stated|common threads?|big picture)\b/i;

/** A broad question asking for analysis across sources ("look across eras ... what patterns emerge"). */
export function isSynthesisQuestion(question) {
  const q = String(question || "");
  if (q.length < 120) return false;
  return ANALYSIS.test(q) && (isMultiPart(q) || q.length >= 200);
}
