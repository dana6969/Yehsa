// Copied from /workspace/yehsa-design/tokens-ui.js (Lucky's approved visual system).
// New screens import from here so ui.js can adopt the same tokens without a merge clash.

// Yehsa visual tokens — drop-in for src/phone/ui.js
// Refined 17 Nov 2026 from the current forest / ivory / brass system
// in /workspace/yehsa-build @ 2c68307 (read-only), reconciled with
// Dana's gold tree-of-life logo (/workspace/yehsa-logo.png) and the
// #0D0A07 splash field. This is a refinement, not a replacement.
//
// How to apply:
// 1. Keep the existing brandMark require and ScreenHeader mark
//    (added in 00049cb).
// 2. Replace `export const colors = { ... }` with this `colors` object.
// 3. Paste `themes`, `space`, `radius`, `hit`, `type`, `motion`, and
//    `displayModes` immediately after it.
// 4. Leave app.json splash / adaptiveIcon backgroundColor at #0D0A07
//    (logo stage). Keep the in-app Field chrome at colors.bg (#141a16).
// 5. `sos` / `sosText` are reserved for Emergency and irreversible
//    emergency actions only (ANSI Z535 / ISO 3864). Decline, "Not right",
//    and Share stay on `clay`. Never encode meaning by hue alone: every
//    state also has a word or icon. No red/green traffic lights.
//
// `colors` is the Field (dark, default) theme so existing lookups
// (colors.bg, colors.brass, colors.moss, colors.clay, ...) keep working.

export const colors = {
  bg: "#141a16",
  surface: "#1b2420",
  field: "#0e1411",
  ink: "#f4f0e6",
  muted: "#b7bfb2",
  line: "#2a352e",
  lineStrong: "#6f8678",
  brass: "#e2b15a",
  brassInk: "#1c241e",
  brassText: "#e2b15a",
  moss: "#b7d0a4",
  clay: "#e7b5a0",
  sos: "#C62828",
  sosInk: "#FFFFFF",
  sosText: "#FF3B30",
  warning: "#e2b15a",
  success: "#b7d0a4",
  info: "#d7c4a3",
  youBubble: "#2a352e",
  yehsaBubble: "#1b2420",
  blaze: "#E65100"
};

export const themes = {
  // Field: dark forest, the default. Brass is brand and selection.
  field: { ...colors },
  dark: { ...colors }, // alias
  // Sunlight: ivory paper, dark ink, stronger edges. Gold fills keep a
  // 2 px ink outline so the control meets WCAG 2.2 1.4.11 (bright brass
  // alone is only ~1.7:1 on paper).
  sunlight: {
    bg: "#F4F0E6",
    surface: "#FFFFFF",
    field: "#FFFFFF",
    ink: "#141a16",
    muted: "#3d4c43",
    line: "#d7ddd2",
    lineStrong: "#3d4c43",
    brass: "#e2b15a",
    brassInk: "#1c241e",
    brassText: "#6b4306",
    moss: "#2E5A28",
    clay: "#8A3F2A",
    sos: "#A80015",
    sosInk: "#FFFFFF",
    sosText: "#A80015",
    warning: "#6b4306",
    success: "#2E5A28",
    info: "#3d4c43",
    youBubble: "#e6e0d2",
    yehsaBubble: "#FFFFFF",
    blaze: "#E65100"
  },
  // Night, red option. Dim red on near-black. No green, no white body text.
  // Amber is offered too: red can read as black under protanopia.
  nightRed: {
    bg: "#140808",
    surface: "#1c0c0c",
    field: "#100606",
    ink: "#E07040",
    muted: "#C06048",
    line: "#5A2018",
    lineStrong: "#C06048",
    brass: "#E07040",
    brassInk: "#140808",
    brassText: "#E07040",
    moss: "#E07040",
    clay: "#E07040",
    sos: "#FF6A5A",
    sosInk: "#140808",
    sosText: "#FF6A5A",
    warning: "#E07040",
    success: "#E07040",
    info: "#C06048",
    youBubble: "#2A0C0A",
    yehsaBubble: "#1c0c0c",
    blaze: "#FF6A5A"
  },
  nightAmber: {
    bg: "#140E06",
    surface: "#1c1408",
    field: "#100A04",
    ink: "#D4A040",
    muted: "#C09030",
    line: "#5A4018",
    lineStrong: "#C09030",
    brass: "#D4A040",
    brassInk: "#140E06",
    brassText: "#D4A040",
    moss: "#D4A040",
    clay: "#D4A040",
    sos: "#FF6A5A",
    sosInk: "#140E06",
    sosText: "#FF6A5A",
    warning: "#D4A040",
    success: "#D4A040",
    info: "#C09030",
    youBubble: "#2A1C08",
    yehsaBubble: "#1c1408",
    blaze: "#FF6A5A"
  }
};

export const displayModes = ["field", "sunlight", "nightRed", "nightAmber"];

export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 22,
  xxl: 24,
  xxxl: 32
};

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  pill: 999
};

export const hit = {
  min: 48,
  comfortable: 56,
  tab: 64,
  sos: 64
};

export const type = {
  wordmark: { fontSize: 12, lineHeight: 16, fontWeight: "600", letterSpacing: 2.2, textTransform: "uppercase" },
  title: { fontSize: 26, lineHeight: 32, fontWeight: "600", letterSpacing: -0.4 },
  lead: { fontSize: 16, lineHeight: 24, fontWeight: "400" },
  prose: { fontSize: 17, lineHeight: 26, fontWeight: "400" },
  action: { fontSize: 16, lineHeight: 22, fontWeight: "600" },
  quiet: { fontSize: 15, lineHeight: 22, fontWeight: "400" },
  label: { fontSize: 13, lineHeight: 18, fontWeight: "500" },
  tab: { fontSize: 12, lineHeight: 16, fontWeight: "600", letterSpacing: 0.2 },
  coordinate: { fontSize: 28, lineHeight: 34, fontWeight: "700" }
};

export const motion = {
  pressedOpacity: 0.82,
  disabledOpacity: 0.5,
  // 911 / emergency call: hold, then a visible countdown. Not a single tap.
  sosHoldMs: 1500,
  sosCountdownSec: 3
};
