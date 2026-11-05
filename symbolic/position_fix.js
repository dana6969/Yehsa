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
