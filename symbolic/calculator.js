// Exact field arithmetic and unit conversion. No eval of arbitrary text.

const LENGTH = {
  mm: 0.001,
  cm: 0.01, centimeter: 0.01, centimeters: 0.01, centimetre: 0.01, centimetres: 0.01,
  m: 1, meter: 1, meters: 1, metre: 1, metres: 1,
  km: 1000, kilometer: 1000, kilometers: 1000, kilometre: 1000, kilometres: 1000,
  in: 0.0254, inch: 0.0254, inches: 0.0254,
  ft: 0.3048, foot: 0.3048, feet: 0.3048,
  yd: 0.9144, yds: 0.9144, yard: 0.9144, yards: 0.9144,
  mi: 1609.344, mile: 1609.344, miles: 1609.344,
  nmi: 1852, nm: 1852
};
const AREA = { sqm: 1, m2: 1, hectare: 10000, hectares: 10000, acre: 4046.8564224, acres: 4046.8564224, sqft: 0.09290304, ft2: 0.09290304 };
const MASS = { mg: 0.001, g: 1, gram: 1, grams: 1, kg: 1000, kilogram: 1000, kilograms: 1000, oz: 28.349523125, ounce: 28.349523125, ounces: 28.349523125, lb: 453.59237, lbs: 453.59237, pound: 453.59237, pounds: 453.59237 };
const VOLUME = {
  ml: 1, milliliter: 1, milliliters: 1, millilitre: 1, millilitres: 1,
  l: 1000, liter: 1000, liters: 1000, litre: 1000, litres: 1000,
  gal: 3785.411784, gallon: 3785.411784, gallons: 3785.411784,
  qt: 946.352946, quart: 946.352946, quarts: 946.352946,
  pt: 473.176473, pint: 473.176473, pints: 473.176473,
  cup: 240, cups: 240, tbsp: 15, tablespoon: 15, tablespoons: 15, tsp: 5, teaspoon: 5, teaspoons: 5
};
const TIME = { s: 1, sec: 1, secs: 1, second: 1, seconds: 1, min: 60, mins: 60, minute: 60, minutes: 60, h: 3600, hr: 3600, hrs: 3600, hour: 3600, hours: 3600 };
const SPEED = { mps: 1, kph: 1000 / 3600, mph: 1609.344 / 3600, fps: 0.3048, knot: 1852 / 3600, knots: 1852 / 3600 };

function clean(input) {
  return String(input || "").toLowerCase().replace(/[?]/g, " ").replace(/\s+/g, " ").trim();
}

function formatNumber(value) {
  if (!Number.isFinite(value)) return null;
  const rounded = Math.round(value * 1e6) / 1e6;
  if (Math.abs(rounded - Math.round(rounded)) < 1e-6) return String(Math.round(rounded));
  return String(rounded);
}

function arithmetic(text) {
  const patterns = [
    [/^(?:what is |how much is )?(?:the sum of )?(-?\d+(?:\.\d+)?) (?:plus|added to|\+) (-?\d+(?:\.\d+)?)/, (a, b) => a + b],
    [/^(?:what is |how much is )?(-?\d+(?:\.\d+)?) (?:minus|subtracted by|-) (-?\d+(?:\.\d+)?)/, (a, b) => a - b],
    [/^(?:what is |how much is )?(-?\d+(?:\.\d+)?) (?:times|multiplied by|\*|x) (-?\d+(?:\.\d+)?)/, (a, b) => a * b],
    [/^(?:what is |how much is )?(-?\d+(?:\.\d+)?) divided by (-?\d+(?:\.\d+)?)/, (a, b) => (b === 0 ? null : a / b)]
  ];
  for (const [pattern, op] of patterns) {
    const match = text.match(pattern);
    if (!match) continue;
    const rest = text.slice(match.index + match[0].length);
    if (/\b(?:plus|minus|times|multiplied by|divided by|over)\b/.test(rest)) continue;
    if (/^\s*[-+*/x×÷^)(]/.test(rest)) continue;
    const value = op(Number(match[1]), Number(match[2]));
    const shown = formatNumber(value);
    if (shown == null) return { text: "Division by zero is undefined." };
    return { text: `${match[1]} and ${match[2]} come to ${shown}.` };
  }
  const sum = text.match(/(?:sum of|add) (-?\d+(?:\.\d+)?) and (-?\d+(?:\.\d+)?)/);
  if (sum) {
    const shown = formatNumber(Number(sum[1]) + Number(sum[2]));
    return { text: `The sum of ${sum[1]} and ${sum[2]} is ${shown}.` };
  }
  const from = text.match(/subtract (-?\d+(?:\.\d+)?) from (-?\d+(?:\.\d+)?)/);
  if (from) {
    const shown = formatNumber(Number(from[2]) - Number(from[1]));
    return { text: `${from[2]} minus ${from[1]} is ${shown}.` };
  }
  return null;
}

