// Find a document on the web and bring it onto the phone (Dana, Nov 24: "find and download
// documents I ask it and learn from those").
// 1. documentIntent spots "download FM 21-76", "find the Maine hunting regulations PDF",
//    "get me the USDA canning guide". It is checked in Ask only, never on getMappedAction.
// 2. findDocuments sends the cleaned words (outboundQuery: no names, numbers that look personal,
//    emails or addresses) to one keyless search page, then asks each top link what it is (HEAD:
//    type, size, date). Nothing is downloaded until the person taps one.
// 3. downloadDocument fetches the tapped link through fetch_guard (https only, public hosts,
//    redirects re-checked, no cookies), up to 50 MB, and sniffs the bytes: PDF, EPUB, text or a
//    web page only. Programs, archives, pictures and scripts are refused.

import { guardedFetch, guardedHead } from "../web/fetch_guard.js";
import { outboundQuery, queryAllowed } from "../web/sources.js";
import { authority, searchWeb } from "../web/web_search.js";
import { blockedType, kindFromUrl, sniffDocument } from "./doc_check.js";
import { cleanDocTitle } from "./doc_title.js";
import { catalogItem, isLandingPage, resolveItem, volumeOf } from "./doc_resolve.js";

export { cleanDocTitle };

export const DOC_LIMITS = { maxBytes: 50 * 1024 * 1024, timeoutMs: 120000, maxRedirects: 3 };
export const MAX_CANDIDATES = 5;

const DOC_WORDS = "pdf|epub|e-?book|manual|field manual|handbook|guide|guidebook|regulations?|regs|law ?book|rule ?book|digest|booklet|pamphlet|brochure|fact ?sheet|document|publication|report|paper|book|textbook|almanac|bulletin|circular|ordinance|statute|code book";
const PUB_CODE = /\b(?:FM|ATP|ATTP|TM|TC|AR|DA PAM|ADP|ADRP|GTA|MCRP|MCWP|NAVEDTRA|AFMAN|AFH|AFI)\s?-?\d{1,3}(?:-\d{1,3})*(?:\.\d+)?\b/i;
const LEAD = /^(?:(?:hey|ok(?:ay)?|yehsa)[, ]+)?(?:please\s+)?(?:(?:can|could|would|will) you\s+)?(?:please\s+)?/i;
const VERB = /^(download|fetch|grab|save|find|get|pull(?: up)?|look up|search(?: for)?|locate|bring(?: me)?|i (?:need|want)(?: to (?:download|get|find|read))?)\s+(?:me\s+)?(?:a copy of\s+)?/i;
// Things that are not documents even with a doc word nearby.
const NOT_DOC = /\b(?:map|maps|map pack|area|tiles?|weather|forecast|directions?|route|radio|station|signal|water|fire|food|shelter|help|location|position|gps|waypoint|my notes?|note)\b/i;

/**
 * "download FM 21-76" -> { query: "FM 21-76", format: "any" }. "find the Maine hunting regulations PDF"
 * -> { query: "Maine hunting regulations PDF" }. Returns null for anything else.
 */
export function documentIntent(text) {
  const raw = String(text || "").replace(/[?!.]+\s*$/, "").trim();
  if (raw.length < 6 || raw.length > 200) return null;
  if (/^(?:how|what|why|when|where|who|which|is|are|do|does|should)\b/i.test(raw)) return null;
  const body = raw.replace(LEAD, "");
  const verb = VERB.exec(body);
  if (!verb) return null;
  let rest = body.slice(verb[0].length).replace(/^(?:the|a|an|that|some)\s+/i, "").trim();
  const isDownload = /^(?:download|fetch|grab|save)$/i.test(verb[1]) || /download/i.test(verb[1]);
  const hasDocWord = new RegExp(`\\b(?:${DOC_WORDS})\\b`, "i").test(rest);
  const hasCode = PUB_CODE.test(rest);
  if (!hasDocWord && !hasCode && !isDownload) return null;
  if (!hasCode && NOT_DOC.test(rest) && !/\b(?:pdf|manual|handbook|guide|regulations?|book|booklet)\b/i.test(rest)) return null;
  rest = rest.replace(/\s+(?:for me|please|to (?:my|the) phone|onto (?:my|the) phone|so (?:i|you) can .*)$/i, "").trim();
  const trail = /\s+(?:for me|please|to (?:my|the) phone|onto (?:my|the) phone)$/i;
  const query = (outboundQuery(rest) || rest).replace(trail, "").trim();
  if (!queryAllowed(query).ok) return null;
  return { query: query.slice(0, 100), format: /\bepub|e-?book\b/i.test(rest) ? "epub" : /\btxt|plain text\b/i.test(rest) ? "text" : "any" };
}

