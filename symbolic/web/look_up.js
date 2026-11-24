// Look it up: one question in, one short answer with citations out, or an honest "nothing found".
// Order: the ATP pack on this phone, then the allowlisted government pages, then Wikipedia.
// Every network read is this phone's own fetch through fetch_guard.js. Only the cleaned words from
// outboundQuery() leave the phone, and only to Wikipedia's search; government pages are fetched by
// their fixed address. The result is a draft for review. Nothing here stores anything.

import { queryTokens } from "../book_search.js";
import { sourceById, sourceForUrl } from "./allowlist.js";
import { buildAnswer, coverage, questionGroups, splitSentences } from "./answer_builder.js";
import { searchAtp } from "./atp_lookup.js";
import { guardedFetch } from "./fetch_guard.js";
import { pagesFor } from "./gov_directory.js";
import { cleanFetched } from "./sanitize.js";
import { GOV_LICENSE, WIKI_LICENSE, outboundQuery, parseSearch, queryAllowed, wikipediaPageUrl, wikipediaSearchUrl } from "./sources.js";
import { stateWildlifeLink } from "./state_wildlife.js";
import { ADVICE_LINE, adviceKind, webCandidates, webFirst, webQuery } from "./web_search.js";

const PAGE_LIMITS = { maxBytes: 1048576 };
const WIKI_LIMITS = { maxBytes: 524288 };

export function wikipediaTextUrl(title) {
  return `https://en.wikipedia.org/w/api.php?action=query&format=json&formatversion=2&prop=extracts&explaintext=1&redirects=1&titles=${encodeURIComponent(String(title).replace(/ /g, "_"))}`;
}

