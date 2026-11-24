// Downloaded documents: the list (catalog) and each document's text (body), as plain data.
// The phone side (src/phone/documents.js) seals both; this file never touches storage or the network.
// Answers come only after Yehsa's own notes miss (or when the question names the document), and
// they are quotes, word for word, with the document title and page. Medical, legal and dose lines
// say "check the source". Document text is data: it never changes a rule, a setting or a reply style.

import { queryTokens, tokenForms } from "../book_search.js";
import { coverage, questionGroups, splitSentences } from "../web/answer_builder.js";
import { looksLikeInstruction, sensitiveKind } from "../web/sanitize.js";
import { ADVICE_LINE, adviceKind } from "../web/web_search.js";
import { sectionRef } from "./doc_sections.js";

export const DOC_VERSION = 1;
export const MAX_DOCS = 60;
export const VECTOR_DIMS = 384;
export const DOC_LICENSE = "Quoted from a document you downloaded. Rights stay with its publisher.";

export function emptyDocCatalog() {
  return { v: DOC_VERSION, docs: [] };
}

export function openDocCatalog(value) {
  if (!value || value.v !== DOC_VERSION || !Array.isArray(value.docs)) return emptyDocCatalog();
  return { v: DOC_VERSION, docs: value.docs.filter((d) => d && typeof d.id === "string") };
}

export function newDocId(now = Date.now(), rand = Math.random) {
  return `doc-${now.toString(36)}-${Math.floor(rand() * 1e9).toString(36)}`;
}

function cleanTitle(text, fallback) {
  const t = String(text || "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);
  if (!t || /^(?:microsoft word - |untitled|document\d*$)/i.test(t) && t.length < 12) return fallback;
  return t.replace(/^Microsoft Word - /i, "").replace(/\.(?:docx?|indd|pdf)$/i, "").trim() || fallback;
}

/** The catalog row for a freshly read document. */
export function docMeta({ id, candidate, read, bytes, format, now = Date.now(), sections }) {
  const site = (() => {
    try {
      return new URL(candidate.url).hostname.replace(/^www\./, "");
    } catch {
      return "";
    }
  })();
  // A PDF's own title is often a file name ("Chapter 1"); the search result title is usually better.
  const ownTitle = cleanTitle(read.title, "");
  const searchTitle = cleanTitle(candidate.title, "");
  const title = (ownTitle.length >= 12 && !/^chapter\s+\d+$/i.test(ownTitle) ? ownTitle : searchTitle || ownTitle) || site || "Downloaded document";
  return {
    id,
    title,
    site,
    url: candidate.url,
    format,
    pageKind: read.pageKind || "page",
    pageCount: read.pages.length,
    bytes,
    sections: sections.length,
    chars: read.pages.reduce((n, p) => n + p.length, 0),
    fetchedAt: new Date(now).toISOString(),
    modified: candidate.modified || null,
    query: String(candidate.query || "").slice(0, 120),
    indexedModel: null
  };
}

export function addDocument(catalog, meta) {
  const docs = [meta, ...catalog.docs.filter((d) => d.id !== meta.id && d.url !== meta.url)];
  return { ...catalog, docs: docs.slice(0, MAX_DOCS) };
}

/** The document already downloaded from this link, if any. */
export function docForUrl(catalog, url) {
  return catalog.docs.find((d) => d.url === url) || null;
}

export function renameDocument(catalog, id, title) {
  const clean = cleanTitle(title, "");
  if (!clean) return { ok: false, reason: "A name needs a few letters." };
  if (!catalog.docs.some((d) => d.id === id)) return { ok: false, reason: "That document is gone." };
  return { ok: true, catalog: { ...catalog, docs: catalog.docs.map((d) => (d.id === id ? { ...d, title: clean, renamed: true } : d)) } };
}

export function deleteDocument(catalog, id) {
  return { ...catalog, docs: catalog.docs.filter((d) => d.id !== id) };
}

export function updateDocument(catalog, id, patch) {
  return { ...catalog, docs: catalog.docs.map((d) => (d.id === id ? { ...d, ...patch } : d)) };
}

// ---------- vectors ----------

function toB64(int8) {
  const u8 = new Uint8Array(int8.buffer, int8.byteOffset, int8.byteLength);
  let raw = "";
  for (let i = 0; i < u8.length; i += 1) raw += String.fromCharCode(u8[i]);
  return typeof btoa === "function" ? btoa(raw) : Buffer.from(u8).toString("base64");
}

function fromB64(text) {
  const raw = typeof atob === "function" ? atob(text) : Buffer.from(text, "base64").toString("latin1");
  const out = new Int8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) out[i] = (raw.charCodeAt(i) << 24) >> 24;
  return out;
}

export function sectionDocument(meta, section) {
  return `${meta.title}${section.heading ? `. ${section.heading}` : ""}: ${section.text.slice(0, 1200)}`;
}

