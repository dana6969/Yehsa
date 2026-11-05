import { pathToFileURL } from "url";
import path from "path";
import { parseQuestion } from "./question_parse.js";
import { recallKnowledge } from "./knowledge_index.js";
import { mapEmotion } from "./emotion_mapper.js";

export function ask(input) {
  const question = parseQuestion(input);
  if (!question.topic) return { question, answered: false, text: null };
  const emotion = mapEmotion(question.raw);
  const knowledge = recallKnowledge(question.raw);
  if (!knowledge && !emotion.understood) {
    return { question, emotion, answered: false, text: null, hits: [] };
  }
  const text = knowledge?.text || emotion.deduction;
  return {
    question,
    emotion,
    answered: true,
    text,
    hits: knowledge?.hits || [],
    kind: knowledge?.kind || "emotion",
    symbol: knowledge?.symbol || emotion.emotion
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
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = result.answered ? 0 : 1;
  }
}