function normalizeUnits(text) {
  return text
    .replace(/degrees celsius/g, "celsius")
    .replace(/degrees fahrenheit/g, "fahrenheit")
    .replace(/miles per hour/g, "mph")
    .replace(/kilometers per hour/g, "kph")
    .replace(/kilometres per hour/g, "kph")
    .replace(/meters per second/g, "mps")
    .replace(/metres per second/g, "mps")
    .replace(/feet per second/g, "fps")
    .replace(/nautical miles/g, "nmi")
    .replace(/nautical mile/g, "nmi")
    .replace(/km\/h/g, "kph")
    .replace(/square meters/g, "sqm")
    .replace(/square feet/g, "sqft");
}

function convert(text) {
  const spoken = normalizeUnits(text);
  const match = spoken.match(/how many ([a-z]+) (?:are there in|are in|is in|in|is) (-?\d+(?:\.\d+)?) ([a-z]+)|(?:what is |convert )?(-?\d+(?:\.\d+)?) ([a-z]+) (?:into|in|to) ([a-z]+)/);
  if (!match) return null;
  const [amount, fromName, toName] = match[1]
    ? [Number(match[2]), match[3], match[1]]
    : [Number(match[4]), match[5], match[6]];
  const celsius = fromName === "celsius" || fromName === "c";
  const fahrenheit = fromName === "fahrenheit" || fromName === "f";
  const toCelsius = toName === "celsius" || toName === "c";
  const toFahrenheit = toName === "fahrenheit" || toName === "f";
  if ((celsius && toFahrenheit) || (fahrenheit && toCelsius)) {
    if (celsius && toFahrenheit) {
      return { text: `${formatNumber(amount)} Celsius is ${formatNumber(amount * 9 / 5 + 32)} Fahrenheit.` };
    }
    return { text: `${formatNumber(amount)} Fahrenheit is ${formatNumber((amount - 32) * 5 / 9)} Celsius.` };
  }
  const families = [LENGTH, MASS, VOLUME, TIME, SPEED, AREA];
  const family = families.find((table) => table[fromName] && table[toName]);
  if (!family) return null;
  const value = amount * family[fromName] / family[toName];
  const label = { sqm: "square meters", sqft: "square feet", nmi: "nautical miles", yd: "yards", yds: "yards", ft: "feet", in: "inches", mi: "miles", km: "kilometers", m: "meters", cm: "centimeters", qt: "quarts", pt: "pints", gal: "gallons", l: "liters", ml: "milliliters", lb: "pounds", lbs: "pounds", oz: "ounces", kg: "kilograms", g: "grams" };
  const fromLabel = label[fromName] || fromName;
  const toLabel = label[toName] || toName;
  return { text: `${formatNumber(amount)} ${fromLabel} is ${formatNumber(value)} ${toLabel}.` };
}

function precedence(text) {
  const body = text.replace(/^(?:what is|how much is|calculate)\s+/, "");
  const match = body.match(/^(-?\d+(?:\.\d+)?)(?:\s+(plus|minus|times|divided by)\s+(-?\d+(?:\.\d+)?))+$/);
  if (!match) return null;
  const terms = [];
  const re = /(-?\d+(?:\.\d+)?)|plus|minus|times|divided by/g;
  const tokens = [...body.matchAll(re)].map((item) => item[0]);
  let value = Number(tokens[0]);
  const addends = [];
  let op = "plus";
  for (let i = 1; i < tokens.length; i += 2) {
    const operator = tokens[i];
    const num = Number(tokens[i + 1]);
    if (operator === "times") value *= num;
    else if (operator === "divided by") {
      if (num === 0) return { text: "Division by zero is undefined." };
      value /= num;
    } else {
      addends.push([op, value]);
      op = operator;
      value = num;
    }
  }
  addends.push([op, value]);
  let total = 0;
  for (const [sign, part] of addends) total += sign === "minus" ? -part : part;
  return { text: `That comes to ${formatNumber(total)}.` };
}

