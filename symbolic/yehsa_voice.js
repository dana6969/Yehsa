// Yehsa's voice: a warm, calm, grounded way to say what the approved notes already say.
// Pure JavaScript, no model, no I/O, no new facts. It only wraps an answer the notes gave:
// a short opener, one natural follow-up offer, and a small memory of the thread so a
// plain "yes" means "yes, that offer". Safety lines are never removed. The frozen test
// does not load this file, and the answer text under the wrapper is untouched.

import { warmFiller } from "./answer_polish.js";
import { readEmotion } from "./emotion_read.js";
import { shapeAnswer } from "./answer_shape.js";

const OPEN_BOTH = "Happy to help with both.";

export const TRIP_PLAN_TEXT = "Start with Before you go. It checks your battery, your GPS and your offline map, and who knows your plan. Download the map for where you're heading while you still have signal, then pack.";

export function tripResult() {
  return {
    answered: true,
    text: `Happy to help you plan it. ${TRIP_PLAN_TEXT}`,
    kind: "survival",
    symbol: null,
    voiced: true,
    opener: "Happy to help you plan it.",
    sections: [{ title: null, text: TRIP_PLAN_TEXT }],
    offerDomain: "trip"
  };
}

const TRIP = /\b(?:(?:plan(?:ning)?|prepar(?:e|ing)|organi[sz]e|organi[sz]ing|get(?:ting)? ready for|pack(?:ing)?)\b[^.?!]{0,30}\b(?:trip|hike|hunt|hunting|camp(?:ing|out)?|outing|adventure|journey|overnight|expedition|weekend)|(?:trip|hike|hunt|camping|outing)\b[^.?!]{0,20}\b(?:plan|planning|prep)|packing list|pack list|trip plan)\b/i;

const DOMAINS = [
  ["shelter", /\b(shelter|tarp|lean-?to|debris hut|bivouac|bivy|tent)\b/i],
  ["fire", /\b(fire|firewood|tinder|kindling|ignite|campfire)\b/i],
  ["water", /\b(water|purify|boil|thirst|dehydrat\w*|hydrat\w*)\b/i],
  ["medical", /\b(bleed\w*|wound|cut|burn|bite|sprain|splint|fracture|broken bone|cpr|chok\w*|hypotherm\w*|frostbite|injur\w*|first aid|heat stroke|snake)\b/i],
  ["food", /\b(food|forage|foraging|edible|snare|fishing|fish|eat)\b/i],
  ["plants", /\b(plant|plants|mushroom|berry|berries|herb|herbs)\b/i],
  ["navigation", /\b(navigate|navigation|compass|lost|direction|north|bearing|route|trail)\b/i],
  ["weather", /\b(weather|storm|lightning|rain|snow|forecast|barometer|wind)\b/i],
  ["signal", /\b(signal|rescue|flare|whistle|mirror|sos)\b/i]
];

export function domainOf(text) {
  const value = String(text || "");
  if (TRIP.test(value)) return "trip";
  for (const [name, pattern] of DOMAINS) if (pattern.test(value)) return name;
  return null;
}

export function newThread() {
  return { turns: 0, topics: [], lastDomain: null, lastSymbol: null, offer: null, feeling: null, misses: 0 };
}

// What to ask or open when someone says yes to an offer. `ask` runs the normal question
// path. `go` opens a screen. The follow-up lines are checked against the real notes in tests.
const OFFERS = {
  shelter: { label: "Want to go on to making a fire to go with it?", ask: "How do I start a fire?" },
  fire: { label: "Want me to cover staying warm through the night?", ask: "How do I stay warm at night?" },
  water: { label: "Want to hear how to find water out here?", ask: "How do I find water?" },
  medical: { label: "Want me to go over when a cut needs more than a bandage?", ask: "How do I treat a cut?" },
  food: { label: "Want to go over making sure the water is safe too?", ask: "How do I purify water?" },
  plants: { label: "Want to go over how to identify plants safely?", ask: "How do I identify plants safely?" },
  navigation: { label: "Want to go over finding north without a compass?", ask: "How do I find north without a compass?" },
  weather: { label: "Want to talk about getting shelter ready for it?", ask: "How do I build a shelter?" },
  signal: { label: "Want to go over how to stay put and be found?", ask: "How do I signal for rescue?" },
  trip: { label: "Want me to walk you through a packing list for the trip?", go: "kit" }
};

