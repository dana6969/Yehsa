// Offline area storage on the phone. Files live in the app's private document folder.
// Nothing here opens a network connection.

import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system";

const LIST_KEY = "yehsa.areas.v1";
const ROOT = `${FileSystem.documentDirectory}yehsa-areas/`;

function base64(bytes) {
  let binary = "";
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) binary += String.fromCharCode(...bytes.subarray(i, i + step));
  return globalThis.btoa(binary);
}

function unbase64(text) {
  const binary = globalThis.atob(text);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

function safe(part) {
  return String(part).replace(/[^a-zA-Z0-9._-]/g, "_");
}

function pathFor(areaId, key) {
  return `${ROOT}${safe(areaId)}/${safe(key.replace(/[:/]/g, "-"))}.png`;
}

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
  const dir = `${ROOT}${safe(areaId)}/`;
  await FileSystem.makeDirectoryAsync(dir, { intermediates: true }).catch(() => {});
  await FileSystem.writeAsStringAsync(pathFor(areaId, key), base64(bytes), { encoding: FileSystem.EncodingType.Base64 });
}

export async function readTile(areaId, key) {
  try {
    const text = await FileSystem.readAsStringAsync(pathFor(areaId, key), { encoding: FileSystem.EncodingType.Base64 });
    return unbase64(text);
  } catch {
    return null;
  }
}

export async function removeArea(areaId) {
  await FileSystem.deleteAsync(`${ROOT}${safe(areaId)}/`, { idempotent: true });
}

export async function freeBytes() {
  try {
    return await FileSystem.getFreeDiskStorageAsync();
  } catch {
    return null;
  }
}

export const storageNote = "Stored in Yehsa's own folder on this phone. Nothing is uploaded.";
