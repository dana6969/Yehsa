// R8: the big-picture ideas synthesis mode groups passages under. A theme is one of these ideas
// found in passages from several different sources. Hand-written and rule-based: a fixed list,
// no model. Each concept lists the word stems that count as mentioning it (see bm25.stem).
import { stem } from "./bm25.js";

const RAW = {
  "war and conquest": "war wars warfare conquest conquer conquered battle battles army armies invasion invaders soldiers attack attacked defeat defeated fought siege besieged fleet captured",
  "power and empire": "empire empires emperor king kings power rulers tyranny tyrant domination autocrat dynasty",
  "rise and collapse": "decline decay collapse fall fell ruin downfall disintegration crumbled",
  "cycles and repetition": "cycle cycles rhythm repeat repeated recur again pendulum swing periodic",
  "trade and wealth": "trade commerce merchants wealth money riches gold markets",
  "faith and religion": "religion religions faith god gods worship temple priests church belief",
  "knowledge and learning": "knowledge learning science scientific discovery discoveries books teachers education reason",
  "wisdom and folly": "wisdom wise folly foolish fool understanding prudence",
  "ignorance and error": "ignorance ignorant error errors illusion superstition mistaken misunderstood delusion",
  "pride and greed": "pride proud greed greedy ambition vanity arrogance",
  "law and justice": "law laws justice righteous judges order rights",
  "freedom and slavery": "freedom liberty free slaves slavery serfs bondage",
  "disease and famine": "plague pestilence disease famine hunger starvation epidemic",
  "technology and invention": "technology invention inventions tools machines engines printing steam iron",
  "cooperation and unity": "unity cooperation brotherhood fellowship solidarity union together",
  "division and conflict": "division divided strife conflict quarrel rivalry hatred enmity",
  "change and progress": "progress advance change changes growth development improvement",
  "mind and self": "mind minds thought thoughts self soul consciousness desire",
  "nature and the land": "nature earth land soil climate weather seasons rivers",
  "peace": "peace peaceful harmony",
  "fear and suffering": "fear suffering sorrow misery pain grief",
  "writing and records": "writing written script records history histories chronicle"
};

export const CONCEPTS = Object.entries(RAW).map(([label, words]) => ({ label, stems: new Set(words.split(" ").map(stem)) }));

/** The concepts one sentence mentions (by stem). */
export function conceptsIn(termList) {
  const have = new Set(termList);
  return CONCEPTS.filter((c) => [...c.stems].some((s) => have.has(s)));
}

// What a part of a broad question is after, when its own words are only "patterns" or "misunderstood".
const PART_HINTS = [
  [/\bpatterns?|recurr|repeat|again and again|cycles?\b/i, ["cycle", "rhythm", "repeat", "rise", "decline", "fall", "empire", "war"]],
  [/\bmisunderst|misjudg|wrong about|illusion|themselves\b/i, ["ignorance", "illusion", "error", "pride", "self", "mind", "superstition"]],
  [/\bfail(?:ed)? to apply|lessons?|not (?:learn|appl)|ignored\b/i, ["wisdom", "knowledge", "folly", "lesson", "war", "peace"]],
  [/\bprogress|better technology|advanc|improv\b/i, ["progress", "technology", "invention", "civilization", "war", "cycle"]],
  [/\bconclusions?|deduc|infer|not explicitly\b/i, ["civilization", "knowledge", "power", "religion", "war"]],
  [/\byet to understand|still (?:don't|do not) understand|unknown|mystery|mysteries\b/i, ["mind", "self", "peace", "unity", "cooperation", "knowledge"]]
];

export function partHints(text) {
  const out = [];
  for (const [rule, words] of PART_HINTS) if (rule.test(text)) out.push(...words.map(stem));
  return [...new Set(out)];
}
