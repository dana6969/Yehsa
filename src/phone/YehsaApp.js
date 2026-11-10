import React, { useEffect, useMemo, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Image,
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
import { courseText, saveSessionWaypoint } from "../../symbolic/phone_land.js";
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
import { readPlatformFix, watchPlatformGps } from "./location_provider.js";
import { openMic, probeVoice, silenceSpeakers, speakProse, stopProse } from "./speech_provider.js";
import {
  recognitionErrorNotice,
  reduceVoiceGesture,
  speakHint,
  submitHeard,
  voiceButtonLabel
} from "../../symbolic/voice_adapter.js";
import { Action, Field, HoldTalk, Prose, Quiet, ScreenHeader, StatusPill, colors } from "./ui.js";
import { approveAction, declineAction, proposeAction, setActionEnabled, undoApproved } from "../../symbolic/action_gate.js";
import { readAssistant } from "../../symbolic/assistant_intent.js";
import {
  buildOutbound,
  deleteModelEntry,
  emptyModelSettings,
  labelModelAnswer,
  missModelOffer,
  packModelSettings,
  previewModelSend,
  rememberModelEntry,
  selectedProvider
} from "../../symbolic/model_link.js";
import { sendToModel } from "./model_client.js";
import { deleteModelKey, readModelKey, saveModelKey } from "./model_secrets.js";
import ModelsPane from "./ModelsPane.js";
import LearnedPane from "./LearnedPane.js";
import PictureGuide from "./PictureGuide.js";
import pictureManifest from "../../assets/pictures/manifest.json";
import { friendlySource, imageHref, picturesFor } from "../../symbolic/picture_guide.js";
import { Ionicons } from "@expo/vector-icons";
import {
  approveLearned,
  emptyLearned,
  exportLearned,
  learnedShareText,
  markHelpful,
  markNotRight,
  openLearned,
  phraseFromFeedback,
  proposeLearned,
  recordLearnedAnswer,
  recordModelAsk,
  rememberPhrase
} from "../../symbolic/learned_notes.js";
import { capabilitySummary, continueUtterance, isCapabilityQuestion, sourceChips } from "../../symbolic/chat_turn.js";
import LandscapeMap from "./LandscapeMap.js";
import {
  PACK_CATALOG,
  addPack,
  attributionLine,
  beginDownload,
  deletePack,
  elevationNear,
  emptyPackStore,
  formatBytes,
  nearestWater,
  packShapes,
  pauseDownload,
  resumeDownload,
  validateImport
} from "../../symbolic/map_packs.js";
import { planDemDownload } from "../../symbolic/dem_tiles.js";
import OfflineMap from "./OfflineMap.js";
import PeerChat from "./PeerChat.js";
import {
  applyGpsSample,
  gpsStatusLabel,
  grantGpsConsent,
  initialGpsMap,
  markSignalLost,
  noteUserPan,
  recenterOnMe,
  revokeGpsConsent,
  startNavigation
} from "../../symbolic/gps_map.js";

const webPointer = Platform.OS === "web" ? { cursor: "pointer" } : null;

const TABS = [
  { id: "ask", label: "Chat", icon: "chatbubble-ellipses" },
  { id: "land", label: "Map", icon: "map" },
  { id: "guide", label: "Guide", icon: "images" },
  { id: "position", label: "Me", icon: "person" },
  { id: "mesh", label: "Mesh", icon: "bluetooth" }
];

export default function YehsaApp() {
  const [tab, setTab] = useState("ask");
  const [position, setPosition] = useState(initialPosition);
  const [waypoints, setWaypoints] = useState([]);
  const [track, setTrack] = useState([]);
  const [mapTap, setMapTap] = useState(null);
  const [mapPacks, setMapPacks] = useState(emptyPackStore);
  const [actions, setActions] = useState(null);
  const [models, setModels] = useState(emptyModelSettings);
  const [learned, setLearned] = useState(emptyLearned);
  const [owner, setOwner] = useState(null);
  const [mesh, setMesh] = useState(initialMeshSession);
  const [modelTestNote, setModelTestNote] = useState("A connection test sends only the word ready, and only after Approve test.");

  useEffect(() => {
    let live = true;
    AsyncStorage.getItem("yehsa.model.public.v1").then((raw) => {
      if (!live || !raw) return;
      const packed = packModelSettings(JSON.parse(raw));
      setModels(packed);
      return Promise.all(packed.providers.map(async (provider) => {
        if (provider.needsKey === false) return provider;
        const saved = await readModelKey(provider.id);
        return { ...provider, keySaved: Boolean(saved) };
      })).then((providers) => {
        if (live) setModels({ ...packed, providers });
      });
    }).catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  function storeLearned(next) {
    const stamped = { ...next, deviceId: owner?.installId || next?.deviceId || null };
    setLearned(stamped);
    AsyncStorage.setItem("yehsa.learned.v1", exportLearned(stamped)).catch(() => {});
  }

  useEffect(() => {
    let live = true;
    AsyncStorage.getItem("yehsa.learned.v1").then((raw) => {
      if (!live || !raw) return;
      const opened = openLearned(JSON.parse(raw), owner?.installId || null);
      setLearned(opened);
    }).catch(() => {});
    return () => {
      live = false;
    };
  }, [owner?.installId]);

  function storeModels(next) {
    const packed = packModelSettings(next);
    setModels(packed);
    AsyncStorage.setItem("yehsa.model.public.v1", JSON.stringify(packed)).catch(() => {});
  }

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
          style={tab === "ask" ? styles.pane : styles.dockHost}
          pointerEvents="box-none"
        >
          <AskPane
            session={session}
            owner={owner}
            active
            docked={tab !== "ask"}
            screen={tab}
            position={position}
            setPosition={setPosition}
            waypoints={waypoints}
            setWaypoints={setWaypoints}
            setMesh={setMesh}
            mapTap={mapTap}
            mapPacks={mapPacks}
            models={models}
            setModels={storeModels}
            ownerId={owner?.installId || null}
            learned={learned}
            setLearned={storeLearned}
            onActions={setActions}
          />
        </View>
        <View
          style={[styles.pane, tab !== "land" && styles.hidden]}
          pointerEvents={tab === "land" ? "auto" : "none"}
          accessibilityElementsHidden={tab !== "land"}
        >
          <LandPane
            position={position}
            setPosition={setPosition}
            onConsent={changeConsent}
            waypoints={waypoints}
            track={track}
            onMapTap={setMapTap}
            mapPacks={mapPacks}
            setMapPacks={setMapPacks}
          />
        </View>
        <View
          style={[styles.pane, tab !== "guide" && styles.hidden]}
          pointerEvents={tab === "guide" ? "auto" : "none"}
          accessibilityElementsHidden={tab !== "guide"}
        >
          <PictureGuide />
        </View>
        <View style={[styles.pane, tab !== "settings" && styles.hidden]} pointerEvents={tab === "settings" ? "auto" : "none"}>
          <ScrollView contentContainerStyle={styles.scroll}>
            <ScreenHeader title="Actions" lead="Choose what I may ask to do." />
            {(actions?.settings ? Object.keys(actions.settings) : []).map((type) => (
              <View key={type} style={styles.switchRow}>
                <Text style={styles.switchLabel}>{friendlySource(type)}</Text>
                <Switch
                  accessibilityLabel={`${type} ${actions.settings[type] ? "on" : "off"}`}
                  value={actions.settings[type] === true}
                  onValueChange={() => actions.toggle(type)}
                />
              </View>
            ))}
            <Text style={styles.sectionLabel}>Approved</Text>
            {(actions?.log || []).filter((item) => item.status === "approved").map((item) => (
              <View key={`${item.id}-${item.at || item.status}`} style={styles.card}>
                <Text style={styles.bubbleText}>{friendlySource(item.type)}</Text>
                {item.undo && item.undone !== true ? (
                  <Pressable accessibilityRole="button" accessibilityLabel="Undo" onPress={() => actions.undo(item.id)}>
                    <Text style={styles.undoLink}>Undo</Text>
                  </Pressable>
                ) : null}
              </View>
            ))}
          </ScrollView>
        </View>
        <View style={[styles.pane, tab !== "about" && styles.hidden]} pointerEvents={tab === "about" ? "auto" : "none"}>
          <ScrollView contentContainerStyle={styles.scroll}>
            <ScreenHeader title="About" lead="What stays on this phone." />
            <Quiet>Yehsa answers from the notes on this phone. A model, a map pack, and GPS each stay off until you ask. A picture is not a safe identification. Nothing is shared unless you use a separate share action. Packaged dictionary: {phoneCorpusMeta.headwords} headwords and {phoneCorpusMeta.medicalNames} medical names. {phoneCorpusMeta.honest} This install is bound to this device. Exterior access is denied.</Quiet>
          </ScrollView>
        </View>
        <View
          style={[styles.pane, tab !== "position" && styles.hidden]}
          pointerEvents={tab === "position" ? "auto" : "none"}
          accessibilityElementsHidden={tab !== "position"}
        >
          <PositionPane position={position} setPosition={setPosition} onConsent={changeConsent} onOpenModels={() => setTab("models")} onOpenLearned={() => setTab("learned")} onOpenSettings={() => setTab("settings")} onOpenAbout={() => setTab("about")} />
        </View>
        <View
          style={[styles.pane, tab !== "mesh" && styles.hidden]}
          pointerEvents={tab === "mesh" ? "auto" : "none"}
          accessibilityElementsHidden={tab !== "mesh"}
        >
          <MeshPane mesh={mesh} setMesh={setMesh} owner={owner} position={position} />
        </View>
        <View
          style={[styles.pane, tab !== "models" && styles.hidden]}
          pointerEvents={tab === "models" ? "auto" : "none"}
          accessibilityElementsHidden={tab !== "models"}
        >
          <ModelsPane
            settings={models}
            onChange={storeModels}
            testNote={modelTestNote}
            onSaveKey={async (id, key) => {
              const saved = await saveModelKey(id, key);
              if (saved.ok) {
                storeModels({
                  ...models,
                  providers: models.providers.map((item) => item.id === id ? { ...item, keySaved: true } : item)
                });
              }
              return saved;
            }}
            onDeleteProvider={async (id) => {
              await deleteModelKey(id);
              storeModels({
                ...models,
                selectedId: models.selectedId === id ? null : models.selectedId,
                providers: models.providers.filter((item) => item.id !== id)
              });
            }}
            onTest={async (provider) => {
              const outbound = buildOutbound({ question: "Reply with the word ready." });
              const apiKey = provider.needsKey === false ? "" : await readModelKey(provider.id);
              const result = await sendToModel({
                provider,
                apiKey,
                outbound,
                approved: true,
                fetchImpl: globalThis.fetch
              });
              setModelTestNote(result.ok
                ? `${provider.name} answered the test. That was the model, not a Yehsa note. Connecting a model does not retrain Yehsa.`
                : result.reason);
            }}
          />
        </View>
        <View
          style={[styles.pane, tab !== "learned" && styles.hidden]}
          pointerEvents={tab === "learned" ? "auto" : "none"}
          accessibilityElementsHidden={tab !== "learned"}
        >
          <LearnedPane
            store={learned}
            deviceId={owner?.installId || null}
            onChange={storeLearned}
            onShare={(note) => {
              const queued = queueServiceText(mesh, learnedShareText(note));
              setMesh(queued.session);
              return queued.ok
                ? "Held on this phone for the mesh. It was not uploaded, and position was not included."
                : (queued.reason || "The note was not queued.");
            }}
          />
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
              <Ionicons name={item.icon} size={22} color={selected ? colors.brass : colors.muted} />
              <Text style={[styles.tabText, selected && styles.tabTextOn]}>{item.label}</Text>
            </Pressable>
          );
        })}
      </View>
      </View>
    </View>
  );
}

