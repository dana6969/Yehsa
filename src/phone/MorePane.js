import React, { useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { MORE_ITEMS } from "./nav_model.js";
import VoiceSearchButton from "./VoiceSearchButton.js";
import { filterMoreItems } from "../../symbolic/voice_search.js";
import { Quiet, ScreenHeader, colors, tokens, useDisplay, themedStyles } from "./ui.js";

const webPointer = Platform.OS === "web" ? { cursor: "pointer" } : null;

// Display, privacy and the tools that do not need a tab. Every child screen has a Back
// control and the hardware back key does the same.
export default function MorePane({ onOpen, onBack, backLabel, items = MORE_ITEMS }) {
  const display = useDisplay();
  const [query, setQuery] = useState("");
  const [note, setNote] = useState("");
  const shown = filterMoreItems(items, query);
  return (
    <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
      <ScreenHeader title="More" lead="Display, privacy, and the rest of the tools that don't need a tab." onBack={onBack} backLabel={backLabel} />
      {/* R10: type or say what you want; the list narrows to it. */}
      <View style={[styles.search, { borderColor: display.line }]}>
        <Ionicons name="search" size={18} color={display.muted} />
        <TextInput
          accessibilityLabel="Search More"
          value={query}
          onChangeText={(t) => { setQuery(t); setNote(""); }}
          onSubmitEditing={() => { if (shown.length === 1) onOpen(shown[0].id); }}
          placeholder="Search More"
          placeholderTextColor={display.muted}
          returnKeyType="search"
          style={[styles.searchInput, { fontSize: display.size(16) }]}
        />
        <VoiceSearchButton
          label="Search More by voice"
          onText={setQuery}
          onNote={setNote}
          onDone={(spoken) => {
            setQuery(spoken);
            const found = filterMoreItems(items, spoken);
            if (found.length === 1) { setNote(""); onOpen(found[0].id); }
            else setNote(found.length ? `${found.length} matches for "${spoken}".` : `Nothing in More matches "${spoken}".`);
          }}
        />
      </View>
      {note ? <Quiet live>{note}</Quiet> : null}
      <View style={[styles.list, { borderColor: display.line }]}>
        {shown.map((item, index) => (
          <Pressable
            key={item.id}
            accessibilityRole="button"
            accessibilityLabel={item.label}
            accessibilityHint={item.hint}
            onPress={() => onOpen(item.id)}
            style={({ pressed }) => [styles.row, webPointer, index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: display.line }, pressed && styles.pressed]}
          >
            <View style={styles.copy}>
              <Text style={[styles.label, { fontSize: display.size(16) }]}>{item.label}</Text>
              <Text style={[styles.hint, { color: display.muted, fontSize: display.size(13) }]}>{item.hint}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={display.muted} />
          </Pressable>
        ))}
      </View>
      <Quiet>Location, radio, and models each stay off until you turn them on.</Quiet>
    </ScrollView>
  );
}

const styles = themedStyles((colors) => ({
  scroll: {
    paddingTop: Platform.OS === "ios" ? 52 : 22,
    paddingHorizontal: tokens.space.xl,
    paddingBottom: 180
  },
  list: {
    borderWidth: 1,
    borderRadius: tokens.radius.lg,
    backgroundColor: colors.surface,
    marginBottom: 16
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 64,
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 12
  },
  copy: { flex: 1 },
  search: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderRadius: tokens.radius.lg, backgroundColor: colors.surface, paddingLeft: 12, marginBottom: 12, minHeight: 48 },
  searchInput: { flex: 1, color: colors.ink, minHeight: 48 },
  label: { color: colors.ink, fontWeight: "600" },
  hint: { marginTop: 2, lineHeight: 18 },
  pressed: { opacity: 0.82 }
}));
