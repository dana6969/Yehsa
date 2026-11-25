// Downloaded documents as one service: find, download, read, index, answer, rename, delete,
// re-index. Storage, the network and the meaning model are passed in, so this runs the same in
// tests (mocked fetch, memory storage) and on the phone (sealed files, onnx model).
//
// Storage: the catalog and each document body are sealed with one key from the platform secure
// store (tweetnacl secretbox, the same sealing as Learned-from-the-web notes). The downloaded file
// itself is never kept: its text is read on the phone, sealed, and the raw bytes are dropped.
// Nothing here is imported by getMappedAction.

import { sealJson, openJson } from "../sealed_vault.js";
import { b64, unb64 } from "../online/codec.js";
import { downloadDocument, findDocuments } from "./doc_find.js";
import { buildSections } from "./doc_sections.js";
import {
  addDocument, attachSectionVectors, deleteDocument, docAnswer, docForUrl, docMeta, emptyDocCatalog,
  namedDocument, newDocId, openDocCatalog, renameDocument, sectionDocument, updateDocument, withoutDocName
} from "./doc_store.js";
import { documentText } from "./doc_text.js";
import { documentSectionAnswer } from "./section_answer.js";

export const MAX_VECTOR_SECTIONS = 1500;

/**
 * io: {
 *   getSecret(name), setSecret(name, value), deleteSecret(name) -- the sealing key (platform secure store)
 *   readFile(name), writeFile(name, text), deleteFile(name) -- sealed JSON blobs in app storage
 *   fetchImpl                                           -- network, or null when offline
 *   embed(texts) -> { model, vectors } | null           -- on-device meaning model, optional
 *   randomBytes(n)                                      -- for the key
 * }
 */
