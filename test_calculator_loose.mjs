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

test("length converts yards, feet, inches, meters, and miles in every direction", () => {
  assert.match(calculate("300 yards to feet").text, /\b900\b/);
  assert.match(calculate("how many feet in 2 miles").text, /\b10560\b/);
  assert.match(calculate("50 m in yards").text, /54\.680665/);
  assert.match(calculate("how many yards are in 3 miles").text, /\b5280\b/);
  assert.match(calculate("how many inches are in 3 feet").text, /\b36\b/);
  assert.match(calculate("convert 2 km to meters").text, /\b2000\b/);
  assert.match(calculate("100 centimeters to meters").text, /\b1\b/);
  assert.match(calculate("2 nautical miles in meters").text, /\b3704\b/);
  assert.match(calculate("how many feet are there in 1 yard").text, /\b3\b/);
  assert.match(calculate("9 feet to yards").text, /\b3\b/);
  assert.match(calculate("1760 yards in miles").text, /\b1\b/);
});

test("weight, volume, and temperature conversions fill the family gaps", () => {
  assert.match(calculate("4 pounds to ounces").text, /\b64\b/);
  assert.match(calculate("how many grams in 2 kg").text, /\b2000\b/);
  assert.match(calculate("1 gallon to quarts").text, /\b4\b/);
  assert.match(calculate("2 quarts in pints").text, /\b4\b/);
  assert.match(calculate("500 ml to liters").text, /\b0\.5\b/);
  assert.match(calculate("32 Fahrenheit in Celsius").text, /\b0\b/);
  assert.match(calculate("100 Celsius to Fahrenheit").text, /\b212\b/);
});
