// Allowlisted arithmetic only. No eval and no new Function.
// Grammar: number | (expr) | unary +/- | ^ | * / | + -

export function evaluateMathExpression(input) {
  const expr = String(input || "").replace(/\s+/g, "");
  if (!expr || !/^[0-9+\-*/^().]+$/.test(expr)) return null;
  let index = 0;

  function peek() {
    return expr[index];
  }

  function parseExpression() {
    let left = parseTerm();
    while (peek() === "+" || peek() === "-") {
      const op = expr[index++];
      const right = parseTerm();
      left = op === "+" ? left + right : left - right;
    }
    return left;
  }

  function parseTerm() {
    let left = parsePower();
    while (peek() === "*" || peek() === "/") {
      const op = expr[index++];
      const right = parsePower();
      if (op === "/" && right === 0) throw new Error("division by zero");
      left = op === "*" ? left * right : left / right;
    }
    return left;
  }

  function parsePower() {
    const base = parseUnary();
    if (peek() === "^") {
      index += 1;
      return base ** parsePower();
    }
    return base;
  }

  function parseUnary() {
    if (peek() === "+") {
      index += 1;
      return parseUnary();
    }
    if (peek() === "-") {
      index += 1;
      return -parseUnary();
    }
    return parsePrimary();
  }

  function parsePrimary() {
    if (peek() === "(") {
      index += 1;
      const value = parseExpression();
      if (peek() !== ")") throw new Error("missing closing parenthesis");
      index += 1;
      return value;
    }
    const start = index;
    if (!/[0-9.]/.test(peek() || "")) throw new Error("expected a number");
    while (/[0-9.]/.test(peek() || "")) index += 1;
    const value = Number(expr.slice(start, index));
    if (!Number.isFinite(value)) throw new Error("invalid number");
    return value;
  }

  const value = parseExpression();
  if (index !== expr.length) throw new Error("trailing input");
  return value;
}
