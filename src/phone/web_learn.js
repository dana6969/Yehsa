// Learn from the internet: the phone side. A small shared store, like hunt_state, over the sealed web-notes
// vault. Every fetch is the person's own request: a Fetch tap on a saved question, or a live question
// while "Look up live questions" is on. Every answer waits for Keep or Toss before it is used.
// The text it keeps is a quote with its sources. It never changes a rule or a setting.

import { useEffect, useState } from "react";
import { getVector } from "../../symbolic/meaning/vector_cache.js";
import {
  approveWebNote, deleteWebNote, emptyWebStore, forgetAllWeb, keepUnverified, openWebStore, proposeWebNote, quoteNote, setEnabled, webAnswer
} from "../../symbolic/web/web_notes.js";
import { lookupGovPage, lookupWeather, lookupWikipedia, outboundQuery } from "../../symbolic/web/sources.js";
import { attachVectors, noteDocument, notesNeedingVectors, scoreWebNotes } from "../../symbolic/web/web_index.js";
import { editWebNote, keepAnswer, tossAnswer } from "../../symbolic/web/web_notes.js";
import { answerCandidate, markTried, removeQueued, saveForLater } from "../../symbolic/web/lookup_queue.js";
import { lookUp } from "../../symbolic/web/look_up.js";
import { loadAtpPack } from "./atp_pack.js";
import { embedNotes } from "./meaning_provider";
import { webNotesVault } from "./sealed_stores.js";

let state = { loaded: false, foreign: false, store: emptyWebStore() };
let loading = null;
let saving = Promise.resolve();
const listeners = new Set();

function publish(next) {
  state = next;
  for (const listener of listeners) listener(state);
}

export function loadWebLearn() {
  if (!loading) {
    loading = webNotesVault.open().then((opened) => {
      if (opened.status === "foreign") publish({ loaded: true, foreign: true, store: emptyWebStore() });
      else publish({ loaded: true, foreign: false, store: openWebStore(opened.value) });
    }).catch(() => publish({ loaded: true, foreign: false, store: emptyWebStore() }));
  }
  return loading;
}

function commit(store) {
  publish({ ...state, store });
  saving = saving.then(() => webNotesVault.save(store)).catch(() => {});
  return saving;
}

export function useWebLearn() {
  const [snapshot, setSnapshot] = useState(state);
  useEffect(() => {
    listeners.add(setSnapshot);
    loadWebLearn();
    setSnapshot(state);
    return () => listeners.delete(setSnapshot);
  }, []);
  return snapshot;
}

export function webLearnState() {
  return state;
}

async function indexApproved() {
  const pending = notesNeedingVectors(state.store, "bge-small-en-v1.5-int8.onnx");
  if (pending.length === 0) return;
  try {
    const result = await embedNotes(pending.map(noteDocument));
    if (!result) return;
    commit(attachVectors(state.store, pending.map((note, i) => ({ id: note.id, vector: result.vectors[i] })), result.model));
  } catch {
    // The note still answers by words. The meaning vector is an extra.
  }
}

