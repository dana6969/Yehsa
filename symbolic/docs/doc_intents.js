// R7: questions about a whole document or book, answered from the document itself, never from
// a general web search (Dana, Nov 24: "when asked of a summary of it or chapters I get different
// responses"). Spotted in Ask only, never on getMappedAction.
//   "chapters of kubark", "table of contents of FM 21-76", "kubark chapters"      -> chapters
//   "first chapter of kubark", "chapter 3 of the survival manual"                  -> chapter n
//   "summary of kubark", "summarize the canning guide", "give me an overview of X" -> summary
//   "what does kubark say about rapport"                                          -> about
//   "open kubark", "read the Kybalion"                                             -> open
// needsMatch: only act when the name matches something in the library or the last document
// results (so "read the sky" or "summary of how to purify water" stay ordinary questions).

import { chapterNumber } from "../library/library.js";

const LEAD = /^(?:(?:hey|ok(?:ay)?|yehsa)[, ]+)?(?:please\s+)?(?:(?:can|could|would|will) you\s+)?(?:please\s+)?(?:(?:give|show|tell|get|send|bring|list|read)(?: me)?\s+|i (?:want|need|would like)(?: to (?:see|read|get))?\s+|let me (?:see|read)\s+|what(?:'s| is| are)\s+)?/i;
const NUM = "(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth|last|\\d{1,2}(?:st|nd|rd|th)?)";
const NUMWORD = "(\\d{1,2}|[ivxlc]{1,5}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)";
const OF = "(?:of|in|from|for)";
const DOC_WORD = /\b(?:pdf|epub|e-?book|manual|field manual|handbook|guide(?:book)?|regulations?|law ?book|rule ?book|book|booklet|document|publication|report|paper)\b/i;
const PUB_CODE = /\b(?:FM|ATP|ATTP|TM|TC|AR|DA PAM|ADP|GTA|MCRP|MCWP|AFMAN|AFH|AFI)\s?-?\d{1,3}(?:-\d{1,3})*(?:\.\d+)?\b/i;

function cleanTarget(text) {
  return String(text || "")
    .replace(/^(?:the|a|an|that|this|my)\s+/i, "")
    .replace(/\s+(?:please|for me|in the reader|on (?:my|this) phone|again)$/i, "")
    .replace(/[?.!,;:]+$/g, "")
    .replace(/^["'“”]+|["'“”]+$/g, "")
    .trim();
}

function ok(target) {
  const t = cleanTarget(target);
  if (t.length < 2 || t.length > 100) return null;
  if (/^(?:it|that|this|them|one|you|me|yourself)$/i.test(t)) return null;
  return t;
}

/** Returns { kind, target, n?, topic?, needsMatch } or null. */
export function docRequest(text) {
  const raw = String(text || "").replace(/\s+/g, " ").trim();
  if (raw.length < 6 || raw.length > 220) return null;
  const body = raw.replace(/[?!.]+$/, "").replace(LEAD, "").trim();
  let m;
  // chapter n
  if ((m = new RegExp(`^(?:the )?${NUM} chapter ${OF} (.+)$`, "i").exec(body))) {
    const n = chapterNumber(m[1]);
    const target = ok(m[2]);
    if (n && target) return { kind: "chapter", n, target, needsMatch: false };
  }
  if ((m = new RegExp(`^chapter ${NUMWORD} ${OF} (.+)$`, "i").exec(body))) {
    const n = chapterNumber(m[1]);
    const target = ok(m[2]);
    if (n && target) return { kind: "chapter", n, target, needsMatch: false };
  }
  if ((m = new RegExp(`^(.+?)(?:'s)?,? chapter ${NUMWORD}$`, "i").exec(body))) {
    const n = chapterNumber(m[2]);
    const target = ok(m[1]);
    if (n && target && !/\b(?:read|open|show)\b/i.test(target)) return { kind: "chapter", n, target, needsMatch: true };
  }
  // chapter list
  if ((m = new RegExp(`^(?:the )?(?:chapters|chapter list|list of (?:the )?chapters|table of contents|contents|toc|outline|sections|parts) ${OF} (.+)$`, "i").exec(body))) {
    const target = ok(m[1]);
    if (target) return { kind: "chapters", target, needsMatch: /^(?:contents|outline|sections|parts)/i.test(body) && !DOC_WORD.test(target) && !PUB_CODE.test(target) };
  }
  if ((m = /^what chapters (?:are|does|do) (?:there )?(?:in )?(.+?)(?: have| contain| include)?$/i.exec(body))) {
    const target = ok(m[1]);
    if (target) return { kind: "chapters", target, needsMatch: false };
  }
  if ((m = /^(.+?)(?:'s)? (?:chapters|chapter list|table of contents)$/i.exec(body))) {
    const target = ok(m[1]);
    if (target && !/\b(?:how many|what)\b/i.test(target)) return { kind: "chapters", target, needsMatch: false };
  }
  // summary
  if ((m = new RegExp(`^(?:a |an |the )?(?:short |brief |quick |full |detailed )?(?:summary|summarization|overview|synopsis|gist|recap|rundown|breakdown) ${OF} (.+)$`, "i").exec(body))) {
    const target = ok(m[1]);
    if (target) return { kind: "summary", target, needsMatch: !(DOC_WORD.test(target) || PUB_CODE.test(target)) };
  }
  if ((m = /^(?:summarize|summarise|sum up|recap)\s+(.+)$/i.exec(body))) {
    const target = ok(m[1]);
    if (target) return { kind: "summary", target, needsMatch: !(DOC_WORD.test(target) || PUB_CODE.test(target)) };
  }
  if ((m = /^(?:what is|what's)?\s*(.+?) about$/i.exec(raw.replace(/[?!.]+$/, "")))) {
    const target = ok(m[1].replace(/^(?:what is|what's|what was)\s+/i, ""));
    if (target && /^(?:what is|what's|what was)\b/i.test(raw)) return { kind: "summary", target, needsMatch: true };
  }
  // what does X say about Y
  if ((m = /^(?:what does|what do|does)\s+(.+?)\s+(?:say|says|tell (?:me|us)|cover|mention)\s+(?:about|on|regarding|of)\s+(.+)$/i.exec(raw.replace(/[?!.]+$/, "")))) {
    const target = ok(m[1]);
    const topic = String(m[2] || "").trim();
    if (target && topic.length >= 3) return { kind: "about", target, topic, needsMatch: !(DOC_WORD.test(target) || PUB_CODE.test(target)) };
  }
  // open / read
  if ((m = /^(?:open|read|show)(?: me)?(?: up)?\s+(?:the )?(?:book |manual |document |pdf |e-?book )?(.+?)(?: in the reader| in reader)?$/i.exec(raw.replace(/[?!.]+$/, "").replace(/^(?:please\s+|can you\s+|could you\s+)+/i, "")))) {
    const target = ok(m[1]);
    if (target) return { kind: "open", target, needsMatch: !/ in (?:the )?reader$/i.test(raw) };
  }
  return null;
}
