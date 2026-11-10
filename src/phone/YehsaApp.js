import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View
} from "react-native";
import { StatusBar } from "expo-status-bar";
import books from "../../symbolic_memory/books_index.json";
import { askField } from "../../symbolic/phone_field.js";
import { expandParaphrase } from "../../symbolic/paraphrase.js";
import { parseQuestion } from "../../symbolic/question_parse.js";
import { routesToSpiritual } from "../../symbolic/spiritual_route.js";
import { loadScriptureIndex } from "./scripture_index";
import { phoneCorpusMeta } from "../../symbolic/phone_corpus.js";
import { saveSessionWaypoint } from "../../symbolic/phone_land.js";
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
import { Action, Field, HoldTalk, Prose, Quiet, ScreenHeader, StatusPill, colors } from "./ui.js";
import { actionIntent, approveAction, declineAction, proposeAction, setActionEnabled, undoApproved } from "../../symbolic/action_gate.js";
import { capabilitySummary, continueUtterance, isCapabilityQuestion, sourceChips } from "../../symbolic/chat_turn.js";
import LandscapeMap from "./LandscapeMap.js";

const webPointer = Platform.OS === "web" ? { cursor: "pointer" } : null;

const TABS = [
  { id: "ask", label: "Chat", mark: "○" },
  { id: "land", label: "Map", mark: "◇" },
  { id: "position", label: "Me", mark: "•" },
  { id: "mesh", label: "Mesh", mark: "⋮" }
];

export default function YehsaApp() {
  const [tab, setTab] = useState("ask");
  const [position, setPosition] = useState(initialPosition);
  const [waypoints, setWaypoints] = useState([]);
  const [track, setTrack] = useState([]);
  const [mapTap, setMapTap] = useState(null);
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
      <View style={styles.column}>
      <View style={styles.body}>
        <View
          style={[styles.pane, tab !== "ask" && styles.hidden]}
          pointerEvents={tab === "ask" ? "auto" : "none"}
          accessibilityElementsHidden={tab !== "ask"}
        >
          <AskPane
            session={session}
            owner={owner}
            active={tab === "ask"}
            position={position}
            setPosition={setPosition}
            waypoints={waypoints}
            setWaypoints={setWaypoints}
            setMesh={setMesh}
            mapTap={mapTap}
          />
        </View>
        <View
          style={[styles.pane, tab !== "land" && styles.hidden]}
          pointerEvents={tab === "land" ? "auto" : "none"}
          accessibilityElementsHidden={tab !== "land"}
        >
          <LandPane
            position={position}
            waypoints={waypoints}
            track={track}
            onMapTap={setMapTap}
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
      <View style={styles.tabs} accessibilityRole="tablist">
        {TABS.map((item) => {
          const selected = tab === item.id;
          return (
            <Pressable
              key={item.id}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              accessibilityLabel={item.label}
              onPress={() => setTab(item.id)}
              style={[styles.tab, webPointer, selected && styles.tabOn]}
            >
              <Text style={[styles.tabMark, selected && styles.tabTextOn]}>{item.mark}</Text>
              <Text style={[styles.tabText, selected && styles.tabTextOn]}>{item.label}</Text>
            </Pressable>
          );
        })}
      </View>
      </View>
    </View>
  );
}

