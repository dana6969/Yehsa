import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View
} from "react-native";
import { StatusBar } from "expo-status-bar";
import books from "../../symbolic_memory/books_index.json";
import { askField } from "../../symbolic/phone_field.js";
import { phoneCorpusMeta } from "../../symbolic/phone_corpus.js";
import {
  addSessionTrack,
  courseText,
  declinationText,
  gotoSessionWaypoint,
  lockedFill,
  saveSessionWaypoint,
  sunText,
  trackText
} from "../../symbolic/phone_land.js";
import {
  applyConnect,
  applyScan,
  attachOwner,
  initialMeshSession,
  meshScreenStatus,
  queueServiceText,
  rememberRadioPeer
} from "../../symbolic/phone_mesh.js";
import { applySatelliteReading } from "../../symbolic/position_adapter.js";
import {
  holdTypedFix,
  initialPosition,
  setConsent,
  shareAttempt,
  statusLabel,
  unlockPosition
} from "../../symbolic/phone_position.js";
import { EXPO_LOCK_ACCURACY_M } from "../../symbolic/position_fix.js";
import { chooseYehsaDevice, connectRemembered, scanWithPlatform, transmitNote } from "./ble_provider.js";
import { bindThisInstall } from "./install_owner.js";
import { readPlatformFix } from "./location_provider.js";
import { openMic, probeVoice, silenceSpeakers, speakProse, stopProse } from "./speech_provider.js";
import {
  recognitionErrorNotice,
  reduceVoiceGesture,
  speakHint,
  submitHeard,
  voiceButtonLabel
} from "../../symbolic/voice_adapter.js";
import { Action, Field, HoldTalk, Panel, Prose, colors } from "./ui.js";

const TABS = [
  { id: "ask", label: "Ask" },
  { id: "land", label: "Land" },
  { id: "position", label: "Position" },
  { id: "mesh", label: "Mesh" }
];

const LANDS = [
  { id: "course", label: "Course" },
  { id: "points", label: "Points" },
  { id: "track", label: "Track" },
  { id: "sun", label: "Sun" }
];

function todayUtc() {
  const now = new Date();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const day = String(now.getUTCDate()).padStart(2, "0");
  return `${now.getUTCFullYear()}-${month}-${day}`;
}