/** The words that leave the phone. "pdf" is added when the person did not name a format. */
export function documentQuery(intent) {
  const q = intent.query;
  if (/\b(?:pdf|epub|e-?book|txt|web ?page|website)\b/i.test(q)) return q;
  return `${q} pdf`;
}

const SKIP = /(?:^|\.)(?:youtube\.com|youtu\.be|facebook\.com|instagram\.com|tiktok\.com|pinterest\.[a-z.]+|twitter\.com|x\.com|linkedin\.com|quora\.com|reddit\.com|amazon\.[a-z.]+|ebay\.com|duckduckgo\.com|bing\.com|google\.[a-z.]+|scribd\.com|dokumen\.pub|pdfcoffee\.com|studocu\.com|coursehero\.com|issuu\.com|yumpu\.com|slideshare\.net)$/i;

function hostOf(url) {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\d*\./, "");
  } catch {
    return "";
  }
}

// ---------- R14: title matching ----------
// "Download the encyclopedia of the world" must not list "The Encyclopedia of WORLD RELIGIONS" or
// "Encyclopedia of American Indian Contributions to the World": every key word of the asked title has
// to be in the result's title, and a subject word the person did not ask for ("religions",
// "American Indian") counts against it. Exact and near-exact titles come first.

const TITLE_STOP = new Set("the a an of and or in on for to with by from at its his her their our your my".split(" "));
const FORMAT_WORDS = new Set("pdf epub ebook e-book txt text copy download free full online scan scanned version".split(" "));
// Words that change nothing about which book it is.
const GENERIC = new Set("vol vols volume volumes v part parts set series edition editions ed eds new complete illustrated revised unabridged abridged original reprint first second third fourth fifth sixth seventh eighth ninth tenth".split(" "));
const REFERENCE = /\b(?:encyclop(?:a)?edia|dictionar(?:y|ies)|almanac|atlas|thesaurus|gazetteer|anthology|compendium|history of|book of|bible)\b/i;

