// Phone ask path. Same question parse, field-note ranking, and reasonAnswer as the CLI.
// Dictionary dumps and medical name lists stay on `npm run ask` (they need Node fs).
// Emotion is read from the same cues and does not replace a note. No profile file is written.

import { reasonAnswer, shouldConnect } from "./answer_reasoner.js";
import { queryTokens, searchPassages, sourceKind } from "./book_search.js";
import { readEmotion } from "./emotion_read.js";
import { navigationSentence } from "./nav_sentence.js";
import { parseQuestion } from "./question_parse.js";
import {
  haversineKm,
  initialBearingDeg
} from "./landscape_math.js";

function clip(text, limit) {
  const flat = String(text || "").replace(/\s+/g, " ").trim();
  if (flat.length <= limit) return flat;
  return `${flat.slice(0, limit - 1).trimEnd()}…`;
}

function addHit(bag, hit) {
  if (!hit || !hit.symbol || !hit.text || !(hit.score > 0)) return;
  const key = `${hit.kind}:${String(hit.symbol).toLowerCase()}`;
  const prev = bag.get(key);
  if (!prev || hit.score > prev.score) bag.set(key, hit);
}

function collectField(parsed, passages) {
  const phrase = parsed.topic || parsed.text;
  const tokens = queryTokens(phrase);
  const bag = new Map();
  const boost = (kind, score) => (parsed.domain && kind === parsed.domain ? score + 16 : score);

  for (const passage of searchPassages(passages, phrase, 8)) {
    const kind = sourceKind(passage.source);
    addHit(bag, {
      kind,
      symbol: passage.symbol,
      text: clip(passage.context, 320),
      title: passage.title || "",
      source: passage.source || "",
      score: boost(kind, passage.score)
    });
  }

  if (parsed.intent === "use" && (parsed.domain === "survival" || parsed.domain === "herbology")) {
    const caution = searchPassages(passages, "unknown plant", 1)[0];
    if (caution) {
      const kind = sourceKind(caution.source);
      addHit(bag, {
        kind,
        symbol: caution.symbol,
        text: clip(caution.context, 320),
        title: caution.title || "",
        source: caution.source || "",
        score: boost(kind, 50)
      });
    }
  }

  if (shouldConnect(parsed)) {
    const concerns = new Set(parsed.concerns || []);
    const extras = [];
    if (concerns.has("plant") || concerns.has("skin") || concerns.has("insect") || parsed.intent === "care") {
      extras.push("plantain", "unknown plant");
    }
    if (concerns.has("skin") || concerns.has("insect") || parsed.intent === "care") {
      extras.push("clean water", "mosquito");
    }
    for (const extra of extras) {
      for (const passage of searchPassages(passages, extra, 4)) {
        const kind = sourceKind(passage.source);
        addHit(bag, {
          kind,
          symbol: passage.symbol,
          text: clip(passage.context, 480),
          title: passage.title || "",
          source: passage.source || "",
          score: passage.score
        });
      }
    }
  }

  return [...bag.values()]
    .filter((hit) => hit.score >= 20)
    .sort((a, b) => b.score - a.score || a.symbol.localeCompare(b.symbol));
}

function pointOf(raw) {
  if (!raw || typeof raw !== "object") return null;
  const latitude = Number(raw.latitude);
  const longitude = Number(raw.longitude);
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) return null;
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) return null;
  const point = { latitude, longitude };
  if (raw.altitude != null && Number.isFinite(Number(raw.altitude))) point.altitude = Number(raw.altitude);
  return point;
}

function sessionIo(session = {}) {
  const consent = session.consent === true;
  const fix = consent ? pointOf(session.fix) : null;
  const waypoints = Array.isArray(session.waypoints) ? session.waypoints : [];
  return {
    readLockedPosition(options = {}) {
      if (options.ingress && options.ingress !== "local") {
        return { ok: false, fix: null, reason: "exterior denied" };
      }
      if (options.consent !== true) {
        return { ok: false, fix: null, reason: "position is opt-in; local consent is required" };
      }
      if (!fix) return { ok: true, fix: null, altitude: null, reason: "no consented position lock" };
      return { ok: true, fix, altitude: fix.altitude ?? null, reason: null };
    },
    tripToWaypoint(name, options = {}) {
      if (options.ingress && options.ingress !== "local") return { ok: false, reason: "exterior denied" };
      if (options.consent !== true) return { ok: false, reason: "position is opt-in; local consent is required" };
      const id = String(name || "").trim().toLowerCase();
      const waypoint = waypoints
        .map((entry) => ({ ...pointOf(entry), name: String(entry?.name || "").toLowerCase() }))
        .find((entry) => entry.name === id && entry.latitude != null);
      if (!waypoint) return { ok: false, reason: "waypoint not found", waypoint: null };
      const from = pointOf(options.from) || fix;
      if (!from) return { ok: false, reason: "no consented position lock", waypoint: null };
      return {
        ok: true,
        distanceKm: haversineKm(from, waypoint),
        bearingDeg: initialBearingDeg(from, waypoint),
        waypoint: { name: waypoint.name }
      };
    },
    elevationFromLock(options = {}) {
      if (options.ingress && options.ingress !== "local") {
        return { ok: false, altitude: null, reason: "exterior denied" };
      }
      if (options.consent !== true) {
        return { ok: false, altitude: null, reason: "position is opt-in; local consent is required" };
      }
      if (!fix) return { ok: true, altitude: null, reason: "no consented position lock" };
      if (fix.altitude == null) return { ok: true, altitude: null, reason: "consented fix has no altitude" };
      return { ok: true, altitude: fix.altitude, reason: null };
    }
  };
}

function cueFor(emotion, hasNote) {
  if (!emotion?.understood || !hasNote) return null;
  return `Wording cue: ${emotion.emotion}. The note above still stands.`;
}

/**
 * One short answer for the phone screen.
 * passages: the field-note index (books_index.json passages).
 * options.session: { consent, fix, waypoints } for "from here" courses. Never assumed.
 */
export function askField(input, passages, options = {}) {
  const raw = String(input ?? "");
  if (!raw.trim()) {
    return {
      answered: false,
      empty: true,
      text: null,
      cue: null,
      emotion: null,
      miss: null
    };
  }
  if (!Array.isArray(passages)) {
    const error = new Error("Field notes could not be read offline.");
    error.code = "NOTES_UNAVAILABLE";
    throw error;
  }
  const question = parseQuestion(raw);
  const emotion = readEmotion(question.raw);
  let knowledge = null;
  if (question.topic) {
    const ranked = collectField(question, passages);
    const deduction = reasonAnswer(question, ranked);
    if (deduction.text) {
      knowledge = { text: deduction.text };
    }
  }
  const nav = navigationSentence(question.raw, {
    consent: options.session?.consent === true,
    ingress: "local"
  }, sessionIo(options.session));
  const note = [knowledge?.text, nav?.sentence].filter(Boolean).join(" ");
  const fromFeeling = !note && emotion.understood ? emotion.deduction : null;
  const text = note || fromFeeling;
  if (!text) {
    return {
      answered: false,
      empty: false,
      text: null,
      cue: null,
      emotion: { understood: false, emotion: "neutral" },
      miss: "No offline note answered that."
    };
  }
  return {
    answered: true,
    empty: false,
    text,
    cue: cueFor(emotion, Boolean(note)),
    emotion: { understood: emotion.understood, emotion: emotion.emotion },
    miss: null
  };
}
