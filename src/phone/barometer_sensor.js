// Reads the phone's pressure sensor (Android TYPE_PRESSURE) through expo-sensors. Returns hPa,
// or null when this phone has no barometer. It reads once on demand and never records on its own.

import { Barometer } from "expo-sensors";

export async function hasBarometer() {
  try {
    return await Barometer.isAvailableAsync();
  } catch {
    return false;
  }
}

export function readPressureOnce(timeoutMs = 4000) {
  return new Promise((resolve) => {
    let done = false;
    let subscription = null;
    const finish = (value) => {
      if (done) return;
      done = true;
      try { subscription?.remove(); } catch {}
      resolve(value);
    };
    try {
      Barometer.setUpdateInterval(500);
      subscription = Barometer.addListener((data) => {
        const hpa = Number(data?.pressure);
        finish(Number.isFinite(hpa) ? hpa : null);
      });
    } catch {
      finish(null);
    }
    setTimeout(() => finish(null), timeoutMs);
  });
}
