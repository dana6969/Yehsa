// One checklist or status row: icon + word + label. Never colour alone.
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { hit, radius, space, type } from "../tokens.js";
import { colors, themedStyles } from "../ui.js";

export const STATE_LOOK = {
  ready: { icon: "checkmark-circle", word: "Ready", color: colors.success },
  check: { icon: "alert-circle", word: "Check", color: colors.warning },
  missing: { icon: "close-circle", word: "Missing", color: colors.clay },
  info: { icon: "information-circle", word: "Note", color: colors.info }
};

export default function StatusRow({ state = "info", label, detail, children }) {
  const look = STATE_LOOK[state] || STATE_LOOK.info;
  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={`${look.word}. ${label}. ${detail || ""}`}
      style={styles.row}
    >
      <Ionicons name={look.icon} size={26} color={look.color} style={styles.icon} />
      <View style={styles.body}>
        <View style={styles.head}>
          <Text style={[styles.word, { color: look.color, borderColor: look.color }]}>{look.word}</Text>
          <Text style={styles.label}>{label}</Text>
        </View>
        {detail ? <Text style={styles.detail}>{detail}</Text> : null}
        {children}
      </View>
    </View>
  );
}

const styles = themedStyles((colors) => ({
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    minHeight: hit.min,
    paddingVertical: space.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.line
  },
  icon: { marginRight: space.md, marginTop: 2 },
  body: { flex: 1 },
  head: { flexDirection: "row", alignItems: "center", flexWrap: "wrap" },
  word: {
    ...type.label,
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: space.sm,
    paddingVertical: 1,
    marginRight: space.sm,
    overflow: "hidden"
  },
  label: { ...type.action, color: colors.ink, flexShrink: 1 },
  detail: { ...type.quiet, color: colors.muted, marginTop: space.xs }
}));
