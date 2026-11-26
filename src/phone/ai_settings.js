// Yehsa AI (on-device) on/off, kept on this phone. On by default: the model is bundled and free,
// and low-RAM phones skip it automatically. Nothing about this setting leaves the phone.
import AsyncStorage from "@react-native-async-storage/async-storage";

export const AI_SETTINGS_KEY = "yehsa.ai.v1";
export const DEFAULT_AI_SETTINGS = Object.freeze({ enabled: true, useWebQuotes: true });

export function parseAiSettings(raw) {
  try {
    const v = JSON.parse(raw || "null");
    if (!v || typeof v !== "object") return { ...DEFAULT_AI_SETTINGS };
    return { enabled: v.enabled !== false, useWebQuotes: v.useWebQuotes !== false };
  } catch {
    return { ...DEFAULT_AI_SETTINGS };
  }
}

export async function loadAiSettings() {
  try { return parseAiSettings(await AsyncStorage.getItem(AI_SETTINGS_KEY)); } catch { return { ...DEFAULT_AI_SETTINGS }; }
}

export async function saveAiSettings(settings) {
  const clean = parseAiSettings(JSON.stringify(settings));
  try { await AsyncStorage.setItem(AI_SETTINGS_KEY, JSON.stringify(clean)); } catch {}
  return clean;
}

// One in-memory copy shared by the Ask screen and More > Yehsa AI, so a toggle applies at once.
let current = { ...DEFAULT_AI_SETTINGS };
let loaded = null;
const listeners = new Set();

export function currentAiSettings() {
  return current;
}

export function ensureAiSettings() {
  if (!loaded) loaded = loadAiSettings().then((s) => { current = s; listeners.forEach((l) => l(current)); return s; });
  return loaded;
}

export function subscribeAiSettings(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setAiSettings(patch) {
  current = parseAiSettings(JSON.stringify({ ...current, ...patch }));
  listeners.forEach((l) => l(current));
  saveAiSettings(current).catch(() => {});
  return current;
}
