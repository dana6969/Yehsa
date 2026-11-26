import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import manifest from "./assets/pictures/manifest.json" with { type: "json" };
import {
  PICTURE_BUDGET_BYTES,
  APP_SIZE_LIMIT_BYTES,
  answerPictures,
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
    assert.match(image.sourceUrl, /^https:\/\/(commons\.wikimedia\.org|www\.inaturalist\.org)\//);
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
  assert.equal(unknown.placeholder, false);
  assert.ok(unknown.images.length >= 1);
  assert.equal(pictureHealth({ images: [] }, []).some((item) => item.problem === "missing"), true);
  assert.match(guideView(manifest).find((entry) => entry.symbol === "yarrow_achillea").caution, /Never eat or use a plant/);
  assert.equal(PLANT_CAUTION.includes("Look-alikes can be toxic"), true);
  const missing = pictureHealth(manifest, files).filter((item) => item.problem === "missing");
  assert.equal(missing.length, 0);
  const gap = { images: manifest.images.filter((image) => image.symbol !== "unknown_plant") };
  assert.ok(pictureHealth(gap, files).some((item) => item.problem === "missing" && item.id === "unknown_plant"));
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

test("every picture ships inside the app bundle, and a missing one is labeled", () => {
  const bundled = fs.readFileSync("symbolic/picture_assets.native.js", "utf8");
  const web = fs.readFileSync("symbolic/picture_assets.web.js", "utf8");
  let total = 0;
  for (const image of manifest.images) {
    const file = path.join("assets/pictures", image.file);
    assert.ok(fs.existsSync(file), `${image.file} is missing from assets/pictures`);
    assert.equal(fs.readFileSync(file).subarray(8, 12).toString("ascii"), "WEBP");
    total += fs.statSync(file).size;
    const line = `require("../assets/pictures/${image.file}")`;
    assert.ok(bundled.includes(line), `${image.file} is not required in picture_assets.native.js`);
    assert.ok(web.includes(line), `${image.file} is not required in picture_assets.web.js`);
  }
  assert.ok(total < PICTURE_BUDGET_BYTES);
  const screen = fs.readFileSync("src/phone/PictureGuide.js", "utf8");
  assert.doesNotMatch(screen, /uri:\s*imageHref/);
  assert.match(screen, /Picture not included/);
  const home = fs.readFileSync("src/phone/YehsaApp.js", "utf8");
  assert.doesNotMatch(home, /source=\{\{ uri: picture\.href \}\}/);
});

import packs from "./assets/pictures/packs.json" with { type: "json" };
import classes from "./assets/camera_id/classes.json" with { type: "json" };
import { CAMERA_NOTES } from "./symbolic/camera_notes.js";

test("round 4: every camera label has field photos under its note, with credits and an allowed license", () => {
  for (const [label, meta] of Object.entries(classes)) {
    if (meta.group === "everyday") continue;
    const own = manifest.images.filter((image) => image.label === label && image.role !== "lookalike" && image.role !== "example");
    assert.ok(own.length >= 1, `${label} has no field photo`);
    for (const image of own) {
      assert.equal(image.symbol, CAMERA_NOTES[label]);
      assert.match(image.license, /^(CC0|CC BY 4\.0)$/);
      assert.ok(image.author && image.attribution && image.licenseUrl);
    }
  }
  const field = manifest.images.filter((image) => image.source === "iNaturalist");
  assert.ok(field.every((image) => !/SA|NC|ND/.test(image.license)));
});

test("round 4: plants and mushrooms show their look-alikes, with a warning", () => {
  for (const label of ["wild_carrot", "chanterelle", "jack_o_lantern", "ramps"]) {
    const rows = picturesFor(manifest, CAMERA_NOTES[label]).filter((image) => image.role === "lookalike");
    assert.ok(rows.length >= 1, `${label} has no look-alike picture`);
    assert.ok(rows.every((image) => /^Look-alike: /.test(image.warning)));
  }
  const deathCap = guideView(manifest).find((entry) => entry.symbol === "amanita_death_cap");
  assert.match(deathCap.caution, /Never eat a wild mushroom/);
});

test("round 4: bytes per category match the files, and stay under the 2 GB app limit", () => {
  const unique = [...new Set(manifest.images.map((image) => image.file))];
  const bytes = unique.reduce((sum, file) => sum + fs.statSync(path.join("assets/pictures", file)).size, 0);
  assert.equal(packs.total.files, unique.length);
  assert.equal(packs.total.bytes, bytes);
  const sum = Object.values(packs.categories).reduce((total, item) => total + item.bytes, 0);
  assert.equal(sum, bytes);
  assert.ok(bytes < PICTURE_BUDGET_BYTES && PICTURE_BUDGET_BYTES < APP_SIZE_LIMIT_BYTES);
});

test("round 4: an Ask answer shows at most four pictures, own photos first", () => {
  const pics = answerPictures(manifest, "amanita_death_cap");
  assert.ok(pics.length >= 1 && pics.length <= 4);
  assert.notEqual(pics[0].role, "lookalike");
  assert.ok(answerPictures(manifest, "deer_scat").length >= 1);
});
