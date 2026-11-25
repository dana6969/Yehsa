// Choose the field entry for a how-to question by what it asks: the action first, then the animal,
// then the animal's group. An ID card never answers a how-to. When the exact animal has no note of
// its own, the group's note answers with one line that says so.
import { entitiesIn } from "./taxonomy.js";
import { entryFor, formatEntry, entryKind, entrySource } from "../entries.js";
import { understand } from "./understand.js";
import { allProfiles } from "./profiles.js";
import { ENTITIES, GROUP_NOUN, lineage } from "./taxonomy.js";

// When the asked action has no note, the note that covers it: plucking and skinning a bird come
// after field dressing it, so the dressing note answers with a line that says so.
const FALLBACK = { pluck: ["pluck", "skin", "dress"], skin: ["skin", "dress"], dress: ["dress"], butcher: ["butcher"], cook: ["cook"], preserve: ["preserve"], gear: ["gear"], track: ["track"], identify: ["identify"], hunt: ["hunt"] };
const VERB = { dress: "handled", pluck: "handled", skin: "handled", butcher: "butchered", cook: "cooked", preserve: "kept" };
const NO_OWN_NOTE = {
  pluck: "I don't have a separate plucking note. Plucking or skinning comes after field dressing, so here is that first.",
  skin: "I don't have a separate skinning note for this one. Skinning comes after field dressing, so here is that first."
};
const GROUP_WORDS = new Set(["bird", "game", "fish", "upland_bird", "waterfowl", "big_game", "small_game"]);
// Children shown in full under a general note ("field dressing birds" gets upland and waterfowl steps).
const CHILD_ORDER = ["upland_bird", "waterfowl", "turkey"];
const CHILDREN_IN_FULL = 2;

function score(profile, u, action) {
  let best = 0;
  // A tools note covers every animal.
  if (action === "gear" && [...profile.entities].every((e) => e === "game")) return 7;
  if (profile.entities.has(u.entity)) best = 10;
  else if (ENTITIES[u.entity]?.like && profile.entities.has(ENTITIES[u.entity].like)) best = 9;
  const ladder = u.groups;
  ladder.forEach((g, i) => {
    if (profile.groups.has(g) || profile.entities.has(g)) best = Math.max(best, 8 - 2 * i);
  });
  if (!best) return 0;
  // The note's author listed this very wording as one of its names ("quarter a deer", "clean a turkey").
  // A listed wording that names this animal counts most; a bare one ("field dress") only breaks ties,
  // so it never lifts the deer note over the hog note for a hog.
  let bonus = 0;
  for (const phrase of profile.phrases) {
    if (!u.text.includes(` ${phrase} `)) continue;
    const named = entitiesIn(phrase).map((e) => e.entity);
    bonus = Math.max(bonus, named.includes(u.entity) ? 3 : named.length ? 0 : 1);
  }
  best += bonus;
  // The finer point: "venison jerky" wants the jerky note, "wounded deer" the blood-trail note.
  if (u.detail && profile.details.has(u.detail)) best += 5;
  else if (u.detail && profile.details.size) best -= 3;
  else if (!u.detail && profile.details.size) best -= 4;
  return best;
}

function candidates(u) {
  const order = FALLBACK[u.action] || [u.action];
  for (const action of order) {
    const list = [];
    for (const p of allProfiles()) {
      if (!p.actions.includes(action)) continue;
      const s = score(p, u, action);
      if (s > 0) list.push({ p, s, action });
    }
    if (list.length) {
      // More specific notes first on a tie; then a hunting note over a general one.
      list.sort((a, b) => b.s - a.s || a.p.entities.size - b.p.entities.size || (b.p.domain === "hunting") - (a.p.domain === "hunting") || a.p.id.localeCompare(b.p.id));
      return list;
    }
  }
  return [];
}

function stepsBlock(entry) {
  const steps = entry.steps?.length ? entry.steps : [];
  if (!steps.length) return null;
  return `${entry.title}:\n${steps.map((step, i) => `${i + 1}. ${step}`).join("\n")}`;
}

