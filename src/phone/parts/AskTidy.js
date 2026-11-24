// Ask, less crowded (Dana, 24 Nov): sources fold behind one "Sources (n)" line, at most two
// follow-up chips, smaller tag chips. Lucky's Field tokens; the fold is words + a chevron.
import React, { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, themedStyles } from "../ui.js";

export const MAX_FOLLOW_UPS = 2;

/** At most two follow-up chips, without repeats. */
export function followUps(suggestions, max = MAX_FOLLOW_UPS) {
  const seen = new Set();
  const out = [];
  for (const chip of suggestions || []) {
    const key = String(chip?.label || "").toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(chip);
    if (out.length >= max) break;
  }
  return out;
}

/** Count of what sits behind the fold: the source line plus each tag. */
export function sourceCount(source, chips) {
  return (source ? 1 : 0) + (Array.isArray(chips) ? chips.length : 0);
}

export function SourcesFold({ source, chips, label = (x) => x }) {
  const [open, setOpen] = useState(false);
  const n = sourceCount(source, chips);
  if (!n) return null;
  return (
    <View style={styles.wrap}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`Sources, ${n}. ${open ? "Hide" : "Show"}.`}
        hitSlop={8}
        onPress={() => setOpen((v) => !v)}
        style={styles.row}
      >
        <Ionicons name={open ? "chevron-down" : "chevron-forward"} size={14} color={colors.muted} />
        <Text style={styles.label}>{`Sources (${n})`}</Text>
      </Pressable>
      {open ? (
        <View style={styles.body}>
          {source ? <Text style={styles.line}>{source}</Text> : null}
          {chips?.length ? (
            <View style={styles.tags}>
              {chips.map((chip) => <Text key={chip} style={styles.tag}>{label(chip)}</Text>)}
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = themedStyles((c) => ({
  wrap: { marginTop: 4 },
  row: { flexDirection: "row", alignItems: "center", gap: 4, minHeight: 32, alignSelf: "flex-start" },
  label: { color: c.muted, fontSize: 13, fontWeight: "600" },
  body: { gap: 4, paddingLeft: 18 },
  line: { color: c.muted, fontSize: 12, lineHeight: 17 },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: 4 },
  tag: { color: c.muted, fontSize: 11, lineHeight: 15, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 8, borderWidth: 1, borderColor: c.line }
}));
