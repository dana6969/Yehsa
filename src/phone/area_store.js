// Offline area storage for web and tests: tiles in memory, the list in AsyncStorage.
// The phone build uses area_store.native.js, which writes files under the app's own folder.

import AsyncStorage from "@react-native-async-storage/async-storage";

const LIST_KEY = "yehsa.areas.v1";
const tiles = new Map();

export async function loadAreas() {
  try {
    const raw = await AsyncStorage.getItem(LIST_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export async function saveAreas(list) {
  await AsyncStorage.setItem(LIST_KEY, JSON.stringify(list || []));
}

export async function saveTile(areaId, key, bytes) {
  tiles.set(`${areaId}|${key}`, bytes);
}

export async function readTile(areaId, key) {
  return tiles.get(`${areaId}|${key}`) || null;
}

const renders = new Map();

export async function saveRender(areaId, z, x, y, bytes) {
  renders.set(`${areaId}|${z}/${x}/${y}`, bytes);
}

export async function readRender(areaId, z, x, y) {
  return renders.get(`${areaId}|${z}/${x}/${y}`) || null;
}

export async function sweepAreas() {}

export async function removeArea(areaId) {
  for (const key of [...renders.keys()]) {
    if (key.startsWith(`${areaId}|`)) renders.delete(key);
  }
  for (const key of [...tiles.keys()]) {
    if (key.startsWith(`${areaId}|`)) tiles.delete(key);
  }
}

export async function freeBytes() {
  return null;
}

export const storageNote = "On the web preview, tiles are kept for this session only.";
