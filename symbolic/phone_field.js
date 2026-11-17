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
import { safetyAnswer } from "./safety.js";
import { formatLearned, retrieveLearned } from "./learned_notes.js";
import { formatAnswerSource } from "./answer_source.js";
import { detectEmergency, meaningReply, meaningRoutesScripture } from "./meaning/meaning_layer.js";
import { scriptureByMeaning } from "./meaning/scripture_meaning.js";
import { treatmentGuard } from "./meaning/treatment_guard.js";

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

function fieldResult(partial) {
  const result = {
    answered: false,
    empty: false,
    text: null,
    cue: null,
    emotion: null,
    miss: null,
    corpus: phoneCorpusMeta,
    ...partial
  };
  result.source = formatAnswerSource(result);
  return result;
}

/**
 * One short answer for the phone screen.
 * passages: the field-note index (books_index.json passages).
 * options.session: { consent, fix, waypoints } for "from here" courses. Never assumed.
 * options.corpora: optional { search, lookupMedical, lexical } when a test supplies the full maps.
 * options.meaning: optional context from src/phone/meaning_provider (on-device meaning matcher).
 */
export function askField(input, passages, options = {}) {
  const raw = String(input ?? "");
  if (!raw.trim()) {
    return fieldResult({
      answered: false,
      empty: true,
      text: null,
      cue: null,
      emotion: null,
      miss: null
    });
  }
  if (!Array.isArray(passages)) {
    const error = new Error("Field notes could not be read offline.");
    error.code = "NOTES_UNAVAILABLE";
    throw error;
  }
  const safety = safetyAnswer(raw, (query, limit) => searchPassages(passages, query, limit));
  if (safety?.abstain || safety?.text) {
    return fieldResult({
      answered: Boolean(safety.text),
      text: safety.text || null,
      cue: null,
      emotion: { understood: false, emotion: "neutral" },
      miss: safety.text ? null : "No offline note answered that.",
      kind: safety.kind || null,
      symbol: safety.symbol || null,
      title: safety.title || null,
      hits: safety.source ? [{
        kind: safety.kind,
        symbol: safety.symbol,
        title: safety.title || "",
        source: safety.source,
        text: safety.text
      }] : []
    });
  }
  const calc = calculate(raw);
  if (calc) {
    return fieldResult({
      answered: true,
      text: calc.text,
      cue: null,
      emotion: { understood: false, emotion: "neutral" },
      miss: null,
      kind: "calculator"
    });
  }
  const expanded = expandParaphrase(raw, options.learned?.phrases);
  const question = parseQuestion(expanded);
  const meaning = options.meaning || null;
  const scriptureList = options.spiritualIndex?.passages || options.spiritualIndex;
  if (routesToSpiritual(raw, question)) {
    const passages = scriptureList;
    let spiritual = Array.isArray(passages) ? quoteSpiritual(raw, passages) : null;
    if (meaning?.scripture && Array.isArray(passages)) spiritual = scriptureByMeaning(meaning, raw, spiritual, passages);
    if (!spiritual) {
      return fieldResult({
        answered: false,
        text: null,
        cue: null,
        emotion: { understood: false, emotion: "neutral" },
        miss: "The scripture index is not loaded yet, so there is no quoted passage for that.",
        kind: "spiritual"
      });
    }
    return fieldResult({
      answered: true,
      text: spiritual.text,
      cue: null,
      emotion: { understood: false, emotion: "neutral" },
      miss: null,
      kind: "spiritual",
      symbol: spiritual.symbol || null,
      title: spiritual.title || spiritual.hits?.[0]?.title || null,
      hits: spiritual.hits || []
    });
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
  let meaningInfo = null;
  if (meaning && !nav?.sentence) {
    const reply = meaningReply(meaning, raw, knowledge);
    meaningInfo = reply.meaning;
    if (reply.text !== (knowledge?.text || null)) {
      knowledge = reply.text ? { ...(knowledge || {}), text: reply.text, symbol: reply.symbol, kind: reply.kind, hits: reply.hits } : null;
    }
  } else if (knowledge?.symbol && treatmentGuard(raw, knowledge.symbol)) {
    knowledge = null;
  }
  const emergency = meaning ? detectEmergency(meaning, raw).emergency : false;
  const premise = premiseFromKnowledge(raw, knowledge);
  const note = nav?.sentence || [premise, knowledge?.text].filter(Boolean).join(" ");
  const fromFeeling = !note && emotion.understood && meaningInfo?.action !== "abstain" ? emotion.deduction : null;
  const text = note || fromFeeling;
  const learnedHit = options.learned ? retrieveLearned(expanded, options.learned) : null;
  if (!text && learnedHit) {
    return fieldResult({
      answered: true,
      text: formatLearned(learnedHit),
      cue: null,
      emotion: { understood: emotion.understood, emotion: emotion.emotion },
      miss: null,
      kind: "learned",
      symbol: learnedHit.id,
      title: learnedHit.title || "Learned note",
      learnedId: learnedHit.id,
      hits: [{
        kind: "learned",
        symbol: learnedHit.id,
        title: learnedHit.title || "Learned note",
        source: learnedHit.source || "this phone",
        text: learnedHit.text
      }]
    });
  }
  if (!text && meaning?.scripture && Array.isArray(scriptureList) && meaningRoutesScripture(meaning, raw)) {
    // The field notes had nothing, and the question reads as a question about the texts.
    const routed = scriptureByMeaning(meaning, raw, quoteSpiritual(raw, scriptureList), scriptureList);
    if (routed?.text) {
      return fieldResult({
        answered: true,
        text: routed.text,
        cue: null,
        emotion: { understood: false, emotion: "neutral" },
        miss: null,
        kind: "spiritual",
        symbol: routed.symbol || null,
        title: routed.title || null
      });
    }
  }
  if (!text) {
    return fieldResult({
      answered: false,
      text: null,
      cue: null,
      emotion: { understood: false, emotion: "neutral" },
      miss: "No offline note answered that."
    });
  }
  const kind = knowledge?.kind || (nav?.sentence ? "landscape" : (fromFeeling ? "emotion" : null));
  return fieldResult({
    answered: true,
    text,
    cue: cueFor(emotion, Boolean(note)),
    emotion: { understood: emotion.understood, emotion: emotion.emotion },
    miss: null,
    kind,
    symbol: knowledge?.symbol || (nav?.sentence ? "landscape_nav" : (fromFeeling ? emotion.emotion : null)),
    title: knowledge?.title || null,
    hits: knowledge?.hits || [],
    emergency,
    meaning: meaningInfo
  });
}
