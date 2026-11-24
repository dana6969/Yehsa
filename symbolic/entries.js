// Field entries: the long form of a note. Ask indexes a short passage for each entry (see
// tools/build_entries.mjs). When that passage is the answer, this module swaps in the full entry:
// a definition, what to look for, when to use it, when not to, and where it comes from.
// Pure data and string work. No I/O, no network, not on the getMappedAction hot path.
import { ENTRIES, ENTRY_SOURCES } from "./entries_data.js";
import { LEGACY_LINKS } from "./entries_links.js";
import { CAMERA_NOTE_NAMES } from "./camera_notes.js";

const BY_ID = new Map(ENTRIES.map((entry) => [entry.id, entry]));

export const ENTRY_COUNT = ENTRIES.length;

export function entryFor(symbol) {
  return BY_ID.get(String(symbol || "")) || null;
}

export function allEntries() {
  return ENTRIES;
}

export function entrySources(entry) {
  return (entry?.src || []).map((id) => ({ id, ...ENTRY_SOURCES[id] })).filter((item) => item.name);
}

// Domains whose "use" text is a set of actions, shown as numbered steps first.
const ACTION_DOMAINS = new Set(["firstaid", "shelter", "water", "fire", "hunting", "navigation", "gear", "family", "mental", "home", "everyday", "food", "signaling", "knots"]);

const LABELS = {
  weather: { use: "What it tells you", not: "Do not read it as" },
  foraging: { use: "How it fits", not: "Do not" },
  plants: { use: "How it fits", not: "Do not" },
  trees: { use: "How it fits", not: "Do not" },
  fungi: { use: "How it fits", not: "Do not" },
  animals: { use: "What to do", not: "Keep in mind" },
  sign: { use: "What it tells you", not: "Keep in mind" },
  spiritual: { use: "How it is used", not: "Keep in mind" },
  default: { use: "When to use it", not: "Limits" }
};

function sentencesOf(text) {
  return String(text || "").replace(/\s+/g, " ").trim().split(/(?<=[.!?])\s+(?=[A-Z0-9])/).filter(Boolean);
}

/**
 * The full text of one entry, in Jeff's answer order: one-sentence definition, concrete steps
 * first, what to look for, what not to do, look-alikes, one safety line, then the sources.
 */
