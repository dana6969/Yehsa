// Small shared pieces for the hunting screens. Meaning is always in words, never color alone.
import React from "react";
import { Platform, Pressable, Text, View } from "react-native";
import { Quiet, colors, tokens, themedStyles, useDisplay } from "./ui.js";

export const screenStyles = themedStyles((c) => ({
  scroll: { paddingTop: Platform.OS === "ios" ? 52 : 22, paddingHorizontal: tokens.space.xl, paddingBottom: 48, gap: 10 }
}));

export function Chips({ options, value, onChange, label }) {
  const display = useDisplay();
  return (
    <View accessibilityLabel={label} style={styles.chips}>
      {options.map((option) => {
        const on = option.id === value;
        return (
          <Pressable
            key={option.id}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            accessibilityLabel={`${option.label}${on ? ", selected" : ""}`}
            onPress={() => onChange(option.id)}
            style={[styles.chip, { borderColor: on ? colors.brass : display.line, backgroundColor: on ? colors.surface : "transparent" }]}
          >
            <Text style={[styles.chipText, { color: on ? colors.brassText : colors.ink, fontSize: display.size(14) }]}>{on ? `${option.label} ✓` : option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function SourceTag({ source }) {
  return <Text style={styles.tag}>{`Source: ${source}`}</Text>;
}

export function Card({ title, children }) {
  const display = useDisplay();
  return (
    <View style={[styles.card, { borderColor: display.line }]}>
      {title ? <Text accessibilityRole="header" style={[styles.cardTitle, { fontSize: display.size(16) }]}>{title}</Text> : null}
      {children}
    </View>
  );
}

export function Line({ label, value, strong }) {
  const display = useDisplay();
  return (
    <View style={styles.line}>
      <Text style={[styles.lineLabel, { color: display.muted, fontSize: display.size(14) }]}>{label}</Text>
      <Text style={[styles.lineValue, strong && styles.strong, { fontSize: display.size(16) }]}>{value}</Text>
    </View>
  );
}

export function Footer({ children }) {
  return <Quiet>{children}</Quiet>;
}

const styles = themedStyles((c) => ({
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 6 },
  chip: { minHeight: 44, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, justifyContent: "center" },
  chipText: { fontWeight: "600" },
  tag: { color: c.muted, fontSize: 12, marginTop: 2 },
  card: { borderWidth: 1, borderRadius: tokens.radius.lg, backgroundColor: c.surface, padding: 14, gap: 6 },
  cardTitle: { color: c.ink, fontWeight: "700" },
  line: { flexDirection: "row", justifyContent: "space-between", gap: 12, paddingVertical: 2 },
  lineLabel: { flexShrink: 1 },
  lineValue: { color: c.ink, fontWeight: "500", textAlign: "right", flexShrink: 1 },
  strong: { fontWeight: "700" }
}));
