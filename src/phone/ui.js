import React, { createContext, useContext } from "react";
import { Image, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

const brandMark = require("../../assets/brand/yehsa-mark-256.png");

export const colors = {
  bg: "#141a16",
  surface: "#1b2420",
  ink: "#f4f0e6",
  muted: "#b7bfb2",
  line: "#2a352e",
  lineStrong: "#3d4c43",
  brass: "#e2b15a",
  brassInk: "#1c241e",
  moss: "#b7d0a4",
  clay: "#e7b5a0",
  field: "#0e1411"
};

// Design tokens. Lucky's color and visual-style system will replace these
// values; screens should read tokens from here instead of hard-coding them.
export const tokens = {
  colors,
  sos: { bg: "#2a1c18", ink: colors.clay, border: "#8d675c", screen: "#1a1210" },
  highContrast: { muted: "#e4e8df", line: "#6f8577", lineStrong: "#8fa597" },
  space: { xs: 4, sm: 8, md: 12, lg: 16, xl: 22 },
  radius: { sm: 10, md: 12, lg: 16, pill: 999 },
  touch: { min: 48, bumper: 64, tabBar: 64 },
  type: { small: 13, body: 15, prose: 17, title: 26, coords: 34 },
  largeTextScale: 1.2
};

// Display settings from More, Display. Applied by the shared parts below.
export const DisplayContext = createContext({ largeText: false, highContrast: false });

export function useDisplay() {
  const display = useContext(DisplayContext) || {};
  const scale = display.largeText ? tokens.largeTextScale : 1;
  return {
    largeText: display.largeText === true,
    highContrast: display.highContrast === true,
    scale,
    size: (value) => Math.round(value * scale),
    muted: display.highContrast ? tokens.highContrast.muted : colors.muted,
    line: display.highContrast ? tokens.highContrast.lineStrong : colors.lineStrong
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
      <Ionicons name="chevron-back" size={22} color={colors.brass} />
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
            <HeaderIcon icon="search" label="Ask or go" onPress={shell.openSearch} />
            <HeaderIcon icon="settings-outline" label="More" onPress={shell.openMore} />
          </View>
        ) : null}
      </View>
      <Text accessibilityRole="header" style={[styles.title, compact && styles.titleCompact, { fontSize: display.size(compact ? 22 : 26), lineHeight: display.size(compact ? 28 : 32) }]}>{title}</Text>
      {lead ? <Text style={[styles.lead, { color: display.muted, fontSize: display.size(16), lineHeight: display.size(24) }]}>{lead}</Text> : null}
    </View>
  );
}

export function StatusPill({ label, tone }) {
  const palette = tone === "good"
    ? { fg: colors.moss, bg: "#17211b", border: "#3f5646" }
    : tone === "warn"
      ? { fg: colors.clay, bg: "#241c19", border: "#6d5148" }
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
      ? { bg: "transparent", ink: colors.clay, border: "#8d675c" }
      : { bg: colors.brass, ink: colors.brassInk, border: colors.brass };
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
        { backgroundColor: palette.bg, borderColor: palette.border },
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
        style
      ]}
    >
      <Text style={[styles.actionText, { color: palette.ink, fontSize: display.size(16), lineHeight: display.size(22) }]}>{label}</Text>
    </Pressable>
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
        placeholderTextColor="#8f9a8c"
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

const styles = StyleSheet.create({
  header: {
    marginBottom: 22
  },
  headerCompact: {
    marginBottom: 10
  },
  titleCompact: {
    letterSpacing: -0.3
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
    color: colors.brass,
    fontWeight: "600",
    marginLeft: 2
  },
  wordmark: {
    color: colors.brass,
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
    backgroundColor: "#1c1810",
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
});
