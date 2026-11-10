import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import manifest from "./assets/pictures/manifest.json" with { type: "json" };
import {
  PICTURE_BUDGET_BYTES,
  PLANT_CAUTION,
  guideView,
  imageHref,
  licenseAllowed,
  packDecision,
  pictureHealth,
  picturesFor,
  friendlySource
} from "./symbolic/picture_guide.js";

const files = fs.readdirSync("public/pictures/files");

test("every picture has a source, a license, and an author, and none are unlicensed", () => {
  assert.ok(manifest.images.length > 0);
  for (const image of manifest.images) {
    assert.ok(image.sourceUrl.startsWith("https://commons.wikimedia.org/"));
    assert.ok(image.author);
    assert.ok(image.attribution);
    assert.equal(licenseAllowed(image.license), true);
    assert.equal(files.includes(image.file), true);
    assert.doesNotMatch(image.license, /NC|ND|GFDL|No restrictions/i);
  }
  const health = pictureHealth(manifest, files);
  assert.equal(health.some((item) => item.problem === "unlicensed"), false);
  assert.equal(health.some((item) => item.problem === "broken"), false);
  assert.equal(health.some((item) => item.problem === "incomplete"), false);
});

test("a note with no accepted picture stays a placeholder and is flagged", () => {
  const tourniquet = guideView(manifest).find((entry) => entry.symbol === "tourniquet_last_resort");
  assert.equal(tourniquet.placeholder, false);
  assert.ok(tourniquet.images.some((image) => /FM 4-25\.11/.test(image.attribution) && image.license === "Public domain"));
  const unknown = guideView(manifest).find((entry) => entry.symbol === "unknown_plant");
  assert.equal(unknown.placeholder, true);
  assert.equal(unknown.images.length, 0);
  assert.match(guideView(manifest).find((entry) => entry.symbol === "yarrow_achillea").caution, /Never eat or use a plant/);
  assert.equal(PLANT_CAUTION.includes("Look-alikes can be toxic"), true);
  const missing = pictureHealth(manifest, files).filter((item) => item.problem === "missing");
  assert.ok(missing.some((item) => item.id === "unknown_plant"));
  const yarrow = picturesFor(manifest, "yarrow_achillea");
  assert.ok(yarrow.some((image) => image.role === "lookalike" && image.warning));
});

test("picture credits use a friendly name and stay out of the chip", () => {
  assert.equal(friendlySource("herbology"), "Plants");
  assert.equal(friendlySource("willow_bark"), "Willow");
  assert.doesNotMatch(friendlySource("willow_bark"), /herbology|_/);
  const home = fs.readFileSync("src/phone/YehsaApp.js", "utf8");
  assert.match(home, /Picture credits/);
  assert.doesNotMatch(home, /<Quiet>\{picture\.attribution\}<\/Quiet>/);
});

test("pictures stay under the size budget and are not pulled into the ask hot path", () => {
  const total = files.reduce((sum, file) => sum + fs.statSync(path.join("public/pictures/files", file)).size, 0);
  const decision = packDecision(total);
  assert.ok(total < PICTURE_BUDGET_BYTES);
  assert.equal(decision.included, true);
  assert.equal(decision.optionalPack, false);
  const guide = fs.readFileSync("symbolic/picture_guide.js", "utf8");
  assert.doesNotMatch(guide, /readFileSync|\.webp/);
  assert.equal(imageHref("yarrow-achillea-whole-0.webp"), "/pictures/files/yarrow-achillea-whole-0.webp");
  const ask = fs.readFileSync("symbolic/ask.js", "utf8");
  assert.doesNotMatch(ask, /picture_guide|pictures\/files/);
  const hot = fs.readFileSync("symbolic/symbolic_dictionary.js", "utf8");
  assert.doesNotMatch(hot, /picture_guide|pictures\/files/);
});