export const webLearn = {
  setEnabled(on) {
    if (state.foreign) return Promise.resolve();
    return commit(setEnabled(state.store, on));
  },
  /** The words that would leave the phone for this question. Shown on the approval card. */
  query(question) {
    return outboundQuery(question);
  },
  async fetchWikipedia(query) {
    const found = await lookupWikipedia({ fetchImpl: globalThis.fetch?.bind(globalThis), query });
    if (!found.ok) return found;
    const proposed = proposeWebNote(state.store, found.candidate);
    if (!proposed.ok) return proposed;
    await commit(proposed.store);
    return { ok: true, note: proposed.note, text: quoteNote(proposed.note) };
  },
  async fetchPage(url) {
    const found = await lookupGovPage({ fetchImpl: globalThis.fetch?.bind(globalThis), url });
    if (!found.ok) return found;
    const proposed = proposeWebNote(state.store, found.candidate);
    if (!proposed.ok) return proposed;
    await commit(proposed.store);
    return { ok: true, note: proposed.note, text: quoteNote(proposed.note) };
  },
  weather(position) {
    return lookupWeather({ fetchImpl: globalThis.fetch?.bind(globalThis), latitude: position?.latitude, longitude: position?.longitude });
  },
  approve(id) {
    const result = approveWebNote(state.store, id);
    if (!result.ok) return Promise.resolve(result);
    return commit(result.store).then(() => {
      indexApproved();
      return { ok: true };
    });
  },
  keep(id) {
    return commit(keepUnverified(state.store, id));
  },
  remove(id) {
    return commit(deleteWebNote(state.store, id));
  },
  forgetAll() {
    return commit(forgetAllWeb(state.store));
  },
  /** Start over when this copy cannot open the original phone's notes. */
  async clearForeign() {
    await webNotesVault.clear();
    loading = null;
    publish({ loaded: true, foreign: false, store: emptyWebStore() });
  },
  /** An answer from kept web notes, only after the local notes had none. Works offline, switch on or off. */
  answer(question) {
    if (!state.store.notes.length) return null;
    const q = getVector(`q:${question}`);
    return webAnswer(state.store, question, { vectorScores: q ? scoreWebNotes(state.store, q) : null });
  },
  /** Save a missed question to Look it up later. Stays on this phone, sealed. */
  saveForLater(question) {
    if (state.foreign) return Promise.resolve({ ok: false, reason: "Saved web notes from another phone can't be opened here." });
    const result = saveForLater(state.store, question);
    if (!result.ok) return Promise.resolve(result);
    return commit(result.store).then(() => ({ ok: true, item: result.item, already: result.already === true }));
  },
  removeQueued(id) {
    return commit(removeQueued(state.store, id));
  },
  /**
   * Look one question up now. queueId: the saved question it came from, if any. The answer waits
   * for Keep or Toss. Returns { ok, note, sent, tried } or { ok: false, reason, offline }.
   */
  async lookUp(question, { queueId = null, homeState = null } = {}) {
    if (state.foreign) return { ok: false, reason: "Saved web notes from another phone can't be opened here." };
    const result = await lookUp({ question, fetchImpl: globalThis.fetch?.bind(globalThis), atpPack: await loadAtpPack(), homeState });
    if (!result.ok) {
      if (queueId) await commit(markTried(state.store, queueId, result.reason));
      return result;
    }
    const proposed = proposeWebNote(state.store, answerCandidate(result.answer, queueId), Date.now(), { requested: true });
    if (!proposed.ok) return proposed;
    // The saved question moves to review: it is answered, waiting for Keep or Toss.
    const next = queueId ? removeQueued(proposed.store, queueId) : proposed.store;
    await commit(next);
    return { ok: true, note: proposed.note, sent: result.sent, tried: result.tried, offline: result.offline };
  },
  fetchQueued(item, options) {
    return this.lookUp(item.question, { ...options, queueId: item.id });
  },
  /** Keep: the answer becomes a learned note and answers offline from now on. */
  keepAnswer(id) {
    const result = keepAnswer(state.store, id);
    if (!result.ok) return Promise.resolve(result);
    return commit(result.store).then(() => {
      if (!result.unverified) indexApproved();
      return { ok: true, note: result.note, unverified: result.unverified === true };
    });
  },
  /** Toss: gone, as if it was never fetched. */
  tossAnswer(id) {
    return commit(tossAnswer(state.store, id));
  },
  edit(id, patch) {
    const result = editWebNote(state.store, id, patch);
    if (!result.ok) return Promise.resolve(result);
    return commit(result.store).then(() => {
      indexApproved();
      return { ok: true };
    });
  },
  saveModelNote(note) {
    const result = proposeWebNote(state.store, note);
    if (!result.ok) return Promise.resolve(result);
    return commit(result.store).then(() => ({ ok: true, note: result.note }));
  }
};
