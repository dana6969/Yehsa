// Display modes for the phone shell. Pure JavaScript for node tests.
// Field (dark) is the default. Night defaults to Red, with Amber as an option.
// The mode is saved on this device only.

export const DISPLAY_KEY = "yehsa.display.v1";

export const DISPLAY_MODES = [
  { id: "field", label: "Field", icon: "leaf-outline" },
  { id: "sunlight", label: "Sunlight", icon: "sunny-outline" },
  { id: "night", label: "Night", icon: "moon-outline" }
];

export const NIGHT_TINTS = [
  { id: "red", label: "Red" },
  { id: "amber", label: "Amber" }
];

export function defaultDisplay() {
  return { mode: "field", night: "red", largeText: false };
}

export function openDisplay(raw) {
  const base = defaultDisplay();
  let value = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw);
    } catch {
      return base;
    }
  }
  if (!value || typeof value !== "object") return base;
  return {
    mode: DISPLAY_MODES.some((item) => item.id === value.mode) ? value.mode : base.mode,
    night: NIGHT_TINTS.some((item) => item.id === value.night) ? value.night : base.night,
    largeText: value.largeText === true
  };
}

export function packDisplay(display) {
  return JSON.stringify(openDisplay(display));
}

// Theme key in ui.js themes for a display setting.
export function themeKeyFor(display) {
  const current = openDisplay(display);
  if (current.mode === "sunlight") return "sunlight";
  if (current.mode === "night") return current.night === "amber" ? "nightAmber" : "nightRed";
  return "field";
}

export function setMode(display, mode) {
  return openDisplay({ ...openDisplay(display), mode });
}

export function nextMode(display) {
  const current = openDisplay(display);
  const index = DISPLAY_MODES.findIndex((item) => item.id === current.mode);
  return setMode(current, DISPLAY_MODES[(index + 1) % DISPLAY_MODES.length].id);
}

// The word shown on the header chip. State is never color alone.
export function modeLabel(display) {
  const current = openDisplay(display);
  const mode = DISPLAY_MODES.find((item) => item.id === current.mode);
  if (current.mode === "night") return `Night · ${current.night === "amber" ? "Amber" : "Red"}`;
  return mode.label;
}
