// Look it up: one question in, one short answer with citations out, or an honest "nothing found".
// Order: the ATP pack on this phone, then the allowlisted government pages, then Wikipedia.
// Every network read is this phone's own fetch through fetch_guard.js. Only the cleaned words from
// outboundQuery() leave the phone, and only to Wikipedia's search; government pages are fetched by
// their fixed address. The result is a draft for review. Nothing here stores anything.

import { queryTokens } from "../book_search.js";
import { sourceById, sourceForUrl } from "./allowlist.js";
import { buildAnswer } from "./answer_builder.js";
import { searchAtp } from "./atp_lookup.js";
import { guardedFetch } from "./fetch_guard.js";
import { pagesFor } from "./gov_directory.js";
import { cleanFetched } from "./sanitize.js";
import { GOV_LICENSE, WIKI_LICENSE, outboundQuery, parseSearch, queryAllowed, wikipediaPageUrl, wikipediaSearchUrl } from "./sources.js";
import { stateWildlifeLink } from "./state_wildlife.js";

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

/**
 * Returns { ok: true, answer, sent, tried } or { ok: false, reason, sent, tried, offline }.
 * tried lists each source with ok/reason, for the "where I looked" line.
 */
export async function lookUp({ question, fetchImpl = null, atpPack = null, homeState = null, network = true, now = () => Date.now() }) {
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
  if (network && typeof fetchImpl === "function") {
    const pages = pagesFor(question);
    const govResults = await Promise.all(pages.map((page) => govCandidate({ fetchImpl, page, now })));
    govResults.forEach((result, i) => {
      attempted += 1;
      if (result.ok || !offlineReason(result.reason)) reached += 1;
      tried.push({ source: sourceById(pages[i].source)?.name || pages[i].source, ok: result.ok, reason: result.ok ? null : result.reason });
      if (result.ok) candidates.push(result.candidate);
    });
    const wiki = await wikipediaCandidates({ fetchImpl, query, now });
    attempted += 1;
    if (wiki.ok || !offlineReason(wiki.reason)) reached += 1;
    tried.push({ source: "Wikipedia", ok: wiki.candidates.length > 0, reason: wiki.ok ? null : wiki.reason });
    candidates.push(...wiki.candidates);
  }
  const offline = !network || typeof fetchImpl !== "function" || (attempted > 0 && reached === 0);
  const answer = buildAnswer({ question, query, candidates, link: stateWildlifeLink(question, homeState), now: now() });
  // Only Wikipedia's search gets words. The government pages are fixed addresses.
  const sent = network && typeof fetchImpl === "function" ? query : "";
  if (!answer) {
    return {
      ok: false,
      offline,
      sent,
      tried,
      reason: offline
        ? "I couldn't reach the internet, and the Army manuals on this phone don't cover it. It stays in Look it up later."
        : "I looked in the Army manuals, the government pages and Wikipedia, and none of them answers that clearly. Nothing was kept."
    };
  }
  return { ok: true, answer, sent, tried, offline };
}
