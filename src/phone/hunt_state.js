// One small shared store for hunting mode: the barometer log, saved weather, wind entry,
// ballistics numbers, kit, and the private data (sightings, family card, party, stands).
// Private data is sealed with a key held in the phone's secure store before it is written.
// Everything stays on this phone.

import { useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import "./install_prng.js";
import { keyFromText, keyToText, newKey, open as openBox, seal } from "../../symbolic/hunt/secure_box.js";
import { emptyLog as emptyBaro } from "../../symbolic/hunt/baro.js";
import { emptyLog as emptySightings } from "../../symbolic/hunt/sightings.js";
import { emptyKit, emptyFamily } from "../../symbolic/hunt/kit.js";
import { emptyRoster } from "../../symbolic/hunt/party.js";

const KEY_NAME = "yehsa.hunt.key.v1";
const SEALED = new Set(["sightings", "family", "roster", "spots"]);

export const DEFAULTS = {
  baro: emptyBaro(),
  baroOn: false,
  saved: null,
  wxNotes: [],
  wind: { fromPoint: "", speedClass: "light", swirling: false, source: "manual" },
  manual: { tempF: "", precip: "", windMph: "" },
  ballistics: { preset: "308", grains: "150", bc: "0.294", fps: "2820", sightIn: "1.5", zeroYd: "100", windMph: "10", windClock: "3", tempF: "", altitudeFt: "" },
  legal: { state: "", species: "deer" },
  huntPressure: "normal",
  kit: emptyKit(),
  sightings: emptySightings(),
  family: emptyFamily(),
  roster: emptyRoster(),
  spots: { stands: [], avoid: [] }
};

let state = { ...DEFAULTS, loaded: false };
let loading = null;
const listeners = new Set();

async function keyBytes() {
  let text = null;
  try {
    text = await SecureStore.getItemAsync(KEY_NAME, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
  } catch {
    // The browser preview has no secure store. It falls back below.
  }
  let key = keyFromText(text);
  if (key) return key;
  key = newKey();
  try {
    await SecureStore.setItemAsync(KEY_NAME, keyToText(key), { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
  } catch {
    const fallback = await AsyncStorage.getItem(KEY_NAME).catch(() => null);
    const parsed = keyFromText(fallback);
    if (parsed) return parsed;
    await AsyncStorage.setItem(KEY_NAME, keyToText(key)).catch(() => {});
  }
  return key;
}

async function readOne(name) {
  const raw = await AsyncStorage.getItem(`yehsa.hunt.${name}`).catch(() => null);
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw);
    if (!SEALED.has(name)) return parsed;
    return openBox(parsed, await keyBytes()) ?? undefined;
  } catch {
    return undefined;
  }
}

async function writeOne(name, value) {
  const body = SEALED.has(name) ? seal(value, await keyBytes()) : value;
  await AsyncStorage.setItem(`yehsa.hunt.${name}`, JSON.stringify(body)).catch(() => {});
}

export function loadHunt() {
  if (loading) return loading;
  loading = (async () => {
    const next = { ...state };
    for (const name of Object.keys(DEFAULTS)) {
      const value = await readOne(name);
      if (value !== undefined && value !== null) next[name] = value;
    }
    state = { ...next, loaded: true };
    listeners.forEach((listener) => listener(state));
    return state;
  })();
  return loading;
}

export function getHunt() {
  return state;
}

export function setHunt(name, value) {
  const resolved = typeof value === "function" ? value(state[name]) : value;
  state = { ...state, [name]: resolved };
  listeners.forEach((listener) => listener(state));
  writeOne(name, resolved);
  return resolved;
}

export function useHunt() {
  const [snapshot, setSnapshot] = useState(state);
  useEffect(() => {
    listeners.add(setSnapshot);
    loadHunt();
    setSnapshot(state);
    return () => { listeners.delete(setSnapshot); };
  }, []);
  return snapshot;
}