function titleCase(word) {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

async function wikipediaCandidates({ fetchImpl, query, now }) {
  const search = await guardedFetch({ fetchImpl, url: wikipediaSearchUrl(query), group: "wikipedia", kind: "json" });
  if (!search.ok) return { ok: false, reason: search.reason, candidates: [] };
  let hits = [];
  try {
    hits = parseSearch(JSON.parse(search.text));
  } catch {
    hits = [];
  }
  const words = queryTokens(query).slice(0, 3);
  // The whole phrase, then each word as a title ("Deer", "Scat"), then search hits that name a word
  // in their title. Search alone ranks odd pages first for short two-word asks.
  const exact = [words.length > 1 ? titleCase(words.join(" ")) : null, ...words.map(titleCase)].filter(Boolean);
  const searched = hits.filter((hit) => words.some((word) => hit.title.toLowerCase().includes(word))).map((hit) => hit.key);
  const seen = new Set();
  const candidates = [];
  let named = 0;
  for (const [i, title] of [...exact, ...searched].entries()) {
    // A page named for the words beats pages that only mention them, so search hits are a fallback.
    if (i >= exact.length && named > 0) break;
    if (candidates.length >= 3 || seen.size >= 6) break;
    const key = title.toLowerCase().replace(/ /g, "_");
    if (seen.has(key)) continue;
    seen.add(key);
    const got = await guardedFetch({ fetchImpl, url: wikipediaTextUrl(title), group: "wikipedia", kind: "json", limits: WIKI_LIMITS });
    if (!got.ok) continue;
    let page;
    try {
      page = JSON.parse(got.text)?.query?.pages?.[0];
    } catch {
      continue;
    }
    if (!page || page.missing || typeof page.extract !== "string") continue;
    const resolved = String(page.title || title);
    if (seen.has(`resolved:${resolved}`)) continue;
    seen.add(`resolved:${resolved}`);
    // Section headings ("== Diet ==") and reference tails are not sentences.
    const body = page.extract.replace(/^=+[^=\n]+=+\s*$/gm, " ").split(/\n=+\s*(?:See also|References|Notes|Further reading|External links)\s*=+/i)[0];
    const cleaned = cleanFetched(body, { maxChars: 60000 });
    if (cleaned.text.length < 80) continue;
    const source = sourceById("wikipedia");
    if (i < exact.length) named += 1;
    candidates.push({
      sourceId: "wikipedia",
      sourceName: "Wikipedia",
      kind: "wikipedia",
      ref: "",
      title: cleanFetched(resolved, { maxChars: 100 }).text,
      url: wikipediaPageUrl(resolved),
      license: WIKI_LICENSE.name,
      licenseUrl: WIKI_LICENSE.url,
      attribution: source.attribution,
      fetchedAt: new Date(now()).toISOString(),
      text: cleaned.text
    });
  }
  return { ok: true, candidates };
}

async function govCandidate({ fetchImpl, page, now }) {
  const got = await guardedFetch({ fetchImpl, url: page.url, group: "page", kind: "html", limits: PAGE_LIMITS });
  if (!got.ok) return { ok: false, reason: got.reason };
  const main = /<main\b[\s\S]*?<\/main>/i.exec(got.text)?.[0] || /<article\b[\s\S]*?<\/article>/i.exec(got.text)?.[0] || got.text;
  // Paragraphs and list items only: menus, dates and headings are not sentences to quote.
  const blocks = [];
  for (const match of main.matchAll(/<(p|li)\b[^>]*>([\s\S]*?)<\/\1>/gi)) {
    const piece = cleanFetched(match[2], { html: true, maxChars: 2000 }).text;
    if (piece.length >= 30) blocks.push(piece.replace(/\s*$/, /[.!?]$/.test(piece) ? "" : "."));
    if (blocks.join(" ").length > 40000) break;
  }
  const cleaned = { text: blocks.join("\n") };
  const title = cleanFetched((/<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(got.text) || /<title[^>]*>([\s\S]*?)<\/title>/i.exec(got.text) || [null, ""])[1], { html: true, maxChars: 100 }).text.replace(/\s*[|].*$/, "").trim();
  const source = sourceForUrl(got.finalUrl) || sourceById(page.source);
  return {
    ok: true,
    candidate: {
      sourceId: source?.id || page.source,
      sourceName: source?.name || new URL(got.finalUrl).hostname,
      kind: "gov",
      ref: "",
      title,
      url: got.finalUrl,
      license: GOV_LICENSE.name,
      licenseUrl: GOV_LICENSE.url,
      attribution: `From ${source?.agency || "a US government site"}.`,
      fetchedAt: new Date(now()).toISOString(),
      text: cleaned.text
    }
  };
}

function offlineReason(reason) {
  return /couldn't reach|No network|took too long/i.test(String(reason || ""));
}

/** Sentences worth showing the meaning matcher: from network pages, naming at least one topic word. */
function rerankPool(question, candidates, cap = 40) {
  const groups = questionGroups(question);
  const pool = [];
  for (const candidate of candidates) {
    if (candidate.kind === "pack") continue;
    for (const sentence of splitSentences(candidate.text)) {
      if (coverage(sentence, groups) > 0) pool.push(sentence);
      if (pool.length >= cap) return pool;
    }
  }
  return pool;
}

async function meaningScores(rerank, question, candidates) {
  if (typeof rerank !== "function") return null;
  const pool = [...new Set(rerankPool(question, candidates))];
  if (pool.length === 0) return null;
  try {
    const scores = await Promise.race([
      Promise.resolve(rerank(question, pool)),
      new Promise((resolve) => setTimeout(() => resolve(null), 8000))
    ]);
    if (!Array.isArray(scores) || scores.length !== pool.length) return null;
    return new Map(pool.map((sentence, i) => [sentence, Number(scores[i])]));
  } catch {
    return null;
  }
}

/** The one line shown under a looked-up answer: exactly what left the phone, and where it went. */
export function disclosureLine({ sent, sentTo = [], area = null, nearMe = false }) {
  if (!sent) return "Nothing left this phone. This came from the Army manuals on it.";
  const where = sentTo.length ? sentTo.join(" and ") : "Wikipedia's search";
  const place = area
    ? ` Your approximate area (${area}, state only) was added because location is on.`
    : nearMe
      ? " Location is off, so no place was added and this is not local to you."
      : "";
  return `Only the words "${sent}" left this phone, to ${where}. Result pages were read by their own address.${place} Nothing else was sent.`;
}

/**
 * Returns { ok: true, answer, sent, tried, disclosure } or { ok: false, reason, sent, tried, offline }.
 * tried lists each source with ok/reason, for the "where I looked" line.
 * openWeb: also run a keyless web search and read the top pages when the manuals, the listed
 * government pages and Wikipedia have nothing (or first, for law, news, local and current questions).
 * area: a state code, passed only when location is on. rerank: optional on-device meaning matcher,
 * (question, sentences) => similarity per sentence. Never on the symbol hot path.
 */
export async function lookUp({ question, fetchImpl = null, atpPack = null, homeState = null, network = true, now = () => Date.now(), openWeb = true, area = null, rerank = null }) {
  const query = outboundQuery(question);
  const allowed = queryAllowed(query);
  if (!allowed.ok) return { ok: false, reason: allowed.reason, sent: "", tried: [], offline: false };
  const tried = [];
  const candidates = [];
  const atp = searchAtp(atpPack, question);
  tried.push({ source: "ATP 3-50.21 and ATP 4-02.11 (on this phone)", ok: atp.length > 0 });
  candidates.push(...atp);
  let reached = 0;
  let attempted = 0;
  const online = network && typeof fetchImpl === "function";
  const web = openWeb ? webQuery(question, { area }) : null;
  const first = openWeb && webFirst(question);
  const sendQuery = web?.query && queryAllowed(web.query).ok ? web.query : query;
  const sentTo = [];
  const runWeb = async () => {
    const found = await webCandidates({ fetchImpl, question, query: sendQuery, now });
    attempted += 1;
    if (found.reachedAny) reached += 1;
    tried.push(...found.tried);
    if (found.engine) sentTo.unshift(`${found.engine.name} search`);
    else if (found.reachedAny) sentTo.unshift("a web search");
    candidates.push(...found.candidates);
  };
  if (online) {
    if (first) await runWeb();
    const pages = pagesFor(question);
    const govResults = await Promise.all(pages.map((page) => govCandidate({ fetchImpl, page, now })));
    govResults.forEach((result, i) => {
      attempted += 1;
      if (result.ok || !offlineReason(result.reason)) reached += 1;
      tried.push({ source: sourceById(pages[i].source)?.name || pages[i].source, ok: result.ok, reason: result.ok ? null : result.reason });
      if (result.ok) candidates.push(result.candidate);
    });
    const wiki = await wikipediaCandidates({ fetchImpl, query: sendQuery, now });
    attempted += 1;
    if (wiki.ok || !offlineReason(wiki.reason)) reached += 1;
    tried.push({ source: "Wikipedia", ok: wiki.candidates.length > 0, reason: wiki.ok ? null : wiki.reason });
    candidates.push(...wiki.candidates);
    sentTo.push("Wikipedia's search");
  }
  const link = stateWildlifeLink(question, homeState);
  let answer = first ? null : buildAnswer({ question, query, candidates, link, now: now() });
  if (!answer && online && openWeb && !first && reached > 0) await runWeb();
  if (!answer) {
    const meaning = await meaningScores(rerank, question, candidates);
    answer = buildAnswer({ question, query, candidates, link, now: now(), meaning, strict: first });
  }
  const offline = !online || (attempted > 0 && reached === 0);
  // Only the search pages get words. Government pages and result pages are fetched by their address.
  const sent = online ? sendQuery : "";
  const disclosure = online ? disclosureLine({ sent, sentTo, area: web?.area || null, nearMe: web?.nearMe === true }) : "";
  if (!answer) {
    return {
      ok: false,
      offline,
      sent,
      sentTo,
      disclosure,
      tried,
      reason: offline
        ? "I couldn't reach the internet, and the Army manuals on this phone don't cover it. It stays in Look it up later."
        : `I searched the web${sentTo.length ? ` (${sentTo.join(", ")})` : ""} and read the top pages, and none of them answers that clearly enough to quote. Nothing was kept.`
    };
  }
  // Law and health answers from the internet say so, and can only be kept unverified.
  if (answer.citations.some((c) => c.sourceId !== "atp-3-50.21" && c.sourceId !== "atp-4-02.11" && !/^ATP /.test(c.sourceName))) {
    const advice = adviceKind(question);
    if (advice) answer = { ...answer, advice, adviceLine: ADVICE_LINE[advice] };
  }
  if (web?.nearMe) answer = { ...answer, area: web.area || null, nearMe: true };
  return { ok: true, answer, sent, sentTo, disclosure, tried, offline };
}
