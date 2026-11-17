import React, { useState } from "react";
import { Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import {
  confirmLearned,
  deleteLearned,
  editLearned,
  exportLearned,
  importLearned,
  learnedShareText,
  noteOrigin,
  resetLearned,
  searchLearned
} from "../../symbolic/learned_notes.js";
import { Action, Quiet, ScreenHeader, colors, themedStyles } from "./ui.js";

// What Yehsa has learned. Copy and layout follow /workspace/yehsa-design/fixes-handoff.md §2.
export default function LearnedPane({ store, deviceId, onChange, onShare, onBack, backLabel, onOpenDid }) {
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState("");
  const [share, setShare] = useState(null);
  const [confirmAll, setConfirmAll] = useState(false);
  const [fileNote, setFileNote] = useState("");
  const notes = searchLearned(store, query).filter((note) => !note.hidden);
  const total = (store?.notes || []).filter((note) => !note.hidden).length;

  function exportFile() {
    const body = exportLearned(store);
    if (Platform.OS === "web" && typeof document !== "undefined") {
      const blob = new Blob([body], { type: "application/json" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = "yehsa-learned-notes.json";
      link.click();
      setFileNote("Saved yehsa-learned-notes.json. It stays with you; nothing was uploaded.");
      return;
    }
    setFileNote("Saving to a file isn't available on this phone yet.");
  }

  function importFile() {
    if (Platform.OS !== "web" || typeof document === "undefined") {
      setFileNote("Opening a file isn't available on this phone yet.");
      return;
    }
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,application/json";
    input.onchange = () => {
      const file = input.files && input.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const parsed = JSON.parse(String(reader.result || ""));
          onChange(importLearned(parsed, deviceId));
          setFileNote("Notes added to this phone.");
        } catch {
          setFileNote("That file isn't a Yehsa notes file. Nothing changed.");
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }

  return (
    <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
      <ScreenHeader
        onBack={onBack}
        backLabel={backLabel}
        title="What Yehsa has learned"
        lead="Things you asked Yehsa to remember on this phone."
      />
      {store?.rejected ? <Quiet>Notes from another phone can't be opened here.</Quiet> : null}
      {total > 0 ? (
        <TextInput accessibilityLabel="Search saved notes" value={query} onChangeText={setQuery} placeholder="Search saved notes" placeholderTextColor={colors.muted} style={styles.input} />
      ) : null}
      {total === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.title}>Nothing saved yet</Text>
          <Text style={styles.body}>When you mark an answer Yes, or approve a note, it will show up here.</Text>
        </View>
      ) : null}
      {total > 0 && notes.length === 0 ? <Quiet>No saved notes match that.</Quiet> : null}
      {notes.map((note) => (
        <View key={note.id} style={styles.card}>
          <Text style={styles.title}>{note.title}</Text>
          <Text style={styles.meta}>{noteOrigin(note)}</Text>
          {editing === note.id ? (
            <TextInput accessibilityLabel="Edit note" value={draft} onChangeText={setDraft} multiline style={[styles.input, styles.multi]} />
          ) : (
            note.text && note.text !== note.title ? <Text numberOfLines={6} style={styles.body}>{note.text}</Text> : null
          )}
          {editing === note.id ? (
            <View style={styles.row}>
              <Action label="Save" onPress={() => { onChange(editLearned(store, note.id, { text: draft })); setEditing(null); }} />
              <Action label="Cancel" tone="quiet" onPress={() => setEditing(null)} />
            </View>
          ) : (
            <View style={styles.row}>
              {note.confidence === "confirmed" ? (
                <Text style={styles.kept}>Kept</Text>
              ) : (
                <Action label="Keep" onPress={() => onChange(confirmLearned(store, note.id))} />
              )}
              <Action label="Edit" tone="quiet" onPress={() => { setEditing(note.id); setDraft(note.text); }} />
              <Action label="Forget" tone="clay" onPress={() => onChange(deleteLearned(store, note.id))} />
              <Action label="Share nearby" tone="quiet" onPress={() => setShare(note)} />
            </View>
          )}
        </View>
      ))}
      {share ? (
        <View style={styles.card}>
          <Text style={styles.body}>{`Share this note with phones nearby? Your location isn't included.\n\n${learnedShareText(share)}`}</Text>
          <View style={styles.row}>
            <Action label="Share" onPress={() => { const note = share; setShare(null); const result = onShare(note); if (result) setFileNote(result); }} />
            <Action label="Cancel" tone="quiet" onPress={() => setShare(null)} />
          </View>
        </View>
      ) : null}
      {onOpenDid ? (
        <Pressable accessibilityRole="link" onPress={onOpenDid} style={styles.link}>
          <Text style={styles.linkText}>What Yehsa did</Text>
        </Pressable>
      ) : null}
      {total > 0 && !confirmAll ? <Action label="Forget all" tone="clay" onPress={() => setConfirmAll(true)} /> : null}
      {confirmAll ? (
        <View style={styles.card} accessibilityViewIsModal>
          <Text style={styles.title}>Forget all saved notes?</Text>
          <Text style={styles.body}>This removes every note Yehsa has learned on this phone. It cannot be undone.</Text>
          <View style={styles.row}>
            <Action label="Forget all" tone="clay" onPress={() => { onChange(resetLearned(deviceId)); setConfirmAll(false); }} />
            <Action label="Cancel" tone="quiet" onPress={() => setConfirmAll(false)} />
          </View>
        </View>
      ) : null}
      <View style={styles.row}>
        <Action label="Save to a file" tone="quiet" onPress={exportFile} />
        <Action label="Add from a file" tone="quiet" onPress={importFile} />
      </View>
      {fileNote ? <Quiet>{fileNote}</Quiet> : null}
    </ScrollView>
  );
}

const styles = themedStyles((colors) => ({
  scroll: { paddingTop: 22, paddingHorizontal: 22, paddingBottom: 40, gap: 12 },
  input: { minHeight: 48, color: colors.ink, backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.lineStrong, paddingHorizontal: 12 },
  multi: { minHeight: 90, paddingVertical: 8 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8, alignItems: "center" },
  card: { backgroundColor: colors.surface, borderRadius: 16, borderWidth: 2, borderColor: colors.lineStrong, padding: 14, gap: 8 },
  empty: { paddingVertical: 24, gap: 6 },
  title: { color: colors.ink, fontSize: 16, fontWeight: "600" },
  meta: { color: colors.muted, fontSize: 13 },
  body: { color: colors.ink, fontSize: 15, lineHeight: 22 },
  kept: { color: colors.muted, fontSize: 14, minHeight: 48, textAlignVertical: "center", paddingHorizontal: 8 },
  link: { minHeight: 44, justifyContent: "center" },
  linkText: { color: colors.brassText, fontSize: 15, fontWeight: "600" }
}));
