// Identify: offline camera ID.
// Take or choose a photo. An on-device model compares it with reference photos of the things
// Yehsa has notes for (plants, trees, mushrooms, animals, tracks and scat) and lists up to three
// nearest, with a match band in words and the look-alikes. It never says anything is safe to
// eat or use, and when nothing is close it says "I'm not sure" instead of guessing.
// Props:
//   onOpenNote(symbol)  open a herbology note, picture-guide entry, or an Ask question (optional)
//   onOpenGuide()       open the picture guide (optional)
//   onBack()            leave the screen (optional)
import React, { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { Action, Quiet, ScreenHeader, colors, themedStyles } from "./ui.js";
import { identify, UNSURE_QUIET } from "./camera_id_match.js";
import { cameraIdAvailable, CAMERA_ID_UNAVAILABLE, embedPhoto } from "./camera_id_native.js";

let notesCache = null;
function noteText(symbol) {
  if (!symbol) return "";
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
const GROUP_LABEL = { plant: "Plants", tree: "Trees and shrubs", mushroom: "Mushrooms", animal: "Animals", track: "Tracks", scat: "Scat" };
// A note about the species, not a verdict on the photo. The camera never says a thing is safe to eat.
const USE_TAG = { deadly: "Reference note: this species is deadly. Not a verdict on your photo.", toxic: "Reference note: this species is toxic. Not a verdict on your photo." };

export default function CameraIdScreen({ onOpenNote, onOpenGuide, onBack }) {
  const [photo, setPhoto] = useState(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [openNote, setOpenNote] = useState("");
  const [openLook, setOpenLook] = useState("");
  const [creditsFor, setCreditsFor] = useState("");
  const [credits, setCredits] = useState(false);
  const [setList, setSetList] = useState(false);
  const available = cameraIdAvailable();

  const run = useCallback(async (asset) => {
    setPhoto(asset);
    setResult(null);
    setError("");
    setOpenNote("");
    setOpenLook("");
    setBusy(true);
    try {
      const index = cameraIndex();
      const vec = await embedPhoto(asset, index.model);
      setResult(identify(index, vec));
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

  const grouped = useMemo(() => {
    if (!setList) return null;
    const meta = cameraIndex().meta;
    const out = {};
    Object.values(meta).filter((m) => m.group !== "everyday").forEach((m) => { (out[m.group] = out[m.group] || []).push(m.title); });
    return out;
  }, [setList]);
  const total = useMemo(() => (available ? Object.values(cameraIndex().meta).filter((m) => m.group !== "everyday").length : 0), [available]);

  return (
    <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
      <ScreenHeader title="Identify" lead="Fill the frame with one wild plant, mushroom or animal. Food and objects are not in the set. I only compare these photos with notes on this phone." onBack={onBack} backLabel="Field" />

      {!available ? <Quiet>{CAMERA_ID_UNAVAILABLE}</Quiet> : null}
      <View style={styles.row}>
        <Action label="Take photo" onPress={takePhoto} disabled={busy || !available} accessibilityHint="Opens the camera. One subject, close, in daylight works best." style={styles.grow} />
        <Action label="Choose photo" tone="quiet" onPress={choosePhoto} disabled={busy || !available} accessibilityHint="Pick a photo already on this phone." style={styles.grow} />
      </View>
      <Quiet>Photo hints, never a verdict. Works offline and the photo stays on this phone. {total ? `Covers ${total} things: plants, trees, mushrooms, key animals, tracks and scat.` : ""}</Quiet>
      <Pressable accessibilityRole="button" accessibilityLabel={setList ? "Hide what is covered" : "What is covered"} onPress={() => setSetList(!setList)}>
        <Text style={styles.link}>{setList ? "Hide what is covered" : "What is covered"}</Text>
      </Pressable>
      {grouped ? Object.entries(grouped).map(([g, names]) => <Quiet key={g}>{`${GROUP_LABEL[g] || g}: ${names.join(", ")}.`}</Quiet>) : null}

      {photo?.uri ? <Image source={{ uri: photo.uri }} style={styles.photo} accessibilityLabel="Your photo" /> : null}
      {busy ? (
        <View style={styles.row}>
          <ActivityIndicator color={colors.brass} />
          <Quiet live>Comparing on this phone…</Quiet>
        </View>
      ) : null}
      {error ? <Text style={styles.warnText} accessibilityLiveRegion="polite">{error}</Text> : null}

      {result?.status === "unsure" ? (
        <View style={styles.card} accessibilityRole="summary">
          <Text accessibilityRole="header" style={styles.title}>{result.title}</Text>
          <Text style={styles.body} accessibilityLiveRegion="polite">{result.text}</Text>
          {result.domain === "everyday" ? <Quiet>{result.quiet}</Quiet> : null}
          {result.deadlyLine ? <Text style={styles.warnText}>{result.deadlyLine} {result.emergency}</Text> : null}
          {result.domain !== "everyday" ? <Quiet>{UNSURE_QUIET}</Quiet> : null}
          <Action label="Try another photo" onPress={choosePhoto} disabled={busy || !available} />
          {onOpenGuide ? <Action label="Open the picture guide" tone="quiet" onPress={onOpenGuide} /> : null}
        </View>
      ) : null}

      {result?.status === "match" ? (
        <View>
          <Quiet live>{result.text}</Quiet>
          {result.deadlyNearby.length ? (
            <View style={styles.warnBox}>
              <Text style={styles.warnTitle}>Deadly look-alike in the top three</Text>
              <Text style={styles.warnText}>{`${result.deadlyNearby.map((id) => cameraIndex().meta[id].title).join(", ")} scored near this photo. Treat it as deadly until someone who knows it checks it in person. ${result.emergency}`}</Text>
            </View>
          ) : null}
          {result.suggestions.map((item, k) => (
            <View key={item.id} style={styles.card}>
              <View style={styles.cardHead}>
                <Text style={styles.rank}>{k + 1}</Text>
                <View style={styles.grow}>
                  <Text style={styles.title}>{item.title}</Text>
                  {item.latin ? <Quiet>{item.latin}</Quiet> : null}
                </View>
                <View style={[styles.band, item.use === "deadly" && styles.bandDeadly]}>
                  <Text style={styles.bandText}>{item.bandText}</Text>
                </View>
              </View>
              {USE_TAG[item.use] ? <Text style={styles.deadlyTag}>{USE_TAG[item.use]}</Text> : null}
              <Quiet>{item.bandHint}</Quiet>
              <Text style={styles.label}>What to look for</Text>
              <Text style={styles.body}>{item.look}</Text>
              {item.caution ? <Text style={styles.warnText}>{item.caution}</Text> : null}
              {item.notes.map((line) => <Text key={line} style={styles.warnText}>{line}</Text>)}
              {item.lookalikes.length ? (
                <View>
                  <Text style={styles.label}>Look-alikes</Text>
                  <View style={styles.row}>
                    {item.lookalikes.map((other) => (
                      <Pressable key={other.id} accessibilityRole="button" accessibilityLabel={`Look-alike: ${other.title}${other.deadly ? ", deadly" : ""}`} onPress={() => setOpenLook(openLook === `${item.id}:${other.id}` ? "" : `${item.id}:${other.id}`)} style={styles.chip}>
                        <Text style={styles.chipText}>{other.deadly ? `${other.title} (deadly)` : other.title}</Text>
                      </Pressable>
                    ))}
                  </View>
                  {item.lookalikes.map((other) => (openLook === `${item.id}:${other.id}` ? <Text key={other.id} style={styles.body}>{`${other.title}: ${cameraIndex().meta[other.id].look}`}</Text> : null))}
                </View>
              ) : null}
              <View style={styles.row}>
                {item.note ? <Action label="Read the note" tone="quiet" onPress={() => showNote(item.note)} /> : null}
                {onOpenNote ? <Action label={item.guide ? "Picture guide" : "Ask about it"} tone="quiet" onPress={() => onOpenNote(item.guide || item.note || item.id)} /> : null}
              </View>
              {item.note && openNote === item.note ? <Text style={styles.body}>{noteText(item.note)}</Text> : null}
              <Pressable accessibilityRole="button" accessibilityLabel={`Photo credits for ${item.title}`} onPress={() => setCreditsFor(creditsFor === item.id ? "" : item.id)}>
                <Text style={styles.link}>{creditsFor === item.id ? "Hide photo credits" : "Photo credits for this one"}</Text>
              </Pressable>
              {creditsFor === item.id ? <ClassCredits id={item.id} /> : null}
            </View>
          ))}
          <Quiet>{result.warning}</Quiet>
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
      <Quiet>{`${index.model.name}. License ${index.model.license}. ${index.model.sourceUrl}`}</Quiet>
      <Quiet>Reference photos come from iNaturalist research-grade observations licensed CC0, CC BY or CC BY-SA, taken by iNaturalist members. The photos are not in the app, only their numeric fingerprints. Each result has its own credits list.</Quiet>
    </View>
  );
}

function ClassCredits({ id }) {
  // eslint-disable-next-line global-require
  const { loadCameraCredits } = require("./camera_id_index.js");
  const list = loadCameraCredits().classes[id] || [];
  return (
    <View>
      <Quiet>{`${list.length} reference photos. Observer, license, and observation number on inaturalist.org:`}</Quiet>
      {list.slice(0, 60).map(([obs, user, lic]) => <Quiet key={obs}>{`${user || "unknown"} · ${String(lic).toUpperCase()} · observations/${obs}`}</Quiet>)}
      {list.length > 60 ? <Quiet>{`…and ${list.length - 60} more.`}</Quiet> : null}
    </View>
  );
}

const styles = themedStyles((colors) => ({
  scroll: { padding: 20, paddingBottom: 180, gap: 12 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8, alignItems: "center" },
  grow: { flexGrow: 1 },
  warnBox: { borderWidth: 1, borderColor: colors.clay, backgroundColor: colors.surface, borderRadius: 12, padding: 14, gap: 4 },
  warnTitle: { color: colors.clay, fontWeight: "700", fontSize: 15 },
  warnText: { color: colors.clay, fontSize: 14, lineHeight: 20 },
  photo: { width: "100%", aspectRatio: 1, borderRadius: 12, backgroundColor: colors.surface },
  card: { borderWidth: 1, borderColor: colors.lineStrong, backgroundColor: colors.surface, borderRadius: 16, padding: 16, gap: 8, marginTop: 8 },
  cardHead: { flexDirection: "row", alignItems: "center", gap: 10 },
  rank: { color: colors.brass, fontWeight: "700", fontSize: 18, width: 20 },
  title: { color: colors.ink, fontSize: 18, fontWeight: "700" },
  body: { color: colors.ink, fontSize: 15, lineHeight: 22 },
  label: { color: colors.muted, fontSize: 12, letterSpacing: 1, textTransform: "uppercase", marginTop: 4 },
  band: { borderWidth: 1, borderColor: colors.lineStrong, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  bandDeadly: { borderColor: colors.clay },
  bandText: { color: colors.ink, fontSize: 13 },
  deadlyTag: { color: colors.clay, fontWeight: "800", letterSpacing: 1.5 },
  chip: { borderWidth: 1, borderColor: colors.lineStrong, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8, minHeight: 44, justifyContent: "center" },
  chipText: { color: colors.ink, fontSize: 14 },
  link: { color: colors.brassText, fontSize: 14, marginTop: 4, paddingVertical: 10 }
}));
