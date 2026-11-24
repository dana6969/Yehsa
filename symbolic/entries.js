// Field entries: the long form of a note. Ask indexes a short passage for each entry (see
// tools/build_entries.mjs). When that passage is the answer, this module swaps in the full entry:
// a definition, what to look for, when to use it, when not to, and where it comes from.
// Pure data and string work. No I/O, no network, not on the getMappedAction hot path.
import { ENTRIES, ENTRY_SOURCES } from "./entries_data.js";
import { LEGACY_LINKS } from "./entries_links.js";

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
  const text = formatEntry(entry);
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
