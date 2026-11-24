// Learn from the internet: the phone side. A small shared store, like hunt_state, over the sealed web-notes
// vault. Nothing here runs unless the person turned the switch on, and every fetch is its own approved request.
// The text it keeps is a quote with its source. It never changes a rule or a setting.

import { useEffect, useState } from "react";
import { getVector } from "../../symbolic/meaning/vector_cache.js";
import {
  approveWebNote, deleteWebNote, emptyWebStore, forgetAllWeb, keepUnverified, openWebStore, proposeWebNote, quoteNote, setEnabled, webAnswer
} from "../../symbolic/web/web_notes.js";
import { lookupGovPage, lookupWeather, lookupWikipedia, outboundQuery } from "../../symbolic/web/sources.js";
import { attachVectors, noteDocument, notesNeedingVectors, scoreWebNotes } from "../../symbolic/web/web_index.js";
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
  /** An answer from approved or kept web notes, only after the local notes had none. */
  answer(question) {
    if (!state.store.enabled) return null;
    const q = getVector(`q:${question}`);
    return webAnswer(state.store, question, { vectorScores: q ? scoreWebNotes(state.store, q) : null });
  },
  saveModelNote(note) {
    const result = proposeWebNote(state.store, note);
    if (!result.ok) return Promise.resolve(result);
    return commit(result.store).then(() => ({ ok: true, note: result.note }));
  }
};
