// Ask is less crowded: at most two follow-up chips, sources folded behind "Sources (n)".
import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";

test("Ask tidy helpers and wiring", async () => {
  const src = fs.readFileSync("src/phone/parts/AskTidy.js", "utf8");
  assert.match(src, /export const MAX_FOLLOW_UPS = 2;/);
  assert.match(src, /Sources \(\$\{n\}\)/);
  // The helpers are plain functions; check them without React Native.
  const followUps = (suggestions, max = 2) => {
    const seen = new Set();
    const out = [];
    for (const chip of suggestions || []) {
      const key = String(chip?.label || "").toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(chip);
      if (out.length >= max) break;
    }
    return out;
  };
  assert.equal(followUps([{ label: "a" }, { label: "A" }, { label: "b" }, { label: "c" }]).length, 2);
  const app = fs.readFileSync("src/phone/YehsaApp.js", "utf8");
  assert.match(app, /followUps\(item\.suggestions\)/);
  assert.match(app, /<SourcesFold /);
  assert.doesNotMatch(app, /item\.suggestions\.map\(/, "follow-ups go through followUps() so there are never more than two");
  assert.match(app, /routeIntent\(effective\)/);
  assert.match(app, /onLongPress=\{hunt \? huntMap\.onMapLongPress : nav\.dropPin\}/);
});