/** Attach meaning vectors (Float32 arrays from the on-device model) to a body, quantized to int8. */
export function attachSectionVectors(body, vectors, model) {
  const out = {};
  body.sections.forEach((section, i) => {
    const v = vectors[i];
    if (!v || v.length !== VECTOR_DIMS) return;
    const q = new Int8Array(VECTOR_DIMS);
    for (let k = 0; k < VECTOR_DIMS; k += 1) q[k] = Math.max(-127, Math.min(127, Math.round(v[k] * 127)));
    out[section.id] = toB64(q);
  });
  return { ...body, vectors: out, model };
}

// ---------- search ----------

const formsCache = new WeakMap();

function sectionForms(section) {
  let set = formsCache.get(section);
  if (!set) {
    set = new Set();
    for (const word of `${section.heading || ""} ${section.text}`.toLowerCase().split(/[^a-z0-9+]+/)) {
      if (word.length < 3) continue;
      for (const form of tokenForms(word)) set.add(form);
    }
    formsCache.set(section, set);
  }
  return set;
}

function coverageOf(set, groups) {
  if (!groups.length) return 0;
  let hit = 0;
  for (const group of groups) if (group.some((token) => tokenForms(token).some((f) => set.has(f)))) hit += 1;
  return hit / groups.length;
}

const decodedCache = new WeakMap();
function vectorOf(body, id) {
  let map = decodedCache.get(body);
  if (!map) {
    map = new Map();
    decodedCache.set(body, map);
  }
  if (!map.has(id)) map.set(id, body.vectors?.[id] ? fromB64(body.vectors[id]) : null);
  return map.get(id);
}

/**
 * entries: [{ meta, body }]. queryVector: a normalized 384-number question vector, or null.
 * Returns the best sections: [{ meta, section, words, sim, score }].
 */
export function searchSections(entries, question, { queryVector = null, limit = 8, onlyDoc = null } = {}) {
  const groups = questionGroups(question);
  if (!groups.length) return [];
  const hits = [];
  for (const { meta, body } of entries) {
    if (!body?.sections) continue;
    if (onlyDoc && meta.id !== onlyDoc) continue;
    for (const section of body.sections) {
      const words = coverageOf(sectionForms(section), groups);
      let sim = null;
      if (queryVector && queryVector.length === VECTOR_DIMS) {
        const row = vectorOf(body, section.id);
        if (row) {
          let dot = 0;
          for (let i = 0; i < VECTOR_DIMS; i += 1) dot += row[i] * queryVector[i];
          sim = dot / 127;
        }
      }
      if (words === 0 && !(sim != null && sim >= 0.62)) continue;
      hits.push({ meta, section, words, sim, score: words + (sim != null ? Math.max(0, sim - 0.45) * 1.5 : 0) });
    }
  }
  hits.sort((a, b) => b.score - a.score);
  return hits.slice(0, limit);
}

/** The document a question names ("in the canning guide", "according to FM 21-76"), or null. */
export function namedDocument(catalog, question) {
  const q = String(question || "").toLowerCase();
  if (!/\b(?:in|from|according to|per|does|says?|within|inside)\b/.test(q)) return null;
  let best = null;
  for (const doc of catalog.docs || []) {
    const words = queryTokens(doc.title).filter((w) => !/^(?:guide|manual|the|pdf|document|book|army|department)$/.test(w));
    if (!words.length) continue;
    const hit = words.filter((w) => q.includes(w)).length;
    const code = /\b([a-z]{1,4}\s?\d{1,3}-\d{1,3}(?:\.\d+)?)\b/i.exec(doc.title)?.[1];
    const codeHit = code && q.replace(/\s+/g, "").includes(code.toLowerCase().replace(/\s+/g, ""));
    const score = codeHit ? 2 : hit / words.length;
    if ((codeHit || (hit >= 2 && score >= 0.5)) && (!best || score > best.score)) best = { id: doc.id, score };
  }
  return best?.id || null;
}

/** "in the canning guide, how long for tomatoes" -> "how long for tomatoes" when the guide is the named document. */
export function withoutDocName(question, meta) {
  const titleWords = new Set(queryTokens(meta?.title || ""));
  let text = String(question || "")
    .replace(/\b(?:in|from|according to|per|within|inside)\s+(?:the|my|that)?\s*/gi, " ")
    .replace(/\b(?:what does|does)\b/gi, " ")
    .replace(/\bsays?\b/gi, " ");
  text = text.split(/(\s+)/).filter((w) => !titleWords.has(w.toLowerCase().replace(/[^a-z0-9.-]/g, "")) && !/^(?:manual|guide|document|pdf|book|handbook)[,.]?$/i.test(w)).join("");
  return text.replace(/^[\s,;:]+/, "").replace(/\s+/g, " ").trim() || question;
}

const DOSE = /\b(?:dose|dosage|dosing|mg|milligrams?|mcg|tablets?|pills?|capsules?|ml|how much (?:\w+ )?(?:to take|should i take))\b/i;

export function docAdvice(question, text) {
  const kind = adviceKind(question);
  const sensitive = sensitiveKind(text, question);
  if (DOSE.test(question) || DOSE.test(text) || sensitive === "dosing") return "Check the source; this is not dosing advice. Confirm any dose with a pharmacist or doctor.";
  if (sensitive === "plant-toxicity") return "Check the source; do not use this alone to decide whether to eat or touch a plant or mushroom.";
  return kind ? ADVICE_LINE[kind] : null;
}

