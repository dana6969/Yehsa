import assert from "node:assert/strict";
import test from "node:test";
import { calculate } from "./symbolic/calculator.js";

const AMBIG = /more than one way|do not match up/;

test("full expressions keep every operation with normal precedence", () => {
  assert.match(calculate("12 * 7 + 3").text, /\b87\b/);
  assert.match(calculate("what is 12 * 7 + 3?").text, /\b87\b/);
  assert.match(calculate("12 x 7 + 3").text, /\b87\b/);
  assert.match(calculate("3 + 12 * 7").text, /\b87\b/);
  assert.match(calculate("2+3*4-1").text, /\b13\b/);
  assert.match(calculate("100 - 10 - 5").text, /\b85\b/);
  assert.match(calculate("10 / 2 / 5").text, /That comes to 1\./);
  assert.match(calculate("8 / 4 * 2").text, /\b4\b/);
  assert.match(calculate("3 - -2 * 2").text, /\b7\b/);
  assert.match(calculate("12 × 7 ÷ 4").text, /\b21\b/);
  assert.match(calculate("calculate 1.5 * 4 + 0.25").text, /6\.25/);
  assert.match(calculate("what is 3 times 4 plus 5 minus 2").text, /\b15\b/);
  assert.match(calculate("what is 2 x 3 x 4").text, /\b24\b/);
  assert.match(calculate("12 * 7 + 3 =").text, /\b87\b/);
});

test("parentheses and powers", () => {
  assert.match(calculate("(2+3)*4").text, /\b20\b/);
  assert.match(calculate("2 * (3 + 4) - 1").text, /\b13\b/);
  assert.match(calculate("((1 + 2) * (3 + 4)) / 7").text, /That comes to 3\./);
  assert.match(calculate("2^3^2").text, /\b512\b/);
  assert.match(calculate("2 ^ 3 * 2").text, /\b16\b/);
  assert.match(calculate("(-2)^2").text, /That comes to 4\./);
  assert.match(calculate("-(2^2)").text, /That comes to -4\./);
  assert.match(calculate("2^-2 + 1").text, /1\.25/);
});

test("ambiguous or broken input is refused, not guessed", () => {
  const implied = calculate("6/2(1+2)").text;
  assert.match(implied, AMBIG);
  assert.equal(implied.match(/\b9\b|\b1\b/), null);
  assert.match(calculate("-2^2").text, AMBIG);
  assert.match(calculate("2 * (3 + 4").text, AMBIG);
  assert.match(calculate("2 + 3) * 4").text, AMBIG);
  assert.match(calculate("5 / (2 - 2)").text, /undefined/);
  assert.equal(calculate("12 * 7 + 3 apples"), null);
});

test("single operations keep their older answers", () => {
  assert.match(calculate("12 * 7").text, /12 and 7 come to 84/);
  assert.match(calculate("2 ^ 3").text, /2 to the power of 3 is 8/);
  assert.match(calculate("What is the sum of 2 and 2?").text, /\b4\b/);
  assert.match(calculate("what is 1/2 plus 1/4").text, /0\.75/);
});
