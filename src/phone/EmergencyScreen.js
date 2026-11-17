import React, { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Action, Quiet, colors, tokens, useDisplay } from "./ui.js";
import { speakProse, stopProse } from "./speech_provider.js";
import { coordinateText } from "./emergency_model.js";

// Full-screen emergency view. It opens over whatever was on screen and Close
// (or the back key) returns there. No surveys, no model prompts, no pop-ups.
// Nothing here shares or calls without a separate confirm.
export default function EmergencyScreen({ position, onClose, onMeshSos, onFirstAid }) {
  const display = useDisplay();
  const coords = coordinateText(position);
  const [note, setNote] = useState("");

  useEffect(() => () => {
    stopProse();
  }, []);

  function speak(text) {
    setNote("");
    speakProse(text, {
      onError: () => setNote("This phone cannot speak right now. The words stay on screen.")
    }).then((result) => {
      if (!result?.ok) setNote(result?.reason || "This phone cannot speak right now. The words stay on screen.");
    });
  }

  return (
    <View style={styles.root} accessibilityViewIsModal>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text accessibilityRole="header" style={[styles.title, { fontSize: display.size(28) }]}>Emergency</Text>
        <Text style={[styles.lead, { color: display.muted }]}>Close returns you to where you were.</Text>
        <View style={styles.coordsCard}>
          <Text accessibilityLabel={coords.spoken} style={[styles.coords, { fontSize: display.size(coords.held ? tokens.type.coords : 22) }]} selectable>
            {coords.big}
          </Text>
          <Quiet>{coords.detail}</Quiet>
          <Action label="Speak coordinates" tone="quiet" onPress={() => speak(coords.spoken)} />
        </View>
        <Action label="Mesh SOS in People" tone="clay" onPress={onMeshSos} accessibilityHint="Opens People. The SOS there asks before it sends, and leaves your place out unless you turn it on." />
        <Action label="First-aid notes" tone="quiet" onPress={onFirstAid} accessibilityHint="Opens Ask with first-aid notes from this phone." />
        {note ? <Quiet live>{note}</Quiet> : null}
        <Action label="Close" tone="quiet" onPress={onClose} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: tokens.sos.screen,
    zIndex: 50,
    elevation: 50
  },
  scroll: {
    paddingTop: 34,
    paddingHorizontal: 22,
    paddingBottom: 40
  },
  title: {
    color: colors.ink,
    fontWeight: "700",
    letterSpacing: -0.4
  },
  lead: {
    fontSize: 15,
    lineHeight: 22,
    marginTop: 6,
    marginBottom: 16
  },
  coordsCard: {
    backgroundColor: colors.field,
    borderRadius: tokens.radius.lg,
    padding: 16,
    marginBottom: 14,
    gap: 8
  },
  coords: {
    color: colors.ink,
    fontWeight: "700",
    letterSpacing: -0.3,
    fontVariant: ["tabular-nums"]
  }
});
