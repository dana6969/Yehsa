import React, { useEffect, useRef, useState } from "react";
import { Linking, Pressable, ScrollView, Share, Text, Vibration, View, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Action, HoldButton, Quiet, colors, themedStyles, tokens, useDisplay } from "./ui.js";
import { speakProse, stopProse } from "./speech_provider.js";
import {
  BLEEDING_STEPS,
  CPR_BPM,
  CPR_STEPS,
  FIRST_AID_CAVEAT,
  SATELLITE_GUIDE,
  beatIntervalMs,
  canIncludePlace,
  coordinateText,
  dialFor,
  meshSosText
} from "./emergency_model.js";

const webPointer = Platform.OS === "web" ? { cursor: "pointer" } : null;

// Full-screen emergency view over whatever was on screen. Close (or the back
// key) returns there. No surveys, no model prompts, no pop-ups. Calling,
// sharing, and sending each need a hold and a countdown. Red is reserved for
// this screen and the SOS bumper.
export default function EmergencyScreen({ position, onClose, onFirstAid, onSendMeshSos }) {
  const display = useDisplay();
  const coords = coordinateText(position);
  const [note, setNote] = useState("");
  const [guide, setGuide] = useState(null);
  const [satellite, setSatellite] = useState(false);
  const [includePlace, setIncludePlace] = useState(false);
  const placeAllowed = canIncludePlace(position);

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

  async function dial(hold) {
    const url = dialFor(hold);
    if (!url) return;
    try {
      await Linking.openURL(url);
      setNote(`The dialer opened with ${url.slice(4)}. Press call on the dialer.`);
    } catch {
      setNote(`This screen cannot open a dialer. Dial ${url.slice(4)} yourself.`);
    }
  }

  async function shareLocation() {
    if (!coords.held) {
      setNote("No position is held, so there is nothing to share. Turn on Location in More first.");
      return;
    }
    try {
      await Share.share({ message: `I need help. My position is ${coords.big}. ${coords.detail.replace("Not shared.", "")}`.trim() });
      setNote("The share sheet opened. Only the app you picked receives it.");
    } catch {
      setNote("This screen cannot open a share sheet. Read the coordinates aloud instead.");
    }
  }

  function sendSos() {
    const message = meshSosText(position, includePlace && placeAllowed);
    const result = onSendMeshSos?.(message) || "Held on this phone for the mesh.";
    setNote(`${result} ${message.placeIncluded ? "Your place was included." : "Your place was not included."}`);
  }

  if (guide) {
    return <StepsGuide kind={guide} onBack={() => setGuide(null)} speak={speak} />;
  }

  return (
    <View style={styles.root} accessibilityViewIsModal>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.headRow}>
          <View style={styles.cap} accessible={false}>
            <Text style={styles.capText}>SOS</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text accessibilityRole="header" style={[styles.title, { fontSize: display.size(28) }]}>Emergency</Text>
            <Text style={[styles.lead, { color: display.muted }]}>Close returns you to where you were.</Text>
          </View>
        </View>
        <View style={styles.coordsCard}>
          <Text accessibilityLabel={coords.spoken} style={[styles.coords, { fontSize: display.size(coords.held ? tokens.type.coordinate.fontSize : 22) }]} selectable>
            {coords.big}
          </Text>
          <Quiet>{coords.detail}</Quiet>
          <Action label="Speak coordinates" tone="quiet" onPress={() => speak(coords.spoken)} />
        </View>
        <HoldButton label="Hold to call 911" countdownLabel="Dialer for 911" target="call:911" onFire={dial} />
        <HoldButton label="Hold to call 112" countdownLabel="Dialer for 112" target="call:112" onFire={dial} tone="quiet" />
        <Action label="Share my location" tone="quiet" onPress={shareLocation} accessibilityHint="Opens your phone's share sheet. You choose who gets it." />
        <View style={styles.row}>
          <View style={{ flex: 1 }}><Action label="CPR steps" onPress={() => setGuide("cpr")} accessibilityHint="Spoken steps with a beat to push to." /></View>
          <View style={{ flex: 1 }}><Action label="Bleeding steps" onPress={() => setGuide("bleeding")} /></View>
        </View>
        <View style={styles.meshCard}>
          <Text style={styles.cardTitle}>Mesh SOS</Text>
          <Quiet>Goes to Yehsa phones you are linked with. It is held on this phone when no link is up.</Quiet>
          <Pressable
            accessibilityRole="switch"
            accessibilityState={{ checked: includePlace && placeAllowed, disabled: !placeAllowed }}
            accessibilityLabel={includePlace && placeAllowed ? "Don't include my location" : "Include my location in the SOS"}
            disabled={!placeAllowed}
            onPress={() => setIncludePlace((value) => !value)}
            style={[styles.toggle, webPointer, !placeAllowed && { opacity: 0.6 }]}
          >
            <Ionicons name={includePlace && placeAllowed ? "checkbox" : "square-outline"} size={22} color={colors.ink} />
            <Text style={styles.toggleText}>
              {placeAllowed
                ? (includePlace ? "Location included" : "Location left out")
                : "Location left out. Location is off, or there is no fix yet."}
            </Text>
          </Pressable>
          <HoldButton label="Hold to send mesh SOS" countdownLabel="Sending SOS" target="mesh-sos" onFire={sendSos} />
        </View>
        <Action label="First-aid notes" tone="quiet" onPress={onFirstAid} accessibilityHint="Opens Ask with first-aid notes from this phone." />
        {note ? <Quiet live>{note}</Quiet> : null}
        <Pressable accessibilityRole="button" accessibilityLabel="Satellite SOS guide" onPress={() => setSatellite((value) => !value)} style={[styles.satHead, webPointer]}>
          <Text style={styles.cardTitle}>Satellite SOS guide</Text>
          <Ionicons name={satellite ? "chevron-up" : "chevron-down"} size={18} color={colors.ink} />
        </Pressable>
        {satellite ? SATELLITE_GUIDE.map((line) => <Quiet key={line}>{line}</Quiet>) : null}
        <Action label="Close" tone="quiet" onPress={onClose} />
      </ScrollView>
    </View>
  );
}

