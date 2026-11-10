import { pathToFileURL } from "url";
import path from "path";
import { parseQuestion } from "./question_parse.js";
import { recallKnowledge } from "./knowledge_index.js";
import { mapEmotion } from "./emotion_mapper.js";
import { adaptToUser, rememberUserTurn } from "./user_learning.js";
import { navigationSentence } from "./landscape_nav.js";
import { expandParaphrase } from "./paraphrase.js";
import { calculate } from "./calculator.js";
import { spiritualAnswer } from "./spiritual_answer.js";
import { routesToSpiritual } from "./spiritual_route.js";
import { premiseFlag } from "./premise.js";
import { safetyAnswer } from "./safety.js";
import { compoundParts, dictionaryLookup, isEmergency, reassurance, shouldAbstain } from "./answer_gate.js";
import { searchBooks } from "./book_index.js";
import { proposeAgents } from "./agents/host.js";

function premiseFromKnowledge(question, knowledge) {
  const texts = [knowledge?.text, ...(knowledge?.hits || []).map((hit) => hit?.text)];
  for (const text of texts) {
    const flagged = premiseFlag(question, text);
    if (flagged) return flagged;
  }
  return null;
}

function finish(question, emotion, knowledge, extra, options) {
  const turn = rememberUserTurn({
    utterance: question.original || question.raw,
    emotion,
    question: knowledge?.question || question,
    options
  });
  let text = extra.text || null;
  if (text && extra.adapt !== false) {
    text = adaptToUser(text, turn.profile, knowledge?.question || question, emotion);
  }
  const proposals = options.agents === false ? [] : proposeAgents({
    question: question.original || question.raw,
    answer: { answered: Boolean(text), text, confidence: extra.confidence || "ok" },
    files: options.corpusFiles
  }, options.agentSettings);
  return {
    question: knowledge?.question || question,
    emotion,
    answered: Boolean(text),
    text,
    hits: extra.hits || knowledge?.hits || [],
    kind: extra.kind || knowledge?.kind || null,
    symbol: extra.symbol || knowledge?.symbol || null,
    learning: { learned: turn.learned, turns: turn.profile?.turns || 0 },
    proposals
  };
}

export function ask(input, options = {}) {
  const original = String(input || "");
  const expanded = expandParaphrase(original);
  const question = parseQuestion(expanded);
  question.original = original;
  if (!question.topic && !calculate(original) && !routesToSpiritual(original, question)) {
    return { question, answered: false, text: null };
  }
  const emotion = mapEmotion(original);
  if (shouldAbstain(original)) {
    return finish(question, emotion, null, { text: null, confidence: "low" }, options);
  }
  const parts = options._part ? null : compoundParts(original);
  if (parts) {
    const math = calculate(parts.math);
    const rest = ask(parts.other, { ...options, agents: false, _part: true });
    const text = [math?.text, rest?.text].filter(Boolean).join(" ");
    return finish(question, emotion, null, {
      text: text || null,
      kind: "compound",
      symbol: "compound",
      hits: rest?.hits || [],
      adapt: false
    }, options);
  }
  const calc = calculate(original);
  if (calc) {
    return finish(question, emotion, null, { text: calc.text, kind: "calculator", symbol: "calculate", hits: [] }, options);
  }
  if (routesToSpiritual(original, question)) {
    const spiritual = spiritualAnswer(original);
    if (!spiritual) return finish(question, emotion, null, { text: null, confidence: "low" }, options);
    return finish(question, emotion, null, spiritual, options);
  }
  const safety = safetyAnswer(original, searchBooks);
  if (safety?.abstain) return finish(question, emotion, null, { text: null, confidence: "low" }, options);
  if (safety?.text) {
    return finish(question, emotion, null, {
      text: safety.text,
      kind: safety.kind,
      symbol: safety.symbol,
      hits: []
    }, options);
  }
  const defined = dictionaryLookup(original);
  if (defined) {
    return finish(question, emotion, null, defined, options);
  }
  const knowledge = recallKnowledge(expanded);
  const nav = navigationSentence(original, options);
  const premise = premiseFromKnowledge(original, knowledge);
  const note = nav?.sentence || [premise, knowledge?.text].filter(Boolean).join(" ");
  let base = note || (emotion.understood ? emotion.deduction : null);
  if (note && base && isEmergency(original) && emotion.understood) base = `${note} ${reassurance()}`;
  if (!base) return finish(question, emotion, knowledge, { text: null, confidence: "low" }, options);
  return finish(question, emotion, knowledge, {
    text: base,
    hits: knowledge?.hits,
    kind: knowledge?.kind || (nav?.sentence ? "landscape" : "emotion"),
    symbol: knowledge?.symbol || (nav?.sentence ? "landscape_nav" : emotion.emotion)
  }, options);
}

const entry = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (import.meta.url === entry) {
  const question = process.argv.slice(2).join(" ").trim();
  if (!question) {
    console.error("Usage: node symbolic/ask.js \"<full question>\"");
    process.exitCode = 1;
  } else {
    const result = ask(question, { agents: false });
    if (!result.answered || !result.text) {
      console.error("No offline note answered that.");
      process.exitCode = 1;
    } else {
      console.log(result.text);
    }
  }
}