export default function YehsaApp() {
  const [tab, setTab] = useState("ask");
  const [position, setPosition] = useState(initialPosition);
  const [waypoints, setWaypoints] = useState([]);
  const [track, setTrack] = useState([]);
  const [owner, setOwner] = useState(null);
  const [mesh, setMesh] = useState(initialMeshSession);

  useEffect(() => {
    let live = true;
    bindThisInstall().then((bound) => {
      if (!live) return;
      setOwner(bound);
      setMesh((current) => attachOwner(current, bound));
    }).catch(() => {
      if (!live) return;
      const failed = { recognized: false, reason: "no phone identity; access refused", source: null, exterior: "deny" };
      setOwner(failed);
      setMesh((current) => attachOwner(current, failed));
    });
    return () => {
      live = false;
    };
  }, []);

  const session = useMemo(() => ({
    consent: position.consent === true,
    fix: position.status === "locked" ? position.fix : null,
    waypoints
  }), [position, waypoints]);

  function changeConsent(value) {
    const next = setConsent(position, value);
    setPosition(next);
    if (!next.consent) {
      setWaypoints([]);
      setTrack([]);
    }
  }

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <View style={styles.body}>
        <View
          style={[styles.pane, tab !== "ask" && styles.hidden]}
          pointerEvents={tab === "ask" ? "auto" : "none"}
          accessibilityElementsHidden={tab !== "ask"}
        >
          <AskPane session={session} owner={owner} active={tab === "ask"} />
        </View>
        <View
          style={[styles.pane, tab !== "land" && styles.hidden]}
          pointerEvents={tab === "land" ? "auto" : "none"}
          accessibilityElementsHidden={tab !== "land"}
        >
          <LandPane
            position={position}
            waypoints={waypoints}
            setWaypoints={setWaypoints}
            track={track}
            setTrack={setTrack}
          />
        </View>
        <View
          style={[styles.pane, tab !== "position" && styles.hidden]}
          pointerEvents={tab === "position" ? "auto" : "none"}
          accessibilityElementsHidden={tab !== "position"}
        >
          <PositionPane position={position} setPosition={setPosition} onConsent={changeConsent} />
        </View>
        <View
          style={[styles.pane, tab !== "mesh" && styles.hidden]}
          pointerEvents={tab === "mesh" ? "auto" : "none"}
          accessibilityElementsHidden={tab !== "mesh"}
        >
          <MeshPane mesh={mesh} setMesh={setMesh} owner={owner} position={position} />
        </View>
      </View>
      <View style={styles.tabs}>
        {TABS.map((item) => {
          const selected = tab === item.id;
          return (
            <Pressable
              key={item.id}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              accessibilityLabel={item.label}
              onPress={() => setTab(item.id)}
              style={[styles.tab, selected && styles.tabOn]}
            >
              <Text style={[styles.tabText, selected && styles.tabTextOn]}>{item.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function AskPane({ session, owner, active }) {
  const [question, setQuestion] = useState("");
  const [phase, setPhase] = useState("idle");
  const [answer, setAnswer] = useState(null);
  const [cue, setCue] = useState(null);
  const [notice, setNotice] = useState(null);
  const [voicePlan, setVoicePlan] = useState(null);
  const [gesture, setGesture] = useState({ phase: "idle", pressedAt: null, action: "none" });
  const [voiceNote, setVoiceNote] = useState(null);
  const gestureRef = useRef(gesture);
  const phaseRef = useRef(phase);
  const heardRef = useRef("");
  const errorRef = useRef(null);
  const handleRef = useRef(null);
  const pendingStop = useRef(false);
  const startingRef = useRef(false);
  const finishing = useRef(false);
  const pointerUsed = useRef(false);
  const liveRef = useRef(true);
  const askGen = useRef(0);
  const activeRef = useRef(active);
  phaseRef.current = phase;
  activeRef.current = active;

  function setGestureBoth(next) {
    gestureRef.current = next;
    setGesture(next);
  }

  function abortMic() {
    const handle = handleRef.current;
    handleRef.current = null;
    pendingStop.current = false;
    setGestureBoth({ phase: "idle", pressedAt: null, action: "none" });
    try {
      handle?.abort?.();
    } catch {
      // The microphone is already closed.
    }
  }

  const abortRef = useRef(abortMic);
  abortRef.current = abortMic;

  useEffect(() => {
    let live = true;
    probeVoice().then((plan) => {
      if (live) setVoicePlan(plan);
    }).catch(() => {
      if (live) setVoicePlan({ route: "none", onDevice: false, service: "none", speakRoute: "none", notice: "This screen has no speech recognizer. Type the question. The notes stay on this phone." });
    });
    return () => {
      live = false;
      liveRef.current = false;
      abortRef.current();
      stopProse();
    };
  }, []);

  useEffect(() => {
    if (active) return undefined;
    abortRef.current();
    stopProse();
    return undefined;
  }, [active]);

  function runAsk(raw, { speak } = {}) {
    const text = String(raw ?? "").trim();
    if (!text) {
      setPhase("empty");
      setAnswer(null);
      setCue(null);
      setNotice("Type a question first.");
      return;
    }
    stopProse();
    setQuestion(text);
    setPhase("loading");
    setNotice(null);
    const generation = ++askGen.current;
    setTimeout(() => {
      if (askGen.current !== generation) return;
      try {
        const result = askField(text, books.passages, { session });
        if (result.empty) {
          setPhase("empty");
          setAnswer(null);
          setCue(null);
          setNotice("Type a question first.");
          return;
        }
        if (!result.answered) {
          setPhase("miss");
          setAnswer(null);
          setCue(null);
          setNotice(result.miss || "No offline note answered that.");
          return;
        }
        setPhase("ready");
        setAnswer(result.text);
        setCue(result.cue);
        setNotice(null);
        if (speak) {
          setVoiceNote("Speaking the answer.");
          speakProse(result.text, {
            onDone: () => setVoiceNote((current) => (current === "Speaking the answer." ? null : current)),
            onError: () => setVoiceNote("This screen cannot speak the answer. The note stays on screen.")
          });
        }
      } catch (err) {
        setPhase("error");
        setAnswer(null);
        setCue(null);
        setNotice(err?.message || "That question could not be read offline.");
      }
    }, 40);
  }

  function ask() {
    setVoiceNote(null);
    runAsk(question);
  }

  function finishListen() {
    if (finishing.current) return;
    finishing.current = true;
    const handle = handleRef.current;
    handleRef.current = null;
    pendingStop.current = false;
    setGestureBoth({ phase: "idle", pressedAt: null, action: "none" });
    const afterStop = handle?.stop ? handle.stop() : Promise.resolve(heardRef.current);
    Promise.resolve(afterStop).then((stopped) => {
      finishing.current = false;
      if (!liveRef.current || activeRef.current === false) return;
      const text = stopped || heardRef.current;
      const decision = submitHeard(text, errorRef.current);
      if (!decision.submit) {
        if (decision.notice) setVoiceNote(decision.notice);
        return;
      }
      setVoiceNote(null);
      runAsk(decision.text, { speak: true });
    }).catch(() => {
      finishing.current = false;
      if (!liveRef.current) return;
      const decision = submitHeard(heardRef.current, errorRef.current);
      if (decision.submit) runAsk(decision.text, { speak: true });
      else if (decision.notice) setVoiceNote(decision.notice);
    });
  }

  function beginListen({ lock, pressedAt }) {
    if (startingRef.current || voicePlan?.route === "none" || voicePlan?.route == null || phaseRef.current === "loading") return;
    startingRef.current = true;
    pendingStop.current = false;
    errorRef.current = null;
    heardRef.current = "";
    silenceSpeakers();
    setGestureBoth({
      phase: lock ? "locked" : "arming",
      pressedAt: lock ? null : pressedAt,
      action: "start"
    });
    Promise.resolve(openMic({
      onDevice: voicePlan?.onDevice === true,
      onTranscript: (text) => {
        heardRef.current = text;
        if (liveRef.current) setQuestion(text);
      },
      onError: (code) => {
        errorRef.current = code;
      },
      onEnd: (text) => {
        if (text) heardRef.current = text;
        if (gestureRef.current.phase === "locked") finishListen();
      }
    })).then((handle) => {
      startingRef.current = false;
      if (!liveRef.current || activeRef.current === false) {
        try {
          handle?.abort?.();
        } catch {
          // The screen is gone.
        }
        return;
      }
      if (!handle?.started) {
        setGestureBoth({ phase: "idle", pressedAt: null, action: "none" });
        setVoiceNote(handle?.reason || recognitionErrorNotice(handle?.code || "service-not-allowed"));
        return;
      }
      handleRef.current = handle;
      const released = pendingStop.current || (!lock && gestureRef.current.phase === "idle");
      if (released) {
        finishListen();
        return;
      }
      if (!lock && gestureRef.current.phase === "arming") {
        setGestureBoth(reduceVoiceGesture(gestureRef.current, { type: "hearing" }));
      }
    }).catch(() => {
      startingRef.current = false;
      setGestureBoth({ phase: "idle", pressedAt: null, action: "none" });
      setVoiceNote(recognitionErrorNotice("service-not-allowed"));
    });
  }

  function onMicIn() {
    if (voicePlan?.route !== "native-speech" && voicePlan?.route !== "web-speech") return;
    if (phaseRef.current === "loading") return;
    pointerUsed.current = true;
    const next = reduceVoiceGesture(gestureRef.current, { type: "press-in", at: Date.now() });
    if (next.action === "stop") {
      setGestureBoth(next);
      if (handleRef.current) finishListen();
      else pendingStop.current = true;
      return;
    }
    beginListen({ lock: false, pressedAt: next.pressedAt });
  }

  function onMicOut() {
    if (gestureRef.current.phase !== "arming" && gestureRef.current.phase !== "listening") return;
    const next = reduceVoiceGesture(gestureRef.current, { type: "press-out", at: Date.now() });
    setGestureBoth(next);
    if (next.action === "stop") {
      if (handleRef.current) finishListen();
      else pendingStop.current = true;
    }
  }

  function onMicPress() {
    if (pointerUsed.current) {
      pointerUsed.current = false;
      return;
    }
    if (voicePlan?.route !== "native-speech" && voicePlan?.route !== "web-speech") return;
    if (phaseRef.current === "loading") return;
    if (gestureRef.current.phase === "idle") {
      beginListen({ lock: true, pressedAt: null });
      return;
    }
    setGestureBoth({ phase: "idle", pressedAt: null, action: "stop" });
    if (handleRef.current) finishListen();
    else pendingStop.current = true;
  }

  const canListen = voicePlan?.route === "native-speech" || voicePlan?.route === "web-speech";
  const micLabel = voiceButtonLabel({
    gesture: gesture.phase,
    canListen,
    checked: voicePlan != null
  });
  const listening = gesture.phase === "arming" || gesture.phase === "listening" || gesture.phase === "locked";

  return (
    <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
      <Text style={styles.brand}>Yehsa</Text>
      <Text style={styles.lead}>
        A field companion for one phone. Notes, courses, and a position you choose to hold. Offline. No city map.
      </Text>
      <Field
        label="Question"
        value={question}
        onChangeText={setQuestion}
        placeholder="How do I carry drinking water?"
        multiline
      />
      <HoldTalk
        label={micLabel}
        hint="Hold to talk, or tap once to keep listening and tap again to ask. Yehsa fills the question and uses the same notes as typing."
        onPressIn={onMicIn}
        onPressOut={onMicOut}
        onPress={onMicPress}
        disabled={!canListen || phase === "loading"}
        live={listening}
      />
      <Text style={styles.hint}>
        {voicePlan ? `${voicePlan.notice} ${speakHint(voicePlan.speakRoute)}` : "Checking the microphone…"}
      </Text>
      {voiceNote ? <Text accessibilityLiveRegion="polite" style={styles.hint}>{voiceNote}</Text> : null}
      <Action label={phase === "loading" ? "Reading notes…" : "Ask"} onPress={ask} disabled={phase === "loading"} />
      {phase === "idle" ? (
        <Panel>
          <Prose>
            Ask in plain language, or hold the button and speak. Yehsa answers from the field notes and a packaged dictionary on this device. A feeling in the wording is a small cue beside the answer. The note still comes back when that feeling is unclear.
          </Prose>
        </Panel>
      ) : null}
      {phase === "loading" ? (
        <Panel>
          <Prose>Reading field notes…</Prose>
        </Panel>
      ) : null}
      {answer ? (
        <Panel>
          <Prose>{answer}</Prose>
          {cue ? <Text style={styles.cue}>{cue}</Text> : null}
        </Panel>
      ) : null}
      {answer && voicePlan?.speakRoute && voicePlan.speakRoute !== "none" ? (
        <Action
          label="Hear the answer"
          tone="quiet"
          onPress={() => {
            setVoiceNote("Speaking the answer.");
            speakProse(answer, {
              onDone: () => setVoiceNote((current) => (current === "Speaking the answer." ? null : current)),
              onError: () => setVoiceNote("This screen cannot speak the answer. The note stays on screen.")
            });
          }}
        />
      ) : null}
      {notice ? (
        <Panel>
          <Prose tone={phase === "error" ? "warn" : undefined}>{notice}</Prose>
        </Panel>
      ) : null}
      <Text style={styles.foot}>
        {`Packaged dictionary: ${phoneCorpusMeta.headwords} headwords and ${phoneCorpusMeta.medicalNames} medical names. ${phoneCorpusMeta.honest} ${phoneCorpusMeta.fieldNoteHonest} ${phoneCorpusMeta.medicalHonest} Nothing you ask is saved as a profile. ${owner?.recognized ? `This install is bound to this device (${owner.source}). Exterior access is denied.` : (owner?.reason || "Binding this install to this device.")}`}
      </Text>
    </ScrollView>
  );
}

function LandPane({ position, waypoints, setWaypoints, track, setTrack }) {
  const [section, setSection] = useState("course");
  const [fromText, setFromText] = useState("");
  const [toText, setToText] = useState("");
  const [magnetic, setMagnetic] = useState("");
  const [declination, setDeclination] = useState("");
  const [name, setName] = useState("");
  const [pointText, setPointText] = useState("");
  const [altitude, setAltitude] = useState("");
  const [gotoName, setGotoName] = useState("");
  const [gotoFrom, setGotoFrom] = useState("");
  const [trackPoint, setTrackPoint] = useState("");
  const [trackAlt, setTrackAlt] = useState("");
  const [trackTime, setTrackTime] = useState("");
  const [sunPoint, setSunPoint] = useState("");
  const [sunDate, setSunDate] = useState(todayUtc);
  const [result, setResult] = useState("Type coordinates. There is no city search and no downloaded map.");

  function useLocked(setter) {
    const filled = lockedFill(position);
    if (!filled.ok) {
      setResult(filled.text);
      return;
    }
    setter(filled.text);
    setResult("Filled from the position you chose to hold. It is not a city lookup.");
  }

  return (
    <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
      <Text style={styles.brand}>Yehsa</Text>
      <Text style={styles.screenTitle}>Landscape</Text>
      <Text style={styles.lead}>
        Distance, bearing, waypoints, a track, and a rough sunrise. A sphere of 6371 km. No streets and no places of interest.
      </Text>
      <View style={styles.chips}>
        {LANDS.map((item) => {
          const selected = section === item.id;
          return (
            <Pressable
              key={item.id}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => setSection(item.id)}
              style={[styles.chip, selected && styles.chipOn]}
            >
              <Text style={[styles.chipText, selected && styles.chipTextOn]}>{item.label}</Text>
            </Pressable>
          );
        })}
      </View>

      {section === "course" ? (
        <View>
          <Field label="From (latitude, longitude)" value={fromText} onChangeText={setFromText} placeholder="0, 0" />
          <Action label="Use locked position as From" tone="quiet" onPress={() => useLocked(setFromText)} />
          <Field label="To (latitude, longitude)" value={toText} onChangeText={setToText} placeholder="0, 1" />
          <Action
            label="Distance and bearing"
            onPress={() => setResult(courseText(fromText, toText).text)}
          />
          <Panel>
            <Prose>{result}</Prose>
          </Panel>
          <Field label="Magnetic bearing (degrees)" value={magnetic} onChangeText={setMagnetic} placeholder="90" />
          <Field label="Declination from your map (east positive)" value={declination} onChangeText={setDeclination} placeholder="12" />
          <Action
            label="Apply declination"
            tone="quiet"
            onPress={() => setResult(declinationText(magnetic, declination).text)}
          />
        </View>
      ) : null}

      {section === "points" ? (
        <View>
          <Field label="Name" value={name} onChangeText={setName} placeholder="camp" />
          <Field label="At (latitude, longitude)" value={pointText} onChangeText={setPointText} placeholder="45.1, -69.2" />
          <Action label="Use locked position" tone="quiet" onPress={() => useLocked(setPointText)} />
          <Field label="Altitude in meters (optional)" value={altitude} onChangeText={setAltitude} placeholder="" />
          <Action
            label="Save waypoint"
            onPress={() => {
              const saved = saveSessionWaypoint(waypoints, {
                consent: position.consent,
                name,
                pointText,
                altitudeText: altitude
              });
              setWaypoints(saved.list);
              setResult(saved.text);
            }}
          />
          <Field label="Go to name" value={gotoName} onChangeText={setGotoName} placeholder="camp" />
          <Field label="Start from (latitude, longitude)" value={gotoFrom} onChangeText={setGotoFrom} placeholder="leave blank to use the lock" />
          <Action label="Use locked position as start" tone="quiet" onPress={() => useLocked(setGotoFrom)} />
          <Action
            label="Go to waypoint"
            onPress={() => setResult(gotoSessionWaypoint(waypoints, {
              consent: position.consent,
              name: gotoName,
              fromText: gotoFrom,
              locked: position.status === "locked" ? position.fix : null
            }).text)}
          />
          <Panel>
            <Text style={styles.label}>Waypoints on this screen</Text>
            {waypoints.length === 0 ? (
              <Prose>None yet. Saving needs consent on the Position screen. Turning consent off clears this list.</Prose>
            ) : waypoints.map((item) => (
              <Text key={item.name} style={styles.row}>
                {item.name} — {item.latitude.toFixed(5)}, {item.longitude.toFixed(5)}
                {item.altitude != null ? `, ${item.altitude} m` : ""}
              </Text>
            ))}
          </Panel>
        </View>
      ) : null}

      {section === "track" ? (
        <View>
          <Field label="Point (latitude, longitude)" value={trackPoint} onChangeText={setTrackPoint} placeholder="0, 0" />
          <Action label="Use locked position" tone="quiet" onPress={() => useLocked(setTrackPoint)} />
          <Field label="Altitude in meters (optional)" value={trackAlt} onChangeText={setTrackAlt} placeholder="" />
          <Field label="Time (optional, ISO)" value={trackTime} onChangeText={setTrackTime} placeholder="2026-01-01T00:00:00Z" />
          <Action
            label="Add track point"
            onPress={() => {
              const added = addSessionTrack(track, {
                consent: position.consent,
                pointText: trackPoint,
                altitudeText: trackAlt,
                timeText: trackTime
              });
              setTrack(added.points);
              setResult(added.ok ? trackText(added.points).text : added.text);
            }}
          />
          <Action label="Track summary" tone="quiet" onPress={() => setResult(trackText(track).text)} />
        </View>
      ) : null}

      {section === "sun" ? (
        <View>
          <Field label="At (latitude, longitude)" value={sunPoint} onChangeText={setSunPoint} placeholder="45.1, -69.2" />
          <Action label="Use locked position" tone="quiet" onPress={() => useLocked(setSunPoint)} />
          <Field label="Date (YYYY-MM-DD)" value={sunDate} onChangeText={setSunDate} placeholder="2026-06-21" />
          <Action label="Rough sunrise and sunset" onPress={() => setResult(sunText(sunPoint, sunDate).text)} />
        </View>
      ) : null}

      {section !== "course" ? (
        <Panel>
          <Prose>{result}</Prose>
        </Panel>
      ) : null}
    </ScrollView>
  );
}

function heldPhrase(source) {
  if (source === "typed") return "typed coordinates";
  if (source === "gnss") return "a termux-location GPS fix";
  if (source === "expo-location") return "an Expo Location fix";
  return "a fix";
}

function PositionPane({ position, setPosition, onConsent }) {
  const [lat, setLat] = useState("");
  const [lon, setLon] = useState("");
  const [altitude, setAltitude] = useState("");
  const [shareNote, setShareNote] = useState("Share is a separate action. Nothing is sent when you lock.");
  const [listening, setListening] = useState(false);

  const label = statusLabel(position);
  const tone = position.status === "locked" ? "good" : position.status === "degraded" ? "warn" : undefined;

  async function trySatellite() {
    if (position.consent !== true) {
      setPosition(applySatelliteReading(position, { route: "none", fix: null }));
      return;
    }
    setListening(true);
    try {
      const reading = await readPlatformFix();
      setPosition((current) => (
        current.consent === true ? applySatelliteReading(current, reading) : initialPosition()
      ));
    } finally {
      setListening(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
      <Text style={styles.brand}>Yehsa</Text>
      <Text style={styles.screenTitle}>Position</Text>
      <Text style={styles.lead}>
        Off until you consent. Yehsa does not lock a position by itself, and it does not share one unless you use the separate share action.
      </Text>
      <Panel>
        <Text style={styles.kicker}>Status</Text>
        <Prose tone={tone}>{label}</Prose>
        <Text style={styles.note}>{position.note}</Text>
        {position.status === "locked" && position.fix ? (
          <Text style={styles.note}>
            Held {heldPhrase(position.source)}: {position.fix.latitude.toFixed(5)}, {position.fix.longitude.toFixed(5)}
            {position.fix.altitude != null ? `, ${position.fix.altitude} m` : ""}
            {position.fix.accuracy != null ? `. Accuracy about ${Math.round(position.fix.accuracy)} m` : ""}. Not shared.
          </Text>
        ) : null}
      </Panel>
      <View style={styles.consentRow}>
        <View style={styles.consentCopy}>
          <Text style={styles.consentTitle}>I consent to hold a position on this device</Text>
          <Text style={styles.hint}>
            Turning this off clears the lock, the waypoints, and the track on this screen.
          </Text>
        </View>
        <Switch
          accessibilityLabel="Consent to hold a position"
          value={position.consent === true}
          onValueChange={onConsent}
          trackColor={{ false: "#3d4a40", true: "#8eaa74" }}
          thumbColor={position.consent ? "#f4f0e6" : "#c5cbbd"}
        />
      </View>
      <Action
        label={listening ? "Listening for a fix…" : "Try satellite lock"}
        onPress={trySatellite}
        disabled={listening}
        accessibilityHint="Runs only when you tap, and only after consent. Uses termux-location when that bridge exists, otherwise Expo Location."
      />
      <Field label="Latitude" value={lat} onChangeText={setLat} placeholder="45.1" />
      <Field label="Longitude" value={lon} onChangeText={setLon} placeholder="-69.2" />
      <Field label="Altitude in meters (optional)" value={altitude} onChangeText={setAltitude} placeholder="" />
      <Action
        label="Hold these coordinates"
        tone="quiet"
        onPress={() => {
          const raw = { latitude: lat, longitude: lon };
          if (String(altitude).trim()) raw.altitude = altitude;
          setPosition(holdTypedFix(position, raw));
        }}
      />
      <Action label="Unlock" tone="quiet" onPress={() => setPosition(unlockPosition(position))} />
      <Panel>
        <Text style={styles.kicker}>Share, separately</Text>
        <Prose>{shareNote}</Prose>
        <View style={{ height: 12 }} />
        <Action
          label="Share position"
          tone="clay"
          onPress={() => {
            const attempt = shareAttempt(position);
            setPosition(attempt.state);
            setShareNote(attempt.message);
          }}
        />
      </Panel>
      <Text style={styles.foot}>
        {`Consent stays off until you turn it on. This button does not run by itself. termux-location is used when that command is bridged in; otherwise Expo Location at high accuracy. A reading coarser than ${EXPO_LOCK_ACCURACY_M} m, a missing permission, or a missing radio stays Degraded. Share still does not transmit from this screen.`}
      </Text>
    </ScrollView>
  );
}

function peerLabel(peer) {
  const id = peer.address || peer.id || "peer";
  const rssi = typeof peer.rssi === "number" ? `, ${peer.rssi} dBm` : "";
  return `${peer.name} — ${id}${rssi}`;
}

function MeshPane({ mesh, setMesh, owner, position }) {
  const status = meshScreenStatus(mesh);
  const tone = status.readiness === "linked" ? "good" : status.readiness === "degraded" ? "warn" : undefined;
  const [scanning, setScanning] = useState(false);
  const [chooser, setChooser] = useState(false);
  const [note, setNote] = useState("");
  const [serviceNote, setServiceNote] = useState("The offline phone service does not wait for a position lock.");
  const bound = owner?.recognized === true;
  const positionOff = position?.status !== "locked";

  async function scan() {
    if (scanning) return;
    setScanning(true);
    try {
      const report = await scanWithPlatform();
      setChooser(report.route === "web-bluetooth-chooser");
      setMesh((current) => applyScan(current, report));
    } finally {
      setScanning(false);
    }
  }

  async function connect(peer) {
    const report = await connectRemembered(peer);
    setMesh((current) => applyConnect(current, peer.address || peer.id, report).session);
  }

  async function choose() {
    const result = await chooseYehsaDevice();
    if (!result?.peer || result.radio !== true) {
      setMesh((current) => attachOwner({
        ...current,
        scanned: true,
        degraded: true,
        invoked: false,
        reason: result?.reason || "No Yehsa device was chosen."
      }, current.owner));
      return;
    }
    setMesh((current) => rememberRadioPeer(current, result.peer, {
      radio: true,
      scanMode: "chooser",
      reason: null
    }).session);
  }

  async function keepNote() {
    const queued = queueServiceText(mesh, note);
    setMesh(queued.session);
    if (!queued.ok) {
      setServiceNote(queued.reason || "The note was not kept.");
      return;
    }
    setNote("");
    if (queued.session.link?.primary?.radio === true) {
      const sent = await transmitNote(queued.item.text, queued.session.link?.primary);
      if (sent.sent === true) {
        setMesh((current) => {
          const next = current.outbox.map((item) => (
            item.queuedAt === queued.item.queuedAt
              ? { ...item, transmitted: true, delivered: "queued-on-held-link", positionShared: false }
              : item
          ));
          return { ...current, outbox: next };
        });
        setServiceNote("Queued on the held link. No cipher is claimed. Position was not shared.");
        return;
      }
    }
    setServiceNote("Held on this phone. Not transmitted. A position lock is not required.");
  }

  return (
    <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
      <Text style={styles.brand}>Yehsa</Text>
      <Text style={styles.screenTitle}>Mesh</Text>
      <Text style={styles.lead}>
        Scan when you ask. A missing radio stays degraded. Peers are other installs and cannot run symbols here.
      </Text>
      <Panel>
        <Text style={styles.kicker}>{status.title}</Text>
        <Prose tone={tone}>{status.headline}</Prose>
        <Text style={styles.note}>{status.detail}</Text>
      </Panel>
      {status.rows.map((row) => (
        <Panel key={row.label}>
          <Text style={styles.kicker}>{row.label}</Text>
          <Prose>{row.value}</Prose>
        </Panel>
      ))}
      <Action
        label={scanning ? "Scanning…" : "Scan for Yehsa peers"}
        onPress={scan}
        disabled={scanning || !bound}
        accessibilityHint="Passive scan when the radio can do it. Does not disconnect a link already held."
      />
      {chooser ? (
        <Action
          label="Choose a Yehsa device"
          tone="quiet"
          onPress={choose}
          disabled={!bound}
          accessibilityHint="Browser chooser filtered to Yehsa. Does not disconnect a link already held."
        />
      ) : null}
      <Panel>
        <Text style={styles.kicker}>Peers</Text>
        {status.peers.length === 0 ? (
          <Prose>None remembered from a real scan.</Prose>
        ) : status.peers.map((peer) => (
          <View key={peer.address || peer.id} style={{ marginBottom: 8 }}>
            <Text style={styles.row}>{peerLabel(peer)}</Text>
            <Action
              label={`Connect ${peer.name}`}
              tone="quiet"
              onPress={() => connect(peer)}
              disabled={!bound}
            />
          </View>
        ))}
      </Panel>
      <Panel>
        <Text style={styles.kicker}>Offline phone</Text>
        <Prose>
          {positionOff
            ? "Position is Unlocked. You can still keep a short note here. It is not a call and it is not billed."
            : "Position is held. This note does not share it."}
        </Prose>
        <Text style={styles.note}>
          {mesh.link?.primary?.radio === true
            ? "A link is held. The note is written there only when that peer exposes the Yehsa note characteristic. Otherwise it stays on this phone."
            : "No link is held. The note stays on this phone."}
        </Text>
        <View style={{ height: 12 }} />
        <Field
          label="Note for the held link"
          value={note}
          onChangeText={setNote}
          placeholder="Short text. No call and no bill."
          multiline
        />
        <Action label="Keep note on this phone" onPress={keepNote} disabled={!bound} />
        <Text style={styles.note}>{serviceNote}</Text>
        {(mesh.outbox || []).length > 0 ? (
          <View style={{ marginTop: 8 }}>
            {mesh.outbox.map((item) => (
              <Text key={item.queuedAt} style={styles.row}>
                {item.transmitted ? "Queued on the held link" : "Held on this phone"} — {item.text}
              </Text>
            ))}
          </View>
        ) : null}
      </Panel>
      <Text style={styles.foot}>
        Termux still uses termux-bluetooth-scan and termux-bluetooth-connect. Android and iOS use the phone radio when this build includes it. The browser keeps Web Bluetooth. A missing radio stays Degraded. No cipher is claimed.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg
  },
  body: {
    flex: 1,
    width: "100%",
    maxWidth: 560,
    alignSelf: "center"
  },
  pane: {
    flex: 1
  },
  hidden: {
    display: "none"
  },
  scroll: {
    paddingTop: 28,
    paddingHorizontal: 18,
    paddingBottom: 28
  },
  brand: {
    color: colors.brass,
    fontSize: 34,
    fontWeight: "700",
    letterSpacing: 0.4,
    marginBottom: 6
  },
  screenTitle: {
    color: colors.ink,
    fontSize: 22,
    fontWeight: "700",
    marginBottom: 6
  },
  lead: {
    color: colors.muted,
    fontSize: 16,
    lineHeight: 23,
    marginBottom: 16
  },
  cue: {
    color: colors.moss,
    fontSize: 15,
    lineHeight: 21,
    marginTop: 12
  },
  foot: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 4
  },
  label: {
    color: colors.muted,
    fontSize: 14,
    marginBottom: 8
  },
  row: {
    color: colors.ink,
    fontSize: 17,
    lineHeight: 26
  },
  kicker: {
    color: colors.brass,
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    marginBottom: 6
  },
  note: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 22,
    marginTop: 8
  },
  consentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 14,
    marginBottom: 14
  },
  consentCopy: { flex: 1 },
  consentTitle: {
    color: colors.ink,
    fontSize: 17,
    fontWeight: "700",
    lineHeight: 23
  },
  hint: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 4
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 16
  },
  chip: {
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.card
  },
  chipOn: {
    backgroundColor: colors.brass,
    borderColor: colors.brass
  },
  chipText: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: "700"
  },
  chipTextOn: { color: colors.brassInk },
  tabs: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: colors.line,
    backgroundColor: "#161c18",
    paddingBottom: 10,
    paddingTop: 6
  },
  tab: {
    flex: 1,
    minHeight: 52,
    alignItems: "center",
    justifyContent: "center"
  },
  tabOn: {},
  tabText: {
    color: colors.muted,
    fontSize: 15,
    fontWeight: "600"
  },
  tabTextOn: {
    color: colors.brass
  }
});
