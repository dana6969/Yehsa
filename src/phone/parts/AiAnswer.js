// The Yehsa AI (on-device) block under an answer: thinking, streaming text, then the label and the
// passages it cited. Always visibly separate from Yehsa's own answer above it.
import React from "react";
import { Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { themedStyles } from "../ui.js";
import { AI_LABEL } from "../../../symbolic/llm/model_info.js";

export default function AiAnswer({ ai, onStop }) {
  if (!ai || !ai.state || ai.state === "skipped") return null;
  const live = ai.state === "thinking" || ai.state === "streaming";
  if (ai.state === "error") {
    return <View style={styles.box}><Text style={styles.note}>{`${AI_LABEL}: ${ai.note || "could not run this time."}`}</Text></View>;
  }
  return (
    <View style={styles.box} accessibilityLiveRegion={live ? "polite" : "none"}>
      <View style={styles.head}>
        <Ionicons name="sparkles-outline" size={14} style={styles.icon} />
        <Text style={styles.kicker}>{AI_LABEL}</Text>
        {live && onStop ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Stop Yehsa AI" onPress={onStop} hitSlop={10} style={styles.stop}>
            <Text style={styles.stopText}>Stop</Text>
          </Pressable>
        ) : null}
      </View>
      {ai.text ? <Text style={styles.body}>{ai.text}{ai.state === "streaming" ? " ▍" : ""}</Text> : null}
      {!ai.text && live ? <Text style={styles.note}>{ai.note || "Thinking over the passages above…"}</Text> : null}
      {ai.state === "done" && ai.footer ? <Text style={styles.note}>{ai.footer}</Text> : null}
    </View>
  );
}

const styles = themedStyles((colors) => ({
  box: { marginTop: 10, paddingTop: 8, paddingLeft: 10, borderLeftWidth: 2, borderLeftColor: colors.brass },
  head: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 },
  icon: { color: colors.brass },
  kicker: { color: colors.brass, fontSize: 12, fontWeight: "700", letterSpacing: 0.3, flex: 1 },
  body: { color: colors.ink, fontSize: 15, lineHeight: 21 },
  note: { color: colors.muted, fontSize: 12, lineHeight: 17, marginTop: 4 },
  stop: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, borderWidth: 1, borderColor: colors.line },
  stopText: { color: colors.muted, fontSize: 12 }
}));
