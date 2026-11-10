// Phone ask path. Same question parse, ranking, and reasonAnswer as `npm run ask`.
// The Expo bundle carries that dictionary merge and the full medical name lists.
// The original corpora stay on disk. Emotion is a cue beside the note. No profile file is written.

import { readEmotion } from "./emotion_read.js";
import { haversineKm, initialBearingDeg } from "./landscape_math.js";
import { navigationSentence } from "./nav_sentence.js";
import { phoneCorpus, phoneCorpusMeta } from "./phone_corpus.js";
import { recallFromCorpora } from "./knowledge_rank.js";
import { parseQuestion } from "./question_parse.js";
import { expandParaphrase } from "./paraphrase.js";
import { calculate } from "./calculator.js";
import { premiseFlag } from "./premise.js";
import { routesToSpiritual } from "./spiritual_route.js";
import { quoteSpiritual } from "./spiritual_quote.js";
import { searchPassages } from "./book_search.js";

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

function premiseFromKnowledge(question, knowledge) {
  const texts = [knowledge?.text, ...(knowledge?.hits || []).map((hit) => hit?.text)];
  for (const text of texts) {
    const flagged = premiseFlag(question, text);
    if (flagged) return flagged;
  }
  return null;
}

function corporaFor(passages, override) {
  if (override) return override;
  return {
    search: (query, limit) => searchPassages(passages, query, limit),
    lookupMedical: phoneCorpus.lookupMedical,
    lexical: phoneCorpus.lexical
  };
}

/**
 * One short answer for the phone screen.
 * passages: the field-note index (books_index.json passages).
 * options.session: { consent, fix, waypoints } for "from here" courses. Never assumed.
 * options.corpora: optional { search, lookupMedical, lexical } when a test supplies the full maps.
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
      miss: null,
      corpus: phoneCorpusMeta
    };
  }
  if (!Array.isArray(passages)) {
    const error = new Error("Field notes could not be read offline.");
    error.code = "NOTES_UNAVAILABLE";
    throw error;
  }
  const calc = calculate(raw);
  if (calc) {
    return {
      answered: true,
      empty: false,
      text: calc.text,
      cue: null,
      emotion: { understood: false, emotion: "neutral" },
      miss: null,
      corpus: phoneCorpusMeta,
      kind: "calculator"
    };
  }
  const expanded = expandParaphrase(raw);
  const question = parseQuestion(expanded);
  if (routesToSpiritual(raw, question)) {
    const passages = options.spiritualIndex?.passages || options.spiritualIndex;
    const spiritual = Array.isArray(passages) ? quoteSpiritual(raw, passages) : null;
    if (!spiritual) {
      return {
        answered: false,
        empty: false,
        text: null,
        cue: null,
        emotion: { understood: false, emotion: "neutral" },
        miss: "The scripture index is not loaded yet, so there is no quoted passage for that.",
        corpus: phoneCorpusMeta,
        kind: "spiritual"
      };
    }
    return {
      answered: true,
      empty: false,
      text: spiritual.text,
      cue: null,
      emotion: { understood: false, emotion: "neutral" },
      miss: null,
      corpus: phoneCorpusMeta,
      kind: "spiritual"
    };
  }
  const emotion = readEmotion(question.raw);
  let knowledge = null;
  if (question.topic) {
    knowledge = recallFromCorpora(expanded, corporaFor(passages, options.corpora));
  }
  const nav = navigationSentence(raw, {
    consent: options.session?.consent === true,
    ingress: "local"
  }, sessionIo(options.session));
  const premise = premiseFromKnowledge(raw, knowledge);
  const note = [premise, knowledge?.text, nav?.sentence].filter(Boolean).join(" ");
  const fromFeeling = !note && emotion.understood ? emotion.deduction : null;
  const text = note || fromFeeling;
  if (!text) {
    return {
      answered: false,
      empty: false,
      text: null,
      cue: null,
      emotion: { understood: false, emotion: "neutral" },
      miss: "No offline note answered that.",
      corpus: phoneCorpusMeta
    };
  }
  return {
    answered: true,
    empty: false,
    text,
    cue: cueFor(emotion, Boolean(note)),
    emotion: { understood: emotion.understood, emotion: emotion.emotion },
    miss: null,
    corpus: phoneCorpusMeta,
    kind: knowledge?.kind || null
  };
}
