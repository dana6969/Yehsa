const FRAME = /^(?:please\s+|can you\s+|could you\s+|tell me\s+|explain\s+)?(what|how|why|when|where|who|can|could|should|is|are|does|do)\b/;

const SCAFFOLD = new Set([
  "what", "how", "why", "when", "where", "who", "can", "could", "should", "would", "might",
  "shall", "will", "is", "are", "does", "do", "be", "been", "being", "used", "use", "using",
  "for", "in", "on", "a", "an", "the", "to", "of", "me", "my", "please", "tell", "explain",
  "you", "your", "setting", "context", "about", "with", "from", "that", "this", "and", "not",
  "treat", "treating", "treatment", "soothe", "relieve", "help", "helps", "good", "make",
  "makes", "take", "takes", "give", "gives", "need", "needs", "want", "wants", "let"
]);

// A place-setting word, dropped only when the question still names something else.
const SETTING = new Set(["field", "fields"]);

const DOMAIN_WORDS = [
  ["survival", "survival"],
  ["herbology", "herbology"],
  ["herbal", "herbology"],
  ["medical", "medical"],
  ["medicine", "medical"],
  ["math", "math"],
  ["mathematics", "math"],
  ["landscape", "landscape"],
  ["geography", "landscape"],
  ["spiritual", "spiritual"],
  ["scripture", "spiritual"]
];

const DOMAIN_CUES = [
  { domain: "survival", test: /\b(survival|field craft|campsite|shelter|foraging)\b/ },
  { domain: "herbology", test: /\b(herbology|herbal|poultice)\b/ },
  { domain: "medical", test: /\b(medical|medicine|wound care)\b/ },
  { domain: "math", test: /\b(math|mathematics|equation|triangle|calculate)\b/ },
  { domain: "landscape", test: /\b(landscape|geography|biome|ecosystem|watershed|declination|orienteering|contour|tundra|coastline|terrain|deserts?|arctic|forests?|mountains?|true north|magnetic north|great-circle|great circle)\b/ },
  { domain: "spiritual", test: /\b(spiritual|scripture|meaning of life|soul|the tao|hermetica|hermes|barddas|druid)\b/ }
];

function clean(text) {
  return String(text || "").toLowerCase().replace(/[?!.]+/g, " ").replace(/\s+/g, " ").trim();
}

function intentOf(text) {
  if (/\b(used for|use for|uses of|good for|be used)\b/.test(text)) return "use";
  if (/\b(treat|treating|treatment|soothe|relieve|dehydration|dehydrated)\b/.test(text)) return "care";
  if (/\bhow\b/.test(text)) return "how";
  if (/\bwhat\b/.test(text)) return "what";
  if (/\bwhy\b/.test(text)) return "why";
  if (/\bwhere\b/.test(text)) return "where";
  return "ask";
}

function concernsOf(text) {
  const concerns = [];
  if (/\b(plant|plants|herb|herbs|herbal|poultice|bark|leaf|leaves|root)\b/.test(text)) concerns.push("plant");
  if (/\b(bite|bites|sting|stings|itch|itchy|rash|wound|skin)\b/.test(text)) concerns.push("skin");
  if (/\b(mosquito|mosquitoes|insect|insects|bug|bugs)\b/.test(text)) concerns.push("insect");
  if (/\b(water|thirst|thirsty|drink|drinking|dehydration|dehydrated)\b/.test(text)) concerns.push("water");
  if (/\b(pain|ache|aches|fever|headache)\b/.test(text)) concerns.push("pain");
  return concerns;
}

function domainOf(text) {
  const setting = text.match(/\bin (?:an?|the) ([a-z]+) (?:setting|context)\b/);
  if (setting) {
    const named = DOMAIN_WORDS.find(([word]) => word === setting[1]);
    if (named) return named[1];
  }
  for (const cue of DOMAIN_CUES) {
    if (cue.test.test(text)) return cue.domain;
  }
  return null;
}

function topicOf(text, domain) {
  let stripped = text.replace(/\b(?:with|using) (?:plants|herbs)\b/g, " ");
  if (/\b(treat|treating|treatment|soothe|relieve)\b/.test(stripped)) {
    stripped = stripped.replace(/\b(plants|herbs)\b/g, " ");
  }
  const concerns = concernsOf(text);
  if (concerns.includes("insect") || concerns.includes("skin")) {
    stripped = stripped.replace(/\b(plants|herbs)\b/g, " ");
  }
  const drop = new Set(SCAFFOLD);
  if (domain) drop.add(domain);
  for (const [word] of DOMAIN_WORDS) drop.add(word);
  const tokens = stripped.split(/[^a-z0-9+]+/).filter((word) => word.length > 2 && !drop.has(word));
  const core = tokens.filter((word) => !SETTING.has(word));
  return (core.length ? core : tokens).join(" ");
}

export function parseQuestion(input) {
  const raw = String(input || "").trim();
  const text = clean(raw);
  const isQuestion = /\?\s*$/.test(raw) || FRAME.test(text);
  const intent = isQuestion ? intentOf(text) : "ask";
  const domain = domainOf(text);
  const topic = topicOf(text, domain) || text;
  const concerns = concernsOf(text);
  return { raw, text, isQuestion, intent, topic, domain, concerns };
}