export function offerFor(domain) {
  return OFFERS[domain] || null;
}

const OPENERS = {
  shelter: ["Good thinking, getting out of the weather matters most.", "Okay, shelter first. Here is how I would set it up."],
  fire: ["Let's get you a fire going.", "Fire is a good friend out here. Here is the way in."],
  water: ["Water first, you are right to ask.", "Okay, let's get your water safe."],
  medical: ["Okay, stay steady. Here is what to do.", "I am right here. Take this one step at a time."],
  food: ["Let's look at food, nice and careful.", "Okay, here is what I have on that."],
  plants: ["Let's slow down with this one, plants can fool people.", "Here is what the notes say, and I'd rather you be sure than quick."],
  navigation: ["Let's get your bearings.", "Okay, take a breath. We can work this out."],
  weather: ["Good to watch the sky. Here is what I have.", "Let's read the weather together."],
  signal: ["Okay, let's help them find you.", "Staying visible is half of it. Here is how."],
  spiritual: ["Sit with this one for a moment.", "Here is what the text says."],
  general: ["Here is what I have.", "Okay, here is what the notes say."]
};

const FEELING_OPENERS = {
  fear: "That sounds frightening. You are not alone with it, and we can take it one step at a time.",
  sadness: "I'm sorry. That is a heavy thing to carry. I'm here.",
  anger: "That sounds hard, and it makes sense to be angry. I'm listening.",
  care: "That is a kind thing to want. Let's do it well.",
  interest: "Good question to keep open.",
  joy: "Good to hear that. I'm glad."
};