const MAX_QUOTE_CHARS = 650;

/**
 * Quote a passage, not scattered lines: the best sentence with its neighbours from the same
 * section, then (if room) a second passage from another page. Returns { passages } or null.
 */
export function quotePassages(hits, question) {
  const groups = questionGroups(question);
  if (!groups.length) return null;
  const need = groups.length === 1 ? 1 : groups.length >= 4 ? 0.6 : 0.5;
  const scored = [];
  hits.slice(0, 6).forEach((hit, h) => {
    const sents = splitSentences(hit.section.text).filter((x) => !looksLikeInstruction(x));
    // A section headed with the topic ("Bee and Wasp Stings") beats a passing mention elsewhere.
    const headed = hit.section.heading ? coverage(hit.section.heading, groups) * 0.3 : 0;
    // The meaning matcher, when it ran, can carry a passage that says it in other words.
    const lift = hit.sim != null ? Math.max(-0.1, Math.min(0.35, (hit.sim - 0.6) * 1.5)) : 0;
    sents.forEach((sentence, i) => {
      const cov = coverage(sentence, groups);
      if (cov === 0) return;
      const dangling = /(?:--|:|—)\s*$/.test(sentence) ? 0.3 : 0;
      const listy = /^[·•\-*]/.test(sentence) ? 0.15 : 0;
      scored.push({ h, i, sents, hit, cov, eff: cov + (hit.sim != null && hit.sim >= 0.7 ? 0.25 : 0), score: cov + hit.score * 0.35 + headed + lift - dangling - listy - h * 0.02 - i * 0.005 });
    });
  });
  scored.sort((a, b) => b.score - a.score);
  const passages = [];
  let chars = 0;
  for (const best of scored) {
    if (passages.length >= 2) break;
    if (best.eff < need) continue;
    if (passages.some((p) => p.hit.section.id === best.hit.section.id)) continue;
    if (passages.length && best.cov < passages[0].cov) continue;
    let start = best.i;
    if (start > 0 && coverage(best.sents[start - 1], groups) > 0 && !/(?:--|:)\s*$/.test(best.sents[start - 1])) start -= 1;
    const lines = [];
    let len = 0;
    const budget = passages.length ? MAX_QUOTE_CHARS - chars : MAX_QUOTE_CHARS;
    for (let k = start; k < best.sents.length && k <= best.i + 2; k += 1) {
      const line = best.sents[k];
      if (lines.length && len + line.length > budget) break;
      lines.push(line);
      len += line.length + 1;
    }
    // A quote ends on a whole sentence; a line cut off by a column or a table is dropped.
    while (lines.length && !/[.!?]["”')\]]?$/.test(lines[lines.length - 1])) lines.pop();
    len = lines.reduce((n, line) => n + line.length + 1, 0);
    if (!lines.length || (passages.length && len < 60)) continue;
    passages.push({ hit: best.hit, cov: best.cov, text: lines.join(" ") });
    chars += len;
    if (chars > MAX_QUOTE_CHARS * 0.8) break;
  }
  return passages.length ? { passages } : null;
}

/**
 * An answer quoted from downloaded documents, or null. Every sentence is word for word, followed
 * by a [n] that points at the document title and page.
 */
export function docAnswer(entries, question, { queryVector = null, onlyDoc = null } = {}) {
  const hits = searchSections(entries, question, { queryVector, onlyDoc });
  if (!hits.length) return null;
  const quoted = quotePassages(hits, question);
  if (!quoted) return null;
  const citations = [];
  const body = quoted.passages.map((p) => {
    const meta = p.hit.meta;
    const n = citations.length + 1;
    citations.push({
      n,
      sourceId: `doc:${meta.id}`,
      sourceName: meta.title,
      ref: sectionRef(p.hit.section, meta.pageKind),
      title: meta.title,
      url: meta.url,
      page: p.hit.section.page,
      docId: meta.id,
      license: DOC_LICENSE,
      fetchedAt: meta.fetchedAt
    });
    return `${p.text.replace(/\s*$/, "")} [${n}]`;
  }).join(" ");
  const doc = quoted.passages[0].hit.meta;
  const advice = docAdvice(question, body);
  const cites = citations.map((c) => `[${c.n}] "${c.sourceName}", ${c.ref}. ${c.url}`).join("\n");
  const opener = `From downloaded document "${doc.title}":`;
  const unverified = "Unverified: quoted from a document you downloaded. Yehsa has not checked it.";
  const tail = advice ? `${advice} ${unverified}` : unverified;
  return {
    answered: true,
    voiced: true,
    opener,
    sections: [
      { title: null, text: body },
      { title: "Sources", text: cites },
      { title: null, text: tail }
    ],
    text: `${opener}\n\n${body}\n\nSources:\n${cites}\n\n${tail}`,
    kind: "document",
    offerDomain: "document",
    symbol: null,
    source: `Downloaded document: ${doc.title}`,
    docId: doc.id,
    citations,
    advice: advice || null,
    confident: false
  };
}
