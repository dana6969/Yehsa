// General look-up: a keyless web search, then the top few result pages read as plain text.
// Dana, Nov 24: "I need it to be able to pull whatever I ask it."
//
// What leaves the phone: only the cleaned question words (outboundQuery strips names, numbers,
// emails, addresses), sent to one keyless search page (DuckDuckGo's HTML page, or Bing's RSS feed
// if DuckDuckGo does not answer), then each chosen result page is fetched by its own address.
// For "near me" questions the state name is added only when location is on; that is disclosed.
// Every request goes through fetch_guard.js: https only, public hosts only, no cookies, size and
// time caps. Page text is data: scripts, styles and markup are stripped, instruction-like lines are
// dropped, and nothing fetched is ever run or rendered as HTML. Search snippets are never quoted.

import { guardedFetch } from "./fetch_guard.js";
import { cleanFetched } from "./sanitize.js";
import { outboundQuery } from "./sources.js";
import { STATE_WILDLIFE } from "./state_wildlife.js";
import { buildSections } from "../docs/doc_sections.js";
import { cleanDocText } from "../docs/doc_text.js";
import { extractPdfTextAsync } from "../docs/pdf_text.js";

export const WEB_LICENSE = "Quoted for reference. Rights stay with the site.";
export const SEARCH_LIMITS = { maxBytes: 524288, timeoutMs: 8000 };
export const PAGE_LIMITS = { maxBytes: 786432, timeoutMs: 8000 };
export const MAX_PAGES = 4;
// A PDF in the results is read too (R6): up to 12 MB and its first 120 pages, text only.
export const PDF_RESULT_LIMITS = { maxBytes: 12 * 1024 * 1024, timeoutMs: 20000 };
export const PDF_RESULT_PAGES = 120;

export const ENGINES = [
  { id: "duckduckgo", name: "DuckDuckGo", kind: "html", url: (q) => `https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}` },
  { id: "bing", name: "Bing", kind: "xml", url: (q) => `https://www.bing.com/search?format=rss&q=${encodeURIComponent(q)}` }
];

