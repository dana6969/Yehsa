// Opt-in position for the Expo screen.
// Satellite lock is the Termux helper. This runtime cannot run it, so that attempt degrades.
// Typed coordinates are held only after consent. Nothing is shared from here.

export const UNLOCKED_NOTE = "Position lock is off. Yehsa will not read or store a position until you consent.";

export function initialPosition() {
  return {
    consent: false,
    status: "unlocked",
    fix: null,
    source: null,
    shared: false,
    note: UNLOCKED_NOTE
  };
}

function pointOf(raw) {
  if (!raw || typeof raw !== "object") return null;
  const latitude = Number(raw.latitude);
  const longitude = Number(raw.longitude);
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) return null;
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) return null;
  const fix = { latitude, longitude };
  if (raw.altitude != null && raw.altitude !== "") {
    const altitude = Number(raw.altitude);
    if (!Number.isFinite(altitude) || altitude < -500 || altitude > 12000) return null;
    fix.altitude = altitude;
  }
  return fix;
}

export function setConsent(state, consent) {
  const current = state || initialPosition();
  if (consent !== true) {
    return initialPosition();
  }
  if (current.consent === true) return current;
  return {
    consent: true,
    status: "unlocked",
    fix: null,
    source: null,
    shared: false,
    note: "Consent is on. Nothing is locked yet. Yehsa still does not read a position until you ask."
  };
}

export function holdTypedFix(state, raw) {
  const current = state || initialPosition();
  if (current.consent !== true) {
    return {
      ...initialPosition(),
      note: "Position lock is opt-in. Turn on consent before holding coordinates."
    };
  }
  const fix = pointOf(raw);
  if (!fix) {
    return {
      ...current,
      shared: false,
      note: "Those coordinates are not usable. Latitude is between -90 and 90, longitude between -180 and 180."
    };
  }
  return {
    consent: true,
    status: "locked",
    fix,
    source: "typed",
    shared: false,
    note: "Holding coordinates you typed. This is not a satellite fix, and it has not been shared."
  };
}

export function noteSatelliteUnavailable(state) {
  const current = state || initialPosition();
  if (current.consent !== true) {
    return {
      ...initialPosition(),
      note: "Position lock is opt-in. Consent is required before a satellite read."
    };
  }
  const note = "Satellite lock needs termux-location on the phone. This screen cannot run that helper, so no satellite fix was stored.";
  if (current.status === "locked" && current.fix) {
    return {
      ...current,
      shared: false,
      note: `${note} The coordinates you already chose to hold are unchanged.`
    };
  }
  return {
    consent: true,
    status: "degraded",
    fix: null,
    source: null,
    shared: false,
    note
  };
}

export function unlockPosition(state) {
  const current = state || initialPosition();
  if (current.consent !== true) return initialPosition();
  return {
    consent: true,
    status: "unlocked",
    fix: null,
    source: null,
    shared: false,
    note: "Unlocked. Consent stays on, but no coordinates are held."
  };
}

export function shareAttempt(state) {
  const current = state || initialPosition();
  const message = "Not sent. Sharing is a separate step on the phone that owns the mesh link: node symbolic/position_lock.js --consent --share. This screen did not transmit coordinates.";
  if (current.consent !== true || current.status !== "locked" || !current.fix) {
    return {
      state: { ...current, shared: false },
      message: "Nothing was shared. A share would still not be sent from this screen, and there is no consented lock to offer."
    };
  }
  return {
    state: { ...current, shared: false },
    message
  };
}

export function statusLabel(state) {
  if (!state || state.status === "unlocked") return "Unlocked";
  if (state.status === "degraded") return "Degraded";
  if (state.status === "locked") return "Locked";
  return "Unlocked";
}