function AskPane({ session, owner, active, position, setPosition, waypoints, setWaypoints, setMesh, mapTap }) {
  const [question, setQuestion] = useState("");
  const [phase, setPhase] = useState("idle");
  const [messages, setMessages] = useState([]);
  const [gate, setGate] = useState({ settings: { waypoint: true, measure: true, "position-hold": true, "position-unlock": true, "mesh-scan": true, calculate: true, speak: true, "field-note": true }, log: [], pending: null });
  const [notes, setNotes] = useState([]);
  const priorRef = useRef(null);
  const gateRef = useRef(gate);
  function rememberGate(next) {
    gateRef.current = next;
    setGate(next);
  }
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
  const threadRef = useRef(null);
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
    if (!mapTap) return undefined;
    const proposed = proposeAction(gateRef.current, {
      type: "waypoint",
      id: `act-${Date.now()}`,
      label: `Save waypoint at ${mapTap.latitude.toFixed(4)}, ${mapTap.longitude.toFixed(4)}`,
      payload: { name: "point", point: mapTap }
    });
    rememberGate(proposed.gate);
    if (proposed.card) {
      pushMessage({ role: "yehsa", text: "That tap is only a proposal. It is not saved until you tap Approve, and consent on Me still has to be on.", card: proposed.card });
    }
    return undefined;
  }, [mapTap]);

  useEffect(() => {
    if (active) return undefined;
    abortRef.current();
    stopProse();
    return undefined;
  }, [active]);

  function pushMessage(message) {
    setMessages((current) => [...current, { id: `m-${Date.now()}-${current.length}`, ...message }]);
    setTimeout(() => threadRef.current?.scrollToEnd?.({ animated: false }), 50);
  }

  function applyCard(card) {
    if (card.type === "waypoint") {
      if (position?.consent !== true) {
        return { ok: false, text: "Consent is still off, so I did not save a waypoint.", undo: null };
      }
      const point = card.payload.point;
      const pointText = point ? `${point.latitude}, ${point.longitude}` : "";
      const saved = saveSessionWaypoint(waypoints, {
        consent: true,
        name: card.payload.name || "point",
        pointText,
        altitudeText: ""
      });
      if (saved.ok) setWaypoints(saved.list);
      return { ok: saved.ok === true, text: saved.text, undo: saved.ok ? { type: "waypoint", name: card.payload.name || "point" } : null };
    }
    if (card.type === "position-unlock") {
      setPosition(unlockPosition(position));
      return { ok: true, text: "Unlocked. Consent stays on until you turn it off.", undo: null };
    }
    if (card.type === "position-hold") {
      if (position?.consent !== true) {
        return { ok: false, text: "Consent is still off. Approve does not turn that on.", undo: null };
      }
      return { ok: false, text: "There is no new satellite reading on this card. Use Try satellite lock on Me.", undo: null };
    }
    if (card.type === "mesh-scan") {
      scanWithPlatform().then((report) => {
        setMesh((current) => applyScan(current, report));
      }).catch(() => {});
      return { ok: true, text: "Scan started. A peer is shown only if the radio hears one. Nothing is invented.", undo: null };
    }
    if (card.type === "speak") {
      const last = [...messages].reverse().find((item) => item.role === "yehsa" && item.text);
      if (!last) return { ok: false, text: "There is no answer to speak yet.", undo: null };
      speakProse(last.text, {});
      return { ok: true, text: "Speaking the last answer on this phone.", undo: null };
    }
    if (card.type === "field-note") {
      const note = { id: `note-${Date.now()}`, text: card.payload.text };
      setNotes((current) => [...current, note]);
      return { ok: true, text: "Saved on this phone only. It was not sent.", undo: { type: "field-note", id: note.id } };
    }
    if (card.type === "measure") {
      return { ok: true, text: "Use two taps on the map. The line is a measurement, not a saved place.", undo: null };
    }
    return { ok: false, text: "That action is not available.", undo: null };
  }

  function onApprove(id) {
    const decision = approveAction(gateRef.current, id, applyCard);
    rememberGate(decision.gate);
    pushMessage({ role: "yehsa", text: decision.result?.text || "Nothing ran." });
  }

  function onDecline(id) {
    const decision = declineAction(gateRef.current, id);
    rememberGate(decision.gate);
    pushMessage({ role: "yehsa", text: "Declined. I did not do it." });
  }

  function onUndo(id) {
    const decision = undoApproved(gateRef.current, id);
    rememberGate(decision.gate);
    if (decision.undo?.type === "waypoint") {
      setWaypoints((current) => current.filter((item) => item.name !== decision.undo.name));
    }
    if (decision.undo?.type === "field-note") {
      setNotes((current) => current.filter((item) => item.id !== decision.undo.id));
    }
    pushMessage({ role: "yehsa", text: decision.undo ? "Undone on this phone." : "That one cannot be undone." });
  }

  function runAsk(raw, { speak } = {}) {
    const typed = String(raw ?? "").trim();
    if (!typed) {
      setPhase("empty");
      setNotice("Type a message first.");
      return;
    }
    const text = continueUtterance(typed, priorRef.current);
    stopProse();
    setQuestion("");
    setPhase("loading");
    setNotice(null);
    pushMessage({ role: "you", text: typed });
    const generation = ++askGen.current;
    setTimeout(() => {
      if (askGen.current !== generation) return;
      const run = async () => {
        if (isCapabilityQuestion(text)) {
          return { answered: true, text: capabilitySummary(phoneCorpusMeta), kind: "about", symbol: "capabilities" };
        }
        const spiritualIndex = routesToSpiritual(text, parseQuestion(expandParaphrase(text)))
          ? await loadScriptureIndex()
          : null;
        return askField(text, books.passages, { session, spiritualIndex });
      };
      run().then((result) => {
        if (askGen.current !== generation) return;
        const intent = actionIntent(typed);
        const proposed = intent ? proposeAction(gateRef.current, { ...intent, id: `act-${Date.now()}` }) : { card: null };
        if (intent) rememberGate(proposed.gate);
        const reply = result?.text || result?.miss || "I don't have an installed note for that.";
        priorRef.current = { utterance: text };
        setPhase(result?.answered ? "ready" : "miss");
        pushMessage({
          role: "yehsa",
          text: reply,
          chips: sourceChips(result),
          card: proposed.card
        });
        if (speak && result?.text) {
          speakProse(result.text, {
            onDone: () => setVoiceNote(null),
            onError: () => setVoiceNote("This screen cannot speak the answer. The note stays on screen.")
          });
        }
      }).catch((err) => {
        if (askGen.current !== generation) return;
        setPhase("error");
        pushMessage({ role: "yehsa", text: err?.message || "That question could not be read offline." });
      });
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
    <View style={styles.chatWrap}>
      <ScrollView ref={threadRef} contentContainerStyle={styles.thread} keyboardShouldPersistTaps="handled">
        {messages.length === 0 ? (
          <View style={styles.bubbleYehsa}>
            <Text style={styles.bubbleText}>Ask in plain words. I answer from the notes on this phone. I will not change your place or the radio until you tap Approve.</Text>
          </View>
        ) : null}
        {messages.map((item) => (
          <View key={item.id} style={item.role === "you" ? styles.bubbleYou : styles.bubbleYehsa}>
            <Text style={styles.bubbleText}>{item.text}</Text>
            {item.chips?.length ? (
              <View style={styles.chips}>
                {item.chips.map((chip) => (
                  <Text key={chip} style={styles.chipText}>{chip}</Text>
                ))}
              </View>
            ) : null}
            {item.card && gate.pending?.id === item.card.id ? (
              <View style={styles.card}>
                <Text style={styles.bubbleText}>{item.card.label}</Text>
                <View style={styles.cardRow}>
                  <Action label="Approve" onPress={() => onApprove(item.card.id)} />
                  <Action label="Edit" tone="quiet" onPress={() => setQuestion(item.card.label)} />
                  <Action label="Decline" tone="clay" onPress={() => onDecline(item.card.id)} />
                </View>
              </View>
            ) : null}
          </View>
        ))}
        {phase === "loading" ? <Text style={styles.typing}>Yehsa is reading the notes…</Text> : null}
        {notice ? <Quiet>{notice}</Quiet> : null}
        {voiceNote ? <Quiet>{voiceNote}</Quiet> : null}
      </ScrollView>
      {notes.length ? <Quiet>{`${notes.length} note${notes.length === 1 ? "" : "s"} saved on this phone.`}</Quiet> : null}
      <View style={styles.composer}>
        <TextInput
          accessibilityLabel="Message"
          value={question}
          onChangeText={setQuestion}
          placeholder="Message Yehsa"
          placeholderTextColor="#8f9a8c"
          style={styles.composerInput}
        />
        <HoldTalk
          label={canListen ? "Mic" : micLabel}
          hint="Hold to talk, or tap once to keep listening and tap again to ask."
          onPressIn={onMicIn}
          onPressOut={onMicOut}
          onPress={onMicPress}
          disabled={!canListen || phase === "loading"}
          live={listening}
        />
        <Action label="Send" onPress={ask} disabled={phase === "loading"} />
        <Action label="Hear the answer" tone="quiet" onPress={() => {
          const last = [...messages].reverse().find((item) => item.role === "yehsa" && item.text);
          if (!last) return;
          speakProse(last.text, {
            onDone: () => setVoiceNote(null),
            onError: () => setVoiceNote("This screen cannot speak the answer. The note stays on screen.")
          });
        }} />
      </View>
      <View style={styles.cardRow}>
        {Object.keys(gate.settings).map((type) => (
          <Pressable
            key={type}
            accessibilityRole="switch"
            accessibilityLabel={`${type} ${gate.settings[type] ? "on" : "off"}`}
            accessibilityState={{ checked: gate.settings[type] === true }}
            onPress={() => rememberGate(setActionEnabled(gateRef.current, type, gate.settings[type] !== true))}
            style={styles.chip}
          >
            <Text style={styles.chipText}>{`${type} ${gate.settings[type] ? "on" : "off"}`}</Text>
          </Pressable>
        ))}
      </View>
      <Action label="Undo last approved action" tone="quiet" onPress={() => {
        const last = [...gate.log].reverse().find((item) => item.status === "approved" && item.undo && item.undone !== true);
        if (last) onUndo(last.id);
      }} />
    </View>
  );
}

function ResultText({ result }) {
  if (!result?.text) return null;
  if (result.tone === "quiet") return <Quiet live>{result.text}</Quiet>;
  return <Prose live tone={result.tone === "warn" ? "warn" : undefined}>{result.text}</Prose>;
}

function LandPane({ position, waypoints, track, onMapTap }) {
  const [declination, setDeclination] = useState("0");
  const [importNote, setImportNote] = useState("No terrain file is loaded. This is a blank landscape canvas.");
  const origin = position?.consent === true && position.status === "locked" && position.fix
    ? position.fix
    : { latitude: 0, longitude: 0 };
  const held = position?.consent === true && position.status === "locked" ? position.fix : null;

  return (
    <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
      <ScreenHeader
        title="Map"
        lead="A blank landscape you can pan and zoom. No streets and no cities are stored here."
      />
      <LandscapeMap
        origin={origin}
        held={held}
        waypoints={waypoints}
        track={track}
        declination={declination}
        onWaypoint={(point) => {
          if (onMapTap) onMapTap(point);
          setImportNote(`Proposed ${point.latitude.toFixed(5)}, ${point.longitude.toFixed(5)}. Approve it in Chat. Consent on Me is still required.`);
        }}
      />
      <Field label="Declination from your map, east positive" value={declination} onChangeText={setDeclination} placeholder="0" />
      <Quiet>{importNote}</Quiet>
      <Action
        label="Choose a GeoJSON or MBTiles file"
        tone="quiet"
        onPress={() => {
          if (Platform.OS !== "web" || typeof document === "undefined") {
            setImportNote("Choosing a map file is a later step on this install. No tiles were added.");
            return;
          }
          const input = document.createElement("input");
          input.type = "file";
          input.accept = ".geojson,.json,.mbtiles";
          input.onchange = () => {
            const file = input.files && input.files[0];
            if (!file) return;
            if (/\.mbtiles$/i.test(file.name)) {
              setImportNote("MBTiles is not read in this install. The file was not applied.");
              return;
            }
            const reader = new FileReader();
            reader.onload = () => {
              try {
                const json = JSON.parse(String(reader.result || ""));
                const count = Array.isArray(json.features) ? json.features.length : 0;
                setImportNote(count
                  ? `Read ${count} features from your file. They are not drawn as a city map in this version, and nothing was downloaded.`
                  : "That file had no GeoJSON features. Nothing was added.");
              } catch {
                setImportNote("That file was not usable GeoJSON. Nothing was added.");
              }
            };
            reader.readAsText(file);
          };
          input.click();
        }}
      />
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

  const consented = position.consent === true;

  return (
    <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
      <ScreenHeader
        title="Me"
        lead="Your place stays off until you turn it on. Sharing is a separate choice and does not send from this screen."
      />
      <View style={styles.statusBlock}>
        <StatusPill label={position.status === "degraded" ? "Couldn't get a fix" : position.status === "locked" ? "Holding a place" : consented ? "Ready when you ask" : "Place is off"} tone={tone} />
        <Text style={styles.note}>{position.note}</Text>
        {position.status === "locked" && position.fix ? (
          <Text style={styles.fixLine}>
            Held {heldPhrase(position.source)}: {position.fix.latitude.toFixed(5)}, {position.fix.longitude.toFixed(5)}
            {position.fix.altitude != null ? `, ${position.fix.altitude} m` : ""}
            {position.fix.accuracy != null ? `. Accuracy about ${Math.round(position.fix.accuracy)} m` : ""}. Not shared.
          </Text>
        ) : null}
      </View>
      <Pressable
        accessibilityRole="switch"
        accessibilityLabel="Consent to hold a position"
        accessibilityHint="Turning this off clears the lock, the waypoints, and the track on this screen."
        accessibilityState={{ checked: consented }}
        onPress={() => onConsent(!consented)}
        style={[styles.consentRow, webPointer, consented && styles.consentOn]}
      >
        <View style={styles.consentCopy}>
          <Text style={styles.consentTitle}>I consent to hold a position on this device</Text>
          <Text style={styles.hint}>
            Turning this off clears the lock, the waypoints, and the track on this screen.
          </Text>
        </View>
        <Switch
          pointerEvents="none"
          importantForAccessibility="no"
          accessibilityElementsHidden
          value={consented}
          trackColor={{ false: "#2c3830", true: "#6d8a62" }}
          thumbColor={consented ? "#f4f0e6" : "#d7ddd2"}
        />
      </Pressable>
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
      <View style={styles.group}>
        <Text style={styles.sectionLabel}>Share, separately</Text>
        <Prose>{shareNote}</Prose>
        <Action
          label="Share position"
          tone="clay"
          style={styles.follow}
          onPress={() => {
            const attempt = shareAttempt(position);
            setPosition(attempt.state);
            setShareNote(attempt.message);
          }}
        />
      </View>
      <Text style={styles.foot}>
        {"Turn this on yourself, then tap Try satellite lock. A coarse or missing reading stays unheld. Share still does not transmit from this screen."}
      </Text>
      <Text style={styles.foot}>
        {`Details. Packaged dictionary: ${phoneCorpusMeta.headwords} headwords and ${phoneCorpusMeta.medicalNames} medical names. ${phoneCorpusMeta.honest} ${phoneCorpusMeta.fieldNoteHonest} ${phoneCorpusMeta.medicalHonest} A reading coarser than ${EXPO_LOCK_ACCURACY_M} m is not stored. Nothing you ask is saved as a profile. This install is bound to this device. Exterior access is denied.`}
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

  const pill = !mesh.scanned
    ? "Not scanned yet"
    : status.readiness === "degraded"
      ? "No radio from here"
      : status.readiness === "linked"
        ? "Link held"
        : status.readiness === "heard"
          ? "Peers heard"
          : "No peers";

  return (
    <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
      <ScreenHeader
        title="Mesh"
        lead="Look for other Yehsa phones when you ask. A missing radio is said in plain words. Other phones cannot run actions here."
      />
      <View style={styles.statusBlock}>
        <Text style={styles.sectionLabel}>{status.title}</Text>
        <StatusPill label={pill} tone={tone} />
        <Prose>{status.headline}</Prose>
        {status.detail && status.detail !== status.headline ? (
          <Text style={styles.note}>{status.detail}</Text>
        ) : null}
      </View>
      <View style={styles.facts}>
        {status.rows.map((row) => (
          <View key={row.label} style={styles.fact}>
            <Text style={styles.factLabel}>{row.label}</Text>
            <Text style={styles.factValue}>{row.value}</Text>
          </View>
        ))}
      </View>
      <Action
        label={scanning ? "Scanning…" : "Scan for Yehsa peers"}
        onPress={scan}
        disabled={scanning || !bound}
        accessibilityHint="Passive scan when the radio can do it. Does not disconnect a link already held."
      />
      {pill === "No radio from here" ? (
        <Action label="Fix it" tone="quiet" onPress={scan} disabled={scanning || !bound} accessibilityHint="Try the scan again. A missing radio stays unavailable." />
      ) : null}
      {chooser ? (
        <Action
          label="Choose a Yehsa device"
          tone="quiet"
          onPress={choose}
          disabled={!bound}
          accessibilityHint="Browser chooser filtered to Yehsa. Does not disconnect a link already held."
        />
      ) : null}
      <View style={styles.group}>
        <Text style={styles.sectionLabel}>Peers</Text>
        {status.peers.length === 0 ? (
          <Quiet>None remembered from a real scan.</Quiet>
        ) : status.peers.map((peer) => (
          <View key={peer.address || peer.id} style={styles.peer}>
            <Text style={styles.row}>{peerLabel(peer)}</Text>
            <Action
              label={`Connect ${peer.name}`}
              tone="quiet"
              onPress={() => connect(peer)}
              disabled={!bound}
            />
          </View>
        ))}
      </View>
      <View style={styles.group}>
        <Text style={styles.sectionLabel}>Offline phone</Text>
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
          <View style={styles.outbox}>
            {mesh.outbox.map((item) => (
              <Text key={item.queuedAt} style={styles.row}>
                {item.transmitted ? "Queued on the held link" : "Held on this phone"} — {item.text}
              </Text>
            ))}
          </View>
        ) : null}
      </View>
      <Text style={styles.foot}>
        Termux still uses termux-bluetooth-scan and termux-bluetooth-connect. Android and iOS use the phone radio when this build includes it. The browser keeps Web Bluetooth. A missing radio stays Degraded. No cipher is claimed.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: "center"
  },
  column: {
    flex: 1,
    width: "100%",
    maxWidth: 480
  },
  body: {
    flex: 1
  },
  pane: {
    flex: 1
  },
  hidden: {
    display: "none"
  },
  scroll: {
    paddingTop: Platform.OS === "ios" ? 52 : 22,
    paddingHorizontal: 22,
    paddingBottom: 36
  },
  answer: {
    marginTop: 8,
    paddingTop: 18,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    marginBottom: 4
  },
  cue: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 14,
    paddingLeft: 12,
    borderLeftWidth: 2,
    borderLeftColor: colors.lineStrong
  },
  hear: {
    marginTop: 16
  },
  idle: {
    marginTop: 6,
    marginBottom: 4
  },
  notice: {
    marginTop: 8,
    marginBottom: 8
  },
  noticeWarn: {
    paddingLeft: 12,
    borderLeftWidth: 2,
    borderLeftColor: colors.clay
  },
  foot: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 22,
    paddingTop: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line
  },
  row: {
    color: colors.ink,
    fontSize: 16,
    lineHeight: 24,
    fontVariant: ["tabular-nums"],
    paddingVertical: 4
  },
  note: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 22
  },
  fixLine: {
    color: colors.ink,
    fontSize: 16,
    lineHeight: 24,
    fontVariant: ["tabular-nums"]
  },
  statusBlock: {
    marginBottom: 18,
    gap: 10
  },
  sectionLabel: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "600"
  },
  facts: {
    marginBottom: 8
  },
  fact: {
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    gap: 4
  },
  factLabel: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "500"
  },
  factValue: {
    color: colors.ink,
    fontSize: 16,
    lineHeight: 23
  },
  group: {
    marginTop: 6,
    marginBottom: 8,
    paddingTop: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    gap: 10
  },
  follow: {
    marginTop: 4
  },
  peer: {
    marginTop: 8
  },
  outbox: {
    marginTop: 4,
    gap: 4
  },
  readout: {
    marginTop: 2,
    marginBottom: 16,
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line
  },
  readoutWarn: {
    paddingLeft: 12,
    borderLeftWidth: 2,
    borderLeftColor: colors.clay
  },
  consentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    minHeight: 72,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 18,
    backgroundColor: "transparent"
  },
  consentOn: {
    borderColor: "#5f7d56",
    backgroundColor: "#161e18"
  },
  consentCopy: { flex: 1 },
  consentTitle: {
    color: colors.ink,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "600"
  },
  hint: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 4
  },
  speech: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 14
  },
  liveNote: {
    color: colors.ink,
    fontSize: 14,
    lineHeight: 20,
    marginTop: -4,
    marginBottom: 14
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 18
  },
  chip: {
    minHeight: 44,
    paddingHorizontal: 16,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent"
  },
  chipOn: {
    backgroundColor: colors.brass,
    borderColor: colors.brass
  },
  chipText: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: "600"
  },
  chipTextOn: { color: colors.brassInk },
  tabs: {
    flexDirection: "row",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.lineStrong,
    backgroundColor: colors.bg,
    paddingBottom: Platform.OS === "ios" ? 18 : 6
  },
  tab: {
    flex: 1,
    minHeight: 64,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8
  },
  tabOn: {},
  tabMark: {
    color: colors.muted,
    fontSize: 16,
    marginBottom: 2
  },
  chatWrap: { flex: 1, padding: 12 },
  thread: { paddingBottom: 12, gap: 10 },
  bubbleYou: { alignSelf: "flex-end", maxWidth: "86%", backgroundColor: "#2a352e", borderRadius: 16, padding: 12 },
  bubbleYehsa: { alignSelf: "flex-start", maxWidth: "86%", backgroundColor: "#1b2420", borderRadius: 16, padding: 12 },
  bubbleText: { color: colors.ink, fontSize: 16, lineHeight: 22 },
  typing: { color: colors.brass, marginTop: 8 },
  composer: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8 },
  composerInput: { flex: 1, minHeight: 48, color: colors.ink, backgroundColor: colors.surface, borderRadius: 12, paddingHorizontal: 12 },
  card: { marginTop: 8, gap: 8 },
  cardRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tabMarkOn: {
    backgroundColor: colors.brass
  },
  tabText: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "600",
    letterSpacing: 0.2
  },
  tabTextOn: {
    color: colors.brass
  }
});
