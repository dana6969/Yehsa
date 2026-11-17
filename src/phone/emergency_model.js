// Emergency screen logic. Pure JavaScript so node tests can load it.
// Nothing here calls, shares, or sends. The screen asks first, then hands a
// tel: link to the phone dialer, where the person still presses call.
// Kept off the knowledge path: getMappedAction never loads this file.

export const EMERGENCY_NUMBERS = ["911", "112"];
export const HOLD_MS = 1500;
export const COUNTDOWN_SEC = 3;
export const CPR_BPM = 110;

export function beatIntervalMs(bpm = CPR_BPM) {
  const rate = Math.min(120, Math.max(100, Number(bpm) || CPR_BPM));
  return Math.round(60000 / rate);
}

// Hold-to-confirm, used for calling and for sending an SOS.
// Press and hold 1.5 s, then a visible 3 s countdown that can be canceled.
// A single tap never fires. Phases: idle, holding, countdown, fire.
export function idleHold() {
  return { phase: "idle", target: null, startedAt: 0, endsAt: 0 };
}

export function pressHold(state, target, now = Date.now()) {
  if (state?.phase === "countdown") return state;
  return { phase: "holding", target, startedAt: now, endsAt: 0 };
}

export function holdProgress(state, now = Date.now()) {
  if (!state || state.phase !== "holding") return state?.phase === "countdown" ? 1 : 0;
  return Math.max(0, Math.min(1, (now - state.startedAt) / HOLD_MS));
}

// Called on a timer while the finger is down, and on release.
export function stepHold(state, now = Date.now(), { released = false } = {}) {
  const current = state || idleHold();
  if (current.phase === "holding") {
    if (now - current.startedAt >= HOLD_MS) {
      return { phase: "countdown", target: current.target, startedAt: current.startedAt, endsAt: now + COUNTDOWN_SEC * 1000 };
    }
    return released ? idleHold() : current;
  }
  if (current.phase === "countdown" && now >= current.endsAt) {
    return { phase: "fire", target: current.target, startedAt: current.startedAt, endsAt: current.endsAt };
  }
  return current;
}

export function secondsLeft(state, now = Date.now()) {
  if (state?.phase !== "countdown") return 0;
  return Math.max(0, Math.ceil((state.endsAt - now) / 1000));
}

export function cancelHold() {
  return idleHold();
}

// Only a finished countdown for an emergency number yields a dialer link.
// The phone dialer opens with the number; the person still presses call.
export function dialFor(state) {
  if (state?.phase !== "fire") return null;
  const number = String(state.target || "").replace(/^call:/, "");
  return EMERGENCY_NUMBERS.includes(number) ? `tel:${number}` : null;
}

function fixOf(position) {
  if (!position || position.status !== "locked" || !position.fix) return null;
  const { latitude, longitude } = position.fix;
  if (!Number.isFinite(Number(latitude)) || !Number.isFinite(Number(longitude))) return null;
  return position.fix;
}

function hemi(value, pos, neg) {
  return `${Math.abs(value).toFixed(5)} degrees ${value >= 0 ? pos : neg}`;
}

export function coordinateText(position) {
  const fix = fixOf(position);
  if (!fix) {
    return {
      held: false,
      big: "No position held",
      detail: position?.consent === true
        ? "Location is on, but no fix is held yet."
        : "Location is off. Turn it on in More, then Location.",
      spoken: "No position is held on this phone."
    };
  }
  const lat = Number(fix.latitude);
  const lon = Number(fix.longitude);
  const accuracy = fix.accuracy != null ? Math.round(Number(fix.accuracy)) : null;
  return {
    held: true,
    big: `${lat.toFixed(5)}, ${lon.toFixed(5)}`,
    detail: `${accuracy != null ? `Accuracy about ${accuracy} m. ` : ""}Not shared.`,
    spoken: `Latitude ${hemi(lat, "north", "south")}. Longitude ${hemi(lon, "east", "west")}.${accuracy != null ? ` Accuracy about ${accuracy} meters.` : ""}`
  };
}

// Mesh SOS text. The place is added only when location consent is on, a fix
// is held, and the person turned on "include my place" for this SOS.
export function meshSosText(position, includePlace) {
  const fix = position?.consent === true && includePlace === true ? fixOf(position) : null;
  if (!fix) return { text: "SOS. I need help.", placeIncluded: false };
  return {
    text: `SOS. I need help. Near ${Number(fix.latitude).toFixed(5)}, ${Number(fix.longitude).toFixed(5)}.`,
    placeIncluded: true
  };
}

export function canIncludePlace(position) {
  return position?.consent === true && fixOf(position) != null;
}

// Short spoken steps for an adult, from common lay first-aid guidance.
export const CPR_STEPS = [
  "Make sure the scene is safe.",
  "Tap the person and shout. Check for normal breathing for no more than ten seconds.",
  "If they are not breathing normally, call emergency services or have someone call, and send someone for an AED.",
  "Kneel beside them. Put the heel of one hand in the center of the chest, the other hand on top.",
  "Push hard and fast, at least five centimeters, or two inches, deep. About two pushes a second. Follow the beat.",
  "Let the chest come all the way back up between pushes.",
  "If you are trained, give two breaths after every thirty pushes. If not, keep pushing without stopping.",
  "Use an AED as soon as one arrives and follow its voice.",
  "Keep going until help takes over or the person starts breathing normally."
];

export const BLEEDING_STEPS = [
  "Call emergency services, or have someone call.",
  "Protect your hands if you can.",
  "Press hard on the wound with a cloth or your hand, and keep pressing.",
  "If blood soaks through, add more cloth on top. Do not lift the first layer.",
  "For heavy bleeding from an arm or leg that pressure does not stop, put a tourniquet five to eight centimeters, two to three inches, above the wound, not on a joint.",
  "Tighten it until the bleeding stops, and note the time it went on.",
  "Keep the person warm and lying down until help arrives."
];

export const SATELLITE_GUIDE = [
  "Yehsa does not send a satellite signal itself. These steps are for a device you already carry.",
  "Personal locator beacon: get to open sky, extend the antenna, and press SOS. Leave it on and pointed up.",
  "Satellite messenger: press and hold its SOS button until it confirms, then answer the rescue center's messages if it can.",
  "Phone with satellite SOS: call emergency services first. If there is no signal, the phone may offer satellite. Hold it toward open sky and follow the prompts.",
  "Stay where you are if you can, and keep the device on until help reaches you."
];

export const FIRST_AID_CAVEAT = "Steps follow common first-aid guidance. They do not replace trained help.";
