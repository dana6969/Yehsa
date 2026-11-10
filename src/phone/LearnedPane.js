import React, { useState } from "react";
import { Platform, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import {
  applyLearnedReview,
  deleteLearned,
  editLearned,
  exportLearned,
  importLearned,
  learnedShareText,
  learnedSummary,
  resetLearned,
  reviewLearned,
  searchLearned
} from "../../symbolic/learned_notes.js";
import { Action, Quiet, ScreenHeader, colors } from "./ui.js";

export default function LearnedPane({ store, deviceId, onChange, onShare }) {
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState("");
  const [review, setReview] = useState(null);
  const [share, setShare] = useState(null);
  const [fileNote, setFileNote] = useState("Export and import stay on a file you keep. Nothing is uploaded.");
  const notes = searchLearned(store, query);

  function exportFile() {
    const body = exportLearned(store);
    if (Platform.OS === "web" && typeof document !== "undefined") {
      const blob = new Blob([body], { type: "application/json" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = "yehsa-learned-notes.json";
      link.click();
      setFileNote("Downloaded yehsa-learned-notes.json. It was not uploaded.");
      return;
    }
    setFileNote("This install cannot write that file. Nothing was uploaded.");
  }

  function importFile() {
    if (Platform.OS !== "web" || typeof document === "undefined") {
      setFileNote("Choosing a file is not available here. Nothing was imported.");
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
          setFileNote("Imported onto this phone. The notes were not sent anywhere.");
        } catch {
          setFileNote("That file was not a learned-notes file. Nothing changed.");
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }

  return (
    <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
      <ScreenHeader
        title="What Yehsa has learned"
        lead="This is retrieval memory on this phone, not retraining of a neural model. Yehsa can answer a learned question after you teach it, and abstains otherwise."
      />
      <Quiet>{learnedSummary(store)} Notes stay bound to this device. They are not shared over the mesh unless you approve a share.</Quiet>
      {store?.rejected ? <Quiet>Notes from another device were not opened.</Quiet> : null}
      <TextInput accessibilityLabel="Search learned notes" value={query} onChangeText={setQuery} placeholder="Search" placeholderTextColor="#8f9a8c" style={styles.input} />
      <View style={styles.row}>
        <Action label="Export file" tone="quiet" onPress={exportFile} />
        <Action label="Import file" tone="quiet" onPress={importFile} />
        <Action label="Reset all learned notes" tone="clay" onPress={() => onChange(resetLearned(deviceId))} />
      </View>
      <Quiet>{fileNote}</Quiet>
      <Action label="Review learned notes" tone="quiet" onPress={() => setReview(reviewLearned(store)[0] || { empty: true })} />
      {review?.empty ? <Quiet>Curator, Verifier, and corpus health found nothing to propose.</Quiet> : null}
      {review && !review.empty ? (
        <View style={styles.card}>
          <Text style={styles.title}>{review.text}</Text>
          <View style={styles.row}>
            <Action label="Approve" onPress={() => { onChange(applyLearnedReview(store, review, true)); setReview(null); }} />
            <Action label="Decline" tone="clay" onPress={() => setReview(null)} />
          </View>
        </View>
      ) : null}
      {notes.length === 0 ? <Quiet>Nothing learned yet. Approve a model answer, a correction, or a field note and it can be retrieved later.</Quiet> : null}
      {notes.map((note) => (
        <View key={note.id} style={styles.card}>
          <Text style={styles.title}>{note.title}</Text>
          <Quiet>{`Learned on this device from ${note.source}. ${note.confidence}. ${note.hidden ? "Hidden." : "Used when a question matches."}`}</Quiet>
          <Text style={styles.body}>{note.text}</Text>
          {editing === note.id ? (
            <TextInput accessibilityLabel="Edit learned note" value={draft} onChangeText={setDraft} multiline style={[styles.input, styles.multi]} />
          ) : null}
          <View style={styles.row}>
            <Action label="Edit" tone="quiet" onPress={() => { setEditing(note.id); setDraft(note.text); }} />
            <Action label="Save edit" tone="quiet" onPress={() => { onChange(editLearned(store, note.id, { text: draft })); setEditing(null); }} />
            <Action label="Delete" tone="clay" onPress={() => onChange(deleteLearned(store, note.id))} />
            <Action label="Share on mesh" tone="quiet" onPress={() => setShare(note)} />
          </View>
        </View>
      ))}
      {share ? (
        <View style={styles.card}>
          <Text style={styles.body}>{`Share this note on the mesh? ${learnedShareText(share)} Position is not included.`}</Text>
          <View style={styles.row}>
            <Action label="Approve" onPress={() => { const note = share; setShare(null); const result = onShare(note); if (result) setFileNote(result); }} />
            <Action label="Decline" tone="clay" onPress={() => setShare(null)} />
          </View>
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingTop: 22, paddingHorizontal: 22, paddingBottom: 180, gap: 10 },
  input: { minHeight: 48, color: colors.ink, backgroundColor: colors.surface, borderRadius: 12, paddingHorizontal: 12 },
  multi: { minHeight: 90, paddingVertical: 8 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  card: { backgroundColor: colors.surface, borderRadius: 16, padding: 12, gap: 8 },
  title: { color: colors.ink, fontSize: 16, fontWeight: "600" },
  body: { color: colors.ink, fontSize: 15, lineHeight: 22 }
});
