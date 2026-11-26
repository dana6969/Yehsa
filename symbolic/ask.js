import { pathToFileURL } from "url";
import path from "path";
import { parseQuestion } from "./question_parse.js";
import { recallKnowledge } from "./knowledge_index.js";
import { mapEmotion } from "./emotion_mapper.js";
import { adaptToUser, rememberUserTurn } from "./user_learning.js";
import { navigationSentence } from "./landscape_nav.js";
import { expandParaphrase } from "./paraphrase.js";
import { calculate } from "./calculator.js";
import { scripturePassages, spiritualAnswer } from "./spiritual_answer.js";
import { routesToSpiritual } from "./spiritual_route.js";
import { premiseFlag } from "./premise.js";
import { safetyAnswer } from "./safety.js";
import { compoundParts, dictionaryLookup, isEmergency, reassurance, shouldAbstain } from "./answer_gate.js";
import { searchBooks } from "./book_index.js";
import { proposeAgents } from "./agents/host.js";
import { formatAnswerSource } from "./answer_source.js";
import { detectEmergency, meaningReply, meaningRoutesScripture } from "./meaning/meaning_layer.js";
import { scriptureByMeaning } from "./meaning/scripture_meaning.js";
import { treatmentGuard } from "./meaning/treatment_guard.js";
import { fieldGuideAnswer } from "./field_guide.js";
import { stripFiller } from "./answer_polish.js";
import { expandKnowledge, namedEntryKnowledge, namedNote } from "./entries.js";
import { intentAnswer } from "./understanding/pick.js";

function premiseFromKnowledge(question, knowledge) {
  const texts = [knowledge?.text, ...(knowledge?.hits || []).map((hit) => hit?.text)];
  for (const text of texts) {
    const flagged = premiseFlag(question, text);
    if (flagged) return flagged;
  }
  return null;
}

function finish(question, emotion, knowledge, extra, options) {
  const turn = rememberUserTurn({
    utterance: question.original || question.raw,
    emotion,
    question: knowledge?.question || question,
    options
  });
  let text = stripFiller(extra.text || null) || null;
  if (text && extra.adapt !== false) {
    text = adaptToUser(text, turn.profile, knowledge?.question || question, emotion);
  }
  const proposals = options.agents === false ? [] : proposeAgents({
    question: question.original || question.raw,
    answer: { answered: Boolean(text), text, confidence: extra.confidence || "ok" },
    files: options.corpusFiles
  }, options.agentSettings);
  const result = {
    question: knowledge?.question || question,
    emotion,
    answered: Boolean(text),
    text,
    hits: extra.hits || knowledge?.hits || [],
    kind: extra.kind || knowledge?.kind || null,
    symbol: extra.symbol || knowledge?.symbol || null,
    title: extra.title || knowledge?.title || null,
    emergency: Boolean(extra.emergency),
    meaning: extra.meaning || null,
    learning: { learned: turn.learned, turns: turn.profile?.turns || 0 },
    proposals
  };
  result.source = formatAnswerSource({ ...result, source: extra.source || knowledge?.source || null });
  return result;
}

