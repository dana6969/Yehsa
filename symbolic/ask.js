import { pathToFileURL } from "url";
import path from "path";
import { parseQuestion } from "./question_parse.js";
import { recallKnowledge } from "./knowledge_index.js";
import { mapEmotion } from "./emotion_mapper.js";
import { adaptToUser, rememberUserTurn } from "./user_learning.js";

export function ask(input, options = {}) {
  const question = parseQuestion(input);
  if (!question.topic) return { question, answered: false, text: null };
  const emotion = mapEmotion(question.raw);
  const knowledge = recallKnowledge(question.raw);
  const turn = rememberUserTurn({
    utterance: question.raw,
    emotion,
    question: knowledge?.question || question,
    options
  });
  const base = knowledge?.text || (emotion.understood ? emotion.deduction : null);
  if (!base) {
    return { question, emotion, answered: false, text: null, hits: [], learning: { learned: turn.learned } };
  }
  const text = adaptToUser(base, turn.profile, knowledge?.question || question, emotion);
  return {
    question: knowledge?.question || question,
    emotion,
    answered: true,
    text,
    hits: knowledge?.hits || [],
    kind: knowledge?.kind || "emotion",
    symbol: knowledge?.symbol || emotion.emotion,
    learning: { learned: turn.learned, turns: turn.profile?.turns || 0 }
  };
}

const entry = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (import.meta.url === entry) {
  const question = process.argv.slice(2).join(" ").trim();
  if (!question) {
    console.error("Usage: node symbolic/ask.js \"<full question>\"");
    process.exitCode = 1;
  } else {
    const result = ask(question);
    if (!result.answered || !result.text) {
      console.error("No offline note answered that.");
      process.exitCode = 1;
    } else {
      console.log(result.text);
    }
  }
}
