import React, { useState } from "react";
import { Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { filterDestinations, looksLikeQuestion } from "./nav_model.js";
import { colors, themedStyles, useDisplay } from "./ui.js";
import { useBackLayer } from "./back_layers.js";
import VoiceSearchButton from "./VoiceSearchButton.js";

const webPointer = Platform.OS === "web" ? { cursor: "pointer" } : null;

// "Ask or go": type to jump to a screen or tool, or send the words to Ask.
export default function CommandSheet({ onGo, onAsk, onClose }) {
  const display = useDisplay();
  const [query, setQuery] = useState("");
  const [voiceNote, setVoiceNote] = useState("");
  const matches = filterDestinations(query);
  const text = query.trim();
  const askFirst = looksLikeQuestion(text);
  useBackLayer(true, onClose);

  const askRow = text ? (
    <Row key="ask" icon="chatbubble-ellipses-outline" label={`Ask Yehsa: “${text}”`} onPress={() => onAsk(text)} display={display} />
  ) : null;

  return (
    <View style={styles.scrim}>
      <Pressable accessibilityRole="button" accessibilityLabel="Close Ask or go" onPress={onClose} style={styles.scrimTap} />
      <View style={styles.sheet} accessibilityViewIsModal>
        <View style={styles.head}>
          <Ionicons name="search" size={20} color={colors.ink} />
          <TextInput
            accessibilityLabel="Ask or go"
            autoFocus
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={() => {
              if (!text) return;
              if (askFirst || matches.length === 0) onAsk(text);
              else onGo(matches[0]);
            }}
            placeholder="Ask or go"
            placeholderTextColor={colors.muted}
            returnKeyType="go"
            style={[styles.input, { fontSize: display.size(17) }]}
          />
          <VoiceSearchButton
            label="Say it"
            onText={setQuery}
            onNote={setVoiceNote}
            onDone={(spoken) => {
              setQuery(spoken);
              setVoiceNote("");
              const found = filterDestinations(spoken);
              if (looksLikeQuestion(spoken) || found.length === 0) onAsk(spoken);
              else onGo(found[0]);
            }}
          />
          <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} style={[styles.close, webPointer]}>
            <Ionicons name="close" size={22} color={colors.ink} />
          </Pressable>
        </View>
        {voiceNote ? <Text accessibilityLiveRegion="polite" style={{ color: colors.muted, paddingHorizontal: 16, paddingBottom: 6 }}>{voiceNote}</Text> : null}
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.list}>
          {askFirst ? askRow : null}
          {matches.map((item) => (
            <Row key={item.id} icon={item.kind === "sos" ? "alert-circle-outline" : "arrow-forward"} label={item.label} onPress={() => onGo(item)} display={display} />
          ))}
          {!askFirst ? askRow : null}
        </ScrollView>
      </View>
    </View>
  );
}

function Row({ icon, label, onPress, display }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => [styles.row, webPointer, pressed && { opacity: 0.82 }]}>
      <Ionicons name={icon} size={18} color={colors.brassText} />
      <Text numberOfLines={2} style={[styles.rowText, { fontSize: display.size(16) }]}>{label}</Text>
    </Pressable>
  );
}

const styles = themedStyles((colors) => ({
  scrim: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0, zIndex: 30, elevation: 30 },
  scrimTap: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.45)" },
  sheet: {
    marginTop: Platform.OS === "ios" ? 52 : 18,
    marginHorizontal: 12,
    maxHeight: "75%",
    backgroundColor: colors.bg,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    overflow: "hidden"
  },
  head: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: colors.line },
  input: { flex: 1, minHeight: 56, color: colors.ink },
  close: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  list: { paddingVertical: 6 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 52, paddingHorizontal: 16 },
  rowText: { color: colors.ink, flex: 1 }
}));