const NEAR_ME = /\b(?:near me|nearby|near here|around me|around here|in my area|close to me|where i am|my area|locally)\b/gi;
const ASK_LEAD = /^(?:(?:i|we)\s+(?:need|want|would like|'d like|am looking for|are looking for)\s+(?:to (?:know|find|see|read)\s+)?(?:about\s+)?|(?:please\s+)?(?:find|show|give|get|pull)(?:\s+me)?(?:\s+up)?\s+|what (?:do you know|can you tell me) about\s+|tell me\s+)/i;

const STATES = Object.entries(STATE_WILDLIFE).map(([code, row]) => ({ code, name: row[0] }));

/** The state a question names, by full name ("Maine laws"), or null. */
export function namedState(question) {
  const text = String(question || "");
  for (const state of STATES) {
    if (new RegExp(`\\b${state.name.replace(/ /g, "\\s+")}\\b`, "i").test(text)) return state;
  }
  return null;
}

export function stateName(code) {
  const row = STATE_WILDLIFE[String(code || "").toUpperCase()];
  return row ? row[0] : null;
}

export function asksNearMe(question) {
  NEAR_ME.lastIndex = 0;
  return NEAR_ME.test(String(question || ""));
}

/**
 * The words sent to the search page. area: a state code, only when location is on.
 * Returns { query, nearMe, area } where area is the state name that was added, or null.
 */
export function webQuery(question, { area = null } = {}) {
  const nearMe = asksNearMe(question);
  let text = String(question || "").replace(NEAR_ME, " ");
  text = outboundQuery(text).replace(ASK_LEAD, "").replace(/\s+/g, " ").trim();
  let added = null;
  if (nearMe && area) {
    const name = stateName(area) || null;
    if (name && !new RegExp(`\\b${name}\\b`, "i").test(text)) {
      text = `${text} ${name}`.trim();
      added = name;
    }
  }
  return { query: text.slice(0, 120), nearMe, area: added };
}

function decodeResultUrl(href) {
  let raw = String(href || "").replace(/&amp;/g, "&");
  if (raw.startsWith("//")) raw = `https:${raw}`;
  try {
    const url = new URL(raw);
    // DuckDuckGo wraps results in its own redirect. Ads go through y.js and are skipped.
    if (/(^|\.)duckduckgo\.com$/.test(url.hostname)) {
      if (url.pathname.startsWith("/y.js")) return null;
      const target = url.searchParams.get("uddg");
      return target ? decodeResultUrl(target) : null;
    }
    if (url.protocol !== "https:") return null;
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function plain(fragment, max = 200) {
  return cleanFetched(String(fragment || ""), { html: true, maxChars: max }).text.replace(/\s+/g, " ").trim();
}

/** DuckDuckGo's HTML results page -> [{ url, title, snippet }]. */
export function parseDuckDuckGo(html) {
  const out = [];
  const text = String(html || "");
  const re = /<a\b[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = re.exec(text)) && out.length < 12) {
    const url = decodeResultUrl(match[1]);
    if (!url) continue;
    const rest = text.slice(re.lastIndex, re.lastIndex + 3000);
    const snippet = /class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/(?:a|div|td)>/i.exec(rest)?.[1] || "";
    out.push({ url, title: plain(match[2], 140), snippet: plain(snippet, 300) });
  }
  return out;
}

/** Bing's RSS results -> [{ url, title, snippet }]. */
export function parseBingRss(xml) {
  const out = [];
  for (const item of String(xml || "").matchAll(/<item>([\s\S]*?)<\/item>/gi)) {
    const link = /<link>([\s\S]*?)<\/link>/i.exec(item[1])?.[1];
    const url = decodeResultUrl(String(link || "").trim());
    if (!url) continue;
    out.push({
      url,
      title: plain(/<title>([\s\S]*?)<\/title>/i.exec(item[1])?.[1], 140),
      snippet: plain(/<description>([\s\S]*?)<\/description>/i.exec(item[1])?.[1], 300)
    });
    if (out.length >= 12) break;
  }
  return out;
}

// Sites whose pages are not readable text, or are mostly other people's posts.
const SKIP_HOSTS = /(?:^|\.)(?:youtube\.com|youtu\.be|facebook\.com|instagram\.com|tiktok\.com|pinterest\.[a-z.]+|twitter\.com|x\.com|linkedin\.com|quora\.com|reddit\.com|amazon\.[a-z.]+|ebay\.com|duckduckgo\.com|bing\.com|google\.[a-z.]+)$/i;
const HEALTH = /(?:^|\.)(?:cdc\.gov|nih\.gov|who\.int|fda\.gov|hhs\.gov|medlineplus\.gov|mayoclinic\.org|clevelandclinic\.org)$/i;
const NEWS = /(?:^|\.)(?:apnews\.com|reuters\.com|npr\.org|pbs\.org|bbc\.co\.uk|bbc\.com)$/i;
const LAW = /(?:^|\.)(?:law\.cornell\.edu|justia\.com|uscourts\.gov|congress\.gov|govinfo\.gov)$/i;

/** 0..1: how much to trust a host for a quote. Government and state sites first. */
export function authority(url, { state = null } = {}) {
  let host;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return 0;
  }
  const slug = state ? state.name.toLowerCase().replace(/\s+/g, "") : null;
  const stateSite = slug && (host.includes(slug) || host.endsWith(`.${state.code.toLowerCase()}.us`) || host.endsWith(`.${state.code.toLowerCase()}.gov`));
  if (/\.(?:gov|mil)$/.test(host) || /\.[a-z]{2}\.us$/.test(host)) return stateSite ? 1 : 0.9;
  if (HEALTH.test(host)) return 0.85;
  if (LAW.test(host)) return 0.75;
  if (/\.edu$/.test(host)) return 0.7;
  if (NEWS.test(host)) return 0.6;
  if (host === "en.wikipedia.org") return 0.5;
  if (stateSite) return 0.45;
  if (/\.org$/.test(host)) return 0.35;
  return 0.25;
}

/** Search results in reading order: skip unreadable sites and files (PDFs are read), government and state sites first, two pages per site. */
export function pickResults(results, question, max = MAX_PAGES) {
  const state = namedState(question);
  const seen = new Map();
  return results
    .map((result, rank) => ({ ...result, rank, score: authority(result.url, { state }) - rank * 0.04 }))
    .filter((result) => {
      let url;
      try {
        url = new URL(result.url);
      } catch {
        return false;
      }
      if (SKIP_HOSTS.test(url.hostname) || /\.(?:docx?|xlsx?|pptx?|zip|jpe?g|png|gif|mp[34])$/i.test(url.pathname)) return false;
      if (url.hostname === "en.wikipedia.org") return false; // Wikipedia is read through its own API.
      // Two pages per site at most, so one site cannot fill the answer.
      const key = url.hostname.replace(/^www\./, "");
      const count = (seen.get(key) || 0) + 1;
      seen.set(key, count);
      return count <= 2;
    })
    .sort((a, b) => b.score - a.score || a.rank - b.rank)
    .slice(0, max);
}

/** Readable text from a page: paragraphs, list items and table cells inside main/article. Never run. */
export function readablePage(html) {
  const page = String(html || "");
  const chrome = (text) => text.replace(/<(nav|header|footer|aside|form)\b[\s\S]*?<\/\1\s*>/gi, " ");
  const body = chrome(/<main\b[\s\S]*?<\/main>/i.exec(page)?.[0] || /<article\b[\s\S]*?<\/article>/i.exec(page)?.[0] || page);
  const blocks = [];
  const keep = (raw) => {
    const piece = raw.replace(/\s+/g, " ").trim();
    if (piece.length < 30) return;
    if (/[.!?]["')\]]?$/.test(piece)) blocks.push(piece);
    // A list item or cell with no end mark is kept only when it reads as a whole sentence.
    else if (piece.split(" ").length >= 10 && !/(?:\b(?:and|or|of|the|to|for|with)|[,;:])$/i.test(piece)) blocks.push(`${piece}.`);
  };
  for (const match of body.matchAll(/<(p|li|dd|td|blockquote)\b[^>]*>([\s\S]*?)<\/\1>/gi)) {
    keep(cleanFetched(match[2], { html: true, maxChars: 2000 }).text);
    if (blocks.join(" ").length > 40000) break;
  }
  // Some sites (state statute pages) put their text in plain divs. Fall back to the page's text lines.
  if (blocks.length < 3) {
    blocks.length = 0;
    for (const line of cleanFetched(body, { html: true, maxChars: 60000 }).text.split(/\n+/)) keep(line);
  }
  const title = plain((/<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(page) || /<title[^>]*>([\s\S]*?)<\/title>/i.exec(page) || [null, ""])[1], 120)
    .replace(/\s*[|]\s.*$/, "")
    .trim();
  return { title, text: blocks.join("\n") };
}

function hostName(url) {
  return new URL(url).hostname.replace(/^www\./, "");
}

export function isPdfUrl(url) {
  try {
    return /\.pdf$/i.test(new URL(url).pathname);
  } catch {
    return false;
  }
}

/**
 * A PDF search result, read as text on the phone: { ok, read: { title, text }, finalUrl } or { ok: false, reason }.
 * PDF lines are joined back into paragraphs, so sentences quote whole. Text is data, as with pages.
 */
export async function readPdfResult({ fetchImpl, url }) {
  const got = await guardedFetch({ fetchImpl, url, group: "open", kind: "pdf", limits: PDF_RESULT_LIMITS });
  if (!got.ok) return got;
  const pdf = await extractPdfTextAsync(got.bytes, { limits: { maxPages: PDF_RESULT_PAGES, maxChars: 400000 } });
  if (!pdf.ok) return { ok: false, reason: pdf.reason };
  const text = buildSections(pdf.pages.map(cleanDocText)).map((section) => section.text).join("\n").slice(0, 120000);
  const title = String(pdf.title || "").replace(/^Microsoft Word - /i, "").trim();
  return { ok: true, read: { title: title.length >= 8 ? title.slice(0, 120) : "", text }, finalUrl: got.finalUrl };
}

/** One search, on the first engine that answers with results. */
export async function searchWeb({ fetchImpl, query }) {
  const tried = [];
  for (const engine of ENGINES) {
    const got = await guardedFetch({ fetchImpl, url: engine.url(query), group: "search", kind: engine.kind, limits: SEARCH_LIMITS });
    if (!got.ok) {
      tried.push({ source: `${engine.name} search`, ok: false, reason: got.reason });
      continue;
    }
    const results = engine.kind === "xml" ? parseBingRss(got.text) : parseDuckDuckGo(got.text);
    tried.push({ source: `${engine.name} search`, ok: results.length > 0, reason: results.length ? null : "No results." });
    if (results.length) return { ok: true, engine, results, tried };
  }
  return { ok: false, engine: null, results: [], tried, reason: tried.map((t) => t.reason).filter(Boolean)[0] || "No results." };
}

/**
 * Search, then read the top pages. Returns { ok, engine, candidates, tried, reachedAny }.
 * Each candidate is shaped for buildAnswer (kind "web", authority 0..1).
 */
export async function webCandidates({ fetchImpl, question, query, now = () => Date.now(), maxPages = MAX_PAGES }) {
  const search = await searchWeb({ fetchImpl, query });
  const tried = [...search.tried];
  const reachedAny = search.tried.some((t) => t.ok || !/couldn't reach|took too long|No network/i.test(String(t.reason || "")));
  if (!search.ok) return { ok: false, engine: null, candidates: [], tried, reachedAny, reason: search.reason };
  const state = namedState(question);
  const picked = pickResults(search.results, question, maxPages);
  const pages = await Promise.all(picked.map((result) => (isPdfUrl(result.url) ? readPdfResult({ fetchImpl, url: result.url }) : guardedFetch({ fetchImpl, url: result.url, group: "open", kind: "html", limits: PAGE_LIMITS }))));
  const candidates = [];
  pages.forEach((got, i) => {
    const result = picked[i];
    const name = hostName(result.url);
    if (!got.ok) {
      tried.push({ source: name, ok: false, reason: got.reason });
      return;
    }
    const read = got.read || readablePage(got.text);
    if (read.text.length < 80) {
      tried.push({ source: name, ok: false, reason: "No readable text." });
      return;
    }
    tried.push({ source: name, ok: true });
    const finalUrl = got.finalUrl || result.url;
    candidates.push({
      sourceId: "web",
      sourceName: hostName(finalUrl),
      kind: "web",
      ref: "",
      title: read.title || result.title,
      url: finalUrl,
      license: WEB_LICENSE,
      licenseUrl: "",
      attribution: `Quoted word for word from ${hostName(finalUrl)}.`,
      authority: authority(finalUrl, { state }),
      fetchedAt: new Date(now()).toISOString(),
      text: read.text
    });
  });
  return { ok: candidates.length > 0, engine: search.engine, candidates, tried, reachedAny: true };
}

// Questions a field manual or encyclopedia cannot answer well: law, news, local, current, prices.
const WEB_FIRST = /\b(?:laws?|legal|statutes?|court|custody|child support|divorce|regulations?|ordinances?|news|latest|current(?:ly)?|today|tonight|this (?:week|month|year)|outbreaks?|cases|recalls?|closures?|prices?|cost|hours|open now|schedule|election|20[2-3]\d)\b/i;

export function webFirst(question) {
  return WEB_FIRST.test(String(question || "")) || asksNearMe(question) || namedState(question) != null;
}

const LEGAL = /\b(?:laws?|legal|statutes?|court|custody|child support|alimony|divorce|lawsuit|sue|attorney|lawyer|rights|eviction|lease|tax(?:es)?|regulations?|ordinances?|fine|penalty|license|permit|warrant|arrest)\b/i;
const MEDICAL = /\b(?:flu|influenza|outbreaks?|disease|illness|sick|symptoms?|diagnos\w*|treat(?:ment|ing)?|cure|medicine|medication|drug|vaccines?|virus|viral|bacteria\w*|infection|infectious|covid|measles|doctor|health|pregnan\w*|cancer|diabet\w*|blood pressure|injur\w*)\b/i;

/** "legal", "medical" or null. Such answers say "check the source" and can only be kept unverified. */
export function adviceKind(question) {
  const text = String(question || "");
  if (LEGAL.test(text)) return "legal";
  if (MEDICAL.test(text)) return "medical";
  return null;
}

export const ADVICE_LINE = {
  legal: "Check the source; this is not legal advice. Laws change, so confirm with the state or a lawyer.",
  medical: "Check the source; this is not medical advice. For your own health, ask a doctor or your state health department."
};