export function createDocService(io) {
  let catalog = emptyDocCatalog();
  let loaded = null;
  let foreign = false;
  const bodies = new Map(); // id -> body (pages, sections, vectors)
  const indexing = new Map(); // id -> { done, total, phase }
  const listeners = new Set();
  let key = null;

  const emit = () => {
    for (const fn of listeners) fn(snapshot());
  };
  const snapshot = () => ({ loaded: loaded != null, foreign, catalog, indexing: Object.fromEntries(indexing) });

  async function sealingKey(create) {
    if (key) return key;
    const raw = await io.getSecret("key.v1");
    const value = typeof raw === "string" ? raw : raw?.value;
    if (value) {
      key = unb64(value);
      return key;
    }
    if (!create) return null;
    key = io.randomBytes(32);
    await io.setSecret("key.v1", b64(key));
    return key;
  }

  async function writeSealed(name, value) {
    const k = await sealingKey(true);
    await io.writeFile(name, JSON.stringify(sealJson(value, k)));
  }

  async function readSealed(name) {
    const text = await io.readFile(name);
    if (!text) return { status: "empty", value: null };
    const k = await sealingKey(false);
    if (!k) return { status: "foreign", value: null };
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      return { status: "foreign", value: null };
    }
    const value = openJson(parsed, k);
    return value == null ? { status: "foreign", value: null } : { status: "ok", value };
  }

  function load() {
    if (!loaded) {
      loaded = (async () => {
        try {
          const got = await readSealed("catalog.v1");
          if (got.status === "foreign") foreign = true;
          catalog = openDocCatalog(got.value);
        } catch {
          catalog = emptyDocCatalog();
        }
        emit();
      })();
    }
    return loaded;
  }

  async function saveCatalog(next) {
    catalog = next;
    emit();
    await writeSealed("catalog.v1", catalog);
  }

  async function body(id) {
    if (bodies.has(id)) return bodies.get(id);
    const got = await readSealed(`doc-${id}.v1`);
    const value = got.status === "ok" ? got.value : null;
    if (value) bodies.set(id, value);
    return value;
  }

  async function saveBody(id, value) {
    bodies.set(id, value);
    await writeSealed(`doc-${id}.v1`, value);
  }

  async function indexVectors(id) {
    if (typeof io.embed !== "function") return false;
    const meta = catalog.docs.find((d) => d.id === id);
    const b = await body(id);
    if (!meta || !b?.sections?.length) return false;
    const sections = b.sections.slice(0, MAX_VECTOR_SECTIONS);
    const vectors = [];
    let model = null;
    const step = 16;
    for (let i = 0; i < sections.length; i += step) {
      indexing.set(id, { phase: "meaning", done: i, total: sections.length });
      emit();
      // eslint-disable-next-line no-await-in-loop
      const got = await io.embed(sections.slice(i, i + step).map((s) => sectionDocument(meta, s)));
      if (!got?.vectors) {
        indexing.delete(id);
        emit();
        return false; // no model on this phone: answers still work by words
      }
      model = got.model;
      vectors.push(...got.vectors);
      if (!catalog.docs.some((d) => d.id === id)) {
        indexing.delete(id);
        emit();
        return false; // deleted while indexing
      }
    }
    const next = attachSectionVectors({ ...b, sections: b.sections }, vectors, model);
    await saveBody(id, next);
    indexing.delete(id);
    await saveCatalog(updateDocument(catalog, id, { indexedModel: model }));
    return true;
  }

  async function allEntries(onlyDoc = null) {
    const out = [];
    for (const meta of catalog.docs) {
      if (onlyDoc && meta.id !== onlyDoc) continue;
      // eslint-disable-next-line no-await-in-loop
      const b = await body(meta.id);
      if (b) out.push({ meta, body: b });
    }
    return out;
  }

  return {
    load,
    snapshot,
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    /** Search the web for documents. Nothing downloads. */
    async find(intent) {
      return findDocuments({ fetchImpl: io.fetchImpl, intent });
    },
    /**
     * Download, read and index one candidate. onStep({ phase, done, total }).
     * Returns { ok, meta, already } or { ok: false, reason }.
     */
    async download(candidate, { onStep = null, now = Date.now() } = {}) {
      await load();
      if (foreign) return { ok: false, reason: "Documents saved on another phone can't be opened here. Start fresh under Me, Learned." };
      const existing = docForUrl(catalog, candidate.url);
      if (existing && bodies.has(existing.id)) return { ok: true, meta: existing, already: true };
      onStep?.({ phase: "download" });
      const got = await downloadDocument({ fetchImpl: io.fetchImpl, candidate });
      if (!got.ok) return got;
      onStep?.({ phase: "read", done: 0, total: 0 });
      const read = await documentText(got.bytes, got.format, { onProgress: (done, total) => onStep?.({ phase: "read", done, total }) });
      if (!read.ok) return { ok: false, reason: read.reason };
      const sections = buildSections(read.pages);
      if (!sections.length) return { ok: false, reason: "I downloaded it, but there was no readable text to learn from. Nothing was kept." };
      const id = existing?.id || newDocId(now);
      const meta = docMeta({ id, candidate: { ...candidate, url: candidate.url }, read, bytes: got.bytes.length, format: got.format, now, sections });
      await saveBody(id, { pages: read.pages, sections, outline: Array.isArray(read.outline) ? read.outline : [], vectors: null, model: null });
      await saveCatalog(addDocument(catalog, meta));
      onStep?.({ phase: "saved" });
      // Meaning vectors after the save, in the background. Answers work by words meanwhile.
      const vectorsDone = indexVectors(id).catch(() => false);
      return { ok: true, meta, vectorsDone };
    },
    /** A quoted answer from the documents, or null. Only after the notes missed, or when the question names a document. */
    async answer(question, { queryVector = null, notesAnswered = false } = {}) {
      await load();
      if (!catalog.docs.length) return null;
      const named = namedDocument(catalog, question);
      if (notesAnswered && !named) return null;
      const entries = await allEntries(named);
      if (named) {
        const meta = catalog.docs.find((d) => d.id === named);
        return docAnswer(entries, withoutDocName(question, meta), { onlyDoc: named }) || docAnswer(entries, question, { queryVector, onlyDoc: named });
      }
      return docAnswer(entries, question, { queryVector });
    },
    names(question) {
      return namedDocument(catalog, question);
    },
    /** R10: the exact part a question names ("second amendment", "section 3 of the canning guide"), or null. */
    async section(question, { constitutionPages = null } = {}) {
      await load();
      const named = catalog.docs.length ? namedDocument(catalog, question) : null;
      const entries = catalog.docs.length ? await allEntries(named) : [];
      return documentSectionAnswer(question, { entries, named, constitutionPages });
    },
    async pages(id) {
      const b = await body(id);
      return b?.pages || null;
    },
    /** The whole sealed body (pages, sections, outline) for the reader and document answers. */
    async body(id) {
      await load();
      return body(id);
    },
    async rename(id, title) {
      const result = renameDocument(catalog, id, title);
      if (!result.ok) return result;
      await saveCatalog(result.catalog);
      return { ok: true };
    },
    async remove(id) {
      bodies.delete(id);
      indexing.delete(id);
      await saveCatalog(deleteDocument(catalog, id));
      try {
        await io.deleteFile(`doc-${id}.v1`);
      } catch {
        // Already gone.
      }
      return { ok: true };
    },
    /** Rebuild sections from the kept text, then the meaning vectors. */
    async reindex(id) {
      const b = await body(id);
      if (!b?.pages) return { ok: false, reason: "That document's text is missing. Download it again from its link." };
      indexing.set(id, { phase: "sections", done: 0, total: 0 });
      emit();
      const sections = buildSections(b.pages);
      await saveBody(id, { pages: b.pages, sections, outline: b.outline || [], vectors: null, model: null });
      await saveCatalog(updateDocument(catalog, id, { sections: sections.length, indexedModel: null }));
      indexing.delete(id);
      emit();
      const vectorsDone = indexVectors(id).catch(() => false);
      return { ok: true, sections: sections.length, vectorsDone };
    },
    /** Start over when the sealed documents came from another phone. */
    async clearForeign() {
      for (const meta of catalog.docs) {
        // eslint-disable-next-line no-await-in-loop
        try { await io.deleteFile(`doc-${meta.id}.v1`); } catch { /* gone */ }
      }
      try { await io.deleteFile("catalog.v1"); } catch { /* gone */ }
      try { await io.deleteSecret?.("key.v1"); } catch { /* gone */ }
      key = null;
      foreign = false;
      catalog = emptyDocCatalog();
      bodies.clear();
      emit();
    }
  };
}
