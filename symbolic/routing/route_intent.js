// Ask can drive the Map: "directions to X", "route to X", "how far to X", "take me to X".
// Pure text match, no network, never on the symbol hot path (getMappedAction).

const NOT_A_PLACE = /^(?:make|build|start|do|tie|use|treat|stop|purify|cook|set|find water|clean|dress|field dress|gut|skin|fix|light|tell|say|stay|survive|signal|safety|the (?:recipe|instructions?|manual)|this|that|it|them|me)\b/i;
const PATTERNS = [
  { kind: "route", re: /^(?:please\s+)?(?:can you\s+|could you\s+)?(?:give me\s+|get me\s+|show me\s+|i need\s+|i want\s+)?(?:the\s+)?(?:(driving|walking|hiking)\s+)?(?:directions|a route|the route|route|the way|turn[- ]by[- ]turn)\s+(?:from here\s+)?to\s+(.+)$/i },
  { kind: "route", re: /^(?:please\s+)?(?:can you\s+|could you\s+)?(?:navigate|take me|drive me|walk me|guide me|get me|bring me|lead me)\s+(?:back\s+)?(?:to|over to)\s+(.+)$/i },
  { kind: "route", re: /^(?:start\s+)?(?:navigation|navigating|nav)\s+to\s+(.+)$/i },
  { kind: "route", re: /^how (?:do|can|would|should) (?:i|we) (?:get|drive|walk|hike) (?:from here\s+)?to\s+(.+)$/i },
  { kind: "route", re: /^(?:how to|best way to) get to\s+(.+)$/i },
  { kind: "distance", re: /^how (?:far|long)(?: away)? (?:is it|would it be|will it take)?\s*(?:(?:to drive|to walk|driving|walking)\s+)?(?:from here\s+)?to\s+(.+)$/i },
  { kind: "distance", re: /^how far(?: away)? is\s+(.+?)\s+from here$/i },
  { kind: "distance", re: /^(?:what(?:'s| is) the\s+)?(?:distance|drive|drive time|driving time|walk) (?:from here\s+)?to\s+(.+)$/i }
];

/** Returns { kind: "route"|"distance", destination, profile } or null. */
export function routeIntent(text) {
  const raw = String(text || "").trim().replace(/[?!.]+$/g, "").replace(/\s+/g, " ");
  if (raw.length < 6 || raw.length > 140) return null;
  for (const { kind, re } of PATTERNS) {
    const m = raw.match(re);
    if (!m) continue;
    let destination = (m[m.length - 1] || "").trim();
    const mode = (m.length > 2 ? m[1] : "") || "";
    destination = destination.replace(/^(?:the\s+)?(?:nearest|closest)\s+/i, (x) => x).replace(/\s+(?:please|now|from here)$/i, "").trim();
    let profile = /walk|hik|on foot/i.test(`${mode} ${raw}`) ? "walk" : "drive";
    destination = destination.replace(/\s+(?:on foot|by car|walking|driving)$/i, "").trim();
    if (!destination || destination.length < 2) return null;
    if (NOT_A_PLACE.test(destination)) return null;
    // A how-to question in disguise ("directions to purify water").
    if (/\b(?:water|fire|shelter|knot|wound|bleeding)\b/i.test(destination) && !/\b(?:nearest|closest|lake|pond|river|creek|station|store|hospital)\b/i.test(destination)) return null;
    return { kind, destination, profile };
  }
  return null;
}

export function routeIntentReply(intent) {
  const mode = intent.profile === "walk" ? "walking" : "driving";
  return intent.kind === "distance"
    ? `Opening the Map to find ${intent.destination} and measure the ${mode} route from where you are.`
    : `Opening the Map with ${intent.destination} searched and a ${mode} route ready to start.`;
}
