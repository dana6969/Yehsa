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
    "I can draw a blank landscape canvas, measure two points, and keep waypoints and a track after you consent to hold a place.",
    "If you ask me to save a waypoint, measure, hold or unlock a place, scan for peers, speak an answer, or save a note, I show an approval card. Nothing in that list runs until you tap Approve.",
    "Holding a place and sharing a place each need their own consent. Sharing still does not transmit from this screen.",
    "I cannot reach the internet on my own. A language model stays off until you connect one and approve the exact question. Connecting one does not retrain me.",
    "I have no live city or street map, and I cannot open or control other apps.",
    dictionary,
    "Counts and the longer limits are on the Details screen."
  ].join(" ");
}

export function sourceChips(result) {
  const chips = [];
  if (result?.kind) chips.push(String(result.kind));
  if (result?.symbol) chips.push(String(result.symbol));
  for (const hit of result?.hits || []) {
    if (hit?.symbol) chips.push(String(hit.symbol));
  }
  return [...new Set(chips.filter(Boolean))].slice(0, 4);
}
