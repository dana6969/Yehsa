// One location setting for the whole app. The Settings / Location switch (position.consent) is the
// single source of truth. The Map's location control reads and writes that same setting, and it
// never turns location on without the same consent words the Settings switch shows.

export const LOCATION_CONSENT = {
  title: "Turn on location?",
  body: "I consent to hold a position on this device. Your place stays on this phone and is not shared. This is the same switch as Settings, Location, and you can turn it off there or here.",
  yes: "Turn on",
  no: "Not now"
};

export function locationOn(position) {
  return position?.consent === true;
}

// Ask for consent, then turn the one setting on. confirm(LOCATION_CONSENT) resolves true or false.
// Returns true when location is on afterwards.
export async function requestLocation({ position, confirm, onConsent }) {
  if (locationOn(position)) return true;
  if (typeof confirm !== "function" || typeof onConsent !== "function") return false;
  let ok = false;
  try {
    ok = (await confirm(LOCATION_CONSENT)) === true;
  } catch {
    ok = false;
  }
  if (!ok) return false;
  onConsent(true);
  return true;
}

// Turning location off from the map turns off the same setting. No prompt needed to turn it off.
export function turnLocationOff({ onConsent }) {
  if (typeof onConsent === "function") onConsent(false);
  return false;
}

// Whether the Map watches GPS. Only with the one setting on; only while the map shows, a route is
// running, or background GPS was chosen; and not while the position is locked (pinned).
export function mapWatchesGps({ consent, active, navOn = false, background = false, pinned = false }) {
  if (consent !== true) return false;
  if (pinned && !navOn) return false;
  return Boolean(active || navOn || background);
}
