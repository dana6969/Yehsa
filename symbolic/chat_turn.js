// Session wording for the phone chat. This does not store a profile and does not claim new powers.

const CAPABILITY = /\b(what can you do|what are your capabilities|your capabilities|what do you do|who are you|what are you)\b/i;

export function isCapabilityQuestion(text) {
  return CAPABILITY.test(String(text || ""));
}

export function continueUtterance(text, prior) {
  const raw = String(text || "").trim();
  const base = String(prior?.utterance || "").replace(/[?!.]+$/g, "").trim();
  if (!raw || !base) return raw;
  const short = raw.replace(/[?!.]+$/g, "").trim();
  const follow = /^(and|also|what about|how about)\b/i.test(short)
    || /^(for|about)\s+\w+$/i.test(short);
  if (!follow) return raw;
  const extra = short.replace(/^(and|also)\s+/i, "");
  return `${base} ${extra}?`;
}

export function capabilitySummary(meta = {}) {
  const headwords = Number(meta.headwords) || 0;
  const notes = "the field notes in this install";
  const dictionary = headwords
    ? `A dictionary pack of ${headwords} headwords is on this phone.`
    : "A dictionary pack is on this phone.";
  return [
    "I answer from what is installed on this phone.",
    `I can read ${notes} about field care, plants, water, shelter, and navigation, and I can quote the scripture index with the title and the passage.`,
    "Those quotes are what the texts say, not a verdict from me.",
    "I can do arithmetic and convert length, mass, volume, temperature, speed, and time.",
    "I can show a simple offline map, measure between two points, and keep waypoints and a track once you turn on location.",
    "If you ask me to save a waypoint, measure, hold or unlock a place, scan for peers, speak an answer, or save a note, I show an approval card. Nothing in that list runs until you tap Approve.",
    "Holding a place and sharing a place each need their own consent. Sharing still does not transmit from this screen.",
    "I don't go online on my own. If you connect an AI model, I ask you before I send it a question. What I learn from you stays on this phone.",
    "I have no live city or street map, and I cannot open or control other apps.",
    dictionary,
    "Counts and the longer limits are on the Details screen."
  ].join(" ");
}

export function sourceChips(result) {
  if (Array.isArray(result?.chips) && result.chips.length) return result.chips.map(String).slice(0, 4);
  const chips = [];
  if (result?.kind) chips.push(String(result.kind));
  if (result?.symbol) chips.push(String(result.symbol));
  for (const hit of result?.hits || []) {
    if (hit?.symbol) chips.push(String(hit.symbol));
  }
  return [...new Set(chips.filter(Boolean))].slice(0, 4);
}

// Only a real answer to the user's own question gets "Was this useful? Yes / Not quite".
// Misses, status lines, approval cards, errors, thank-yous, and capability blurbs never do.
export function isFeedbackEligible(result) {
  if (!result || result.answered !== true || !result.text) return false;
  if (result.kind === "about" || result.kind === "calculator" || result.kind === "weather") return false;
  return true;
}
