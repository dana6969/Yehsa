import { getDefinitions } from "./symbolic_dictionary.js";

// 🔢 Math Solver
function solveMathExpression(expr) {
  try {
    if (!/^[0-9+\-*/^().\s]+$/.test(expr)) return `❌ Invalid characters in expression`;
    const jsExpr = expr.replace(/\^/g, "**");
    const fn = new Function(`return (${jsExpr})`);
    return `🧠 ${expr} = ${fn()}`;
  } catch (e) {
    return `❌ Math Error: ${e.message}`;
  }
}

export async function reasonThrough(symbol) {
  const defStart = Date.now();
  const defs = getDefinitions(symbol);
  const definition = Array.isArray(defs) ? defs.filter(Boolean).join("\n") : "";

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
  const defEnd = Date.now();
  const ts = new Date().toISOString();
  console.log(`[⏱ ${ts}] (${defEnd - defStart}ms) → ${symbol}`);
  return definition;
}
