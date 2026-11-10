// Exact field arithmetic and unit conversion. No eval of arbitrary text.

const LENGTH = { mm: 0.001, cm: 0.01, m: 1, meter: 1, meters: 1, km: 1000, kilometer: 1000, kilometers: 1000, in: 0.0254, inch: 0.0254, inches: 0.0254, ft: 0.3048, foot: 0.3048, feet: 0.3048, mi: 1609.344, mile: 1609.344, miles: 1609.344, nmi: 1852, nm: 1852 };
const AREA = { sqm: 1, m2: 1, hectare: 10000, hectares: 10000, acre: 4046.8564224, acres: 4046.8564224, sqft: 0.09290304, ft2: 0.09290304 };
const MASS = { mg: 0.001, g: 1, gram: 1, grams: 1, kg: 1000, kilogram: 1000, kilograms: 1000, oz: 28.349523125, ounce: 28.349523125, ounces: 28.349523125, lb: 453.59237, lbs: 453.59237, pound: 453.59237, pounds: 453.59237 };
const VOLUME = { ml: 1, milliliter: 1, milliliters: 1, l: 1000, liter: 1000, liters: 1000, gal: 3785.411784, gallon: 3785.411784, gallons: 3785.411784, cup: 240, cups: 240, tbsp: 15, tablespoon: 15, tablespoons: 15, tsp: 5, teaspoon: 5, teaspoons: 5 };
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
    if (/\b(?:plus|minus|times|divided by)\b/.test(rest)) continue;
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
  const match = spoken.match(/how many ([a-z]+) (?:are in|is in|in|is) (-?\d+(?:\.\d+)?) ([a-z]+)|(?:what is |convert )?(-?\d+(?:\.\d+)?) ([a-z]+) (?:into|in|to) ([a-z]+)/);
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
  const label = { sqm: "square meters", sqft: "square feet", nmi: "nautical miles" };
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

export function calculate(input) {
  const text = normalizeUnits(clean(input));
  return arithmetic(text) || extraMath(text) || precedence(text) || convert(text);
}