// options.meaning: a context from meaning/meaning_node.js prepareMeaning(). Without it Ask is
// the lexical path. askWithMeaning() builds the context and then calls this synchronously.
export function ask(input, options = {}) {
  const original = String(input || "");
  const meaning = options.meaning || null;
  const expanded = expandParaphrase(original);
  const question = parseQuestion(expanded);
  question.original = original;
  if (!question.topic && !calculate(original) && !routesToSpiritual(original, question)) {
    return { question, answered: false, text: null };
  }
  const emotion = mapEmotion(original);
  if (shouldAbstain(original)) {
    return finish(question, emotion, null, { text: null, confidence: "low" }, options);
  }
  const parts = options._part ? null : compoundParts(original);
  if (parts) {
    const math = calculate(parts.math);
    const rest = ask(parts.other, { ...options, agents: false, _part: true });
    const text = [math?.text, rest?.text].filter(Boolean).join(" ");
    return finish(question, emotion, null, {
      text: text || null,
      kind: "compound",
      symbol: "compound",
      hits: rest?.hits || [],
      adapt: false
    }, options);
  }
  const calc = calculate(original);
  if (calc) {
    return finish(question, emotion, null, { text: calc.text, kind: "calculator", symbol: "calculate", hits: [] }, options);
  }
  if (routesToSpiritual(original, question)) {
    let spiritual = spiritualAnswer(original);
    if (meaning?.scripture) spiritual = scriptureByMeaning(meaning, original, spiritual, scripturePassages());
    if (!spiritual) return finish(question, emotion, null, { text: null, confidence: "low" }, options);
    return finish(question, emotion, null, spiritual, options);
  }
  const safety = safetyAnswer(original, searchBooks);
  if (safety?.abstain) return finish(question, emotion, null, { text: null, confidence: "low" }, options);
  if (safety?.text) {
    return finish(question, emotion, null, {
      text: safety.text,
      kind: safety.kind,
      symbol: safety.symbol,
      title: safety.title || null,
      source: safety.source || null,
      hits: safety.source ? [{
        kind: safety.kind,
        symbol: safety.symbol,
        title: safety.title || "",
        source: safety.source,
        text: safety.text
      }] : []
    }, options);
  }
  // R9: a how-to on an animal (gut, pluck, skin, butcher, cook, keep) gets the note for that action on
  // that animal or its group, ahead of a name match: "how to gut a partridge" is not the grouse ID card.
  const howTo = intentAnswer(original);
  if (howTo) return finish(question, emotion, null, howTo, options);
  // A question that only names a thing gets the note with that exact name (the camera's labels too).
  const named = namedNote(original);
  if (named?.entry) return finish(question, emotion, null, namedEntryKnowledge(named.entry), options);
  const guide = fieldGuideAnswer(original);
  if (guide) return finish(question, emotion, null, guide, options);
  const defined = dictionaryLookup(original);
  if (defined) {
    return finish(question, emotion, null, defined, options);
  }
  let knowledge = recallKnowledge(expanded);
  if (named && knowledge?.symbol !== named.symbol) {
    const hit = (knowledge?.hits || []).find((item) => item.symbol === named.symbol);
    if (hit) knowledge = { ...knowledge, kind: hit.kind, symbol: hit.symbol, title: hit.title, source: hit.source, text: hit.text, hits: [hit, ...knowledge.hits.filter((item) => item !== hit)] };
  }
  const nav = navigationSentence(original, options);
  let meaningInfo = null;
  if (meaning && !nav?.sentence && !(named && knowledge?.symbol === named.symbol)) {
    const reply = meaningReply(meaning, original, knowledge);
    meaningInfo = reply.meaning;
    if (reply.text !== (knowledge?.text || null)) {
      knowledge = reply.text ? { ...(knowledge || {}), text: reply.text, symbol: reply.symbol, kind: reply.kind, hits: reply.hits } : null;
    }
  } else if (knowledge?.symbol && treatmentGuard(original, knowledge.symbol)) {
    // Hard rule without the model too: a care note is not attached to an unrelated injury.
    knowledge = null;
  }
  if (knowledge?.symbol) knowledge = expandKnowledge(knowledge);
  const emergency = isEmergency(original) || (meaning ? detectEmergency(meaning, original).emergency : false);
  const premise = premiseFromKnowledge(original, knowledge);
  const note = nav?.sentence || [premise, knowledge?.text].filter(Boolean).join(" ");
  let base = note || (emotion.understood && meaningInfo?.action !== "abstain" ? emotion.deduction : null);
  if (note && base && emergency && emotion.understood) base = `${note} ${reassurance()}`;
  if (!base && meaning?.scripture && meaningRoutesScripture(meaning, original)) {
    // The field notes had nothing, and the question reads as a question about the texts.
    const spiritual = scriptureByMeaning(meaning, original, spiritualAnswer(original), scripturePassages());
    if (spiritual?.text) return finish(question, emotion, null, { ...spiritual, adapt: false }, options);
  }
  if (!base) return finish(question, emotion, knowledge, { text: null, confidence: "low", emergency, meaning: meaningInfo }, options);
  return finish(question, emotion, knowledge, {
    text: base,
    hits: knowledge?.hits,
    kind: knowledge?.kind || (nav?.sentence ? "landscape" : "emotion"),
    symbol: knowledge?.symbol || (nav?.sentence ? "landscape_nav" : emotion.emotion),
    emergency,
    meaning: meaningInfo
  }, options);
}

/**
 * Ask with the offline meaning matcher. Loads the embedding model lazily on first use, embeds
 * the question (and its parts and the lexical candidate reply), then runs the same synchronous
 * Ask. Falls back to the lexical path when the model or runtime is missing.
 */
export async function askWithMeaning(input, options = {}) {
  const original = String(input || "");
  const { prepareMeaning } = await import("./meaning/meaning_node.js");
  const replies = [];
  const expanded = expandParaphrase(original);
  const parsed = parseQuestion(expanded);
  const spiritual = routesToSpiritual(original, parsed);
  if (!spiritual && parsed.topic) {
    const lexical = recallKnowledge(expanded);
    if (lexical?.text) replies.push(lexical.text);
  }
  let meaning = await prepareMeaning(original, { replies });
  if (meaning && (spiritual || meaningRoutesScripture(meaning, original))) {
    const lexical = spiritualAnswer(original);
    const quoted = lexical?.hits?.[0]?.text ? [lexical.hits[0].text] : [];
    meaning = await prepareMeaning(original, { replies: quoted, scripturePassages: scripturePassages() });
  }
  return ask(original, { ...options, meaning });
}

const entry = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (import.meta.url === entry) {
  const question = process.argv.slice(2).join(" ").trim();
  if (!question) {
    console.error("Usage: node symbolic/ask.js \"<full question>\"");
    process.exitCode = 1;
  } else {
    const result = ask(question, { agents: false });
    if (!result.answered || !result.text) {
      console.error("No offline note answered that.");
      process.exitCode = 1;
    } else {
      console.log(result.text);
    }
  }
}
