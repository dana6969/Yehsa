// Location probe for the Expo shell.
// termux-location wins when a bridge is present. Otherwise Expo Location.
// This file does not read a fix until readPlatformFix() is called.
// Nothing here runs at launch, and a coarse reading is not stored.

import { gpsWatchPlan } from "../../symbolic/gps_map.js";
import { chooseLocationRoute } from "../../symbolic/position_adapter.js";
import { parseTermuxGps, pickAccurateSample } from "../../symbolic/position_fix.js";

const WATCH_MS = 12000;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readExpoFix(Location) {
  const perm = await Location.requestForegroundPermissionsAsync();
  if (perm?.status !== "granted") {
    return { route: "expo-location", fix: null, reason: "Expo Location permission was not granted. No fix was stored." };
  }
  if (typeof Location.hasServicesEnabledAsync === "function") {
    const enabled = await Location.hasServicesEnabledAsync();
    if (enabled === false) {
      return { route: "expo-location", fix: null, reason: "Location services are off on this device. No fix was stored." };
    }
  }
  const accuracy = Location.Accuracy?.BestForNavigation ?? Location.Accuracy?.Highest ?? 6;
  const options = { accuracy, mayShowUserSettingsDialog: true };
  const samples = [];
  const take = (pos) => {
    if (pos?.coords) samples.push(pos.coords);
  };
  try {
    take(await Location.getCurrentPositionAsync(options));
  } catch {
    // One failed read is not a stored fix. The watch below is the second try on this tap.
  }
  if (pickAccurateSample(samples).fix) {
    return { route: "expo-location", fix: pickAccurateSample(samples).fix };
  }
  if (typeof Location.watchPositionAsync === "function") {
    let subscription = null;
    try {
      subscription = await Location.watchPositionAsync(options, (pos) => take(pos));
      const started = Date.now();
      while (Date.now() - started < WATCH_MS) {
        if (pickAccurateSample(samples).fix) break;
        await delay(400);
      }
    } catch {
      // The watch did not start. Stopping it is not a stored fix.
    } finally {
      try {
        subscription?.remove?.();
      } catch {
        // Removing the watch is not a position lock.
      }
    }
  }
  const decision = pickAccurateSample(samples);
  if (decision.fix) return { route: "expo-location", fix: decision.fix };
  return {
    route: "expo-location",
    fix: null,
    reason: decision.reason || "Expo Location did not return a high-accuracy fix. Nothing was stored."
  };
}

/**
 * Foreground GPS watch. Consent false returns before any provider call.
 * Background permission is requested only when background is explicitly true.
 */
export async function watchPlatformGps({ consent, background = false, onUpdate, Location: injected } = {}) {
  const plan = gpsWatchPlan({ consent, background });
  if (plan.watch !== true) {
    return { started: false, foreground: false, background: false, reason: plan.reason, stop() {} };
  }
  let Location = injected || null;
  if (!Location) {
    try {
      Location = await import("expo-location");
    } catch {
      Location = null;
    }
  }
  if (!Location || typeof Location.watchPositionAsync !== "function" || typeof Location.requestForegroundPermissionsAsync !== "function") {
    return {
      started: false,
      foreground: true,
      background: false,
      reason: "Expo Location is not available on this screen. No fix was stored.",
      stop() {}
    };
  }
  const perm = await Location.requestForegroundPermissionsAsync();
  if (perm?.status !== "granted") {
    return {
      started: false,
      foreground: true,
      background: false,
      reason: "Expo Location permission was not granted. No fix was stored.",
      stop() {}
    };
  }
  let backgroundOn = false;
  if (plan.background === true && typeof Location.requestBackgroundPermissionsAsync === "function") {
    const extra = await Location.requestBackgroundPermissionsAsync();
    backgroundOn = extra?.status === "granted";
  }
  const accuracy = Location.Accuracy?.BestForNavigation ?? Location.Accuracy?.Highest ?? 6;
  let subscription = null;
  try {
    subscription = await Location.watchPositionAsync({
      accuracy,
      timeInterval: 2000,
      distanceInterval: 1
    }, (pos) => {
      if (typeof onUpdate === "function") onUpdate(pos?.coords || null);
    });
  } catch {
    return {
      started: false,
      foreground: true,
      background: false,
      reason: "The GPS watch did not start. Nothing was stored.",
      stop() {}
    };
  }
  return {
    started: true,
    foreground: true,
    background: backgroundOn,
    reason: null,
    stop() {
      try {
        subscription?.remove?.();
      } catch {
        // Stopping the watch is not a stored fix.
      }
    }
  };
}

export async function readPlatformFix() {
  const bridge = globalThis.__YEHSA_PLATFORM__;
  const termux = typeof bridge?.termuxLocation === "function";
  let Location = null;
  if (!termux) {
    try {
      Location = await import("expo-location");
    } catch {
      Location = null;
    }
  }
  const expoAvailable = Boolean(
    Location
    && typeof Location.requestForegroundPermissionsAsync === "function"
    && typeof Location.getCurrentPositionAsync === "function"
  );
  const route = chooseLocationRoute({ termuxAvailable: termux, expoAvailable });

  if (route === "termux-location") {
    try {
      const result = await bridge.termuxLocation();
      const fix = parseTermuxGps(result?.stdout ?? result);
      if (fix) return { route, fix, provider: "gps" };
      return {
        route,
        fix: null,
        reason: result?.reason || "termux-location did not return a GPS fix. No network fix was stored."
      };
    } catch {
      return {
        route,
        fix: null,
        reason: "termux-location did not return a GPS fix. No network fix was stored."
      };
    }
  }

  if (route !== "expo-location") {
    return {
      route: "none",
      fix: null,
      reason: "No location provider is available here. termux-location is not on this runtime, and Expo Location is not installed."
    };
  }

  try {
    return await readExpoFix(Location);
  } catch {
    return { route, fix: null, reason: "Expo Location did not return a fix. Nothing was stored." };
  }
}
