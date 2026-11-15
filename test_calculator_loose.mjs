import assert from "node:assert/strict";
import test from "node:test";
import { calculate } from "./symbolic/calculator.js";

test("existing arithmetic and conversions stay put", () => {
  assert.match(calculate("What is the sum of 2 and 2?").text, /\b4\b/);
  assert.match(calculate("How many meters are in 2 kilometers?").text, /2000/);
  assert.match(calculate("subtract 3 from 10").text, /\b7\b/);
  assert.match(calculate("What is 50 Fahrenheit in Celsius?").text, /\b10\b/);
  assert.match(calculate("what is 20 percent of 80").text, /\b16\b/);
  assert.match(calculate("What is 2 plus 3 times 4?").text, /14/);
});

test("fractions, fillers, averages, rates, and discounts", () => {
  assert.match(calculate("what is 1/2 plus 1/4").text, /0\.75/);
  assert.match(calculate("how many tablespoons in 2 and a half cups").text, /\b40\b/);
  assert.match(calculate("roughly how many meters are in about 2 kilometers").text, /2000/);
  assert.match(calculate("what is the average of 4, 8, and 12").text, /\b8\b/);
  assert.match(calculate("what is half of 10").text, /\b5\b/);
  assert.match(calculate("20 percent off 80").text, /\b64\b/);
  assert.match(calculate("from 40 to 50 is what percent change").text, /25 percent increase/);
  assert.match(calculate("increased by 10 percent from 200").text, /\b220\b/);
  assert.match(calculate("we walked 12 miles in 3 hours, how fast per hour").text, /\b4\b/);
});

test("an ambiguous percent wording does not invent a number", () => {
  const mixed = calculate("is that 20 percent of 80 or 20 percent off 80");
  assert.match(mixed.text, /more than one way/);
  assert.equal(mixed.text.match(/\b16\b|\b64\b/), null);
});
