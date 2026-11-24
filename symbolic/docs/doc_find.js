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
    out.push({
      url: result.url,
      title: result.title || file || host,
      site: host,
      format: kind,
      snippet: result.snippet || "",
      score: authority(result.url) + fileBonus + match * 0.4 - rank * 0.03
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
  const kind = c.format === "pdf" ? "PDF" : c.format === "epub" ? "EPUB" : c.format === "text" ? "Text" : "Web page";
  const date = c.modified ? (() => {
    const d = new Date(c.modified);
    return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  })() : null;
  return [kind, c.site, prettySize(c.size), date ? `updated ${date}` : null].filter(Boolean).join(" · ");
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
  const ranked = rankDocResults(search.results, intent.query).slice(0, maxCandidates + 2);
  const heads = await Promise.all(ranked.map((c) => guardedHead({ fetchImpl, url: c.url, limits: { maxRedirects: DOC_LIMITS.maxRedirects } })));
  const candidates = [];
  ranked.forEach((c, i) => {
    const head = heads[i];
    if (head.ok && blockedType(head.type)) return;
    const type = head.ok ? head.type.toLowerCase() : "";
    const format = /pdf/.test(type) ? "pdf" : /epub/.test(type) ? "epub" : /text\/plain/.test(type) ? "text" : /html/.test(type) && c.format === "page" ? "page" : c.format;
    const size = head.ok ? head.length : null;
    const row = {
      id: `cand-${i}-${Math.abs(hashCode(c.url)).toString(36)}`,
      url: c.url,
      title: c.title.slice(0, 140),
      site: c.site,
      format,
      size,
      modified: head.ok ? head.modified : null,
      tooBig: Number.isFinite(size) && size > DOC_LIMITS.maxBytes,
      query: intent.query
    };
    row.line = candidateLine(row);
    candidates.push(row);
  });
  const shown = candidates.slice(0, maxCandidates);
  return {
    ok: shown.length > 0,
    sent,
    engine: search.engine?.name || null,
    candidates: shown,
    tried: search.tried,
    disclosure: findDisclosure(sent, search.engine ? `${search.engine.name} search` : null),
    reason: shown.length ? null : `I searched for "${sent}" but none of the results were documents I can read.`
  };
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
  const got = await guardedFetch({ fetchImpl, url: candidate.url, group: "open", kind: "doc", limits: { ...DOC_LIMITS, ...limits } });
  if (!got.ok) {
    return { ok: false, reason: /bigger than/.test(got.reason) ? "That file is over 50 MB, so I stopped. Nothing was kept." : got.reason };
  }
  const sniff = sniffDocument(got.bytes, got.type, got.finalUrl || candidate.url);
  if (!sniff.ok) return { ok: false, reason: sniff.reason };
  return { ok: true, bytes: got.bytes, format: sniff.format, type: got.type, finalUrl: got.finalUrl || candidate.url };
}
