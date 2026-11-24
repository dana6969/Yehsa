// Round 4: field entries join Ask and the meaning matcher only when the question names them.
import assert from "node:assert/strict";
import test from "node:test";
import { entryHeadHit } from "./symbolic/entries.js";
import { ask } from "./symbolic/ask.js";

test("an entry counts as named only by its title, bracket words, or other names", () => {
  assert.equal(entryHeadHit("deer_scat", "Tell me about deer droppings"), true);
  assert.equal(entryHeadHit("cumulonimbus_cloud", "Thunderheads are building over the peak"), true);
  assert.equal(entryHeadHit("flash_flood_risk", "Why can a dry gully in the desert be dangerous?"), true);
  assert.equal(entryHeadHit("fire_site_choice", "My hand got a small scrape on a rock"), false);
  assert.equal(entryHeadHit("hungry_in_woods", "I'm turned around in the woods"), false);
  assert.equal(entryHeadHit("tourniquet_last_resort", "anything"), null);
});

test("a near-neighbour entry does not answer a question it was not asked", () => {
  for (const [q, wrong] of [
    ["My hand got a small scrape on a rock", /^(fire_site_choice|deer_scrape)$/],
    ["What's the best brand of hiking boots to buy?", /^foot_care_hiking$/],
    ["How do I get a campfire going from small sticks?", /^fire_out_completely$/]
  ]) {
    const r = ask(q, { agents: false });
    assert.doesNotMatch(String(r.symbol || ""), wrong, q);
  }
  assert.equal(ask("Tell me about deer scat", { agents: false }).symbol, "deer_scat");
});
