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
  const definition = getDefinitions(symbol);

  // 🧠 Math Fallback
  if (!definition && /^[0-9+*/().\s^-]+$/.test(symbol)) {
    const mathResult = solveMathExpression(symbol);
    console.log(`[MATH] ${mathResult}`);
    return mathResult;
  }

  if (!definition) return null;

  console.log(`📖 ${symbol}: ${definition}`);
  return definition;
}
