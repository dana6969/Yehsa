// Identify: offline camera ID (plan step 6).
// Take or choose a photo of one plant. An on-device model compares it with
// Yehsa's own reference photos and lists the three nearest plants Yehsa has
// notes for, with a match band in words, the look-alikes, and the note.
// It never says a plant is safe to eat or use, and it declines when nothing
// is close. Props:
//   onOpenNote(symbol)  open a herbology note or picture-guide entry (optional)
//   onBack()            leave the screen (optional)
import React, { useCallback, useState } from "react";
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { Action, Quiet, ScreenHeader, colors } from "./ui.js";
import { CAMERA_CLASSES, PHOTO_WARNING, identify } from "./camera_id_match.js";
import { cameraIdAvailable, CAMERA_ID_UNAVAILABLE, embedPhoto } from "./camera_id_native.js";

let notesCache = null;
function noteText(symbol) {
  if (!notesCache) {
    // eslint-disable-next-line global-require
    const list = require("../../symbolic_books/herbology/notes.json");
    notesCache = Object.fromEntries(list.map((item) => [item.symbol, item.context]));
  }
  return notesCache[symbol] || "";
}

let indexCache = null;
function cameraIndex() {
  if (!indexCache) {
    // eslint-disable-next-line global-require
    const { loadCameraIndex } = require("./camera_id_index.js");
    indexCache = loadCameraIndex();
  }
  return indexCache;
}

const PICK_OPTIONS = { mediaTypes: ["images"], quality: 0.9, allowsEditing: false, exif: false };

export default function CameraIdScreen({ onOpenNote, onBack }) {
  const [photo, setPhoto] = useState(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [openNote, setOpenNote] = useState("");
  const [credits, setCredits] = useState(false);
  const available = cameraIdAvailable();

  const run = useCallback(async (asset) => {
    setPhoto(asset);
    setResult(null);
    setError("");
    setBusy(true);
    try {
      const vec = await embedPhoto(asset);
      setResult(identify(cameraIndex(), vec));
    } catch (err) {
      setError(available ? `${CAMERA_ID_UNAVAILABLE} ${String(err?.message || "")}`.trim() : CAMERA_ID_UNAVAILABLE);
    } finally {
      setBusy(false);
    }
  }, [available]);

  const takePhoto = useCallback(async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      setError("Camera permission is off. You can still choose a photo you already took.");
      return;
    }
    const picked = await ImagePicker.launchCameraAsync(PICK_OPTIONS);
    if (!picked.canceled && picked.assets?.[0]) run(picked.assets[0]);
  }, [run]);

  const choosePhoto = useCallback(async () => {
    const picked = await ImagePicker.launchImageLibraryAsync(PICK_OPTIONS);
    if (!picked.canceled && picked.assets?.[0]) run(picked.assets[0]);
  }, [run]);

  const showNote = (symbol) => setOpenNote(openNote === symbol ? "" : symbol);

  return (
    <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
      {onBack ? <Action label="Back" tone="quiet" onPress={onBack} accessibilityHint="Leaves Identify." /> : null}
      <ScreenHeader title="Identify" lead="Photo hints from Yehsa's own plant notes. Works offline. The photo stays on this phone." />

      <View style={styles.warnBox} accessibilityRole="alert">
        <Text style={styles.warnTitle}>Not an identification</Text>
        <Text style={styles.warnText}>{PHOTO_WARNING}</Text>
      </View>

      {!available ? <Quiet>{CAMERA_ID_UNAVAILABLE}</Quiet> : null}
      <View style={styles.row}>
        <Action label="Take photo" onPress={takePhoto} disabled={busy || !available} accessibilityHint="Opens the camera. One plant, close, in daylight works best." style={styles.grow} />
        <Action label="Choose photo" tone="quiet" onPress={choosePhoto} disabled={busy || !available} accessibilityHint="Pick a photo already on this phone." style={styles.grow} />
      </View>
      <Quiet>Fill the frame with one plant: leaves, flowers, and stem if you can. Only these plants are in the reference set: {Object.values(CAMERA_CLASSES).map((c) => c.title).join(", ")}.</Quiet>

      {photo?.uri ? <Image source={{ uri: photo.uri }} style={styles.photo} accessibilityLabel="Your photo" /> : null}
      {busy ? (
        <View style={styles.row}>
          <ActivityIndicator color={colors.brass} />
          <Quiet live>Comparing on this phone…</Quiet>
        </View>
      ) : null}
      {error ? <Text style={styles.warnText} accessibilityLiveRegion="polite">{error}</Text> : null}

      {result?.status === "declined" ? (
        <View style={styles.card}>
          <Text style={styles.title}>No close match</Text>
          <Text style={styles.body} accessibilityLiveRegion="polite">{result.text}</Text>
          <Text style={styles.warnText}>{result.emergency}</Text>
        </View>
      ) : null}

      {result?.status === "match" ? (
        <View>
          <Quiet live>{result.text}</Quiet>
          {result.deadlyNearby.length ? (
            <View style={styles.warnBox}>
              <Text style={styles.warnTitle}>Deadly plant in the top three</Text>
              <Text style={styles.warnText}>{`${result.deadlyNearby.map((id) => CAMERA_CLASSES[id].title).join(", ")} scored near this photo. Treat the plant as deadly until someone who knows plants checks it in person. ${result.emergency}`}</Text>
            </View>
          ) : null}
          {result.suggestions.map((item, k) => (
            <View key={item.id} style={styles.card}>
              <View style={styles.cardHead}>
                <Text style={styles.rank}>{k + 1}</Text>
                <View style={styles.grow}>
                  <Text style={styles.title}>{item.title}</Text>
                  <Quiet>{item.latin}</Quiet>
                </View>
                <View style={[styles.band, item.use === "deadly" && styles.bandDeadly]}>
                  <Text style={styles.bandText}>{item.bandText}</Text>
                </View>
              </View>
              {item.use === "deadly" ? <Text style={styles.deadlyTag}>DEADLY</Text> : null}
              <Quiet>{item.bandHint}</Quiet>
              {item.notes.map((line) => <Text key={line} style={styles.warnText}>{line}</Text>)}
              <Text style={styles.label}>Look-alikes</Text>
              <View style={styles.row}>
                {item.lookalikes.map((other) => (
                  <Pressable key={other.id} accessibilityRole="button" accessibilityLabel={`Look-alike: ${other.title}${other.deadly ? ", deadly" : ""}`} onPress={() => showNote(other.note)} style={styles.chip}>
                    <Text style={styles.chipText}>{other.deadly ? `${other.title} (deadly)` : other.title}</Text>
                  </Pressable>
                ))}
                <Pressable accessibilityRole="button" accessibilityLabel="Look-alike note" onPress={() => showNote(item.lookalikeNote)} style={styles.chip}>
                  <Text style={styles.chipText}>Look-alike note</Text>
                </Pressable>
              </View>
              <View style={styles.row}>
                <Action label="Read the note" tone="quiet" onPress={() => showNote(item.note)} />
                {onOpenNote ? <Action label={item.guide ? "Picture guide" : "Open in Ask"} tone="quiet" onPress={() => onOpenNote(item.guide || item.note)} /> : null}
              </View>
              {[item.note, item.lookalikeNote, ...item.lookalikes.map((o) => o.note)].includes(openNote) && openNote ? (
                <Text style={styles.body}>{noteText(openNote)}</Text>
              ) : null}
            </View>
          ))}
        </View>
      ) : null}

      <Pressable accessibilityRole="button" accessibilityLabel="Model and photo credits" onPress={() => setCredits(!credits)}>
        <Text style={styles.link}>{credits ? "Hide credits" : "Model and photo credits"}</Text>
      </Pressable>
      {credits ? <Credits /> : null}
    </ScrollView>
  );
}

