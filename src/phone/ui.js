import React from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

export const colors = {
  bg: "#1c241e",
  card: "#273029",
  ink: "#f4f0e6",
  muted: "#c5cbbd",
  line: "#3d4a40",
  brass: "#e2b15a",
  brassInk: "#1c241e",
  moss: "#b7d0a4",
  clay: "#e7b5a0",
  field: "#141a16"
};

export function Action({ label, onPress, disabled, tone = "brass", accessibilityHint }) {
  const palette = tone === "quiet"
    ? { bg: colors.card, ink: colors.ink, border: colors.line }
    : tone === "clay"
      ? { bg: "#6e463c", ink: colors.ink, border: "#6e463c" }
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
        { backgroundColor: palette.bg, borderColor: palette.border },
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed
      ]}
    >
      <Text style={[styles.actionText, { color: palette.ink }]}>{label}</Text>
    </Pressable>
  );
}

export function HoldTalk({ label, hint, onPressIn, onPressOut, onPress, disabled, live }) {
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
        live && styles.micLive,
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed
      ]}
    >
      <Text style={[styles.micText, { color: live ? colors.ink : colors.brassInk }]}>{label}</Text>
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
        placeholderTextColor="#8d978a"
        multiline={multiline}
        autoCorrect={false}
        autoCapitalize="none"
        style={[styles.input, multiline && styles.inputMulti]}
      />
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

export function Panel({ children }) {
  return <View style={styles.panel}>{children}</View>;
}

export function Prose({ children, tone }) {
  const color = tone === "warn" ? colors.clay : tone === "good" ? colors.moss : colors.ink;
  return <Text style={[styles.prose, { color }]}>{children}</Text>;
}

const styles = StyleSheet.create({
  action: {
    minHeight: 52,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 10
  },
  actionText: {
    fontSize: 17,
    fontWeight: "700"
  },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.8 },
  mic: {
    minHeight: 64,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.brass,
    backgroundColor: colors.brass,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    paddingVertical: 16,
    marginBottom: 8
  },
  micLive: {
    backgroundColor: "#6e463c",
    borderColor: colors.clay
  },
  micText: {
    fontSize: 18,
    fontWeight: "700",
    textAlign: "center"
  },
  fieldWrap: { marginBottom: 14 },
  label: {
    color: colors.muted,
    fontSize: 14,
    marginBottom: 6,
    letterSpacing: 0.2
  },
  input: {
    backgroundColor: colors.field,
    color: colors.ink,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    minHeight: 52,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 18
  },
  inputMulti: {
    minHeight: 120,
    textAlignVertical: "top"
  },
  hint: {
    color: colors.muted,
    fontSize: 13,
    marginTop: 6,
    lineHeight: 18
  },
  panel: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: colors.line
  },
  prose: {
    fontSize: 18,
    lineHeight: 26
  }
});