function StepsGuide({ kind, onBack, speak }) {
  const display = useDisplay();
  const steps = kind === "cpr" ? CPR_STEPS : BLEEDING_STEPS;
  const [index, setIndex] = useState(0);
  const [beat, setBeat] = useState(false);
  const [on, setOn] = useState(false);
  const timer = useRef(null);

  useEffect(() => {
    speak(steps[index]);
  }, [index]);

  useEffect(() => {
    if (!on) return undefined;
    // Metronome: a visible pulse and a short vibration on each beat.
    timer.current = setInterval(() => {
      setBeat((value) => !value);
      try {
        Vibration.vibrate(25);
      } catch {
        // No vibration motor. The pulse stays on screen.
      }
    }, beatIntervalMs(CPR_BPM));
    return () => clearInterval(timer.current);
  }, [on]);

  return (
    <View style={styles.root} accessibilityViewIsModal>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Action label="Back to Emergency" tone="quiet" onPress={() => { stopProse(); onBack(); }} />
        <Text accessibilityRole="header" style={[styles.title, { fontSize: display.size(26) }]}>{kind === "cpr" ? "CPR, adult" : "Heavy bleeding"}</Text>
        <Quiet>{`Step ${index + 1} of ${steps.length}`}</Quiet>
        <Text accessibilityLiveRegion="polite" style={[styles.step, { fontSize: display.size(22), lineHeight: display.size(30) }]}>{steps[index]}</Text>
        <View style={styles.row}>
          <View style={{ flex: 1 }}><Action label="Previous" tone="quiet" disabled={index === 0} onPress={() => setIndex((value) => Math.max(0, value - 1))} /></View>
          <View style={{ flex: 1 }}><Action label="Next step" disabled={index === steps.length - 1} onPress={() => setIndex((value) => Math.min(steps.length - 1, value + 1))} /></View>
        </View>
        <Action label="Say it again" tone="quiet" onPress={() => speak(steps[index])} />
        {kind === "cpr" ? (
          <View style={styles.metro}>
            <View accessibilityLabel={on ? `Beat at ${CPR_BPM} per minute` : "Beat off"} style={[styles.pulse, { opacity: on && beat ? 1 : 0.25 }]} />
            <Action label={on ? `Stop the beat (${CPR_BPM} a minute)` : `Start the beat (${CPR_BPM} a minute)`} onPress={() => setOn((value) => !value)} />
            <Quiet>The beat flashes and vibrates. It has no sound on this build.</Quiet>
          </View>
        ) : null}
        <Quiet>{FIRST_AID_CAVEAT}</Quiet>
      </ScrollView>
    </View>
  );
}

const styles = themedStyles((colors) => ({
  root: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: colors.bg,
    zIndex: 50,
    elevation: 50
  },
  scroll: {
    paddingTop: 34,
    paddingHorizontal: 22,
    paddingBottom: 40,
    gap: 4
  },
  headRow: { flexDirection: "row", alignItems: "center", gap: 14, marginBottom: 12 },
  cap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 3,
    borderColor: colors.sosText,
    alignItems: "center",
    justifyContent: "center"
  },
  capText: { color: colors.sosText, fontWeight: "800", fontSize: 16, letterSpacing: 1 },
  title: { color: colors.ink, fontWeight: "700", letterSpacing: -0.4 },
  lead: { fontSize: 15, lineHeight: 22, marginTop: 4 },
  coordsCard: {
    backgroundColor: colors.field,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    padding: 16,
    marginBottom: 12,
    gap: 8
  },
  coords: { color: colors.ink, fontWeight: "700", letterSpacing: -0.3, fontVariant: ["tabular-nums"] },
  row: { flexDirection: "row", gap: 8 },
  meshCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    padding: 14,
    marginVertical: 8,
    gap: 8
  },
  cardTitle: { color: colors.ink, fontSize: 17, fontWeight: "600" },
  toggle: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 48 },
  toggleText: { color: colors.ink, fontSize: 15, flex: 1 },
  satHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 48,
    marginTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingTop: 8
  },
  step: { color: colors.ink, fontWeight: "600", marginVertical: 18 },
  metro: { marginTop: 12, gap: 8, alignItems: "stretch" },
  pulse: { alignSelf: "center", width: 72, height: 72, borderRadius: 36, backgroundColor: colors.brass, borderWidth: 2, borderColor: colors.ink }
}));
