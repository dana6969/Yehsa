import { getDefinitions } from "./symbolic_dictionary.js";

// 🔢 Math Solver
function solveMathExpression(expr) {
  try {
    const fn = new Function("return (" + expr + ")");
    return `🧠 ${expr} = ${fn()}`;
  } catch (e) {
    return `❌ Math Error: ${e.message}`;
  }
}

export async function reasonThrough(symbol) {
  const definition = getDefinitions(symbol);

  // 🧠 Math Fallback
  if (!definition && /^[0-9+*/().\s^-]+$/.test(symbol)) {
    const mathStart = Date.now();
    const mathResult = solveMathExpression(symbol);
    console.log(`[MATH] ${mathResult}`);
    const mathEnd = Date.now();
    const ts = new Date().toISOString();
    console.log(`[⏱ ${ts}] (${mathEnd - mathStart}ms) → ${symbol}`);
    return mathResult;
  }

  if (!definition) return null;

  console.log(`📖 ${symbol}: ${definition}`);
  return definition;
}