// Full arithmetic expressions: + - * / ^ and parentheses, with normal
// precedence (powers right to left, then * and /, then + and -, each left to
// right). Hand-written parser, never eval. Implied multiplication next to a
// parenthesis ("6/2(1+2)") and a minus sign right before a power ("-2^2") are
// read different ways by different people, so those get refused instead of
// guessed. Unbalanced parentheses are refused too.
const EXPR_PREFIX = /^(?:what is|what's|whats|how much is|calculate|compute|evaluate|solve|work out)\s+/;

function exprTokens(text) {
  let body = text.replace(EXPR_PREFIX, "").replace(/^(?:the value of\s+)/, "");
  body = body.replace(/\s*(?:=|equals?|is equal to)?\s*\.?\s*$/, "");
  body = body
    .replace(/\bmultiplied by\b/g, " * ")
    .replace(/\btimes\b/g, " * ")
    .replace(/\bdivided by\b/g, " / ")
    .replace(/\bplus\b/g, " + ")
    .replace(/\bminus\b/g, " - ")
    .replace(/\bto the power of\b/g, " ^ ")
    .replace(/\*\*/g, " ^ ")
    .replace(/×/g, " * ")
    .replace(/÷/g, " / ")
    .replace(/[−–]/g, " - ");
  // "x" means multiply only when it sits between a number or ")" and a number or "(".
  body = body.replace(/(\d|\))\s*x\s*(?=[\d(.])/g, "$1 * ");
  if (!body || /[^0-9.+\-*/^()\s]/.test(body)) return null;
  const tokens = [];
  const re = /\s*(\d+(?:\.\d+)?|\.\d+|[-+*/^()])/y;
  let pos = 0;
  while (pos < body.length) {
    if (/^\s+$/.test(body.slice(pos))) break;
    re.lastIndex = pos;
    const m = re.exec(body);
    if (!m) return null;
    tokens.push(m[1]);
    pos = re.lastIndex;
  }
  return tokens;
}

class ExprRefusal extends Error {}

function parseExpression(tokens) {
  let i = 0;
  const peek = () => tokens[i];
  const isNum = (t) => t != null && /^[\d.]/.test(t);
  function primary() {
    const t = tokens[i];
    if (t === "(") {
      i += 1;
      const v = sum();
      if (tokens[i] !== ")") throw new ExprRefusal("paren");
      i += 1;
      if (tokens[i] === "(" || isNum(tokens[i])) throw new ExprRefusal("implied");
      return v;
    }
    if (isNum(t)) {
      i += 1;
      if (tokens[i] === "(") throw new ExprRefusal("implied");
      if (isNum(tokens[i])) throw new ExprRefusal("adjacent");
      return Number(t);
    }
    throw new ExprRefusal("syntax");
  }
  function power() {
    const base = primary();
    if (peek() === "^") {
      i += 1;
      const exp = unary(true);
      const v = base ** exp;
      if (!Number.isFinite(v)) throw new ExprRefusal("range");
      return v;
    }
    return base;
  }
  function unary(inExponent = false) {
    if (peek() === "-" || peek() === "+") {
      const sign = tokens[i] === "-" ? -1 : 1;
      i += 1;
      const start = i;
      const v = unary(inExponent);
      // "-2^2": some read (-2)^2, some -(2^2). Refuse rather than pick.
      if (sign < 0 && !inExponent && tokens.slice(start, i).includes("^") && tokens[start] !== "(") throw new ExprRefusal("unary-power");
      return sign * v;
    }
    return power();
  }
  function product() {
    let v = unary();
    while (peek() === "*" || peek() === "/") {
      const op = tokens[i];
      i += 1;
      const r = unary();
      if (op === "/") {
        if (r === 0) throw new ExprRefusal("zero");
        v /= r;
      } else v *= r;
    }
    return v;
  }
  function sum() {
    let v = product();
    while (peek() === "+" || peek() === "-") {
      const op = tokens[i];
      i += 1;
      const r = product();
      v = op === "+" ? v + r : v - r;
    }
    return v;
  }
  const value = sum();
  if (i !== tokens.length) throw new ExprRefusal(tokens[i] === ")" ? "paren" : "syntax");
  return value;
}

function expression(text) {
  const tokens = exprTokens(text);
  if (!tokens || !tokens.some((t) => /\d/.test(t))) return null;
  const binary = tokens.filter((t, k) => /^[+\-*/^]$/.test(t) && k > 0 && tokens[k - 1] !== "(" && !/^[+\-*/^]$/.test(tokens[k - 1])).length;
  const parens = tokens.includes("(") || tokens.includes(")");
  // One plain operation stays with the older, worded answers below.
  const unaryPower = tokens.includes("^") && tokens.some((t, k) => t === "-" && (k === 0 || /^[+\-*/^(]$/.test(tokens[k - 1])));
  if (binary < 2 && !parens && !unaryPower) return null;
  try {
    const value = parseExpression(tokens);
    const shown = formatNumber(value);
    if (shown == null) return null;
    return { value, text: `That comes to ${shown}.` };
  } catch (err) {
    if (!(err instanceof ExprRefusal)) throw err;
    if (err.message === "zero") return { text: "Division by zero is undefined." };
    if (err.message === "paren") return { ambiguous: true, text: "The parentheses in that do not match up, so I will not guess where they go." };
    if (err.message === "implied" || err.message === "unary-power") return { ambiguous: true, text: AMBIGUOUS };
    return null;
  }
}

function extraMath(text) {
  const percent = text.match(/(-?\d+(?:\.\d+)?)\s+percent of\s+(-?\d+(?:\.\d+)?)/);
  if (percent) return { text: `${percent[1]} percent of ${percent[2]} is ${formatNumber(Number(percent[1]) / 100 * Number(percent[2]))}.` };
  const root = text.match(/square root of\s+(-?\d+(?:\.\d+)?)/);
  if (root) {
    const value = Number(root[1]);
    if (value < 0) return { text: "The square root of a negative number is not a real number." };
    return { text: `The square root of ${root[1]} is ${formatNumber(Math.sqrt(value))}.` };
  }
  const power = text.match(/(-?\d+(?:\.\d+)?)\s+(?:to the power of|\^)\s*(-?\d+(?:\.\d+)?)/);
  if (power) return { text: `${power[1]} to the power of ${power[2]} is ${formatNumber(Number(power[1]) ** Number(power[2]))}.` };
  const rate = text.match(/(-?\d+(?:\.\d+)?)\s+(mph|kph|knots|km\/h)\s+for\s+(-?\d+(?:\.\d+)?)\s+(hours|hour|hrs)/);
  if (rate) {
    const unit = rate[2] === "km/h" ? "kph" : rate[2];
    const label = unit === "kph" ? "km" : unit === "knots" ? "nautical miles" : "miles";
    return { text: `${rate[1]} ${rate[2]} for ${rate[3]} hours covers ${formatNumber(Number(rate[1]) * Number(rate[3]))} ${label}.` };
  }
  return null;
}

const SMALL_WORDS = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12
};

function stripFillers(text) {
  return text
    .replace(/\b(?:roughly|about|around|approximately|approx|please|just)\b/g, " ")
    .replace(/%/g, " percent ")
    .replace(/\s+/g, " ")
    .trim();
}

function expandFractions(text) {
  let out = text;
  out = out.replace(/\b(zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+and\s+a\s+half\b/g, (_, word) => String(SMALL_WORDS[word] + 0.5));
  out = out.replace(/\b(zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+and\s+(?:a|one)\s+quarter\b/g, (_, word) => String(SMALL_WORDS[word] + 0.25));
  out = out.replace(/\b(\d+)\s+and\s+a\s+half\b/g, (_, whole) => String(Number(whole) + 0.5));
  out = out.replace(/\b(\d+)\s+and\s+(?:a|one)\s+quarter\b/g, (_, whole) => String(Number(whole) + 0.25));
  out = out.replace(/\b(\d+)\s+(\d+)\s*\/\s*(\d+)\b/g, (_, whole, num, den) => {
    const bottom = Number(den);
    if (!bottom) return `${whole} ${num}/${den}`;
    return String(Number(whole) + Number(num) / bottom);
  });
  out = out.replace(/\b(\d+)\s*\/\s*(\d+)\b/g, (_, num, den) => {
    const bottom = Number(den);
    if (!bottom) return `${num}/${den}`;
    return String(Number(num) / bottom);
  });
  if (/\b(plus|minus|times|divided|percent|average|per hour|cups?|tablespoons?|teaspoons?|meters?|kilograms?)\b/.test(out)) {
    out = out.replace(/\b(zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b/g, (word) => String(SMALL_WORDS[word]));
  }
  return out.replace(/\s+/g, " ").trim();
}

function valuesOf(found) {
  return found.filter((item) => item && Number.isFinite(item.value)).map((item) => item.value);
}

function sameValue(left, right) {
  return Math.abs(left - right) <= 1e-6 * Math.max(1, Math.abs(left), Math.abs(right));
}

const AMBIGUOUS = "That wording can be read more than one way, so I will not give a confident number.";

function averageOf(text) {
  const match = text.match(/\baverage(?:\s+of)?\s+((?:-?\d+(?:\.\d+)?\s*(?:,|and|&)?\s*){2,})/);
  if (!match) return null;
  const nums = match[1].match(/-?\d+(?:\.\d+)?/g);
  if (!nums || nums.length < 2) return null;
  const values = nums.map(Number);
  const value = values.reduce((sum, item) => sum + item, 0) / values.length;
  return { value, text: `The average of ${values.map((item) => formatNumber(item)).join(", ")} is ${formatNumber(value)}.` };
}

function discountOf(text) {
  const match = text.match(/(-?\d+(?:\.\d+)?)\s+percent\s+(?:off|discount)(?:\s+(?:of|on|from))?\s+(-?\d+(?:\.\d+)?)/);
  if (!match) return null;
  const pct = Number(match[1]);
  const base = Number(match[2]);
  const value = base * (1 - pct / 100);
  return { value, text: `${formatNumber(pct)} percent off ${formatNumber(base)} is ${formatNumber(value)}.` };
}

function percentChange(text) {
  if (!/\bpercent\b/.test(text)) return null;
  const fromTo = text.match(/\bfrom\s+(-?\d+(?:\.\d+)?)\s+to\s+(-?\d+(?:\.\d+)?)/);
  if (fromTo) {
    const start = Number(fromTo[1]);
    const end = Number(fromTo[2]);
    if (start === 0) return { value: NaN, ambiguous: true, text: AMBIGUOUS };
    const value = ((end - start) / Math.abs(start)) * 100;
    const word = value >= 0 ? "increase" : "decrease";
    return { value, text: `From ${formatNumber(start)} to ${formatNumber(end)} is a ${formatNumber(Math.abs(value))} percent ${word}.` };
  }
  const shifted = text.match(/\b(?:increased|decreased|rose|fell|up|down)\s+(?:by\s+)?(-?\d+(?:\.\d+)?)\s+percent\s+from\s+(-?\d+(?:\.\d+)?)/);
  if (!shifted) return null;
  const pct = Number(shifted[1]);
  const start = Number(shifted[2]);
  const sign = /\b(decreased|fell|down)\b/.test(text) ? -1 : 1;
  const value = start * (1 + sign * pct / 100);
  return { value, text: `${formatNumber(start)} ${sign < 0 ? "decreased" : "increased"} by ${formatNumber(pct)} percent is ${formatNumber(value)}.` };
}

function perHour(text) {
  const match = text.match(/(-?\d+(?:\.\d+)?)\s+(miles|kilometers|km|meters|feet)\s+(?:in|over)\s+(-?\d+(?:\.\d+)?)\s+(hours|hour|minutes|minute)/);
  if (!match) return null;
  const distance = Number(match[1]);
  let hours = Number(match[3]);
  if (match[4].startsWith("minute")) hours /= 60;
  if (hours === 0) return { value: NaN, ambiguous: true, text: AMBIGUOUS };
  const value = distance / hours;
  return { value, text: `${formatNumber(distance)} ${match[2]} in ${formatNumber(Number(match[3]))} ${match[4]} is ${formatNumber(value)} ${match[2]} per hour.` };
}

function halfOf(text) {
  const match = text.match(/\bhalf of\s+(-?\d+(?:\.\d+)?)/);
  if (!match) return null;
  const value = Number(match[1]) / 2;
  return { value, text: `Half of ${formatNumber(Number(match[1]))} is ${formatNumber(value)}.` };
}

function looseMath(text) {
  const found = [averageOf(text), discountOf(text), percentChange(text), perHour(text), halfOf(text)].filter(Boolean);
  if (found.some((item) => item.ambiguous)) return { text: AMBIGUOUS };
  const values = valuesOf(found);
  if (values.length > 1 && values.some((value) => !sameValue(value, values[0]))) return { text: AMBIGUOUS };
  return found[0] || null;
}

function resultValue(item) {
  if (!item) return null;
  if (item.ambiguous) return null;
  if (Number.isFinite(item.value)) return item.value;
  const nums = String(item.text || "").match(/-?\d+(?:\.\d+)?/g);
  if (!nums) return null;
  return Number(nums[nums.length - 1]);
}

export function calculate(input) {
  const text = normalizeUnits(clean(input));
  const full = expression(text);
  if (full) return full.ambiguous ? { text: full.text } : full;
  const exact = arithmetic(text) || extraMath(text) || precedence(text) || convert(text);
  const prepared = expandFractions(normalizeUnits(stripFillers(text)));
  const loose = looseMath(prepared) || (prepared !== text ? (arithmetic(prepared) || extraMath(prepared) || precedence(prepared) || convert(prepared)) : null);
  if (exact?.text && loose?.text) {
    const left = resultValue(exact);
    const right = resultValue(loose);
    if (loose.ambiguous || (left != null && right != null && !sameValue(left, right))) return { text: AMBIGUOUS };
  }
  if (loose?.ambiguous) return { text: AMBIGUOUS };
  return exact || loose || null;
}
