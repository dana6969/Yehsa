// Saved property lines on the phone: one small JSON file per map cell, plus an index of when each
// was last used (so the oldest are dropped first). Lines only; no owner data ever reaches here.

import * as FileSystem from "expo-file-system";
import { createParcelCache } from "../../symbolic/parcels.js";

const DIR = `${FileSystem.documentDirectory}yehsa-parcels/`;
const INDEX = `${DIR}index.json`;
const safe = (key) => String(key).replace(/[^A-Za-z0-9-]/g, "_");

let index = null;
let saveTimer = null;

async function loadIndex() {
  if (index) return index;
  await FileSystem.makeDirectoryAsync(DIR, { intermediates: true }).catch(() => {});
  try {
    index = JSON.parse(await FileSystem.readAsStringAsync(INDEX)) || {};
  } catch {
    index = {};
  }
  return index;
}

function saveIndexSoon() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    FileSystem.writeAsStringAsync(INDEX, JSON.stringify(index || {})).catch(() => {});
  }, 1500);
}

const memo = new Map(); // key -> entry, the few cells on screen

export const parcelStorage = {
  async get(key) {
    await loadIndex();
    if (!index[key]) return null;
    if (memo.has(key)) return memo.get(key);
    try {
      const entry = JSON.parse(await FileSystem.readAsStringAsync(`${DIR}${safe(key)}.json`));
      if (memo.size > 24) memo.delete(memo.keys().next().value);
      memo.set(key, entry);
      return entry;
    } catch {
      delete index[key];
      saveIndexSoon();
      return null;
    }
  },
  async put(key, entry) {
    await loadIndex();
    const known = index[key];
    // Touching usedAt only updates the index; the lines file is written when the lines change.
    if (!known || known.fetchedAt !== entry.fetchedAt) {
      await FileSystem.writeAsStringAsync(`${DIR}${safe(key)}.json`, JSON.stringify(entry));
    }
    memo.set(key, entry);
    index[key] = { usedAt: entry.usedAt || Date.now(), fetchedAt: entry.fetchedAt };
    saveIndexSoon();
  },
  async list() {
    await loadIndex();
    return Object.entries(index).map(([key, v]) => ({ key, usedAt: v.usedAt || 0 }));
  },
  async remove(key) {
    await loadIndex();
    delete index[key];
    memo.delete(key);
    await FileSystem.deleteAsync(`${DIR}${safe(key)}.json`, { idempotent: true }).catch(() => {});
    saveIndexSoon();
  },
  async clear() {
    index = {};
    memo.clear();
    await FileSystem.deleteAsync(DIR, { idempotent: true }).catch(() => {});
  }
};

export const parcelCache = createParcelCache(parcelStorage);
export const parcelsSupported = true;
