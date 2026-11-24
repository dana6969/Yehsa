// Web preview and node: property lines are kept in memory only (the Android app saves them).
import { createParcelCache } from "../../symbolic/parcels.js";

const map = new Map();
export const parcelStorage = {
  async get(key) { return map.get(key) || null; },
  async put(key, entry) { map.set(key, entry); },
  async list() { return [...map.entries()].map(([key, v]) => ({ key, usedAt: v.usedAt || 0 })); },
  async remove(key) { map.delete(key); },
  async clear() { map.clear(); }
};
export const parcelCache = createParcelCache(parcelStorage);
export const parcelsSupported = false;