export function formatEntry(entry) {
  if (!entry) return "";
  const labels = LABELS[entry.domain] || LABELS.default;
  const blocks = [`${entry.title}: ${String(entry.def || "").trim()}`];
  const useSentences = sentencesOf(entry.use);
  if (ACTION_DOMAINS.has(entry.domain)) {
    if (entry.steps?.length) {
      if (entry.use) blocks.push(`${labels.use}: ${entry.use.trim()}`);
      blocks.push(entry.steps.map((step, index) => `${index + 1}. ${step}`).join("\n"));
    } else if (useSentences.length >= 2) {
      blocks.push(useSentences.slice(0, 5).map((step, index) => `${index + 1}. ${step}`).join("\n"));
    } else if (entry.use) {
      blocks.push(entry.use.trim());
    }
  } else if (entry.use) {
    blocks.push(`${labels.use}: ${entry.use.trim()}`);
    if (entry.steps?.length) blocks.push(entry.steps.map((step, index) => `${index + 1}. ${step}`).join("\n"));
  }
  if (entry.look?.length) blocks.push(`What to look for:\n${entry.look.map((item) => `• ${item}`).join("\n")}`);
  if (entry.not) {
    const text = entry.not.trim();
    blocks.push(/^(Do not|Don't|Never|Not )/i.test(text) ? text : `${labels.not}: ${text}`);
  }
  if (entry.alike?.length) blocks.push(`Look-alikes and how to tell them apart:\n${entry.alike.map((item) => `• ${item}`).join("\n")}`);
  if (entry.region) blocks.push(`In New England: ${entry.region.trim()}`);
  if (entry.call) blocks.push(String(entry.call).trim());
  const names = entrySources(entry).map((item) => item.short || item.name);
  if (names.length) blocks.push(`Sources: ${names.join("; ")}.`);
  return blocks.join("\n\n");
}

/**
 * If the knowledge Ask settled on is one of these entries, return it with its full text.
 * `knowledge` is what recallFromCorpora (or the meaning layer) produced. Anything else is returned as is.
 */
export function expandKnowledge(knowledge) {
  if (!knowledge?.symbol) return knowledge;
  const entry = BY_ID.get(String(knowledge.symbol));
  if (!entry) return knowledge;
  let text = formatEntry(entry);
  // A multi-part answer joined this entry with other notes: keep those parts after the full entry.
  const others = (Array.isArray(knowledge.hits) ? knowledge.hits : []).filter((hit) => hit?.symbol && hit.symbol !== entry.id && hit.text);
  if (others.length) {
    const flat = (value) => String(value || "").replace(/\s+/g, " ").trim();
    const fromOthers = others.map((hit) => flat(hit.text)).join(" ");
    const extra = sentencesOf(knowledge.text).filter((sentence) => sentence.length >= 20 && fromOthers.includes(flat(sentence)) && !flat(text).includes(flat(sentence)));
    if (extra.length) text = `${text}\n\n${extra.join(" ")}`;
  }
  const hits = Array.isArray(knowledge.hits) ? knowledge.hits.map((hit) => (hit?.symbol === entry.id ? { ...hit, text } : hit)) : knowledge.hits;
  return { ...knowledge, text, hits, entry: entry.id, entryDomain: entry.domain };
}

export function relatedOffer(symbol) {
  const entry = BY_ID.get(String(symbol || ""));
  if (!entry?.rel?.length) return null;
  for (const id of entry.rel) {
    const next = BY_ID.get(id);
    if (next) return { label: `Want me to go on to ${next.title.toLowerCase()}?`, ask: askFor(next), entry: next.id };
    const legacy = LEGACY_LINKS[id];
    if (legacy) return { label: `Want me to go on to ${legacy.title}?`, ask: legacy.ask, entry: id };
  }
  return null;
}

// The plain question that should land on an entry. Tests check it really does.
export function askFor(entry) {
  return entry.ask || `Tell me about ${entry.title.toLowerCase()}`;
}

// Which corpus folder, and so which note kind, an entry's passage lives in (tools/build_entries.mjs).
const DOMAIN_KIND = {
  firstaid: "medical", weather: "landscape", terrain: "landscape",
  foraging: "herbology", plants: "herbology", trees: "herbology", fungi: "herbology"
};
export function entryKind(entry) {
  return DOMAIN_KIND[entry?.domain] || "survival";
}
export function entrySource(entry) {
  return `symbolic_books/${entryKind(entry)}/entries_${entry.domain}.json`;
}

// A glossary of names: each entry's title, the words in its title's brackets, and its other names,
// plus the names the camera shows for a note. A name that two notes share is left out.
function normName(text) {
  return String(text || "").toLowerCase().replace(/[\u2018\u2019]/g, "'").replace(/[^a-z0-9' -]+/g, " ")
    .replace(/\s+/g, " ").trim().replace(/^(?:a|an|the|some) /, "");
}
const NAME_INDEX = (() => {
  const seen = new Map();
  const add = (name, symbol) => {
    const key = normName(name);
    if (key.length < 3) return;
    if (!seen.has(key)) seen.set(key, new Set());
    seen.get(key).add(symbol);
  };
  for (const entry of ENTRIES) {
    add(entry.title.replace(/\s*\([^)]*\)/g, ""), entry.id);
    for (const inner of entry.title.match(/\(([^)]*)\)/g) || []) add(inner.slice(1, -1), entry.id);
    for (const name of entry.also || []) add(name, entry.id);
  }
  for (const [symbol, names] of Object.entries(CAMERA_NOTE_NAMES)) for (const name of names) add(name, symbol);
  const index = new Map();
  for (const [key, symbols] of seen) if (symbols.size === 1) index.set(key, [...symbols][0]);
  return index;
})();

const NAME_QUESTION = [
  /^(?:what(?:'s| is| are)|tell me (?:more )?about|describe|identify|how do i (?:identify|recognize|recognise|spot)|is this|is that|is it|are these|are those|info on|information on)\s+(.+)$/,
  /^what do(?:es)?\s+(.+?)\s+look like$/
];

/**
 * When a question only names a thing ("What is deer scat?", "Tell me about chaga", "Is this deer poop?"),
 * return the note with that exact name: { symbol, entry } (entry is null for an older note).
 */
export function namedNote(question) {
  const text = normName(String(question || "").replace(/[?.!]+\s*$/, ""));
  for (const pattern of NAME_QUESTION) {
    const match = text.match(pattern);
    if (!match) continue;
    const subject = normName(match[1]);
    for (const key of [subject, subject.replace(/s$/, ""), `${subject}s`]) {
      const symbol = NAME_INDEX.get(key);
      if (symbol) return { symbol, entry: BY_ID.get(symbol) || null };
    }
  }
  return null;
}

// The knowledge record Ask uses for a named entry, already in its full form.
export function namedEntryKnowledge(entry) {
  const hit = { kind: entryKind(entry), symbol: entry.id, title: entry.title, source: entrySource(entry), text: entry.def, score: 100 };
  return expandKnowledge({ ...hit, hits: [hit] });
}