function AskPane({ session, owner, active, docked, screen, position, setPosition, waypoints, setWaypoints, setMesh, mapTap, models, setModels, ownerId, learned, setLearned, mapPacks, onActions }) {
  const [question, setQuestion] = useState("");
  const [phase, setPhase] = useState("idle");
  const [messages, setMessages] = useState([]);
  const [gate, setGate] = useState({ settings: { waypoint: true, measure: true, "position-hold": true, "position-unlock": true, "mesh-scan": true, calculate: true, speak: true, "field-note": true }, log: [], pending: null });
  const [notes, setNotes] = useState([]);
  const priorRef = useRef(null);
  const [correction, setCorrection] = useState(null);
  const [credits, setCredits] = useState(null);
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
      pushMessage({ role: "yehsa", text: "I understood a tap as a waypoint. Nothing is saved until you tap Approve, and consent on Me still has to be on.", card: proposed.card });
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
      setLearned(approveLearned(learned, proposeLearned({
        id: note.id,
        title: "Field note",
        text: note.text,
        source: "your field log",
        question: note.text,
        tags: ["field"]
      })));
      return { ok: true, text: "Saved on this phone only. It was not sent. It can be retrieved later as a learned note.", undo: { type: "field-note", id: note.id } };
    }
    if (card.type === "measure") {
      const from = card.payload.from;
      const to = card.payload.to;
      if (!from || !to) {
        return { ok: false, text: "I still need two places before I can measure.", undo: null };
      }
      const report = courseText(`${from.latitude}, ${from.longitude}`, `${to.latitude}, ${to.longitude}`);
      return { ok: report.ok === true, text: report.text, undo: null };
    }
    if (card.type === "calculate") {
      return { ok: true, text: card.payload.text || "I had no calculation to keep.", undo: null };
    }
    if (card.type === "ask-model") {
      const provider = (models?.providers || []).find((item) => item.id === card.payload.providerId) || selectedProvider(models);
      const apiKeyPromise = provider?.needsKey === false ? Promise.resolve("") : readModelKey(provider?.id);
      apiKeyPromise.then((apiKey) => sendToModel({
        provider,
        apiKey,
        outbound: card.payload.outbound,
        approved: true,
        fetchImpl: globalThis.fetch
      })).then((result) => {
        if (!/Nothing was sent/.test(result.reason || "")) setLearned(recordModelAsk(learned));
        if (!result.ok) {
          pushMessage({ role: "yehsa", text: result.reason || "Nothing was sent." });
          return;
        }
        const labeled = labelModelAnswer({
          providerName: provider?.name,
          text: result.text,
          offlineNote: card.payload.offlineNote || null
        });
        const entryId = `model-note-${Date.now()}`;
        const proposed = proposeAction(gateRef.current, {
          type: "save-model-note",
          id: `act-${Date.now()}`,
          label: `Save this as unverified from ${provider?.name || "the model"}`,
          payload: { id: entryId, question: card.payload.question, text: result.text, providerName: provider?.name }
        });
        rememberGate(proposed.gate);
        pushMessage({
          role: "yehsa",
          text: `${labeled.text} This does not retrain me. Save it only if you want an unverified note on this phone.`,
          card: proposed.card
        });
      }).catch(() => {
        pushMessage({ role: "yehsa", text: "No network, or the endpoint could not be reached. Nothing else was sent." });
      });
      return { ok: true, text: "Sending only the text shown on the card.", undo: null };
    }
    if (card.type === "map-query") {
      const from = position?.consent === true && position.status === "locked" ? position.fix : null;
      const answer = card.payload?.kind === "elevation" ? elevationNear(mapPacks, from) : nearestWater(mapPacks, from);
      return { ok: true, text: answer.text, undo: null };
    }
    if (card.type === "save-learned") {
      setLearned(approveLearned(learned, card.payload));
      return { ok: true, text: "Learned on this device from your correction. It is unverified until you confirm it or mark it helpful twice.", undo: { type: "learned", id: card.payload?.note?.id } };
    }
    if (card.type === "save-model-note") {
      const entryId = card.payload.id;
      setModels({
        ...models,
        unverified: rememberModelEntry(models?.unverified, { ...card.payload, id: entryId })
      });
      setLearned(approveLearned(learned, proposeLearned({
        id: entryId,
        title: String(card.payload.question || "Model answer").slice(0, 80),
        text: card.payload.text,
        source: card.payload.providerName || "a connected model",
        question: card.payload.question,
        tags: ["model"]
      })));
      return { ok: true, text: "Saved on this phone as learned from the model, unverified. It is not part of the trusted notes. This does not retrain a model.", undo: { type: "model-note", id: entryId } };
    }
    return { ok: false, text: "That action is not available.", undo: null };
  }

  function onApprove(id) {
    const decision = approveAction(gateRef.current, id, applyCard);
    rememberGate(decision.gate);
    const undoId = decision.result?.undo ? id : null;
    pushMessage({ role: "yehsa", text: decision.result?.text || "Nothing ran.", undoId });
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
    if (decision.undo?.type === "model-note") {
      setModels({ ...models, unverified: deleteModelEntry(models?.unverified, decision.undo.id) });
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
    if (/\b(nearest water|show water|where is water)\b/i.test(typed) || /\belevation here\b/i.test(typed)) {
      const kind = /\belevation\b/i.test(typed) ? "elevation" : "water";
      pushMessage({ role: "you", text: typed });
      const proposed = proposeAction(gateRef.current, {
        type: "map-query",
        id: `act-${Date.now()}`,
        label: kind === "water"
          ? "Look for water in the map packs on this phone. Nothing is downloaded."
          : "Read elevation from the map packs on this phone. No elevation service is called.",
        payload: { kind }
      });
      rememberGate(proposed.gate);
      setPhase("ready");
      pushMessage({
        role: "yehsa",
        text: proposed.card
          ? "I will only use a pack that is already on this phone. Nothing is downloaded until you approve a pack, and I will not invent a place."
          : "That map question is switched off.",
        card: proposed.card
      });
      return;
    }
    if (correction) {
      const proposal = proposeLearned({
        title: String(correction.question || "Correction").slice(0, 80),
        text: typed,
        source: "your correction",
        question: correction.question || typed
      });
      setCorrection(null);
      pushMessage({ role: "you", text: typed });
      const proposed = proposeAction(gateRef.current, {
        type: "save-learned",
        id: `act-${Date.now()}`,
        label: "Save your correction as an unverified note on this phone",
        payload: proposal
      });
      rememberGate(proposed.gate);
      setPhase("ready");
      pushMessage({
        role: "yehsa",
        text: proposed.card
          ? "I understood a correction. Nothing is saved until you tap Approve. This is memory on this phone, not retraining."
          : "Saving a correction is switched off, so I did not keep it.",
        card: proposed.card
      });
      return;
    }
    const text = continueUtterance(typed, priorRef.current);
    const held = position?.consent === true && position.status === "locked" ? position.fix : null;
    const origin = held || { latitude: 0, longitude: 0 };
    let here = mapTap || null;
    let hereLabel = mapTap ? "the last place you tapped" : "";
    if (!here && held) {
      here = held;
      hereLabel = "the place you are holding";
    }
    if (!here && screen === "land") {
      here = origin;
      hereLabel = "the center of this blank canvas, not a city";
    }
    const intent = readAssistant(typed, { here, hereLabel, held, waypoints });
    stopProse();
    setQuestion("");
    setNotice(null);
    pushMessage({ role: "you", text: typed });
    if (intent.kind !== "talk" && intent.type !== "ask-model") {
      let card = null;
      if (intent.kind === "action") {
        const proposed = proposeAction(gateRef.current, {
          type: intent.type,
          label: intent.label,
          payload: intent.payload,
          id: `act-${Date.now()}`
        });
        rememberGate(proposed.gate);
        card = proposed.card;
      }
      const reply = intent.kind === "clarify"
        ? `${intent.understood} ${intent.question}`
        : intent.kind === "cannot"
          ? `${intent.understood} ${intent.reply}`
          : card
            ? `${intent.understood} Nothing runs until you tap Approve.`
            : `${intent.understood} That action is switched off, so I did not propose it.`;
      priorRef.current = { utterance: typed };
      setPhase("ready");
      pushMessage({ role: "yehsa", text: reply, card });
      return;
    }
    setPhase("loading");
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
        return askField(text, books.passages, { session, spiritualIndex, learned });
      };
      run().then((result) => {
        if (askGen.current !== generation) return;
        const provider = selectedProvider(models);
        const askedModel = intent.type === "ask-model";
        const questionForModel = askedModel ? intent.payload.question : text;
        const standing = result?.answered && /contradicts that premise|last resort|do not rub|not drinking water/i.test(result.text || "")
          ? result.text
          : null;
        const wantsModel = askedModel || (!result?.answered && provider);
        if (wantsModel && provider) {
          const outbound = buildOutbound({
            question: questionForModel,
            include: models?.include,
            position: held,
            deviceId: ownerId,
            contacts: [],
            notes: models?.unverified
          });
          let offer = !result?.answered && !askedModel
            ? missModelOffer(provider, outbound)
            : previewModelSend(provider, outbound);
          if (models?.include?.contacts === true) {
            offer = `${offer} Contacts were ticked, but this phone has no contact list, so none are sent.`;
          }
          if (standing) {
            offer = `${standing} The offline note stands. The model will not replace it. ${offer}`;
          } else if (result?.answered) {
            offer = `${result.text} ${offer}`;
          }
          const proposed = proposeAction(gateRef.current, {
            type: "ask-model",
            id: `act-${Date.now()}`,
            label: offer,
            payload: { question: questionForModel, outbound, providerId: provider.id, offlineNote: standing }
          });
          rememberGate(proposed.gate);
          priorRef.current = { utterance: text };
          setPhase("ready");
          pushMessage({
            role: "yehsa",
            text: proposed.card ? offer : "That action is switched off, so I did not send anything.",
            chips: sourceChips(result),
            pictures: picturesFor(pictureManifest, result?.symbol).map((image) => ({
              id: image.id,
              href: imageHref(image.file),
              attribution: image.attribution,
              warning: image.warning
            })),
            card: proposed.card,
            question: text,
            symbol: result?.symbol || null,
            learnedId: result?.learnedId || null
          });
          return;
        }
        if (askedModel && !provider) {
          const reply = result?.text || "No model is connected, so nothing was sent. Add one under Me, Models. It stays off until you turn it on.";
          priorRef.current = { utterance: text };
          setPhase(result?.answered ? "ready" : "miss");
          pushMessage({ role: "yehsa", text: result?.text ? `${reply} No model is connected, so nothing was sent.` : reply, chips: sourceChips(result), question: text, symbol: result?.symbol || null, learnedId: result?.learnedId || null });
          return;
        }
        const reply = result?.text || result?.miss || "I don't have an installed note for that.";
        if (result?.kind === "learned") setLearned(recordLearnedAnswer(learned));
        priorRef.current = { utterance: text };
        setPhase(result?.answered ? "ready" : "miss");
        pushMessage({
          role: "yehsa",
          text: reply,
          chips: sourceChips(result),
          pictures: picturesFor(pictureManifest, result?.symbol).map((image) => ({
            id: image.id,
            href: imageHref(image.file),
            attribution: image.attribution,
            warning: image.warning
          })),
          question: text,
          symbol: result?.symbol || null,
          learnedId: result?.learnedId || null
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

  function onHelpful(item) {
    let next = item.learnedId ? markHelpful(learned, item.learnedId) : learned;
    const pair = phraseFromFeedback(item.question, item.symbol);
    if (pair) next = rememberPhrase(next, pair.from, pair.to);
    setLearned(next);
    pushMessage({ role: "yehsa", text: "Marked helpful. I'll remember that phrasing on this phone. This is retrieval memory, not retraining." });
  }

  function onNotRight(item) {
    if (item.learnedId) setLearned(markNotRight(learned, item.learnedId));
    setCorrection({ question: item.question || "" });
    pushMessage({ role: "yehsa", text: item.learnedId
      ? "Hidden on this phone. Trusted notes are unchanged. Type a correction if you want one taught. Nothing is saved until you approve."
      : "That trusted note stays. Type a correction if you want a learned one. Nothing is saved until you approve." });
  }

  useEffect(() => {
    if (!onActions) return;
    onActions({
      settings: gate.settings,
      log: gate.log,
      toggle(type) {
        rememberGate(setActionEnabled(gateRef.current, type, gateRef.current.settings?.[type] !== true));
      },
      undo(id) {
        onUndo(id);
      }
    });
  }, [gate, onActions]);

  const latest = messages.length ? messages[messages.length - 1] : null;

  return (
    <View style={docked ? styles.dock : styles.chatWrap}>
      {docked && latest?.role === "yehsa" ? (
        <View style={styles.bubbleYehsa}>
          <Text numberOfLines={4} style={styles.bubbleText}>{latest.text}</Text>
          {latest.card && gate.pending?.id === latest.card.id ? (
            <View style={styles.card}>
              <Text style={styles.bubbleText}>{latest.card.label}</Text>
              <View style={styles.cardRow}>
                <Action label="Approve" onPress={() => onApprove(latest.card.id)} />
                <Action label="Edit" tone="quiet" onPress={() => setQuestion(latest.card.label)} />
                <Action label="Decline" tone="clay" onPress={() => onDecline(latest.card.id)} />
              </View>
            </View>
          ) : null}
        </View>
      ) : null}
      {docked ? null : (
      <ScrollView ref={threadRef} contentContainerStyle={styles.thread} keyboardShouldPersistTaps="handled">
        {messages.length === 0 ? (
          <View style={styles.bubbleYehsa}>
            <Text style={styles.bubbleText}>Ask me anything on this phone. I wait for Approve before I change anything.</Text>
          </View>
        ) : null}
        {messages.map((item) => (
          <View key={item.id} style={item.role === "you" ? styles.bubbleYou : styles.bubbleYehsa}>
            <Text style={styles.bubbleText}>{item.text}</Text>
            {item.pictures?.length ? (
              <View style={styles.cardRow}>
                {item.pictures.map((picture) => (
                  <View key={picture.id}>
                    <Image accessibilityLabel={friendlySource(picture.id)} source={{ uri: picture.href }} style={styles.thumb} />
                    <Pressable accessibilityRole="button" accessibilityLabel="Picture credits" onPress={() => setCredits(picture)} style={styles.info}>
                      <Ionicons name="information-circle" size={18} color={colors.brass} />
                    </Pressable>
                  </View>
                ))}
              </View>
            ) : null}
            {item.chips?.length ? (
              <View style={styles.chips}>
                {item.chips.map((chip) => (
                  <Text key={chip} style={styles.sourceChip}>{friendlySource(chip)}</Text>
                ))}
              </View>
            ) : null}
            {item.role === "yehsa" ? (
              <View style={styles.cardRow}>
                <Action label="Helpful" tone="quiet" onPress={() => onHelpful(item)} />
                <Action label="Not right" tone="clay" onPress={() => onNotRight(item)} />
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
            {item.undoId ? (
              <Pressable accessibilityRole="button" accessibilityLabel="Undo" onPress={() => onUndo(item.undoId)}>
                <Text style={styles.undoLink}>Undo</Text>
              </Pressable>
            ) : null}
          </View>
        ))}
        {phase === "loading" ? <Text style={styles.typing}>Yehsa is reading the notes…</Text> : null}
        {notice ? <Quiet>{notice}</Quiet> : null}
        {voiceNote ? <Quiet>{voiceNote}</Quiet> : null}
      </ScrollView>
      )}
      {docked ? null : notes.length ? <Quiet>{`${notes.length} note${notes.length === 1 ? "" : "s"} saved on this phone.`}</Quiet> : null}
      <View style={styles.composer}>
        <TextInput
          accessibilityLabel="Message"
          value={question}
          onChangeText={setQuestion}
          placeholder="Message Yehsa"
          placeholderTextColor="#8f9a8c"
          style={styles.composerInput}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={canListen ? "Mic" : micLabel}
          accessibilityHint="Hold to talk, or tap once to keep listening and tap again to ask."
          onPressIn={onMicIn}
          onPressOut={onMicOut}
          onPress={onMicPress}
          disabled={!canListen || phase === "loading"}
          style={styles.iconButton}
        >
          <Ionicons name="mic" size={22} color={listening ? colors.clay : colors.brassInk} />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Send" onPress={ask} disabled={phase === "loading"} style={styles.iconButton}>
          <Ionicons name="send" size={20} color={colors.brassInk} />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Hear the answer" onPress={() => {
          const last = [...messages].reverse().find((item) => item.role === "yehsa" && item.text);
          if (!last) return;
          speakProse(last.text, {
            onDone: () => setVoiceNote(null),
            onError: () => setVoiceNote("This screen cannot speak the answer. The note stays on screen.")
          });
        }} style={styles.iconButtonQuiet}>
          <Ionicons name="volume-high" size={20} color={colors.ink} />
        </Pressable>
      </View>
      {credits ? (
        <View style={styles.credits}>
          <Text style={styles.bubbleText}>{credits.attribution}</Text>
          <Quiet>{credits.warning || "Picture credits"}</Quiet>
          <Action label="Close" tone="quiet" onPress={() => setCredits(null)} />
        </View>
      ) : null}
    </View>
  );
}

function ResultText({ result }) {
  if (!result?.text) return null;
  if (result.tone === "quiet") return <Quiet live>{result.text}</Quiet>;
  return <Prose live tone={result.tone === "warn" ? "warn" : undefined}>{result.text}</Prose>;
}

function LandPane({ position, setPosition, onConsent, waypoints, track, onMapTap, mapPacks, setMapPacks }) {
  const [declination, setDeclination] = useState("0");
  const [importNote, setImportNote] = useState("No terrain file is loaded. This is a blank landscape canvas.");
  const [packOffer, setPackOffer] = useState(null);
  const [demOffer, setDemOffer] = useState(false);
  const [demUrl, setDemUrl] = useState(null);
  const downloadAbort = useRef(null);
  const [gps, setGps] = useState(initialGpsMap);
  const [gpsWanted, setGpsWanted] = useState(false);
  const [backgroundGps, setBackgroundGps] = useState(false);
  const consented = position?.consent === true;
  const origin = gps.follow && gps.fix
    ? gps.fix
    : (gps.fix || (consented && position.status === "locked" && position.fix ? position.fix : { latitude: 0, longitude: 0 }));
  const held = gps.fix || (consented && position.status === "locked" ? position.fix : null);
  const crumbs = gps.track.length ? gps.track : track;

  useEffect(() => {
    if (!consented || !gpsWanted) {
      if (!consented) setGps(revokeGpsConsent());
      return undefined;
    }
    let live = true;
    let stop = () => {};
    setGps((current) => grantGpsConsent(current.consent ? current : initialGpsMap()));
    watchPlatformGps({
      consent: true,
      background: backgroundGps,
      onUpdate(coords) {
        if (!live) return;
        setGps((current) => {
          const base = current.consent ? current : grantGpsConsent(current);
          const next = applyGpsSample(base, coords);
          if (next.status === "locked") {
            setPosition((place) => place.consent === true
              ? applySatelliteReading(place, { route: "expo-location", fix: coords })
              : place);
          }
          return next;
        });
      }
    }).then((handle) => {
      if (!live) {
        handle.stop();
        return;
      }
      stop = handle.stop;
      if (!handle.started && handle.reason) setImportNote(handle.reason);
    });
    const timer = setInterval(() => setGps((current) => markSignalLost(current, Date.now())), 5000);
    return () => {
      live = false;
      clearInterval(timer);
      stop();
    };
  }, [consented, gpsWanted, backgroundGps, setPosition]);

  async function approvePackDownload(id) {
    const planned = beginDownload(mapPacks, id, { approved: true });
    if (!planned.fetch) {
      setImportNote(planned.reason);
      return;
    }
    const controller = new AbortController();
    downloadAbort.current = controller;
    setMapPacks(planned.store);
    try {
      const response = await fetch(planned.item.url, { signal: controller.signal });
      if (!response.ok) throw new Error("status");
      const text = await response.text();
      const pack = validateImport(`${planned.item.id}.geojson`, text);
      if (pack.ok) {
        pack.catalogId = planned.item.id;
        pack.name = planned.item.name;
        pack.source = planned.item.source;
        pack.license = planned.item.license;
        pack.attribution = planned.item.attribution;
        pack.built = pack.built || new Date().toISOString().slice(0, 10);
      }
      const saved = addPack(planned.store, pack);
      setMapPacks(saved.added ? saved.store : planned.store);
      setImportNote(saved.added
        ? `${pack.name} is on this phone. ${pack.attribution} May be out of date.`
        : (pack.reason || saved.reason));
    } catch (err) {
      if (err?.name === "AbortError") {
        setImportNote("Download paused. Nothing new was stored.");
        return;
      }
      setMapPacks(pauseDownload(planned.store, id));
      setImportNote("The download did not finish. Nothing new was stored. OSM public tile servers were not used.");
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
      <ScreenHeader
        title="Map"
        lead="Your map, after you turn GPS on."
      />
      <StatusPill label={gpsStatusLabel(gps)} tone={gps.status === "locked" ? "good" : gps.status === "lost" ? "warn" : undefined} />
      {!consented || !gpsWanted ? (
        <View style={styles.card}>
          <Text style={styles.bubbleText}>Turn on GPS</Text>
          <Quiet>The map stays a landscape canvas until you consent. GPS is the satellite on this device. It does not need a data connection, and it is not shared.</Quiet>
          <Action label="Turn on GPS" onPress={() => { onConsent(true); setGpsWanted(true); }} />
        </View>
      ) : (
        <Action label={backgroundGps ? "Background GPS on" : "Foreground GPS only"} tone="quiet" onPress={() => setBackgroundGps((value) => !value)} />
      )}
      {demUrl ? <Image source={{ uri: demUrl }} accessibilityLabel="Elevation hillshade" style={{ height: 180, borderRadius: 12 }} /> : null}
      {(mapPacks?.packs || []).some((pack) => pack.archive) ? (
        <OfflineMap
          archive={(mapPacks.packs.find((pack) => pack.archive) || {}).archive}
          format={(mapPacks.packs.find((pack) => pack.archive) || {}).format}
          attribution={attributionLine(mapPacks)}
          demUrl={demUrl}
        />
      ) : null}
      <LandscapeMap
        origin={origin}
        held={held}
        waypoints={waypoints}
        track={crumbs}
        features={packShapes(mapPacks || emptyPackStore())}
        declination={declination}
        follow={gps.follow}
        headingDeg={gps.headingDeg}
        accuracyM={gps.accuracyM}
        nav={gps.nav ? { ...gps.nav, name: gps.target?.name } : null}
        navTarget={gps.target}
        onRecenter={() => setGps((current) => recenterOnMe(current))}
        onUserPan={() => setGps((current) => noteUserPan(current))}
        onWaypoint={(point) => {
          if (onMapTap) onMapTap(point);
          setImportNote(`Proposed ${point.latitude.toFixed(5)}, ${point.longitude.toFixed(5)}. Approve it in Chat. Consent on Me is still required.`);
        }}
      />
      {waypoints.map((point) => (
        <Action
          key={point.name}
          label={`Navigate to ${point.name}`}
          tone="quiet"
          onPress={() => setGps((current) => startNavigation(current, point))}
        />
      ))}
      <Field label="Declination from your map, east positive" value={declination} onChangeText={setDeclination} placeholder="0" />
      <Quiet>{attributionLine(mapPacks || emptyPackStore())}</Quiet>
      <Quiet>{elevationNear(mapPacks || emptyPackStore(), held).text}</Quiet>
      <Quiet>{importNote}</Quiet>
      <Action label="Review elevation" tone="quiet" onPress={() => setDemOffer(true)} />
      {demOffer ? (
        <View style={styles.card}>
          <Quiet>{planDemDownload({ approved: false, latitude: held?.latitude || 45, longitude: held?.longitude || -69, zoom: 6 }).reason}</Quiet>
          <Action label="Approve elevation" onPress={async () => {
            const plan = planDemDownload({ approved: true, latitude: held?.latitude || 45, longitude: held?.longitude || -69, zoom: 6 });
            if (!plan.fetch) return;
            try {
              const response = await fetch(plan.url);
              const blob = await response.blob();
              setDemUrl(URL.createObjectURL(blob));
              setImportNote(`${plan.attribution} May be out of date.`);
              setDemOffer(false);
            } catch {
              setImportNote("The elevation tile did not download. Nothing was stored.");
            }
          }} />
          <Action label="Decline" tone="clay" onPress={() => setDemOffer(false)} />
        </View>
      ) : null}
      <Text style={styles.sectionLabel}>Map packs</Text>
      <Quiet>{`Storage ${formatBytes((mapPacks || emptyPackStore()).usedBytes)} of ${formatBytes((mapPacks || emptyPackStore()).budgetBytes)}. Packs stay in app storage, not in the install file. The whole world is not offered.`}</Quiet>
      {(mapPacks?.packs || []).map((pack) => (
        <View key={pack.id} style={styles.card}>
          <Text style={styles.bubbleText}>{`${pack.name}. ${formatBytes(pack.bytes)}. May be out of date.`}</Text>
          <Quiet>{`${pack.attribution} ${pack.license}. ${pack.built || pack.importedAt || "Build date not in the file."} ${pack.note || ""}`}</Quiet>
          <Action label="Update" tone="quiet" onPress={() => {
            if (pack.catalogId) setPackOffer(pack.catalogId);
            else setImportNote("This file has no source URL. Import a newer copy. Nothing was downloaded.");
          }} />
          <Action label="Delete pack" tone="clay" onPress={() => setMapPacks(deletePack(mapPacks, pack.id))} />
        </View>
      ))}
      {PACK_CATALOG.map((item) => (
        <Action key={item.id} label={`Review ${item.name}`} tone="quiet" onPress={() => setPackOffer(item.id)} />
      ))}
      {packOffer ? (
        <View style={styles.card}>
          <Quiet>{beginDownload(mapPacks, packOffer, { approved: false }).reason}</Quiet>
          <Action label="Approve download" onPress={() => approvePackDownload(packOffer)} />
          <Action label="Pause" tone="quiet" onPress={() => {
            downloadAbort.current?.abort?.();
            setMapPacks(pauseDownload(mapPacks, packOffer));
          }} />
          <Action label="Resume" tone="quiet" onPress={() => {
            const next = resumeDownload(mapPacks, packOffer);
            setMapPacks(next.store);
            if (next.fetch) approvePackDownload(packOffer);
          }} />
          <Action label="Decline" tone="clay" onPress={() => setPackOffer(null)} />
        </View>
      ) : null}
      <Action
        label="Import a map file"
        tone="quiet"
        onPress={() => {
          if (Platform.OS !== "web" || typeof document === "undefined") {
            setImportNote("Choosing a map file needs the web screen or a phone file picker. Nothing was added.");
            return;
          }
          const input = document.createElement("input");
          input.type = "file";
          input.accept = ".geojson,.json,.gpx,.kml,.mbtiles,.pmtiles";
          input.onchange = () => {
            const file = input.files && input.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = () => {
              const bytes = new Uint8Array(reader.result);
              const pack = validateImport(file.name, bytes);
              if (pack.ok && (pack.format === "pmtiles" || pack.format === "mbtiles")) pack.archive = bytes;
              const saved = addPack(mapPacks, pack);
              if (saved.added) setMapPacks(saved.store);
              setImportNote(saved.added
                ? `${pack.name}. ${formatBytes(pack.bytes)}. ${pack.attribution} May be out of date. ${pack.note}`
                : (pack.reason || saved.reason));
            };
            reader.readAsArrayBuffer(file);
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

function PositionPane({ position, setPosition, onConsent, onOpenModels, onOpenLearned, onOpenSettings, onOpenAbout }) {
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
        lead="Your place stays off until you turn it on."
      />
      <Action label="Models" tone="quiet" onPress={onOpenModels} accessibilityHint="Connect a language model. It stays off until you turn one on." />
      <Action label="Settings" tone="quiet" onPress={onOpenSettings} />
      <Action label="About" tone="quiet" onPress={onOpenAbout} />
      <Action label="What Yehsa has learned" tone="quiet" onPress={onOpenLearned} accessibilityHint="Notes Yehsa has learned on this phone. Nothing is uploaded." />
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
  const [people, setPeople] = useState(false);
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

  if (people) {
    return (
      <View style={{ flex: 1 }}>
        <PeerChat includeLocation={position?.consent === true && position.status === "locked"} />
        <Action label="Back to mesh" tone="quiet" onPress={() => setPeople(false)} />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
      <ScreenHeader
        title="Mesh"
        lead="Look for other Yehsa phones when you ask."
      />
      <Action label="People" onPress={() => setPeople(true)} />
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
    flex: 1,
    position: "relative"
  },
  dockHost: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 5
  },
  dock: {
    backgroundColor: colors.bg,
    borderTopWidth: 1,
    borderTopColor: colors.lineStrong,
    padding: 12,
    gap: 8
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
    paddingBottom: 168
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
  thumb: { width: 88, height: 66, borderRadius: 10, backgroundColor: colors.field },
  info: { position: "absolute", right: 4, bottom: 4 },
  sourceChip: { color: colors.muted, fontSize: 12, marginRight: 8 },
  undoLink: { color: colors.brass, fontSize: 15, marginTop: 6 },
  iconButton: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.brass, alignItems: "center", justifyContent: "center" },
  iconButtonQuiet: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  credits: { backgroundColor: colors.surface, borderRadius: 16, padding: 12, gap: 8, marginTop: 8 },
  switchRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 48 },
  switchLabel: { color: colors.ink, fontSize: 16, flex: 1 },
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
