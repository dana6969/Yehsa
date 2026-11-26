// Each field entry read the same way as a question: which action it answers and which animals it covers.
// Built once from the entry data. No I/O. Not on the getMappedAction hot path.
import { ENTRIES } from "../entries_data.js";
import { entitiesIn, groupOf, lineage, kindOf } from "./taxonomy.js";

// Entry id -> the actions it answers. Ids follow a naming rule, so a pattern covers new notes too.
const ACTION_BY_ID = [
  [/^field_dress_tools$/, ["gear"]],
  [/^gutless_method$/, ["dress", "butcher"]],
  [/^field_dressing_|^fish_cleaning/, ["dress"]],
  [/^skinning_/, ["skin", "preserve"]],
  [/^basic_butcher|^quartering_/, ["butcher"]],
  [/^game_cooking_temps$|^food_safe_cook_temps$/, ["cook"]],
  [/^jerky_|^home_canning|^meat_care_/, ["preserve"]],
  [/_track$|_scat$|^hunt_blood_trail$/, ["track"]],
  [/^hunt_shot_placement$|^deer_sign_reading$/, ["hunt"]]
];
// The finer point a note covers inside its action (see understand.js DETAILS).
const DETAIL_BY_ID = {
  jerky_drying_meat: ["dry"], home_canning_safe: ["can"], meat_care_temperature: ["cool", "hang"], skinning_hanging_deer: ["hang"],
  hunt_blood_trail: ["blood"], hunt_shot_placement: ["shot"], deer_sign_reading: ["scout"]
};
// Entries whose definition lists the animals they cover (the cooking table names birds, fish, bear...).
const ENTITIES_FROM_DEF = new Set(["game_cooking_temps", "meat_care_temperature"]);
// The kitchen table is for farm meat; the game table answers for wild animals.
const ONLY_GROUP = { food_safe_cook_temps: "domestic" };

function detailsOf(entry) {
  if (DETAIL_BY_ID[entry.id]) return DETAIL_BY_ID[entry.id];
  if (/_scat$/.test(entry.id)) return ["scat"];
  if (/_track$/.test(entry.id)) return ["print"];
  return [];
}

function actionsOf(entry) {
  for (const [re, actions] of ACTION_BY_ID) if (re.test(entry.id)) return actions;
  if (entry.domain === "animals") return ["identify"];
  if (entry.domain === "sign") return ["track"];
  return [];
}

function profileOf(entry) {
  const actions = actionsOf(entry);
  if (!actions.length) return null;
  const text = [entry.title, ...(entry.also || []), ENTITIES_FROM_DEF.has(entry.id) || ONLY_GROUP[entry.id] ? entry.def : "", ONLY_GROUP[entry.id] ? (entry.look || []).join(" ; ") : ""].join(" ; ");
  let found = entitiesIn(text).map((x) => x.entity);
  if (actions.includes("identify")) {
    // An ID card is about its head noun: "deer tick" is a tick and "turkey tail" a fungus, not a deer or a turkey.
    found = [entry.title.replace(/\s*\([^)]*\)/g, ""), ...(entry.also || [])].flatMap((phrase) => {
      const list = entitiesIn(phrase);
      const words = phrase.toLowerCase().split(/[^a-z']+/).filter(Boolean);
      const last = words[words.length - 1];
      return list.filter((x) => x.name.split(" ").pop() === last || x.name.split(" ").pop().replace(/s$/, "") === last.replace(/s$/, "")).map((x) => x.entity);
    });
  }
  if (ONLY_GROUP[entry.id]) found = found.filter((e) => groupOf(e) === ONLY_GROUP[entry.id]);
  // Hunting notes on deer sign name the deer in their title or other names; scat and track notes too.
  const entities = new Set(found);
  const groups = new Set([...entities].map(groupOf).filter(Boolean));
  const kinds = new Set([...groups].map(kindOf).filter(Boolean));
  const phrases = (entry.also || []).map((x) => String(x).toLowerCase().replace(/[^a-z0-9' ]+/g, " ").replace(/\s+/g, " ").trim()).filter((x) => x.split(" ").length >= 2);
  return { id: entry.id, title: entry.title, domain: entry.domain, actions, phrases, details: new Set(detailsOf(entry)), entities, groups, kinds, steps: entry.steps?.length || 0 };
}

// R11: built on first use (the first how-to question or answer picture), not while the app starts.
let PROFILES = null;
function profiles() {
  if (!PROFILES) {
    PROFILES = new Map();
    for (const entry of ENTRIES) {
      const p = profileOf(entry);
      if (p) PROFILES.set(entry.id, p);
    }
  }
  return PROFILES;
}

export function entryProfile(id) {
  return profiles().get(String(id || "")) || null;
}

export function allProfiles() {
  return profiles().values();
}

/** True when two profiles answer the same action for the same animals or a group above or below them. */
export function sameTopic(a, b) {
  if (!a || !b) return false;
  if (!a.actions.some((x) => b.actions.includes(x))) return false;
  const up = (groups) => new Set([...groups].flatMap(lineage));
  const aUp = up(a.groups);
  const bUp = up(b.groups);
  for (const g of a.groups) if (bUp.has(g)) return true;
  for (const g of b.groups) if (aUp.has(g)) return true;
  return false;
}
