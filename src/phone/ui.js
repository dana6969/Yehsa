import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { Image, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { cancelHold, holdProgress, idleHold, pressHold, secondsLeft, stepHold } from "./emergency_model.js";

const brandMark = require("../../assets/brand/yehsa-mark-256.png");

// Visual tokens from Lucky's Yehsa visual system (17 Nov 2026), dropped in
// from /workspace/yehsa-design/tokens-ui.js. `colors` is the Field (dark,
// default) theme and is switched in place by applyTheme(). `sos` and
// `sosText` are reserved for Emergency and irreversible emergency actions.
// Never encode meaning by hue alone: every state also has a word or icon.
// The splash and adaptive icon background stay #0D0A07 in app.json.

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


// Live theme. `colors` is mutated in place to the active display mode so
// every render-time lookup (colors.ink, colors.brass, ...) follows the mode.
// Styles made with themedStyles() are rebuilt per mode and cached.
const fieldColors = { ...colors };
let activeTheme = "field";

export function applyTheme(key) {
  const next = themes[key] ? key : "field";
  if (next === activeTheme) return activeTheme;
  Object.assign(colors, fieldColors, themes[next]);
  activeTheme = next;
  return activeTheme;
}

export function currentTheme() {
  return activeTheme;
}

export function themedStyles(factory) {
  const cache = {};
  const sheet = () => {
    if (!cache[activeTheme]) cache[activeTheme] = StyleSheet.create(factory({ ...fieldColors, ...themes[activeTheme] }));
    return cache[activeTheme];
  };
  return new Proxy({}, {
    get(_, key) {
      return sheet()[key];
    },
    has(_, key) {
      return key in sheet();
    },
    ownKeys() {
      return Reflect.ownKeys(sheet());
    },
    getOwnPropertyDescriptor(_, key) {
      return Object.getOwnPropertyDescriptor(sheet(), key);
    }
  });
}

// One object for screens that want every token. Lucky's system, 17 Nov 2026.
export const tokens = {
  colors,
  themes,
  space,
  radius,
  hit,
  type,
  motion,
  largeTextScale: 1.2
};

// Display settings from More, Display. Applied by the shared parts below.
export const DisplayContext = createContext({ mode: "field", night: "red", largeText: false });

export function useDisplay() {
  const display = useContext(DisplayContext) || {};
  const scale = display.largeText ? tokens.largeTextScale : 1;
  return {
    mode: display.mode || "field",
    night: display.night || "red",
    largeText: display.largeText === true,
    scale,
    size: (value) => Math.round(value * scale),
    muted: colors.muted,
    line: colors.lineStrong
  };
}

// The shell fills this in so every ScreenHeader can open Search and More.
export const ShellContext = createContext(null);

const webPointer = Platform.OS === "web" ? { cursor: "pointer" } : null;

export function BackBar({ label, onPress }) {
  const display = useDisplay();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Back to ${label || "previous screen"}`}
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => [styles.back, webPointer, pressed && styles.pressed]}
    >
      <Ionicons name="chevron-back" size={22} color={colors.brassText} />
      <Text style={[styles.backText, { fontSize: display.size(16) }]}>{label ? `Back to ${label}` : "Back"}</Text>
    </Pressable>
  );
}

function HeaderIcon({ icon, label, onPress }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [styles.headerIcon, webPointer, pressed && styles.pressed]}
    >
      <Ionicons name={icon} size={22} color={colors.ink} />
    </Pressable>
  );
}

// Field, Sunlight, Night as three explicit chips. One tap picks one. Word and icon, and a check on
// the chosen one, so the state is never color alone. There is no cycling control.
export function ModeChips({ modes, mode, onPick }) {
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel="Display mode" style={styles.modeChips}>
      {modes.map((item) => {
        const on = item.id === mode;
        return (
          <Pressable
            key={item.id}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            accessibilityLabel={`${item.label} mode`}
            onPress={() => onPick(item.id)}
            hitSlop={4}
            style={({ pressed }) => [styles.modeChip, webPointer, on && styles.modeChipOn, pressed && styles.pressed]}
          >
            <Ionicons name={item.icon} size={14} color={on ? colors.brassInk : colors.ink} />
            <Text style={[styles.modeChipText, on && styles.modeChipTextOn]}>{item.label}</Text>
            {on ? <Ionicons name="checkmark" size={14} color={colors.brassInk} /> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

export function ScreenHeader({ title, lead, onBack, backLabel, compact, controls = true }) {
  const shell = useContext(ShellContext);
  const display = useDisplay();
  const showControls = controls && shell && !onBack;
  return (
    <View style={[styles.header, compact && styles.headerCompact]}>
      {onBack ? <BackBar label={backLabel} onPress={onBack} /> : null}
      <View style={styles.brandRow}>
        <Image source={brandMark} style={styles.brandMark} accessibilityIgnoresInvertColors accessible={false} />
        <Text style={styles.wordmark}>Yehsa</Text>
        {showControls ? (
          <View style={styles.headerTools}>
            {shell.openSearch ? <HeaderIcon icon="search" label="Ask or go" onPress={shell.openSearch} /> : null}
            {shell.openMore ? <HeaderIcon icon="settings-outline" label="More" onPress={shell.openMore} /> : null}
          </View>
        ) : null}
      </View>
      {showControls && shell.modes ? <ModeChips modes={shell.modes} mode={shell.mode} onPick={shell.setMode} /> : null}
      <Text accessibilityRole="header" style={[styles.title, compact && styles.titleCompact, { fontSize: display.size(compact ? 22 : 26), lineHeight: display.size(compact ? 28 : 32) }]}>{title}</Text>
      {lead ? <Text style={[styles.lead, { color: display.muted, fontSize: display.size(16), lineHeight: display.size(24) }]}>{lead}</Text> : null}
    </View>
  );
}

export function StatusPill({ label, tone }) {
  const palette = tone === "good"
    ? { fg: colors.success, bg: colors.surface, border: colors.success }
    : tone === "warn"
      ? { fg: colors.clay, bg: colors.surface, border: colors.clay }
      : { fg: colors.ink, bg: "transparent", border: colors.lineStrong };
  return (
    <View
      accessibilityRole="text"
      accessibilityLabel={label}
      style={[styles.pill, { backgroundColor: palette.bg, borderColor: palette.border }]}
    >
      <View style={[styles.pillDot, { backgroundColor: palette.fg }]} />
      <Text style={[styles.pillText, { color: palette.fg }]}>{label}</Text>
    </View>
  );
}

export function Action({ label, onPress, disabled, tone = "brass", accessibilityHint, style }) {
  const display = useDisplay();
  const palette = tone === "quiet"
    ? { bg: "transparent", ink: colors.ink, border: colors.lineStrong }
    : tone === "clay"
      ? { bg: "transparent", ink: colors.clay, border: colors.clay }
      : { bg: colors.brass, ink: colors.brassInk, border: activeTheme === "sunlight" ? colors.ink : colors.brass };
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: Boolean(disabled) }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.action,
        webPointer,
        { backgroundColor: palette.bg, borderColor: palette.border, borderWidth: activeTheme === "sunlight" && tone !== "quiet" && tone !== "clay" ? 2 : 1 },
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
        style
      ]}
    >
      <Text style={[styles.actionText, { color: palette.ink, fontSize: display.size(16), lineHeight: display.size(22) }]}>{label}</Text>
    </Pressable>
  );
}

// Hold-to-confirm for emergency actions: hold 1.5 s, then a 3 s countdown
// with Cancel. A tap or a short press never fires. The fill and the words
// both show progress, so state is never color alone.
export function HoldButton({ label, countdownLabel, target, onFire, tone = "sos", hint }) {
  const display = useDisplay();
  const [hold, setHold] = useState(idleHold);
  const [, setTick] = useState(0);
  const holdRef = useRef(hold);
  holdRef.current = hold;
  const fired = useRef(false);

  useEffect(() => {
    if (hold.phase !== "holding" && hold.phase !== "countdown") return undefined;
    const timer = setInterval(() => {
      const next = stepHold(holdRef.current, Date.now());
      if (next !== holdRef.current) setHold(next);
      setTick((value) => value + 1);
    }, 100);
    return () => clearInterval(timer);
  }, [hold.phase]);

  useEffect(() => {
    if (hold.phase !== "fire" || fired.current) return;
    fired.current = true;
    setHold(idleHold());
    onFire?.(hold);
  }, [hold.phase]);

  const sos = tone === "sos";
  const progress = holdProgress(hold, Date.now());
  const left = secondsLeft(hold, Date.now());
  const bg = sos ? colors.sos : "transparent";
  const ink = sos ? colors.sosInk : colors.ink;
  const words = hold.phase === "countdown"
    ? `${countdownLabel || label} in ${left}…`
    : hold.phase === "holding"
      ? "Keep holding…"
      : label;
  return (
    <View style={styles.holdWrap}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint={hint || "Press and hold for 1.5 seconds, then a 3 second countdown. Cancel stops it."}
        onPressIn={() => {
          fired.current = false;
          setHold((current) => pressHold(current, target, Date.now()));
        }}
        onPressOut={() => setHold((current) => stepHold(current, Date.now(), { released: true }))}
        style={[styles.hold, webPointer, { backgroundColor: bg, borderColor: sos ? colors.ink : colors.lineStrong }]}
      >
        <View pointerEvents="none" style={[styles.holdFill, { width: `${Math.round(progress * 100)}%`, backgroundColor: sos ? colors.ink : colors.brass }]} />
        <Ionicons name={hold.phase === "countdown" ? "timer-outline" : "hand-left-outline"} size={20} color={ink} />
        <Text accessibilityLiveRegion="assertive" style={[styles.holdText, { color: ink, fontSize: display.size(17) }]}>{words}</Text>
      </Pressable>
      {hold.phase === "countdown" ? (
        <Action label="Cancel" tone="quiet" onPress={() => setHold(cancelHold())} />
      ) : null}
    </View>
  );
}

export function HoldTalk({ label, hint, onPressIn, onPressOut, onPress, disabled, live }) {
  const resting = disabled && !live;
  const ink = live ? colors.brass : resting ? colors.muted : colors.brassInk;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={{ disabled: Boolean(disabled), busy: Boolean(live) }}
      disabled={disabled}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      onPress={onPress}
      style={({ pressed }) => [
        styles.mic,
        webPointer,
        live && styles.micLive,
        resting && styles.micResting,
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed
      ]}
    >
      <Text style={[styles.micText, { color: ink }]}>{label}</Text>
    </Pressable>
  );
}

export function Field({ label, value, onChangeText, placeholder, multiline, hint }) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        multiline={multiline}
        autoCorrect={false}
        autoCapitalize="none"
        style={[styles.input, multiline && styles.inputMulti]}
      />
      {hint ? <Text style={styles.fieldHint}>{hint}</Text> : null}
    </View>
  );
}

export function Panel({ children }) {
  return <View style={styles.panel}>{children}</View>;
}

export function Prose({ children, tone, live }) {
  const display = useDisplay();
  const color = tone === "warn" ? colors.clay : tone === "good" ? colors.moss : colors.ink;
  return (
    <Text accessibilityLiveRegion={live ? "polite" : undefined} style={[styles.prose, { color, fontSize: display.size(17), lineHeight: display.size(26) }]}>
      {children}
    </Text>
  );
}

export function Quiet({ children, live }) {
  const display = useDisplay();
  return (
    <Text accessibilityLiveRegion={live ? "polite" : undefined} style={[styles.quiet, { color: display.muted, fontSize: display.size(15), lineHeight: display.size(22) }]}>
      {children}
    </Text>
  );
}

const styles = themedStyles((colors) => ({
  header: {
    marginBottom: 22
  },
  headerCompact: {
    marginBottom: 10
  },
  titleCompact: {
    letterSpacing: -0.3
  },
  holdWrap: { marginBottom: 8 },
  hold: {
    minHeight: 64,
    borderRadius: 14,
    borderWidth: 2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingHorizontal: 16,
    overflow: "hidden"
  },
  holdFill: {
    position: "absolute",
    left: 0,
    bottom: 0,
    height: 6
  },
  holdText: {
    fontWeight: "700",
    letterSpacing: 0.2
  },
  modeChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    minHeight: 36,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.lineStrong
  },
  modeChipOn: {
    backgroundColor: colors.brass,
    borderColor: colors.brass
  },
  modeChips: {
    flexDirection: "row",
    gap: 8,
    marginTop: 8,
    marginBottom: 4
  },
  modeChipText: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: "600"
  },
  modeChipTextOn: {
    color: colors.brassInk
  },
  headerTools: {
    marginLeft: "auto",
    flexDirection: "row",
    gap: 4
  },
  headerIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center"
  },
  back: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    minHeight: 48,
    paddingRight: 12,
    marginLeft: -6,
    marginBottom: 6
  },
  backText: {
    color: colors.brassText,
    fontWeight: "600",
    marginLeft: 2
  },
  wordmark: {
    color: colors.brassText,
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 2.2,
    textTransform: "uppercase"
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8
  },
  brandMark: {
    width: 26,
    height: 26,
    marginRight: 8
  },
  title: {
    color: colors.ink,
    fontSize: 26,
    lineHeight: 32,
    fontWeight: "600",
    letterSpacing: -0.4
  },
  lead: {
    color: colors.muted,
    fontSize: 16,
    lineHeight: 24,
    marginTop: 8
  },
  pill: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 32,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1
  },
  pillDot: {
    width: 7,
    height: 7,
    borderRadius: 4
  },
  pillText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "600",
    letterSpacing: 0.2
  },
  action: {
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 8
  },
  actionText: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "600",
    letterSpacing: 0.1,
    textAlign: "center"
  },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.82 },
  mic: {
    minHeight: 52,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.brass,
    backgroundColor: colors.brass,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 8
  },
  micLive: {
    backgroundColor: colors.surface,
    borderColor: colors.brass
  },
  micResting: {
    backgroundColor: "transparent",
    borderColor: colors.lineStrong
  },
  micText: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "600",
    textAlign: "center"
  },
  fieldWrap: { marginBottom: 12 },
  label: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "500",
    marginBottom: 8
  },
  input: {
    backgroundColor: colors.field,
    color: colors.ink,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    minHeight: 48,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 17
  },
  inputMulti: {
    minHeight: 96,
    textAlignVertical: "top"
  },
  fieldHint: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 6
  },
  panel: {
    marginBottom: 16
  },
  prose: {
    fontSize: 17,
    lineHeight: 26
  },
  quiet: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 22
  }
}));
