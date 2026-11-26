// The one follow-up after an answer. Never the topic just answered (or the general note above it),
// never a note on another sort of animal (no venison after birds), and the next step first:
// after field dressing comes cooking, after skinning comes butchering.
import { ENTRIES } from "../entries_data.js";
import { LEGACY_LINKS } from "../entries_links.js";
import { entryProfile, allProfiles, sameTopic } from "./profiles.js";
import { GROUP_NOUN, entitiesIn, groupOf, kindOf, lineage } from "./taxonomy.js";

const BY_ID = new Map(ENTRIES.map((entry) => [entry.id, entry]));
const NEXT_STEP = {
  dress: ["cook", "preserve", "butcher", "skin"],
  skin: ["butcher", "preserve", "cook"],
  butcher: ["preserve", "cook"],
  preserve: ["cook"],
  gear: ["dress"],
  identify: ["dress", "track", "hunt"],
  track: ["identify", "hunt"],
  hunt: ["track", "dress"]
};
// The kind noun used when a note covers many kinds and the answer was about one ("cooking game birds").
const KIND_NOUN = { bird: "game birds", mammal: "game animals", fish: "fish" };
const ACTION_LINE = {
  cook: (noun) => ({ label: `Want me to go on to cooking ${noun} safely?`, ask: `What temperature do I cook ${noun} to?` }),
  preserve: (noun) => ({ label: `Want me to go on to keeping ${noun} cool and safe?`, ask: `How do I keep ${noun === "fish" ? "fish" : "game meat"} cool?` })
};

const askFor = (entry) => entry.ask || `Tell me about ${entry.title.toLowerCase()}`;

// Same animals: a species or group of one is the other's, or sits above or below it.
const GROUP_WORDS = new Set(["bird", "game", "fish", "upland_bird", "waterfowl", "big_game", "small_game"]);
// A note's own animals: its species, and its group words only when it has no species or spans several kinds
// ("bird tracks" on the turkey-track note does not make it a note on every bird).
function own(p) {
  const species = [...p.entities].filter((e) => !GROUP_WORDS.has(e));
  return new Set(species.length && p.kinds.size <= 1 ? species : [...p.entities]);
}
function overlaps(a, b) {
  const up = (p) => new Set([...own(p), ...[...own(p)].map(groupOf).filter(Boolean).flatMap(lineage)]);
  const aUp = up(a);
  const bUp = up(b);
  return [...own(b)].some((e) => aUp.has(e)) || [...own(a)].some((e) => bUp.has(e));
}

function titleKinds(entry) {
  return new Set(entitiesIn(entry.title).map((x) => kindOf(groupOf(x.entity))).filter(Boolean));
}

function single(set) {
  return set.size === 1 ? [...set][0] : null;
}

/**
 * { label, ask, entry } for the note after `symbol`, or null. `recent` lists symbols already
 * answered in this thread. `strict` is true when the answer is an animal-care note, so the caller
 * does not fall back to a domain offer that has nothing to do with it.
 */
export function nextOffer(symbol, recent = []) {
  const entry = BY_ID.get(String(symbol || ""));
  if (!entry) return { offer: null, strict: false };
  const seen = new Set([entry.id, ...recent.filter(Boolean)]);
  const here = entryProfile(entry.id);
  const ids = [...(entry.rel || [])];
  if (here) {
    // Notes on the same sort of animal that are the next step, even when the entry does not link them.
    for (const p of allProfiles()) {
      if (ids.includes(p.id) || p.id === entry.id) continue;
      const next = NEXT_STEP[here.actions[0]] || [];
      if (!p.actions.some((a) => next.includes(a))) continue;
      if (!overlaps(here, p)) continue;
      ids.push(p.id);
    }
  }
  const options = [];
  ids.forEach((id, order) => {
    if (seen.has(id)) return;
    const next = BY_ID.get(id);
    if (!next) {
      const legacy = LEGACY_LINKS[id];
      if (legacy && !here) options.push({ order, rank: 1, offer: { label: `Want me to go on to ${legacy.title}?`, ask: legacy.ask, entry: id } });
      return;
    }
    const there = entryProfile(id);
    if (here && there) {
      if (sameTopic(here, there)) return; // "field dressing birds" after "field dressing grouse" is the same thing again
      if (here.kinds.size && there.kinds.size && ![...there.kinds].some((k) => here.kinds.has(k))) return; // no venison after birds
      if (here.actions.includes("identify") && there.actions.includes("identify")) return;
    }
    const steps = here ? NEXT_STEP[here.actions[0]] || [] : [];
    const stepRank = there ? Math.min(...there.actions.map((a) => (steps.indexOf(a) + 1) || 9)) : 9;
    let offer = { label: `Want me to go on to ${next.title.toLowerCase()}?`, ask: askFor(next), entry: id };
    // A note on many kinds of animal, after an answer about one kind, is offered for that kind.
    const kind = here ? single(here.kinds) : null;
    if (kind && there && there.kinds.size > 1 && !titleKinds(next).has(kind) && ACTION_LINE[there.actions[0]]) offer = { ...ACTION_LINE[there.actions[0]](KIND_NOUN[kind] || GROUP_NOUN[kind] || "game"), entry: id };
    options.push({ order, rank: here ? stepRank : 0, offer });
  });
  options.sort((a, b) => a.rank - b.rank || a.order - b.order);
  return { offer: options[0]?.offer || null, strict: Boolean(here && here.kinds.size) };
}
