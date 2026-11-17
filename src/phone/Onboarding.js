import React, { useState } from "react";
import { Platform, ScrollView, Text, View } from "react-native";
import { Action, Quiet, colors, themedStyles, useDisplay } from "./ui.js";
import { TRUST_LINES, TRUST_EVAL } from "./trust_copy.js";

export const ONBOARDED_KEY = "yehsa.onboarded.v1";

// Three short cards, shown once. Skip is always there, and the SOS bumper
// below stays live the whole time. Nothing here asks for location, radio,
// or the microphone.
const CARDS = [
  { id: "trust", title: "A pledge, not a login" },
  { id: "sos", title: "Help is one tap away", body: ["The SOS button sits at the left of the bar on every screen.", "Calling or sending from it needs a hold and a short countdown, so a pocket tap does nothing."] },
  { id: "ask", title: "Yehsa asks first", body: ["Yehsa asks before it saves, acts, or shares anything.", "Location, radio, and the microphone stay off until you turn them on."] }
];

export default function Onboarding({ onDone }) {
  const display = useDisplay();
  const [index, setIndex] = useState(0);
  const card = CARDS[index];
  const last = index === CARDS.length - 1;
  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.count}>{`${index + 1} of ${CARDS.length}`}</Text>
        <Text accessibilityRole="header" style={[styles.title, { fontSize: display.size(28), lineHeight: display.size(34) }]}>{card.title}</Text>
        {card.id === "trust" ? (
          <View style={styles.body}>
            <Text style={styles.badge}>{TRUST_EVAL.badge}</Text>
            {TRUST_LINES.map((line) => <Text key={line} style={[styles.line, { fontSize: display.size(17), lineHeight: display.size(25) }]}>{`•  ${line}`}</Text>)}
            <Quiet>{TRUST_EVAL.summary}</Quiet>
          </View>
        ) : (
          <View style={styles.body}>
            {card.body.map((line) => <Text key={line} style={[styles.line, { fontSize: display.size(17), lineHeight: display.size(25) }]}>{line}</Text>)}
          </View>
        )}
        <Action label={last ? "Start" : "Next"} onPress={() => (last ? onDone() : setIndex(index + 1))} />
        {!last ? <Action label="Skip" tone="quiet" onPress={onDone} /> : null}
      </ScrollView>
    </View>
  );
}

const styles = themedStyles((colors) => ({
  root: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0, backgroundColor: colors.bg, zIndex: 20, elevation: 20 },
  scroll: { paddingTop: Platform.OS === "ios" ? 72 : 48, paddingHorizontal: 26, paddingBottom: 40 },
  count: { color: colors.muted, fontSize: 13, fontWeight: "600", marginBottom: 10 },
  title: { color: colors.ink, fontWeight: "700", letterSpacing: -0.4 },
  body: { gap: 12, marginVertical: 22 },
  line: { color: colors.ink },
  badge: {
    alignSelf: "flex-start",
    color: colors.brassInk,
    backgroundColor: colors.brass,
    borderWidth: 1,
    borderColor: colors.ink,
    borderRadius: 999,
    overflow: "hidden",
    paddingHorizontal: 10,
    paddingVertical: 4,
    fontSize: 12,
    fontWeight: "700"
  }
}));