function stem(word) {
  let w = String(word || "").toLowerCase().replace(/[’']s$/, "").replace(/encyclopaedia/g, "encyclopedia");
  if (w.length > 4 && /ies$/.test(w)) w = `${w.slice(0, -3)}y`;
  else if (w.length > 4 && /s$/.test(w) && !/ss$/.test(w)) w = w.slice(0, -1);
  return w;
}

function wordsOf(text) {
  return String(text || "").toLowerCase().replace(/encyclopaedia/g, "encyclopedia").split(/[^a-z0-9’']+/).map((w) => w.replace(/^[’']+|[’']+$/g, "")).filter(Boolean);
}

function isRoman(w) {
  return /^[ivxlc]{1,6}$/.test(w) && w !== "civil" && w !== "ill";
}

/** The asked-for title's key words: "the encyclopedia of the world" -> ["encyclopedia", "world"]. */
export function keyTitleWords(query) {
  return [...new Set(wordsOf(query).filter((w) => !TITLE_STOP.has(w) && !FORMAT_WORDS.has(w)).map(stem))];
}

/** The title before its subtitle, author or volume: "The world encyclopedia; a library of..." -> "The world encyclopedia". */
export function mainTitle(title) {
  const t = String(title || "");
  const cut = t.split(/\s*[:;/]\s*|\s+[-–—|]\s+|-\s+(?=vol)|,\s*(?=(?:vol|volume|v\.)\b)|\s*\((?=\s*vol)/i)[0];
  return cut.replace(/[\s,.-]*\b(?:vol(?:ume)?\.?|v\.)\s*(?:\d+|[ivxl]+)\s*$/i, "").trim() || t.trim();
}

/** { all, hit, missing, extras, exact } for one result title against the asked title. */
export function titleMatch(title, query) {
  const keys = keyTitleWords(query);
  const have = new Set(wordsOf(title).map(stem));
  const hit = keys.filter((k) => have.has(k));
  const missing = keys.filter((k) => !have.has(k));
  const keySet = new Set(keys);
  const main = wordsOf(mainTitle(title)).filter((w) => !TITLE_STOP.has(w) && !FORMAT_WORDS.has(w));
  const extras = [...new Set(main.map(stem).filter((w) => !keySet.has(w) && !GENERIC.has(w) && !/^\d+$/.test(w) && !isRoman(w)))];
  const allowMiss = keys.length >= 4 ? 1 : 0;
  return { all: keys.length > 0 && missing.length <= allowMiss, hit: hit.length, missing, extras, exact: missing.length === 0 && extras.length === 0 };
}

/** A title that says nothing ("Encyclopedia Of", "Untitled", "Document"). */
export function isVagueTitle(title) {
  const words = wordsOf(title);
  if (!words.length) return true;
  if (TITLE_STOP.has(words[words.length - 1])) return true;
  const content = words.filter((w) => !TITLE_STOP.has(w) && !FORMAT_WORDS.has(w));
  return content.length < 2 || /^(?:untitled|document|file|download|pdf)$/i.test(String(title || "").trim());
}

/** Is this a search for one named book (strict title matching), not a topic? */
export function isTitleQuery(query, { book = false } = {}) {
  if (PUB_CODE.test(String(query || ""))) return false;
  return book || REFERENCE.test(String(query || ""));
}

/** "Encyclopedia of World History- Volume 4" -> "Encyclopedia of World History, Volume 4". */
export function displayTitle(title, volume = null) {
  let t = cleanDocTitle(title).replace(/\s*\[\d+\]\s*$/, "").replace(/\s+\/\s+[^/]+$/, "").replace(/\s*-\s*(?=(?:vol(?:ume)?\.?|v\.)\s*\d)/i, ", ").replace(/\s+/g, " ").trim();
  t = t.replace(/\b[Vv]ol\.?\s*(\d+)\b/, "Volume $1").replace(/^[\s\-–—|:;,.]+/, "");
  if (volume && !/\bvolume\s*\d+/i.test(t)) t = `${t}, Volume ${volume}`;
  return t;
}

/** Search results -> document candidates, files first, official sites first, one copy of each file. */
export function rankDocResults(results, query) {
  const words = String(query || "").toLowerCase().split(/[^a-z0-9.-]+/).filter((w) => w.length > 2 && w !== "pdf");
  const seen = new Set();
  const out = [];
  results.forEach((result, rank) => {
    const host = hostOf(result.url);
    if (!host || SKIP.test(host)) return;
    const kind = kindFromUrl(result.url);
    if (!kind) return;
    let file = "";
    try {
      file = decodeURIComponent(new URL(result.url).pathname.split("/").pop() || "").toLowerCase();
    } catch {
      file = "";
    }
    const key = kind === "page" ? result.url.replace(/[#?].*$/, "") : file || result.url;
    if (seen.has(key)) return;
    seen.add(key);
    const text = `${result.title} ${file}`.toLowerCase();
    const match = words.length ? words.filter((w) => text.includes(w)).length / words.length : 0;
    const fileBonus = kind === "pdf" ? 0.35 : kind === "epub" || kind === "text" ? 0.25 : 0;
    const title = cleanDocTitle(result.title || file || host);
    const tm = titleMatch(title, query);
    out.push({
      url: result.url,
      title,
      site: host,
      format: kind,
      snippet: result.snippet || "",
      vague: isVagueTitle(title),
      volume: volumeOf(title) || volumeOf(file) || null,
      score: authority(result.url) + fileBonus + match * 0.4 - rank * 0.03 + (tm.exact ? 0.5 : tm.all ? 0.2 - Math.min(0.3, tm.extras.length * 0.1) : 0)
    });
  });
  return out.sort((a, b) => b.score - a.score);
}

function prettySize(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return null;
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(bytes >= 10485760 ? 0 : 1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function candidateLine(c) {
  const kind = c.format === "pdf" ? "PDF" : c.format === "epub" ? "EPUB" : c.format === "text" ? "Text" : c.downloadable === false ? "Web page, opens in browser" : "Web page";
  const date = c.modified ? (() => {
    const d = new Date(c.modified);
    return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  })() : null;
  const volume = c.volume ? `Volume ${c.volume} of a multi-volume set` : null;
  return [kind, c.site, prettySize(c.size), volume, date ? `updated ${date}` : null].filter(Boolean).join(" · ");
}

export function findDisclosure(sent, engineName) {
  return `Only the words "${sent}" left this phone, to ${engineName || "a web search"}. Each link was then asked for its type and size by its own address. Nothing downloads until you tap one.`;
}

/**
 * Returns { ok, sent, engine, candidates: [{ id, url, title, site, format, size, modified, tooBig, line }], disclosure, tried, offline, reason }.
 */
export async function findDocuments({ fetchImpl, intent, maxCandidates = MAX_CANDIDATES }) {
  const sent = documentQuery(intent);
  if (typeof fetchImpl !== "function") return { ok: false, offline: true, sent: "", candidates: [], reason: "I'm offline, so I can't search for documents right now. Nothing was sent." };
  const search = await searchWeb({ fetchImpl, query: sent });
  const reached = search.tried.some((t) => t.ok || !/couldn't reach|took too long|No network/i.test(String(t.reason || "")));
  if (!search.ok) {
    return {
      ok: false,
      offline: !reached,
      sent: reached ? sent : "",
      candidates: [],
      tried: search.tried,
      reason: reached ? `I searched for "${sent}" and found no documents. Try other words, like the exact title or number.` : "I couldn't reach the internet, so I can't search for documents right now."
    };
  }
  const strict = isTitleQuery(intent.query, { book: Boolean(intent.book) });
  const ranked = rankDocResults(search.results, intent.query).slice(0, maxCandidates + (strict ? 6 : 2));
  // R14: a catalog item page (loc.gov/item, archive.org/details) is resolved to its real PDF first.
  const resolved = await Promise.all(ranked.map((c) => (catalogItem(c.url) ? resolveItem({ fetchImpl, url: c.url }).catch(() => ({ ok: false })) : null)));
  const heads = await Promise.all(ranked.map((c, i) => guardedHead({ fetchImpl, url: resolved[i]?.ok ? resolved[i].url : c.url, limits: { maxRedirects: DOC_LIMITS.maxRedirects } })));
  const candidates = [];
  ranked.forEach((c, i) => {
    const head = heads[i];
    const res = resolved[i];
    if (head.ok && blockedType(head.type)) return;
    const type = head.ok ? head.type.toLowerCase() : "";
    const url = res?.ok ? res.url : c.url;
    let format = res?.ok ? "pdf" : /pdf/.test(type) ? "pdf" : /epub/.test(type) ? "epub" : /text\/plain/.test(type) ? "text" : /html/.test(type) && c.format === "page" ? "page" : c.format;
    if (res?.ok && head.ok && type && !/pdf|octet-stream/.test(type)) format = "page"; // the "PDF" was not one
    const landing = format === "page" && isLandingPage(c.url);
    const size = head.ok && head.length ? head.length : res?.ok ? res.size : null;
    const volume = res?.volume || c.volume || null;
    const better = res?.title && (c.vague || res.ok || titleMatch(res.title, intent.query).hit >= titleMatch(c.title, intent.query).hit) ? res.title : null;
    const row = {
      id: `cand-${i}-${Math.abs(hashCode(url)).toString(36)}`,
      url,
      pageUrl: res?.ok ? c.url : null,
      title: displayTitle(better || c.title, volume).slice(0, 140),
      site: c.site,
      format,
      size,
      volume,
      downloadable: !landing,
      modified: head.ok ? head.modified : null,
      tooBig: Number.isFinite(size) && size > DOC_LIMITS.maxBytes,
      query: intent.query,
      score: c.score + (res?.ok ? 0.35 : 0)
    };
    row.line = candidateLine(row);
    candidates.push(row);
  });
  const shown = filterByTitle(candidates, intent.query, { strict }).slice(0, maxCandidates);
  return {
    ok: shown.length > 0,
    sent,
    engine: search.engine?.name || null,
    candidates: shown,
    tried: search.tried,
    disclosure: findDisclosure(sent, search.engine ? `${search.engine.name} search` : null),
    reason: shown.length ? null : strict && candidates.length ? `I searched for "${sent}", but none of the results was that book, only books with other titles.` : `I searched for "${sent}" but none of the results were documents I can read.`
  };
}

/**
 * R14: for a named book, keep the results whose title has every key word; an exact or near-exact
 * title first; one with a subject word that was not asked for only when nothing exact was found,
 * and never one with several. Downloadable files before web pages. Topic searches are only re-sorted.
 */
export function filterByTitle(rows, query, { strict = false } = {}) {
  const scored = rows.map((r) => ({ r, m: titleMatch(r.title, query) }));
  let keep = scored;
  if (strict) {
    keep = scored.filter(({ m }) => m.all);
    const anyExact = keep.some(({ m }) => m.extras.length === 0);
    keep = keep.filter(({ m }) => (anyExact ? m.extras.length === 0 : m.extras.length <= 1));
  }
  const rank = ({ r, m }) => (m.exact ? 2 : m.all ? 1 - Math.min(0.9, m.extras.length * 0.3) : 0) + (r.downloadable === false ? -1 : 0) + (r.tooBig ? -0.3 : 0) + (r.score || 0) * 0.1;
  return keep.sort((a, b) => rank(b) - rank(a)).map(({ r }) => r);
}

function hashCode(text) {
  let h = 0;
  for (let i = 0; i < text.length; i += 1) h = (h * 31 + text.charCodeAt(i)) | 0;
  return h;
}

/**
 * Download one tapped candidate. Returns { ok, bytes, format, type, finalUrl } or { ok: false, reason }.
 * fetchBytes is injectable for tests; the default is fetch_guard's capped byte fetch.
 */
export async function downloadDocument({ fetchImpl, candidate, limits = {} }) {
  if (candidate.tooBig) return { ok: false, reason: "That file is over 50 MB, so I won't download it." };
  if (!kindFromUrl(candidate.url)) return { ok: false, reason: "That link isn't a document I can read." };
  if (candidate.downloadable === false || (kindFromUrl(candidate.url) === "page" && isLandingPage(candidate.url))) {
    return { ok: false, reason: "That's a library catalog page, not the book file, and I couldn't find its file. Open it in the browser to see it." };
  }
  const got = await guardedFetch({ fetchImpl, url: candidate.url, group: "open", kind: "doc", limits: { ...DOC_LIMITS, ...limits } });
  if (!got.ok) {
    return { ok: false, reason: /bigger than/.test(got.reason) ? "That file is over 50 MB, so I stopped. Nothing was kept." : got.reason };
  }
  const sniff = sniffDocument(got.bytes, got.type, got.finalUrl || candidate.url);
  if (!sniff.ok) return { ok: false, reason: sniff.reason };
  return { ok: true, bytes: got.bytes, format: sniff.format, type: got.type, finalUrl: got.finalUrl || candidate.url };
}
