// Question understanding: what the person wants to DO (the action) and WHAT it is about (the thing
// and its group). Rule based, a few regexes and one word scan. No I/O. Not on the getMappedAction
// hot path: Ask calls it once per question.
import { entitiesIn, groupOf, lineage, kindOf } from "./taxonomy.js";

// Actions that are a how-to on an animal or its meat. An ID card never answers one of these.
export const HOWTO_ACTIONS = new Set(["dress", "skin", "pluck", "butcher", "cook", "preserve", "gear"]);
// Actions the picker also answers, but only from a note on that very animal (no group stand-in).
export const EXACT_ACTIONS = new Set(["track", "identify", "hunt"]);

// The finer point inside an action, so "venison jerky" is not the hanging note.
const DETAILS = {
  preserve: [["dry", /\b(jerky|dry(?:ing)?|dehydrat\w*)\b/], ["can", /\b(can|canning|canned|pressure canner|jars?)\b/], ["cool", /\b(spoil\w*|cool(?:ing)?|cold|warm weather|fresh|bad|smell\w*)\b/], ["hang", /\b(hang(?:ing)?|age|aging)\b/]],
  track: [["blood", /\b(wounded|blood|hit|injured|shot)\b/], ["scat", /\b(scat|droppings|poop|pellets|dung|poo)\b/], ["print", /\b(tracks?|prints?|footprints?|paw|hoof)\b/]],
  hunt: [["shot", /\b(shoot|shot|aim|vital)\b/], ["scout", /\b(find|scout\w*|locate|where (?:are|do))\b/]]
};

// Verb phrases -> action. The first rule that matches wins, so the more specific ones come first.
const ACTION_RULES = [
  ["gear", /\b(what (?:do i|should i|will i) need to|what (?:knife|gear|tools?) (?:do i|should i)|tools? (?:for|to)|kit for)\b/],
  ["pluck", /\b(pluck(?:ing|ed)?|de-?feather(?:ing)?|feathers? off|scald(?:ing)? (?:a |the )?(?:bird|duck|goose|turkey|pheasant))\b/],
  ["skin", /\b(skin(?:ning|ned)?|hide off|peel(?:ing)? the hide|caping|cape out)\b/],
  ["butcher", /\b(butcher(?:ing|ed)?|quarter(?:ing|ed)?|bone (?:it )?out|boning out|de-?bon(?:e|ing)|process(?:ing)? (?:the |my |a |an )?(?:meat|deer|elk|moose|animal|carcass)|cut(?:ting)? up|breaking down|cuts of)\b/],
  ["preserve", /\b(jerky|smok(?:e|ing) (?:the )?meat|cur(?:e|ing) (?:the )?meat|can(?:ning)? (?:venison|meat|fish)|freez(?:e|ing) (?:the )?(?:meat|game|venison)|hang(?:ing)? (?:a |the |my )?(?:deer|meat|carcass|bird)|keep(?:ing)? (?:the |my )?(?:\w+ )?(?:meat|game|deer|venison|fish|birds?) (?:cool|cold|fresh)|age (?:the )?(?:meat|venison)|spoil(?:ed|ing)?)\b/],
  ["cook", /\b(cook(?:ing|ed)?|internal temp(?:erature)?|temperature (?:for|of|to)|what temp|roast(?:ing)?|grill(?:ing)?|fry(?:ing)?|braise|safe to eat|done(?:ness)?)\b/],
  ["dress", /\b(gut(?:s|ting|ted)?|field[- ]?dress(?:ing|ed)?|dress(?:ing)? (?:it |them )?out|dress(?:ing)? (?:a |an |the |my |your )|eviscerat(?:e|ing|ion)|draw(?:ing)? (?:a |the )?(?:bird|fowl)|clean(?:ing|ed)?|fillet(?:ing)?|entrails|innards)\b/],
  ["track", /\b(track(?:s|ing)?|prints?|footprints?|scat|droppings|poop|sign of|blood trail)\b/],
  ["identify", /\b(look(?:s)? like|identify|identif(?:y|ication)|recogni[sz]e|tell (?:it |them )?apart|what kind of|is (?:this|that|it) an?)\b/],
  ["hunt", /\b(hunt(?:ing)?|shoot(?:ing)?|shot placement|call(?:ing)? in|scout(?:ing)?|where to find)\b/]
];

const DRESS_NEEDS_THING = /\b(clean(?:ing|ed)?|dress(?:ing)? (?:a |an |the |my |your ))/;

function plain(text) {
  return String(text || "").toLowerCase().replace(/[\u2018\u2019]/g, "'").replace(/\s+/g, " ").trim();
}

/** The action a text asks for, or null. `hasThing` says whether an animal or fish is named. */
// "Keep bears away from my cooking area" is about keeping animals off, not about cooking or cleaning them.
const KEEP_OFF = /\b(away from|keep(?:ing)? (?:\w+ )?(?:away|out|off)|deter|scare (?:\w+ )?(?:off|away)|repel|attract(?:s|ed|ing)?|cooking (?:area|site|spot|place)|camp kitchen)\b/;

export function actionOf(text, hasThing = true) {
  const t = plain(text);
  if (KEEP_OFF.test(t)) return null;
  for (const [action, re] of ACTION_RULES) {
    const m = t.match(re);
    if (!m) continue;
    // "clean a cut", "dress a wound": cleaning is only field care when an animal is named.
    if (action === "dress" && DRESS_NEEDS_THING.test(m[0]) && !hasThing) continue;
    return action;
  }
  return null;
}

/**
 * { action, entity, group, groups, kind, label, name } for one question.
 * entity: the first animal or fish named (partridge, duck, deer, ...). group: its group.
 */
export function understand(question) {
  const t = plain(question);
  const things = entitiesIn(t);
  // The thing the action is about: prefer a species over a group word ("gut a grouse bird").
  const specific = things.find((x) => !["bird", "game", "fish", "upland_bird", "waterfowl", "big_game", "small_game"].includes(x.entity)) || things[0] || null;
  const action = actionOf(t, Boolean(specific));
  const entity = specific?.entity || null;
  const detail = (DETAILS[action] || []).find(([, re]) => re.test(t))?.[0] || null;
  const group = entity ? groupOf(entity) : null;
  return {
    text: ` ${t.replace(/[^a-z0-9' ]+/g, " ").replace(/\s+/g, " ").trim()} `,
    action,
    howto: HOWTO_ACTIONS.has(action),
    exactOnly: EXACT_ACTIONS.has(action),
    detail,
    entity,
    name: specific?.name || null,
    group,
    groups: group ? lineage(group) : [],
    kind: kindOf(group)
  };
}