function Credits() {
  const index = cameraIndex();
  return (
    <View>
      <Quiet>{`${index.model.name}. ${index.model.license}. ${index.model.sourceUrl}`}</Quiet>
      <Quiet>{`Matches against ${index.sources.length} reference photos from Wikimedia Commons and the Yehsa picture guide. Only the photos' number fingerprints are in the app, not the photos.`}</Quiet>
      {index.sources.map((src) => (
        <Quiet key={src.sourceUrl}>{`${src.author}. ${src.license}. ${src.title}. ${src.sourceUrl}`}</Quiet>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 20, paddingBottom: 48, gap: 12 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8, alignItems: "center" },
  grow: { flexGrow: 1 },
  warnBox: { borderWidth: 1, borderColor: "#8d675c", backgroundColor: "#241c19", borderRadius: 12, padding: 14, gap: 4 },
  warnTitle: { color: colors.clay, fontWeight: "700", fontSize: 15 },
  warnText: { color: colors.clay, fontSize: 14, lineHeight: 20 },
  photo: { width: "100%", aspectRatio: 1, borderRadius: 12, backgroundColor: colors.surface },
  card: { borderWidth: 1, borderColor: colors.lineStrong, backgroundColor: colors.surface, borderRadius: 12, padding: 14, gap: 6, marginTop: 8 },
  cardHead: { flexDirection: "row", alignItems: "center", gap: 10 },
  rank: { color: colors.brass, fontWeight: "700", fontSize: 18, width: 20 },
  title: { color: colors.ink, fontSize: 17, fontWeight: "600" },
  body: { color: colors.ink, fontSize: 15, lineHeight: 22 },
  label: { color: colors.muted, fontSize: 12, letterSpacing: 1, textTransform: "uppercase", marginTop: 4 },
  band: { borderWidth: 1, borderColor: "#6f8678", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  bandDeadly: { borderColor: "#8d675c" },
  bandText: { color: colors.ink, fontSize: 13 },
  deadlyTag: { color: colors.clay, fontWeight: "800", letterSpacing: 1.5 },
  chip: { borderWidth: 1, borderColor: "#6f8678", borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8, minHeight: 40, justifyContent: "center" },
  chipText: { color: colors.ink, fontSize: 14 },
  link: { color: colors.brass, fontSize: 14, marginTop: 12, paddingVertical: 8 }
});
