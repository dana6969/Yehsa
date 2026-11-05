import { getDefinitions } from "./symbolic_dictionary.js";
import { evaluateMathExpression } from "./math_eval.js";
import { recallKnowledge } from "./knowledge_index.js";

function solveMathExpression(expr) {
  try {
    const value = evaluateMathExpression(expr);
    if (value == null) return null;
    return `🧠 ${expr} = ${value}`;
  } catch (e) {
    return `❌ Math Error: ${e.message}`;
  }
}

export async function reasonThrough(symbol) {
  const defStart = Date.now();
  const mathResult = solveMathExpression(symbol);
  if (mathResult) {
    console.log(`[MATH] ${mathResult}`);
    const ts = new Date().toISOString();
    console.log(`[⏱ ${ts}] (${Date.now() - defStart}ms) → ${symbol}`);
    return mathResult;
  }

  const defs = getDefinitions(symbol);
  let definition = Array.isArray(defs) ? defs.filter(Boolean).join("\n") : "";
  if (!definition) {
    const knowledge = recallKnowledge(symbol);
    if (knowledge?.text) definition = knowledge.text;
  }

  if (!definition) return null;

  console.log(`📖 ${symbol}: ${definition}`);
  const defEnd = Date.now();
  const ts = new Date().toISOString();
  console.log(`[⏱ ${ts}] (${defEnd - defStart}ms) → ${symbol}`);
  return definition;
}