// A general note ("Field dressing birds") with the full steps of the notes under it.
function withChildren(entry, profile, action) {
  const groupsUnder = (p) => [...p.groups].every((g) => g !== "bird" && lineage(g).includes("bird"));
  if (!profile.groups.has("bird") && !profile.entities.has("bird")) return null;
  const kids = [];
  for (const p of allProfiles()) {
    if (p.id === entry.id || !p.actions.includes(action) || !p.groups.size || !groupsUnder(p)) continue;
    kids.push(p);
  }
  if (!kids.length) return null;
  const rank = (p) => Math.min(...[...p.groups].map((g) => (CHILD_ORDER.indexOf(g) + 1) || 9));
  kids.sort((a, b) => rank(a) - rank(b) || a.id.localeCompare(b.id));
  const full = kids.slice(0, CHILDREN_IN_FULL).map((p) => entryFor(p.id)).filter(Boolean);
  const rest = kids.slice(CHILDREN_IN_FULL).map((p) => entryFor(p.id)).filter(Boolean);
  const blocks = full.map(stepsBlock).filter(Boolean);
  if (!blocks.length) return null;
  const more = rest.length ? `Also on this phone: ${rest.map((e) => `${e.title} (ask "${e.ask || `Tell me about ${e.title.toLowerCase()}`}")`).join("; ")}.` : null;
  return { blocks, more, used: full.map((e) => e.id) };
}

/**
 * The entry that answers a how-to question, already formatted, or null to leave the question to the
 * normal ranking. Returns a knowledge record like namedEntryKnowledge plus `understanding`.
 */
export function intentAnswer(question) {
  const u = understand(question);
  if (!(u.howto || u.exactOnly) || !u.entity) return null;
  const list = candidates(u);
  if (!list.length) return null;
  const top = list[0];
  // Tracks, ID and hunting notes answer only for the animal they are about: no pheasant ID from the grouse card.
  if (u.exactOnly && top.s < 9) return null;
  // Wild game in general is too broad for a field-care step list; it is fine for the cooking table.
  if (top.s < 6 && top.action !== "cook") return null;
  const entry = entryFor(top.p.id);
  if (!entry) return null;
  const lines = [];
  const says = { pluck: /\bpluck/i, skin: /\bskin/i };
  if (top.action !== u.action && NO_OWN_NOTE[u.action] && !says[u.action]?.test((entry.steps || []).join(" "))) lines.push(NO_OWN_NOTE[u.action]);
  const asked = ENTITIES[u.entity];
  if (top.s < 10 && !GROUP_WORDS.has(u.entity) && asked) {
    const matched = u.groups.find((g) => top.p.groups.has(g) || top.p.entities.has(g)) || u.group;
    const named = asked.also ? `${asked.label} (${asked.also})` : asked.label;
    lines.push(`${named} ${/s$/.test(asked.label) ? "are" : "is"} ${VERB[top.action] || "handled"} like other ${GROUP_NOUN[matched] || "game"}:`);
  }
  let text = formatEntry(entry);
  let used = [entry.id];
  if (GROUP_WORDS.has(u.entity)) {
    const kids = withChildren(entry, top.p, top.action);
    if (kids) {
      const [head, ...tail] = text.split("\n\n");
      const sources = tail.filter((b) => /^Sources:/.test(b));
      const keep = tail.filter((b) => !/^Sources:/.test(b) && !/^\d+\. /.test(b) && !/^(Remove|When to use it)/.test(b));
      text = [head, ...kids.blocks, ...keep, kids.more, ...sources].filter(Boolean).join("\n\n");
      used = [entry.id, ...kids.used];
    }
  }
  if (lines.length) text = `${lines.join(" ")}\n\n${text}`;
  const hit = { kind: entryKind(entry), symbol: entry.id, title: entry.title, source: entrySource(entry), text, score: 100 };
  return {
    ...hit,
    hits: [hit],
    entry: entry.id,
    entryDomain: entry.domain,
    composed: used.length > 1 ? used : null,
    understanding: { action: u.action, entity: u.entity, group: u.group, answeredBy: top.action, match: top.s }
  };
}
