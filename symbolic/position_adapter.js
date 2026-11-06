// Choose a location provider and fold one reading into the opt-in position state.
// Consent stays the gate. Nothing here reads a sensor by itself.

import { initialPosition } from "./phone_position.js";
import { decideExpoReading, normalizeFix, parseTermuxGps } from "./position_fix.js";

export function chooseLocationRoute(caps = {}) {
  if (caps.termuxAvailable === true) return "termux-location";
  if (caps.expoAvailable === true) return "expo-location";
  return "none";
}

function heldFix(fix) {
  if (!fix) return null;
  const point = {
    latitude: fix.latitude,
    longitude: fix.longitude
  };
  if (fix.altitude != null) point.altitude = fix.altitude;
  if (fix.accuracy != null) point.accuracy = fix.accuracy;
  return point;
}

/**
 * Apply one explicit read. Consent off never locks and does not keep a fix.
 * A failed read leaves an existing consented lock in place.
 * shared stays false: transmitting is a separate step.
 */
export function applySatelliteReading(state, reading) {
  const current = state || initialPosition();
  if (current.consent !== true) {
    return {
      ...initialPosition(),
      note: "Position lock is opt-in. Consent is required before a satellite read."
    };
  }

  const route = reading?.route || "none";
  let fix = null;
  let reason = reading?.reason || null;
  if (route === "termux-location") {
    fix = reading?.stdout != null ? parseTermuxGps(reading.stdout) : null;
    if (!fix && reading?.fix) {
      const provider = typeof reading.provider === "string" ? reading.provider.toLowerCase() : "gps";
      fix = provider === "gps" ? normalizeFix(reading.fix, "gnss") : null;
    }
  } else if (route === "expo-location") {
    const decision = decideExpoReading(reading?.fix);
    fix = decision.fix;
    if (!fix && !reason) reason = decision.reason;
  }

  if (fix && (route === "termux-location" || route === "expo-location")) {
    const note = route === "termux-location"
      ? "Holding a GPS fix from termux-location. It has not been shared."
      : "Holding a device fix from Expo Location. It has not been shared.";
    return {
      consent: true,
      status: "locked",
      fix: heldFix(fix),
      source: fix.source,
      shared: false,
      note
    };
  }

  const why = reason
    || (route === "termux-location"
      ? "termux-location did not return a GPS fix. No network fix was stored."
      : route === "expo-location"
        ? "Expo Location did not return a fix. Nothing was stored."
        : "No location provider is available here. termux-location is not on this runtime, and Expo Location did not return a fix.");

  if (current.status === "locked" && current.fix) {
    return {
      ...current,
      shared: false,
      note: `${why} The coordinates you already chose to hold are unchanged.`
    };
  }
  return {
    consent: true,
    status: "degraded",
    fix: null,
    source: null,
    shared: false,
    note: why
  };
}
