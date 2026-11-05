// Bind this Expo install to this device. Storage is the shell's, not the Termux owner file.
// A copied record that does not match this device is left in place and denied.

import { PHONE_ID_RE, evaluateOwner, randomDeviceId } from "../../symbolic/owner_bind.js";

export const INSTALL_KEY = "yehsa.install_device_id";
export const OWNER_KEY = "yehsa.device_owner.v1";

export function memoryStore(seed = new Map()) {
  return {
    async get(key) {
      return seed.has(key) ? seed.get(key) : null;
    },
    async set(key, value) {
      seed.set(key, String(value));
    }
  };
}

export function webStore() {
  return {
    async get(key) {
      try {
        return globalThis.localStorage?.getItem(key) ?? null;
      } catch {
        return null;
      }
    },
    async set(key, value) {
      globalThis.localStorage.setItem(key, String(value));
    }
  };
}

export async function defaultOwnerStore() {
  if (typeof globalThis.localStorage !== "undefined" && globalThis.localStorage) return webStore();
  try {
    const mod = await import("@react-native-async-storage/async-storage");
    const AsyncStorage = mod.default;
    if (AsyncStorage?.getItem && AsyncStorage?.setItem) {
      return {
        async get(key) {
          return AsyncStorage.getItem(key);
        },
        async set(key, value) {
          await AsyncStorage.setItem(key, String(value));
        }
      };
    }
  } catch {
    // The native storage package is absent. The bind lasts for this session only.
  }
  return memoryStore();
}

async function platformPhone() {
  const bridge = globalThis.__YEHSA_PLATFORM__;
  if (typeof bridge?.phoneId === "string" && PHONE_ID_RE.test(bridge.phoneId)) {
    const source = bridge.phoneSource === "ios-vendor" || bridge.phoneSource === "expo-install"
      ? bridge.phoneSource
      : "android-id";
    return { id: bridge.phoneId, source };
  }
  try {
    const Application = await import("expo-application");
    const androidId = typeof Application.getAndroidId === "function"
      ? Application.getAndroidId()
      : Application.androidId;
    if (typeof androidId === "string" && PHONE_ID_RE.test(androidId) && androidId.toLowerCase() !== "null") {
      return { id: androidId, source: "android-id" };
    }
    if (typeof Application.getIosIdForVendorAsync === "function") {
      const ios = await Application.getIosIdForVendorAsync();
      const compact = String(ios || "").replace(/-/g, "");
      if (PHONE_ID_RE.test(compact)) return { id: compact, source: "ios-vendor" };
    }
  } catch {
    // Expo Application is not in this runtime.
  }
  return null;
}

function parseRecord(raw) {
  if (!raw || typeof raw !== "string") return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function bindThisInstall(store) {
  const box = store || await defaultOwnerStore();
  let phone = await platformPhone();
  if (!phone) {
    let id = await box.get(INSTALL_KEY);
    if (typeof id !== "string" || !PHONE_ID_RE.test(id)) {
      id = randomDeviceId();
      if (id) await box.set(INSTALL_KEY, id);
    }
    phone = id && PHONE_ID_RE.test(id) ? { id, source: "expo-install" } : null;
  }
  const stored = parseRecord(await box.get(OWNER_KEY));
  const decision = evaluateOwner({ phone, stored, now: new Date().toISOString() });
  if (decision.write && decision.record) {
    await box.set(OWNER_KEY, JSON.stringify(decision.record));
  }
  return decision;
}
