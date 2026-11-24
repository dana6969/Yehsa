// The map look (Standard, Terrain, Simple, Night) is saved on the phone, so Terrain shading
// stays on after a restart. Pure: the caller passes the storage.
import { MAP_STYLES } from "./map_layers.js";

export const MAP_STYLE_KEY = "yehsa.mapStyle.v1";
const IDS = new Set(MAP_STYLES.map((s) => s.id));

export function readMapStyle(raw) {
  try {
    const value = raw ? JSON.parse(raw) : null;
    return value && IDS.has(value.style) ? value.style : "standard";
  } catch {
    return "standard";
  }
}

export function writeMapStyle(style) {
  return JSON.stringify({ style: IDS.has(style) ? style : "standard" });
}

export async function loadMapStyle(storage) {
  try {
    return readMapStyle(await storage.getItem(MAP_STYLE_KEY));
  } catch {
    return "standard";
  }
}

export async function saveMapStyle(storage, style) {
  try {
    await storage.setItem(MAP_STYLE_KEY, writeMapStyle(style));
  } catch {
    // Not saved this time; the map still shows it.
  }
}
