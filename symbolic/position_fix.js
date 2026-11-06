// Shared satellite-fix checks. No filesystem and no process spawn.
// A network, passive, or peer-mesh reading is not a GPS fix.
// Expo Location readings are labeled expo-location and are not relabeled as GNSS.

export function normalizeFix(raw, source) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const latitude = Number(raw.latitude);
  const longitude = Number(raw.longitude);
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) return null;
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) return null;
  let accuracy = null;
  if (raw.accuracy != null && raw.accuracy !== "") {
    accuracy = Number(raw.accuracy);
    if (!Number.isFinite(accuracy) || accuracy < 0 || accuracy > 100000) return null;
  }
  const fix = {
    latitude,
    longitude,
    accuracy,
    source: source || "local-coords"
  };
  const altitude = optionalAltitude(raw);
  if (altitude != null) fix.altitude = altitude;
  return fix;
}

function optionalAltitude(raw) {
  if (!raw || typeof raw !== "object") return undefined;
  const value = raw.altitude ?? raw.elevation;
  if (value == null || value === "") return undefined;
  const altitude = Number(value);
  if (!Number.isFinite(altitude) || altitude < -500 || altitude > 12000) return undefined;
  return altitude;
}

// Expo Location reports accuracy in meters. A coarser reading is not a lock.
export const EXPO_LOCK_ACCURACY_M = 100;

/**
 * One Expo reading. High accuracy can lock. A missing or coarse accuracy does not.
 * The reason never includes coordinates.
 */
export function decideExpoReading(coords) {
  if (!coords || typeof coords !== "object" || Array.isArray(coords)) {
    return { fix: null, reason: "Expo Location did not return a fix. Nothing was stored." };
  }
  const accuracy = Number(coords.accuracy);
  if (!Number.isFinite(accuracy)) {
    return { fix: null, reason: "Expo Location did not report an accuracy. Nothing was stored." };
  }
  if (accuracy > EXPO_LOCK_ACCURACY_M) {
    return {
      fix: null,
      reason: `Expo Location reported about ${Math.round(accuracy)} m. A lock needs ${EXPO_LOCK_ACCURACY_M} m or better. Nothing was stored.`
    };
  }
  const fix = normalizeFix(coords, "expo-location");
  if (!fix) {
    return { fix: null, reason: "Expo Location did not return a usable fix. Nothing was stored." };
  }
  return { fix, reason: null };
}

/**
 * Keep the tightest sample from one tap. The first sample that can lock wins
 * only when nothing tighter is already in the list; the best accuracy is used.
 */
export function pickAccurateSample(samples) {
  let best = null;
  for (const coords of samples || []) {
    if (!coords || typeof coords !== "object") continue;
    const accuracy = Number(coords.accuracy);
    if (!Number.isFinite(accuracy)) continue;
    if (!best || accuracy < Number(best.accuracy)) best = coords;
  }
  return decideExpoReading(best);
}

/**
 * termux-location -p gps prints JSON. Missing provider is treated as gps,
 * matching the Termux helper. Any other provider is refused.
 */
export function parseTermuxGps(stdout) {
  let parsed;
  try {
    parsed = JSON.parse(String(stdout || "").trim());
  } catch {
    return null;
  }
  const provider = typeof parsed.provider === "string" ? parsed.provider.toLowerCase() : "gps";
  if (provider !== "gps") return null;
  return normalizeFix(parsed, "gnss");
}
