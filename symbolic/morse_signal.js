// Morse for a light or a tone. Pure: it builds the timing and the sound bytes, and never touches a device.
// Short is one unit, long is three. One unit between marks, three between letters, seven between words.

const MORSE = { a: ".-", b: "-...", c: "-.-.", d: "-..", e: ".", f: "..-.", g: "--.", h: "....", i: "..", j: ".---", k: "-.-", l: ".-..", m: "--", n: "-.", o: "---", p: ".--.", q: "--.-", r: ".-.", s: "...", t: "-", u: "..-", v: "...-", w: ".--", x: "-..-", y: "-.--", z: "--..", 0: "-----", 1: ".----", 2: "..---", 3: "...--", 4: "....-", 5: ".....", 6: "-....", 7: "--...", 8: "---..", 9: "----." };

export const MAX_CHARS = 60;
export const NO_FLASHLIGHT = "This phone has no flashlight I can use.";
export const NEEDS_CAMERA_PERMISSION = "I can't use the flashlight without camera permission. Yehsa uses the camera only for this.";
export const WHISTLE_NOTE = "This plays a tone pattern from the phone speaker. It is not a physical whistle, and it will not carry as far as one.";

export function toMorse(text) {
  return String(text || "").toLowerCase().split(/\s+/).filter(Boolean)
    .map((word) => [...word].map((ch) => MORSE[ch]).filter(Boolean).join(" "))
    .filter(Boolean).join("  /  ");
}

// A list of { on, ms } steps. The last step is always an "off".
export function timeline(text, unitMs = 160) {
  const steps = [];
  const words = String(text || "").toLowerCase().split(/\s+/).filter(Boolean)
    .map((word) => [...word].map((ch) => MORSE[ch]).filter(Boolean))
    .filter((letters) => letters.length);
  words.forEach((letters, wordIndex) => {
    letters.forEach((code, letterIndex) => {
      [...code].forEach((mark, markIndex) => {
        steps.push({ on: true, ms: mark === "." ? unitMs : unitMs * 3 });
        const lastMark = markIndex === code.length - 1;
        if (!lastMark) steps.push({ on: false, ms: unitMs });
      });
      const lastLetter = letterIndex === letters.length - 1;
      if (!lastLetter) steps.push({ on: false, ms: unitMs * 3 });
    });
    if (wordIndex < words.length - 1) steps.push({ on: false, ms: unitMs * 7 });
  });
  steps.push({ on: false, ms: unitMs * 7 });
  return steps;
}

export function totalMs(steps) {
  return steps.reduce((sum, step) => sum + step.ms, 0);
}

// 8-bit mono WAV bytes for the same pattern. 2600 Hz sits where whistles do and carries well.
export function wavBytes(text, { unitMs = 160, hz = 2600, rate = 8000, steps: given = null } = {}) {
  const steps = given || timeline(text, unitMs);
  const counts = steps.map((step) => Math.round((step.ms / 1000) * rate));
  const total = counts.reduce((a, b) => a + b, 0);
  const bytes = new Uint8Array(44 + total);
  const view = new DataView(bytes.buffer);
  const tag = (offset, value) => { for (let i = 0; i < value.length; i += 1) bytes[offset + i] = value.charCodeAt(i); };
  tag(0, "RIFF"); view.setUint32(4, 36 + total, true); tag(8, "WAVE"); tag(12, "fmt ");
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, rate, true); view.setUint32(28, rate, true); view.setUint16(32, 1, true); view.setUint16(34, 8, true);
  tag(36, "data"); view.setUint32(40, total, true);
  let at = 44;
  steps.forEach((step, index) => {
    const n = counts[index];
    for (let i = 0; i < n; i += 1) {
      let value = 128;
      if (step.on) {
        // A short fade in and out stops the clicks at each mark.
        const edge = Math.min(1, i / 40, (n - 1 - i) / 40);
        value = Math.round(128 + 110 * edge * Math.sin((2 * Math.PI * hz * i) / rate));
      }
      bytes[at] = value;
      at += 1;
    }
  });
  return bytes;
}

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
export function base64(bytes) {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = bytes[i + 1];
    const c = bytes[i + 2];
    out += B64[a >> 2] + B64[((a & 3) << 4) | ((b ?? 0) >> 4)];
    out += b === undefined ? "=" : B64[((b & 15) << 2) | ((c ?? 0) >> 6)];
    out += c === undefined ? "=" : B64[c & 63];
  }
  return out;
}

// R10: speed in words per minute. PARIS timing: one unit is 1200 / WPM milliseconds.
export const WPM_CHOICES = [5, 8, 10, 13, 18];
export const DEFAULT_WPM = 8;
export function unitForWpm(wpm) {
  const n = Math.min(30, Math.max(3, Number(wpm) || DEFAULT_WPM));
  return Math.round(1200 / n);
}

// SOS as the distress signal is sent run together (... --- ... with no letter gaps), then a word gap.
export function sosTimeline(unitMs = 160) {
  const steps = [];
  const marks = [..."...---..."];
  marks.forEach((mark, i) => {
    steps.push({ on: true, ms: mark === "." ? unitMs : unitMs * 3 });
    if (i < marks.length - 1) steps.push({ on: false, ms: unitMs });
  });
  steps.push({ on: false, ms: unitMs * 7 });
  return steps;
}

export function isSos(text) {
  return /^\s*s\s*o\s*s\s*$/i.test(String(text || ""));
}

// The signal for a message at a speed: { on, ms } steps, SOS run together.
export function signalSteps(text, wpm = DEFAULT_WPM) {
  const unit = unitForWpm(wpm);
  return isSos(text) ? sosTimeline(unit) : timeline(text, unit);
}

// Milliseconds alternating on, off, on, ... starting with on: what the native torch player takes.
// Two steps in a row with the same state are merged.
export function alternating(steps) {
  const out = [];
  let want = true;
  for (const step of steps) {
    if (step.on !== want) {
      if (!out.length) { out.push(0); want = !want; }
      else { out[out.length - 1] += step.ms; continue; }
    }
    out.push(step.ms);
    want = !want;
  }
  return out;
}
