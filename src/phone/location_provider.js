// Location probe for the Expo shell.
// termux-location wins when a bridge is present. Otherwise Expo Location.
// This file does not read a fix until readPlatformFix() is called.

import { chooseLocationRoute } from "../../symbolic/position_adapter.js";
import { parseTermuxGps } from "../../symbolic/position_fix.js";

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
    const perm = await Location.requestForegroundPermissionsAsync();
    if (perm?.status !== "granted") {
      return { route, fix: null, reason: "Expo Location permission was not granted. No fix was stored." };
    }
    const accuracy = Location.Accuracy?.BestForNavigation ?? Location.Accuracy?.Highest ?? 6;
    const pos = await Location.getCurrentPositionAsync({ accuracy });
    const coords = pos?.coords;
    if (!coords) {
      return { route, fix: null, reason: "Expo Location did not return a fix. Nothing was stored." };
    }
    return {
      route,
      fix: {
        latitude: coords.latitude,
        longitude: coords.longitude,
        accuracy: coords.accuracy,
        altitude: coords.altitude
      }
    };
  } catch {
    return { route, fix: null, reason: "Expo Location did not return a fix. Nothing was stored." };
  }
}