const SERIOUS = /\b(bleed\w*|not breathing|can't breathe|cannot breathe|chok\w*|unconscious|cpr|heart attack|stroke|poison\w*|snake ?bite|drown\w*|hypotherm\w*|severe|heavy bleeding)\b/i;

function pick(list, turns) {
  return list[turns % list.length];
}

function domainOfResult(result, question) {
  if (!result) return domainOf(question);
  if (result.kind === "spiritual") return "spiritual";
  if (result.kind === "medical") return "medical";
  const symbolic = domainOf(`${result.symbol || ""} ${result.title || ""}`.replace(/_/g, " "));
  const asked = domainOf(question);
  if (asked === "trip") return "trip";
  return asked || symbolic;
}

const GREETING = /^(?:hi|hello|hey|hiya|good (?:morning|afternoon|evening)|yo)\b[\s,!.]*(?:yehsa)?[\s!.?]*$/i;
const THANKS = /^(?:thanks?|thank you|thx|cheers|appreciate it)\b[\s\S]{0,30}$/i;
const YES = /^(?:yes|yeah|yep|yup|sure|ok|okay|please|please do|go ahead|do it|sounds good|that would be great|yes please)[\s!.]*$/i;
const NO = /^(?:no|nope|nah|no thanks|not now|maybe later|i'm good|im good)[\s!.]*$/i;
const HOWARE = /^(?:how are you|how are you doing|how's it going|you there|are you there)[\s!?.]*$/i;

// A turn that is only talk: a hello, a thanks, a yes to the last offer. Returns null for
// anything else so a real question always goes to the notes.
export function socialTurn(text, thread) {
  const raw = String(text || "").trim();
  if (!raw) return null;
  const state = thread || newThread();
  if (YES.test(raw) && state.offer) {
    const offer = state.offer;
    return offer.go
      ? { kind: "go", go: offer.go, text: "Opening it now. Tick things off as you go." }
      : { kind: "ask", ask: offer.ask, text: null };
  }
  if (NO.test(raw) && state.offer) {
    return { kind: "talk", text: "No problem. I'm here when you want to pick it back up." };
  }
  if (GREETING.test(raw)) {
    return { kind: "talk", text: state.turns > 0 ? "Hi again. What do you need?" : "Hi, I'm Yehsa. I'm here with you, no signal needed. Ask me about shelter, water, first aid, plants or finding your way, or tell me what you're planning." };
  }
  if (THANKS.test(raw)) {
    return { kind: "talk", text: state.offer ? `Anytime. ${state.offer.label}` : "Anytime. I'm here if anything else comes up." };
  }
  if (HOWARE.test(raw)) {
    return { kind: "talk", text: "Steady, thanks for asking. Running right here on your phone. What are we working on?" };
  }
  return null;
}

// Split "help with building a shelter and planning a trip" into its two jobs. It only splits
// when each side lands on a different topic, so "salt and pepper" and "heat exhaustion and
// heat stroke" stay one question.
export function splitCompound(text) {
  const raw = String(text || "").trim().replace(/[?.!]+$/, "");
  const pieces = raw.split(/\s+(?:and also|and|also|plus|as well as)\s+/i).map((part) => part.trim()).filter(Boolean);
  if (pieces.length < 2) return null;
  const parts = pieces.map((piece) => ({ text: piece, domain: domainOf(piece) }));
  if (parts.some((part) => part.text.split(/\s+/).length < 2)) return null;
  const known = parts.filter((part) => part.domain);
  const distinct = new Set(known.map((part) => part.domain));
  if (known.length < 2 || distinct.size < 2) return null;
  return parts;
}

// "I need help with building a shelter" -> "building a shelter". Used only for wording.
export function bareTopic(text) {
  return String(text || "")
    .replace(/^(?:i\s+)?(?:need|want|would like|am looking for|'d like)\s+(?:some\s+)?help\s+(?:with|on|in)\s+/i, "")
    .replace(/^(?:help me|can you help me|could you help me)\s+(?:with\s+)?/i, "")
    .trim();
}

function firstLine(text) {
  return String(text || "").trim();
}

// Fold the parts of a compound question into one reply. `answers` is [{ part, result }] where
// result is what the normal question path gave for that part (null for the trip part).
export function mergeCompound(parts, answers, thread = newThread()) {
  const chunks = [];
  const sections = [];
  const used = [];
  const hits = [];
  let symbol = null;
  let kind = null;
  const sources = [];
  const missed = [];
  answers.forEach(({ part, result }, index) => {
    const topic = bareTopic(part.text);
    if (part.domain === "trip") {
      chunks.push(`${index === 0 ? "For the trip: " : "Now, the trip. "}${TRIP_PLAN_TEXT}`.trim());
      sections.push({ title: "The trip", text: TRIP_PLAN_TEXT });
      used.push("trip");
      return;
    }
    if (result?.answered && result.text) {
      const lead = index === 0 ? `Let's start with ${topic}.` : `Now, ${topic}.`;
      const body = warmFiller(firstLine(result.text));
      chunks.push(`${lead}\n\n${body}`);
      sections.push({ title: topic.charAt(0).toUpperCase() + topic.slice(1), text: body });
      used.push(part.domain || "general");
      if (!symbol) { symbol = result.symbol || null; kind = result.kind || null; }
      if (result.source) sources.push(result.source);
      if (Array.isArray(result.hits)) hits.push(...result.hits);
    } else {
      missed.push(topic);
    }
  });
  if (missed.length) {
    const sorry = `I don't have a trusted note on ${missed.join(" or ")}, so I won't guess at it.`;
    chunks.push(sorry);
    sections.push({ title: null, text: sorry });
  }
  const text = `${OPEN_BOTH}\n\n${chunks.join("\n\n")}`;
  const lastDomain = parts.some((part) => part.domain === "trip") ? "trip" : used[used.length - 1];
  return {
    answered: chunks.length > 0 && used.length > 0,
    text,
    kind: kind || "survival",
    symbol,
    source: sources.join("; ") || null,
    hits,
    voiced: true,
    opener: OPEN_BOTH,
    sections,
    compound: used,
    offerDomain: lastDomain
  };
}

function plainTopicWords(question) {
  return String(question || "").toLowerCase().replace(/[^a-z\s]/g, " ").split(/\s+/).filter((word) => word.length > 3);
}

/**
 * Wrap one answer in Yehsa's voice.
 * result: what askField (or mergeCompound) returned. question: what the person asked.
 * thread: the running memory. Returns { text, offer, thread, spoken } and never changes the
 * answer's facts. A miss keeps its honest "I don't have that" and invites a rephrase.
 */
export function voiceReply(result, question, thread = newThread()) {
  const state = { ...newThread(), ...thread };
  const turns = state.turns;
  const feeling = readEmotion(question);
  const next = { ...state, turns: turns + 1 };
  if (feeling.understood) next.feeling = feeling.emotion;

  if (!result || result.answered !== true || !result.text) {
    next.misses = (state.misses || 0) + 1;
    next.offer = null;
    let text;
    if (feeling.understood && FEELING_OPENERS[feeling.emotion]) {
      text = `${FEELING_OPENERS[feeling.emotion]} I don't have a trusted note for exactly that, and I would rather say so than guess. Tell me what is happening around you, or what you need to do next, and I'll look from there.`;
    } else if (state.misses >= 1) {
      text = "Still nothing in my notes on that. Try it in plain words, like \"how do I stay warm tonight\", or tell me what you are trying to do.";
    } else {
      text = "I don't have a trusted note for that, and I would rather say so than guess. Try asking it another way, or tell me what you are trying to do and I'll look from that side.";
    }
    return { text, offer: null, thread: next, spoken: text };
  }

  // Calculator and capability blurbs stay exactly as they are.
  if (result.kind === "calculator" || result.kind === "about") {
    return { text: result.text, offer: null, thread: { ...next, offer: null }, spoken: result.text };
  }

  const domain = result.offerDomain || domainOfResult(result, question);
  const body = result.voiced ? result.text : warmFiller(result.text);
  const serious = result.emergency === true || (SERIOUS.test(question) && (domain === "medical" || result.kind === "medical"));
  let opener = result.opener || "";
  if (!result.voiced) {
    if (serious) opener = pick(OPENERS.medical, turns);
    else if (feeling.understood && FEELING_OPENERS[feeling.emotion] && ["fear", "sadness", "anger"].includes(feeling.emotion)) opener = FEELING_OPENERS[feeling.emotion];
    else if (result.kind === "learned") opener = "From what you have told me before:";
    else if (state.lastDomain && state.lastDomain === domain && domain && turns > 0) opener = "Staying with that, here is more.";
    else opener = pick(OPENERS[domain] || OPENERS.general, turns);
  }
  const offer = result.kind === "spiritual"
    ? { label: "Want another passage on this, or a different theme?", ask: null }
    : offerFor(domain);
  // Never offer the same follow-up twice in a row.
  const repeat = offer && state.offer && state.offer.label === offer.label;
  const chosen = repeat ? null : offer;
  const flat = result.voiced && result.sections ? result.text : [opener, body].filter(Boolean).join(body.length < 140 && opener ? " " : "\n\n");
  const text = chosen ? `${flat}\n\n${chosen.label}` : flat;
  const sections = (result.sections || [{ title: null, text: body }]).map((section) => ({ title: section.title, shape: shapeAnswer(section.text) }));
  const suggestions = [];
  if (chosen?.ask) suggestions.push({ label: chosen.ask, ask: chosen.ask });
  if (chosen?.go === "kit") suggestions.push({ label: "Open the pack list", go: "kit" }, { label: "Open Before you go", go: "before" });
  next.lastDomain = domain;
  next.lastSymbol = result.symbol || null;
  next.topics = [...state.topics, domain].filter(Boolean).slice(-6);
  next.offer = chosen && (chosen.ask || chosen.go) ? chosen : null;
  const spoken = result.voiced && result.sections ? [opener, ...result.sections.map((section) => section.text)].filter(Boolean).join(" ") : [opener, body].filter(Boolean).join(" ");
  return {
    text,
    parts: { opener: opener && !(result.voiced && !result.opener) ? opener : "", sections, offer: chosen?.label || "" },
    suggestions,
    offer: next.offer,
    thread: next,
    spoken
  };
}

export function threadWords(thread) {
  return plainTopicWords((thread?.topics || []).join(" "));
}
