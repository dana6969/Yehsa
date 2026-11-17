import React, { useEffect, useMemo, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  BackHandler,
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
import { prepareMeaning } from "./meaning_provider";
import { quoteSpiritual } from "../../symbolic/spiritual_quote.js";
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
import { Action, DisplayContext, Field, HoldTalk, ModeChip, Prose, Quiet, ScreenHeader, ShellContext, StatusPill, applyTheme, colors, themedStyles } from "./ui.js";
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
import { pictureSource } from "../../symbolic/picture_assets.js";
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
  recordFeedback,
  recordModelAsk,
  rememberPhrase,
  saveHelpfulAnswer
} from "../../symbolic/learned_notes.js";
import { capabilitySummary, continueUtterance, isCapabilityQuestion, isFeedbackEligible, sourceChips } from "../../symbolic/chat_turn.js";
import LandscapeMap from "./LandscapeMap.js";
import {
  addPack,
  attributionLine,
  beginDownload,
  deletePack,
  elevationNear,
  emptyPackStore,
  formatBytes,
  nearestWater,
  packCards,
  packShapes,
  storageLine,
  validateImport
} from "../../symbolic/map_packs.js";
import { DEM_ATTRIBUTION, contourGeoJSON, elevationAt, hillshadeRgba, planDemRegion, terrariumGrid, tileBounds } from "../../symbolic/dem_tiles.js";
import { decode as decodePng, encode as encodePng } from "fast-png";
import OfflineMap from "./OfflineMap";
import { publishArchive, publishDem, startTileServer } from "./tile_server";
import PeerChat from "./PeerChat.js";
import PeerSecurity from "./PeerSecurity.js";
import EmergencyScreen from "./EmergencyScreen.js";
import { BackLayers, useBackLayer } from "./back_layers.js";
import { MORE_ITEMS, TABS, destinationActions, backAction, backLabel, createBackLayers, initialNav, navReduce, topScreen } from "./nav_model.js";
import FieldPane from "./FieldPane.js";
import MorePane from "./MorePane.js";
import { BooksPane, DownloadArea, HotspotGuide, SatSosGuide, TrustScreen, areaDemLayers, loadAreas } from "./screens_index.js";
import CommandSheet from "./CommandSheet.js";
import Onboarding, { ONBOARDED_KEY } from "./Onboarding.js";
import { TRUST_EVAL, TRUST_LINES } from "./trust_copy.js";
import { DISPLAY_KEY, DISPLAY_MODES, NIGHT_TINTS, defaultDisplay, modeLabel, nextMode, openDisplay, packDisplay, setMode, themeKeyFor } from "./display_model.js";
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



export default function YehsaApp() {
  const [nav, setNav] = useState(initialNav);
  const [display, setDisplay] = useState(defaultDisplay);
  const [onboarding, setOnboarding] = useState(false);
  const [huntRequest, setHuntRequest] = useState(0);
  const [partyRequest, setPartyRequest] = useState(0);
  // The theme is applied before any child renders, so colors.* and
  // themedStyles() lookups all follow the saved display mode.
  const themeKey = themeKeyFor(display);
  applyTheme(themeKey);
  const navRef = useRef(nav);
  navRef.current = nav;
  const layers = useMemo(() => createBackLayers(), []);
  const [pendingAsk, setPendingAsk] = useState(null);
  const tab = nav.tab;
  const screen = topScreen(nav);
  const visible = screen || tab;
  function go(action) {
    setNav((current) => navReduce(current, action));
  }
  function setTab(id) {
    go({ type: "tab", tab: id });
  }
  function openScreen(id) {
    go({ type: "push", screen: id });
  }
  function popScreen() {
    go({ type: "pop" });
  }
  const back = backLabel(nav, TABS);

  useEffect(() => {
    // Android back: the emergency overlay closes first, then an open sheet or
    // subview, then the screen stack, then a non-home tab returns to Ask.
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      const current = navRef.current;
      if (!current.sos && !current.command && current.stack.length === 0 && layers.run()) return true;
      const next = backAction(current);
      if (next.handled) setNav(next.state);
      return next.handled;
    });
    return () => subscription?.remove?.();
  }, [layers]);
  const [position, setPosition] = useState(initialPosition);
  const [waypoints, setWaypoints] = useState([]);
  const [track, setTrack] = useState([]);
  const [mapTap, setMapTap] = useState(null);
  const [peopleChat, setPeopleChat] = useState(false);
  const [askSummary, setAskSummary] = useState(null);
  const [layersRequest, setLayersRequest] = useState(0);
  const [fieldRequest, setFieldRequest] = useState(null);
  const [scanRequest, setScanRequest] = useState(0);
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

  const stackOpen = (id) => (nav.stack.includes(id) ? true : false);
  const chipVisible = !screen && tab !== "ask" && !(tab === "people" && peopleChat);
  useEffect(() => {
    let live = true;
    AsyncStorage.getItem(DISPLAY_KEY).then((raw) => {
      if (live && raw) setDisplay(openDisplay(raw));
    }).catch(() => {});
    AsyncStorage.getItem(ONBOARDED_KEY).then((raw) => {
      if (live && raw !== "done") setOnboarding(true);
    }).catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  function storeDisplay(next) {
    const opened = openDisplay(next);
    setDisplay(opened);
    AsyncStorage.setItem(DISPLAY_KEY, packDisplay(opened)).catch(() => {});
  }

  function finishOnboarding() {
    setOnboarding(false);
    AsyncStorage.setItem(ONBOARDED_KEY, "done").catch(() => {});
  }

  function goDestination(destination) {
    go({ type: "closeCommand" });
    for (const action of destinationActions(destination)) go(action);
    if (destination.id === "layers") setLayersRequest(Date.now());
    if (destination.id === "hunt") setHuntRequest(Date.now());
    if (destination.id === "scan") setScanRequest(Date.now());
    if (destination.tile) setFieldRequest({ id: Date.now(), tile: destination.tile });
  }

  function askFromAnywhere(text) {
    go({ type: "closeCommand" });
    setTab("ask");
    setPendingAsk({ id: Date.now(), text });
  }

  function sendMeshSos(message) {
    const queued = queueServiceText(mesh, message.text);
    setMesh(queued.session);
    if (!queued.ok) return queued.reason || "The SOS was not kept.";
    if (queued.session.link?.primary?.radio === true) {
      transmitNote(queued.item.text, queued.session.link.primary).catch(() => {});
      return "Sent to the held link where the peer accepts notes, and kept on this phone.";
    }
    return "No link is held, so the SOS is kept on this phone and goes out when a link is up.";
  }

  const currentMode = DISPLAY_MODES.find((item) => item.id === display.mode) || DISPLAY_MODES[0];
  const shell = useMemo(() => ({
    openMore: () => go({ type: "push", screen: "more" }),
    openSearch: () => go({ type: "openCommand" }),
    cycleMode: () => storeDisplay(nextMode(display)),
    modeLabel: modeLabel(display),
    modeIcon: currentMode.icon
  }), [display]);

  function pane(id) {
    const on = visible === id;
    return {
      style: [styles.pane, !on && styles.hidden],
      pointerEvents: on ? "auto" : "none",
      accessibilityElementsHidden: !on,
      importantForAccessibility: on ? "auto" : "no-hide-descendants"
    };
  }

  return (
    <BackLayers.Provider value={layers}>
    <DisplayContext.Provider value={display}>
    <ShellContext.Provider value={shell}>
    <View style={styles.root}>
      <StatusBar style={themeKey === "sunlight" ? "dark" : "light"} />
      <View style={styles.column}>
      <View style={styles.body}>
        <View {...pane("ask")}>
          <AskPane
            session={session}
            owner={owner}
            active
            screen={visible}
            pendingAsk={pendingAsk}
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
            onSummary={setAskSummary}
          />
        </View>
        <View {...pane("map")}>
          <LandPane
            position={position}
            setPosition={setPosition}
            onConsent={changeConsent}
            waypoints={waypoints}
            track={track}
            onMapTap={setMapTap}
            mapPacks={mapPacks}
            setMapPacks={setMapPacks}
            layersRequest={layersRequest}
            huntRequest={huntRequest}
            display={display}
            onDisplay={storeDisplay}
            onParty={() => { setTab("people"); setPartyRequest(Date.now()); }}
            onBefore={() => { setTab("field"); setFieldRequest({ id: Date.now(), tile: "before" }); }}
          />
        </View>
        <View {...pane("field")}>
          <FieldPane
            position={position}
            mapPacks={mapPacks}
            waypoints={waypoints}
            onEmergency={() => go({ type: "openSos" })}
            openRequest={fieldRequest}
            onOpenLayers={() => { setTab("map"); setLayersRequest(Date.now()); }}
            onOpenScreen={(id) => (id === "people" ? setTab("people") : openScreen(id))}
            onAsk={askFromAnywhere}
          />
        </View>
        <View {...pane("people")}>
          <PeoplePane
            mesh={mesh}
            setMesh={setMesh}
            owner={owner}
            position={position}
            onChatView={setPeopleChat}
            scanRequest={scanRequest}
            partyRequest={partyRequest}
          />
        </View>
        {stackOpen("more") ? (
          <View {...pane("more")}>
            <MorePane onOpen={openScreen} onBack={popScreen} backLabel={back} items={MORE_ITEMS} />
          </View>
        ) : null}
        {stackOpen("location") ? (
          <View {...pane("location")}>
            <PositionPane position={position} setPosition={setPosition} onConsent={changeConsent} onBack={popScreen} backLabel={back} />
          </View>
        ) : null}
        {stackOpen("actions") ? (
          <View {...pane("actions")}>
            <ScrollView contentContainerStyle={styles.scroll}>
              <ScreenHeader title="What I may do" lead="Choose what I may ask to do. I still wait for Approve." onBack={popScreen} backLabel={back} />
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
          </ScrollView>
          </View>
        ) : null}
        {stackOpen("did") ? (
          <View {...pane("did")}>
            <ScrollView contentContainerStyle={styles.scroll}>
              <ScreenHeader title="What Yehsa did" lead="Actions you approved, newest last, with Undo where it can." onBack={popScreen} backLabel={back} />
            {(actions?.log || []).filter((item) => item.status === "approved").length === 0 ? <Quiet>Nothing approved yet. Approved actions show here with Undo.</Quiet> : null}
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
        ) : null}
        {stackOpen("display") ? (
          <View {...pane("display")}>
            <DisplayPane display={display} onChange={storeDisplay} onBack={popScreen} backLabel={back} />
          </View>
        ) : null}
        {stackOpen("privacy") ? (
          <View {...pane("privacy")}>
            <ScrollView contentContainerStyle={styles.scroll}>
              <ScreenHeader title="Privacy" lead="Nothing leaves the phone unless you approve it." onBack={popScreen} backLabel={back} />
              <Prose>Questions, answers, learned notes, waypoints, and chats are kept on this phone.</Prose>
              <Quiet>Location stays off until you turn it on, and sharing it is a separate step each time.</Quiet>
              <Quiet>The radio scans only when you tap Scan. People chats are encrypted between paired phones.</Quiet>
              <Quiet>A model is off by default. If you connect one, Yehsa shows what would be sent and waits for Approve.</Quiet>
              <Quiet>Map packs and elevation download only after you approve them.</Quiet>
              <Quiet>No account, no ads, and no analytics.</Quiet>
            </ScrollView>
          </View>
        ) : null}
        {stackOpen("helpers") ? (
          <View {...pane("helpers")}>
            <HelpersPane
              position={position}
              onConsent={changeConsent}
              models={models}
              onOpen={openScreen}
              onBack={popScreen}
              backLabel={back}
            />
          </View>
        ) : null}
        {stackOpen("family") ? (
          <View {...pane("family")}>
            <ScrollView contentContainerStyle={styles.scroll}>
              <ScreenHeader title="Family card" lead="Coming in a later update." onBack={popScreen} backLabel={back} />
              <Quiet>A private card with the people to call, medical notes, and meeting places, kept on this phone and linked from Kit in Field.</Quiet>
            </ScrollView>
          </View>
        ) : null}
        {stackOpen("keys") ? (
          <View {...pane("keys")}>
            <ScrollView contentContainerStyle={styles.scroll}>
              <ScreenHeader title="Chat keys" lead="The keys that keep People chats private." onBack={popScreen} backLabel={back} />
              <PeerSecurity />
            </ScrollView>
          </View>
        ) : null}
        {stackOpen("library") ? (
          <View {...pane("library")}>
            <BooksPane title="Library" lead="What Yehsa reads from on this phone." onBack={popScreen} backLabel={back}>
              <Prose>{`${books.passages.length} field passages from ${(books.sources || []).length || "several"} packaged sources.`}</Prose>
              <Quiet>{`Dictionary: ${phoneCorpusMeta.headwords} headwords and ${phoneCorpusMeta.medicalNames} medical names.`}</Quiet>
              <Quiet>Spiritual texts open only when you ask a spiritual question in Ask. They are kept separate from field notes.</Quiet>
            </BooksPane>
          </View>
        ) : null}
        {stackOpen("trust") ? (
          <View {...pane("trust")}>
            <TrustScreen onBack={popScreen} backLabel={back} />
          </View>
        ) : null}
        {stackOpen("satsos") ? (
          <View {...pane("satsos")}>
            <SatSosGuide onBack={popScreen} backLabel={back} />
          </View>
        ) : null}
        {stackOpen("hotspot") ? (
          <View {...pane("hotspot")}>
            <HotspotGuide onBack={popScreen} backLabel={back} />
          </View>
        ) : null}
        {stackOpen("about") ? (
          <View {...pane("about")}>
            <ScrollView contentContainerStyle={styles.scroll}>
              <ScreenHeader title="About" lead="What stays on this phone." onBack={popScreen} backLabel={back} />
              <View style={styles.trust} accessibilityLabel="Trust">
                <Text style={styles.trustKicker}>TRUST</Text>
                <Text style={styles.trustBadge}>{TRUST_EVAL.badge}</Text>
                <Text style={styles.trustTitle}>A pledge, not a login</Text>
                {TRUST_LINES.map((line) => <Text key={line} style={styles.trustLine}>{`•  ${line}`}</Text>)}
                <Quiet>{TRUST_EVAL.summary}</Quiet>
              </View>
              <Quiet>Yehsa answers from the notes on this phone. A model, a map pack, and GPS each stay off until you ask. A picture is not a safe identification. Nothing is shared unless you use a separate share action. Packaged dictionary: {phoneCorpusMeta.headwords} headwords and {phoneCorpusMeta.medicalNames} medical names. {phoneCorpusMeta.honest} This install is bound to this device. Exterior access is denied.</Quiet>
            </ScrollView>
          </View>
        ) : null}
        <View {...pane("models")}>
          <ModelsPane
            onBack={popScreen}
            backLabel={back}
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
                ? `${provider.name} answered the test, so the connection works.`
                : result.reason);
            }}
          />
        </View>
        <View {...pane("learned")}>
          <LearnedPane
            onBack={popScreen}
            backLabel={back}
            onOpenDid={() => openScreen("did")}
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
        {onboarding ? <Onboarding onDone={finishOnboarding} /> : null}
      </View>
      {chipVisible && !onboarding ? (
        <AskChip summary={askSummary} onPress={() => (askSummary?.pending ? setTab("ask") : go({ type: "openCommand" }))} />
      ) : null}
      <View style={styles.tabs} accessibilityRole="tablist">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="SOS emergency"
          accessibilityHint="Opens the emergency screen. Nothing is called or sent until you confirm."
          onPress={() => go({ type: "openSos" })}
          style={({ pressed }) => [styles.sos, webPointer, pressed && styles.sosPressed]}
        >
          <View style={styles.sosCap} />
          <Text style={styles.sosText}>SOS</Text>
        </Pressable>
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
              <View style={[styles.tabMark, selected && styles.tabMarkOn]} />
              <Ionicons name={selected ? item.icon : `${item.icon}-outline`} size={22} color={selected ? colors.brassText : colors.muted} />
              <Text style={[styles.tabText, selected && styles.tabTextOn]}>{item.label}</Text>
            </Pressable>
          );
        })}
      </View>
      </View>
      {nav.command && !nav.sos ? (
        <CommandSheet onGo={goDestination} onAsk={askFromAnywhere} onClose={() => go({ type: "closeCommand" })} />
      ) : null}
      {nav.sos ? (
        <EmergencyScreen
          position={position}
          onClose={() => go({ type: "closeSos" })}
          onSendMeshSos={sendMeshSos}
          onFirstAid={() => {
            go({ type: "closeSos" });
            setTab("ask");
            setPendingAsk({ id: Date.now(), text: "How do I stop heavy bleeding?" });
          }}
        />
      ) : null}
    </View>
    </ShellContext.Provider>
    </DisplayContext.Provider>
    </BackLayers.Provider>
  );
}

function AskPane({ pendingAsk, onSummary, session, owner, active, screen, position, setPosition, waypoints, setWaypoints, setMesh, mapTap, models, setModels, ownerId, learned, setLearned, mapPacks, onActions }) {
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
      pushMessage({ role: "yehsa", text: "Want to save that spot as a waypoint? Tap Approve. Location needs to be on in More.", card: proposed.card });
    }
    return undefined;
  }, [mapTap]);

  useEffect(() => {
    // Emergency first-aid and "Ask or go" hand a question to this thread.
    if (!pendingAsk?.text) return undefined;
    setVoiceNote(null);
    runAsk(pendingAsk.text);
    return undefined;
  }, [pendingAsk?.id]);

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
      return { ok: false, text: "There is no new satellite reading on this card. Use Try satellite lock in More, Location.", undo: null };
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
          text: `${labeled.text} This came from ${provider?.name || "the model"}, not from Yehsa's notes. Save it if you want to keep it on this phone.`,
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
      return { ok: true, text: "Saved your correction on this phone. You can keep, edit, or forget it in What Yehsa has learned.", undo: { type: "learned", id: card.payload?.note?.id } };
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
      return { ok: true, text: "Saved on this phone. It's marked as coming from the model, so it stays separate from Yehsa's own notes.", undo: { type: "model-note", id: entryId } };
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
        label: "Save your correction on this phone",
        payload: proposal
      });
      rememberGate(proposed.gate);
      setPhase("ready");
      pushMessage({
        role: "yehsa",
        text: proposed.card
          ? "Got it. Tap Approve to save your correction on this phone."
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
    if (!here && screen === "map") {
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
        const spiritual = routesToSpiritual(text, parseQuestion(expandParaphrase(text)));
        let spiritualIndex = spiritual ? await loadScriptureIndex() : null;
        const lexical = askField(text, books.passages, { session, spiritualIndex, learned });
        // Offline meaning matcher: loads on the first question, then checks or fills the lexical note.
        let meaning = null;
        try {
          meaning = await prepareMeaning(text, {
            replies: [
              lexical?.text,
              spiritualIndex ? quoteSpiritual(text, spiritualIndex.passages || spiritualIndex)?.hits?.[0]?.text : null
            ].filter(Boolean),
            spiritual,
            loadScripturePassages: loadScriptureIndex
          });
        } catch {
          meaning = null;
        }
        if (!meaning) return lexical;
        if (meaning.scripture && !spiritualIndex) spiritualIndex = await loadScriptureIndex();
        return askField(text, books.passages, { session, spiritualIndex, learned, meaning });
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
            feedbackEligible: false,
            chips: sourceChips(result),
            source: result?.source || null,
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
          pushMessage({ role: "yehsa", text: result?.text ? `${reply} No model is connected, so nothing was sent.` : reply, feedbackEligible: isFeedbackEligible(result), chips: sourceChips(result), source: result?.source || null, question: text, symbol: result?.symbol || null, learnedId: result?.learnedId || null });
          return;
        }
        const reply = result?.text || result?.miss || "I don't have an installed note for that.";
        if (result?.kind === "learned") setLearned(recordLearnedAnswer(learned));
        priorRef.current = { utterance: text };
        setPhase(result?.answered ? "ready" : "miss");
        pushMessage({
          role: "yehsa",
          text: reply,
          // Yes / Not quite shows only under a real answer to the user's own question.
          feedbackEligible: isFeedbackEligible(result),
          chips: sourceChips(result),
          source: result?.source || null,
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
            onError: () => setVoiceNote("Reading aloud isn't available here. The answer stays on screen.")
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

  function patchMessage(id, patch) {
    setMessages((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item));
  }

  // Yes: saved quietly as a learned note, thanked in place. No new bubble.
  function onHelpful(item) {
    let next = item.learnedId ? markHelpful(learned, item.learnedId) : saveHelpfulAnswer(learned, {
      question: item.question,
      text: item.text,
      title: item.title,
      symbol: item.symbol
    });
    const pair = phraseFromFeedback(item.question, item.symbol);
    if (pair) next = rememberPhrase(next, pair.from, pair.to);
    setLearned(next);
    patchMessage(item.id, { feedback: "thanks" });
  }

  // Not quite: opens the reason box under that answer. Nothing posts to the thread.
  function onNotRight(item) {
    patchMessage(item.id, { feedback: "asking", reason: null, detail: "" });
  }

  function sendNotRight(item) {
    let next = item.learnedId ? markNotRight(learned, item.learnedId) : learned;
    next = recordFeedback(next, { question: item.question, symbol: item.symbol, verdict: "not-quite", reason: item.reason || null });
    const detail = String(item.detail || "").trim();
    if (detail) {
      next = approveLearned(next, proposeLearned({
        title: String(item.question || "Your correction").slice(0, 80),
        text: detail,
        source: "your correction",
        question: item.question || ""
      }));
    }
    setLearned(next);
    patchMessage(item.id, { feedback: "thanks" });
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
  const pendingCard = gate.pending ? true : false;
  useEffect(() => {
    // The compact Ask chip on other tabs shows only this summary. It never
    // opens a second thread.
    onSummary?.({ pending: pendingCard, busy: phase === "loading" });
  }, [messages, pendingCard, phase]);

  return (
    <View style={styles.chatWrap}>
      <ScreenHeader compact title="Ask" />
      <ScrollView ref={threadRef} contentContainerStyle={styles.thread} keyboardShouldPersistTaps="handled">
        {messages.length === 0 ? (
          <View style={styles.bubbleYehsa}>
            <Text style={styles.bubbleText}>Ask me anything. I work offline, and I check with you before I change anything.</Text>
          </View>
        ) : null}
        {messages.map((item) => (
          <View key={item.id} style={item.role === "you" ? styles.bubbleYou : styles.bubbleYehsa}>
            <Text style={styles.bubbleText}>{item.text}</Text>
            {item.role === "yehsa" && item.source ? (
              <Text accessibilityRole="text" style={styles.sourceLine}>{`Source: ${item.source}`}</Text>
            ) : null}
            {item.pictures?.length ? (
              <View style={styles.cardRow}>
                {item.pictures.map((picture) => (
                  <View key={picture.id}>
                    {pictureSource(picture.href.split("/").pop()) ? <Image accessibilityLabel={friendlySource(picture.id)} source={pictureSource(picture.href.split("/").pop())} style={styles.thumb} /> : <Text style={styles.bubbleText}>Picture not included</Text>}
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
            {item.role === "yehsa" && item.feedbackEligible === true ? (
              <FeedbackNote
                item={item}
                onYes={() => onHelpful(item)}
                onNotQuite={() => onNotRight(item)}
                onReason={(reason) => patchMessage(item.id, { reason: item.reason === reason ? null : reason })}
                onDetail={(detail) => patchMessage(item.id, { detail })}
                onSend={() => sendNotRight(item)}
                onCancel={() => patchMessage(item.id, { feedback: null, reason: null, detail: "" })}
              />
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
      {notes.length ? <Quiet>{`${notes.length} note${notes.length === 1 ? "" : "s"} saved on this phone.`}</Quiet> : null}
      <View style={styles.composer}>
        <TextInput
          accessibilityLabel="Message"
          value={question}
          onChangeText={setQuestion}
          placeholder="Message Yehsa"
          placeholderTextColor={colors.muted}
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
            onError: () => setVoiceNote("Reading aloud isn't available here. The answer stays on screen.")
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

const FEEDBACK_REASONS = ["Didn't answer my question", "Too vague", "Something was wrong", "Missing a step"];

function FeedbackNote({ item, onYes, onNotQuite, onReason, onDetail, onSend, onCancel }) {
  if (item.feedback === "thanks") {
    return <Text accessibilityLiveRegion="polite" style={styles.feedbackThanks}>Thanks. I saved that on this phone.</Text>;
  }
  if (item.feedback === "asking") {
    return (
      <View style={styles.feedbackBox}>
        <Text style={styles.feedbackPrompt}>What was off? Optional.</Text>
        <View style={styles.feedbackReasons}>
          {FEEDBACK_REASONS.map((reason) => {
            const on = item.reason === reason;
            return (
              <Pressable
                key={reason}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                onPress={() => onReason(reason)}
                style={[styles.reasonChip, on && styles.reasonChipOn]}
              >
                <Text style={[styles.reasonText, on && styles.reasonTextOn]}>{reason}</Text>
              </Pressable>
            );
          })}
        </View>
        <TextInput
          accessibilityLabel="Anything else"
          value={item.detail || ""}
          onChangeText={onDetail}
          placeholder="Anything else? (optional)"
          placeholderTextColor={colors.muted}
          multiline
          style={styles.feedbackInput}
        />
        <View style={styles.cardRow}>
          <Action label="Send" onPress={onSend} />
          <Action label="Cancel" tone="quiet" onPress={onCancel} />
        </View>
      </View>
    );
  }
  return (
    <View style={styles.feedbackRow}>
      <Text style={styles.feedbackPrompt}>Was this useful?</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Yes, this was useful" onPress={onYes} style={styles.feedbackLink}>
        <Text style={styles.feedbackLinkText}>Yes</Text>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Not quite" onPress={onNotQuite} style={styles.feedbackLink}>
        <Text style={styles.feedbackLinkClay}>Not quite</Text>
      </Pressable>
    </View>
  );
}

function ResultText({ result }) {
  if (!result?.text) return null;
  if (result.tone === "quiet") return <Quiet live>{result.text}</Quiet>;
  return <Prose live tone={result.tone === "warn" ? "warn" : undefined}>{result.text}</Prose>;
}

class MapBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onFail?.();
  }
  render() {
    if (this.state.failed) return null;
    return this.props.children;
  }
}

function pngDataUrl(bytes) {
  let binary = "";
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) binary += String.fromCharCode(...bytes.subarray(i, i + step));
  return `data:image/png;base64,${globalThis.btoa(binary)}`;
}

function LandPane({ position, setPosition, onConsent, waypoints, track, onMapTap, mapPacks, setMapPacks, layersRequest, huntRequest, display, onDisplay, onParty, onBefore }) {
  const [layersOpen, setLayersOpen] = useState(false);
  const [hunt, setHunt] = useState(false);
  useBackLayer(hunt, () => setHunt(false));
  useBackLayer(layersOpen, () => setLayersOpen(false));
  useEffect(() => {
    if (huntRequest) setHunt(true);
  }, [huntRequest]);
  useEffect(() => {
    if (layersRequest) setLayersOpen(true);
  }, [layersRequest]);
  const [declination, setDeclination] = useState("0");
  const [importNote, setImportNote] = useState("");
  const [demTiles, setDemTiles] = useState([]);
  const [contours, setContours] = useState({ type: "FeatureCollection", features: [] });
  const [mapFailed, setMapFailed] = useState(false);
  const [tilePort, setTilePort] = useState(null);
  const [elevNote, setElevNote] = useState("");
  const demRef = useRef([]);
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
  const tiledPack = (mapPacks?.packs || []).find((pack) => pack.archive);
  const metersHere = held ? demRef.current.reduce((found, tile) => {
    if (found != null) return found;
    return elevationAt(tile.elev, tile.width, tile.height, tile.bounds, held.longitude, held.latitude);
  }, null) : null;

  useEffect(() => {
    let live = true;
    if (Platform.OS === "web") return undefined;
    startTileServer().then((next) => {
      if (live && next) setTilePort(next);
    }).catch(() => {
      if (live) setMapFailed(true);
    });
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    publishArchive(tiledPack || null);
  }, [tiledPack]);

  // Offline areas saved with "Download this area" draw as hillshade and contours
  // when no elevation tiles are loaded yet. Read from this phone only.
  async function showSavedArea(list) {
    const area = [...(list || [])].reverse().find((item) => item && item.box && item.done?.length);
    if (!area || demRef.current.length) return;
    try {
      const layers = await areaDemLayers(area);
      if (!layers.stored.length || demRef.current.length) return;
      demRef.current = layers.stored;
      setDemTiles(layers.demTiles || layers.stored.map((tile) => ({ url: tile.url, bounds: tile.bounds, z: tile.z, x: tile.x, y: tile.y })));
      setContours(layers.contours || { type: "FeatureCollection", features: [] });
      publishDem(layers.stored);
      setImportNote(`Showing your saved area: ${area.name || "offline area"}.`);
    } catch {
      // A damaged area stays listed so it can be deleted; the blank canvas stays.
    }
  }

  useEffect(() => {
    let live = true;
    loadAreas().then((list) => {
      if (live) showSavedArea(list);
    }).catch(() => {});
    return () => {
      live = false;
    };
  }, []);

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

  const [packJobs, setPackJobs] = useState({});
  const [demJob, setDemJob] = useState({ state: "idle", done: 0, total: 0 });
  const demAbort = useRef(null);
  const packsRef = useRef(mapPacks);
  packsRef.current = mapPacks;
  const liveRef = useRef(true);
  useEffect(() => () => {
    liveRef.current = false;
    downloadAbort.current?.abort?.();
    demAbort.current?.abort?.();
  }, []);

  function setPackJob(id, job) {
    if (!liveRef.current) return;
    setPackJobs((current) => {
      const next = { ...current };
      if (job) next[id] = job;
      else delete next[id];
      return next;
    });
  }

  // The press handler only starts the job and returns. Fetch and parse run after a frame
  // yield, so the Map packs sheet keeps scrolling. A second tap while busy does nothing.
  function approvePackDownload(id) {
    if (!id || packJobs[id]?.state === "downloading") return;
    const planned = beginDownload(packsRef.current, id, { approved: true });
    if (!planned.fetch) {
      setPackJob(id, null);
      return;
    }
    downloadAbort.current?.abort?.();
    const controller = new AbortController();
    downloadAbort.current = controller;
    setPackJob(id, { state: "downloading" });
    (async () => {
      try {
        await yieldFrame();
        const response = await fetch(planned.item.url, { signal: controller.signal });
        if (!response.ok) throw new Error("status");
        const text = await response.text();
        if (text.length > PACK_TEXT_LIMIT) throw new Error("too big");
        await yieldFrame();
        if (controller.signal.aborted) return;
        const pack = validateImport(`${planned.item.id}.geojson`, text);
        if (pack.ok) {
          pack.catalogId = planned.item.id;
          pack.name = planned.item.name;
          pack.source = planned.item.source;
          pack.license = planned.item.license;
          pack.attribution = planned.item.attribution;
          pack.built = pack.built || new Date().toISOString().slice(0, 10);
        }
        await yieldFrame();
        if (controller.signal.aborted || !liveRef.current) return;
        const saved = addPack(packsRef.current, pack);
        if (saved.added) setMapPacks(saved.store);
        setPackJob(id, saved.added ? null : { state: "error" });
      } catch (err) {
        if (err?.name === "AbortError" || controller.signal.aborted) {
          setPackJob(id, null);
          return;
        }
        setPackJob(id, { state: "error" });
      }
    })();
  }

  function cancelPackDownload(id) {
    downloadAbort.current?.abort?.();
    setPackJob(id, null);
  }

  // Elevation tiles: one tile per step, with a frame yield between the fetch, the PNG
  // decode, and the hillshade/contour work. Cancel aborts between steps.
  function startElevation() {
    if (demJob.state === "downloading") return;
    const plan = planDemRegion({ approved: true, around: { latitude: held?.latitude || 45, longitude: held?.longitude || -69, radiusKm: 40 } });
    if (!plan.fetch || plan.tiles.length < 2) {
      setDemJob({ state: "error", done: 0, total: 0 });
      return;
    }
    demAbort.current?.abort?.();
    const controller = new AbortController();
    demAbort.current = controller;
    setDemJob({ state: "downloading", done: 0, total: plan.tiles.length });
    (async () => {
      const stored = [];
      const lines = [];
      try {
        for (let index = 0; index < plan.tiles.length; index += 1) {
          await yieldFrame();
          if (controller.signal.aborted) return;
          const response = await fetch(plan.urls[index], { signal: controller.signal });
          if (!response.ok) continue;
          const bytes = new Uint8Array(await response.arrayBuffer());
          await yieldFrame();
          const png = decodePng(bytes);
          const channels = png.channels || Math.round(png.data.length / (png.width * png.height));
          const rgba = channels === 4 ? png.data : new Uint8Array(png.width * png.height * 4);
          if (channels !== 4) {
            for (let pixel = 0; pixel < png.width * png.height; pixel += 1) {
              rgba[pixel * 4] = png.data[pixel * channels];
              rgba[pixel * 4 + 1] = png.data[pixel * channels + 1];
              rgba[pixel * 4 + 2] = png.data[pixel * channels + 2];
              rgba[pixel * 4 + 3] = 255;
            }
          }
          await yieldFrame();
          const elev = terrariumGrid(rgba, png.width, png.height);
          const shade = hillshadeRgba(elev, png.width, png.height);
          await yieldFrame();
          const encoded = encodePng({ width: png.width, height: png.height, data: shade, channels: 4 });
          const tile = plan.tiles[index];
          const bounds = tileBounds(tile.z, tile.x, tile.y);
          await yieldFrame();
          const drawn = contourGeoJSON(elev, png.width, png.height, bounds, 100);
          lines.push(...drawn.features);
          stored.push({ z: tile.z, x: tile.x, y: tile.y, bounds, elev, width: png.width, height: png.height, url: pngDataUrl(encoded), png: encoded });
          if (liveRef.current) setDemJob({ state: "downloading", done: index + 1, total: plan.tiles.length });
        }
        if (controller.signal.aborted || !liveRef.current) return;
        if (stored.length < 2) throw new Error("empty");
        demRef.current = stored;
        setDemTiles(stored.map((tile) => ({ url: tile.url, bounds: tile.bounds, z: tile.z, x: tile.x, y: tile.y })));
        setContours({ type: "FeatureCollection", features: lines.slice(0, 400) });
        publishDem(stored);
        setDemJob({ state: "idle", done: 0, total: 0 });
      } catch (err) {
        if (!liveRef.current) return;
        if (err?.name === "AbortError" || controller.signal.aborted) {
          setDemJob({ state: "idle", done: 0, total: 0 });
          return;
        }
        setDemJob({ state: "error", done: 0, total: 0 });
      }
    })();
  }

  function cancelElevation() {
    demAbort.current?.abort?.();
    setDemJob({ state: "idle", done: 0, total: 0 });
  }

  function removeElevation() {
    demRef.current = [];
    setDemTiles([]);
    setContours({ type: "FeatureCollection", features: [] });
    publishDem([]);
  }

  return (
    <View style={styles.mapPane}>
      <ScreenHeader compact title={hunt ? "Hunt" : "Map"} />
      <View style={styles.mapStatus}>
        <StatusPill label={gpsStatusLabel(gps)} tone={gps.status === "locked" ? "good" : gps.status === "lost" ? "warn" : undefined} />
        {!consented || !gpsWanted ? (
          <Action label="Turn on GPS" style={styles.mapGps} onPress={() => { onConsent(true); setGpsWanted(true); }} accessibilityHint="GPS stays off until you turn it on. This also turns on location consent." />
        ) : null}
      </View>
      {hunt ? (
        <View style={styles.hud} accessibilityLabel="Hunt view">
          <View style={styles.hudRow}>
            <HudCard label="Legal light" value="Later" sub="Check state regs" />
            <HudCard label="Wind" value="Later" sub="Entry in Field" />
            <HudCard label="Deer" value="Later" sub="Low, Med, High" />
          </View>
          <Text style={styles.hudNote}>Moon: context only, never counted. Hunting tools arrive in a later update.</Text>
          {display && onDisplay ? <ModeButtons display={display} onChange={onDisplay} compact /> : null}
        </View>
      ) : null}
      <View style={styles.mapFill}>
        {(tiledPack || demTiles.length > 0) && !mapFailed ? (
          <MapBoundary onFail={() => setMapFailed(true)}>
            <OfflineMap
              fill
              archive={tiledPack?.archive}
              format={tiledPack?.format}
              tileTemplate={tilePort ? `http://127.0.0.1:${tilePort}/pack/{z}/{x}/{y}` : null}
              demTemplate={tilePort && demTiles.length ? `http://127.0.0.1:${tilePort}/dem/{z}/{x}/{y}.png` : null}
              demTiles={demTiles}
              contours={contours}
              shapes={packShapes(mapPacks || emptyPackStore())}
              fix={held}
              follow={gps.follow}
              headingDeg={gps.headingDeg}
              attribution={attributionLine(mapPacks)}
              onFail={() => setMapFailed(true)}
              onPress={(point) => {
                if (onMapTap) onMapTap(point);
                const meters = demRef.current.reduce((found, tile) => found != null ? found : elevationAt(tile.elev, tile.width, tile.height, tile.bounds, point.longitude, point.latitude), null);
                setElevNote(meters == null ? "No elevation for that spot yet." : `About ${Math.round(meters)} m at that spot.`);
              }}
            />
          </MapBoundary>
        ) : (
        <LandscapeMap
          fill
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
            const meters = demRef.current.reduce((found, tile) => found != null ? found : elevationAt(tile.elev, tile.width, tile.height, tile.bounds, point.longitude, point.latitude), null);
            setElevNote(meters == null ? "" : `About ${Math.round(meters)} m at that spot.`);
            setImportNote(`Point ${point.latitude.toFixed(5)}, ${point.longitude.toFixed(5)}. Open Ask and tap Approve to save it.`);
          }}
        />
        )}
      </View>
      <View style={styles.mapTools}>
        <Action label="Layers and packs" tone="quiet" style={styles.mapToolButton} onPress={() => setLayersOpen(true)} accessibilityHint="Map packs, elevation, declination, waypoints, and import." />
        <Action label={hunt ? "Hunt on" : "Hunt"} tone={hunt ? "brass" : "quiet"} style={styles.mapToolSmall} onPress={() => setHunt((value) => !value)} accessibilityHint="Shows the hunt view on the map. Nothing is shared." />
      </View>
      {hunt ? (
        <View style={styles.mapTools}>
          <Action label="Party" tone="quiet" style={styles.mapToolButton} onPress={onParty} />
          <Action label="Before you go" tone="quiet" style={styles.mapToolButton} onPress={onBefore} />
        </View>
      ) : null}
      {layersOpen ? (
        <View style={styles.sheet} accessibilityViewIsModal>
          <View style={styles.sheetHead}>
            <Text accessibilityRole="header" style={styles.sheetTitle}>Layers and packs</Text>
            <Action label="Close" tone="quiet" style={styles.sheetClose} onPress={() => setLayersOpen(false)} />
          </View>
          <ScrollView contentContainerStyle={styles.sheetScroll} keyboardShouldPersistTaps="handled">
            <Action label="Before you go" tone="quiet" onPress={() => { setLayersOpen(false); onBefore?.(); }} />
            <Text style={styles.sectionLabel}>Download this area</Text>
            <DownloadArea center={held || null} onAreasChange={showSavedArea} />
            {consented && gpsWanted ? (
              <Action label={backgroundGps ? "Background GPS on" : "Foreground GPS only"} tone="quiet" onPress={() => setBackgroundGps((value) => !value)} />
            ) : null}
            {waypoints.map((point) => (
              <Action
                key={point.name}
                label={`Navigate to ${point.name}`}
                tone="quiet"
                onPress={() => setGps((current) => startNavigation(current, point))}
              />
            ))}
            <Field label="Declination from your map, east positive" value={declination} onChangeText={setDeclination} placeholder="0" />
            <Quiet>{metersHere == null ? elevationNear(mapPacks || emptyPackStore(), held).text : `About ${Math.round(metersHere)} m here.`}</Quiet>
            {elevNote ? <Quiet>{elevNote}</Quiet> : null}
            {importNote ? <Quiet>{importNote}</Quiet> : null}
            <Text style={styles.sectionLabel}>Map packs</Text>
            <Quiet>Offline maps on this phone.</Quiet>
            <Quiet>{storageLine(mapPacks || emptyPackStore())}</Quiet>
            <PackCard
              card={{
                key: "elevation",
                name: "Elevation and terrain",
                state: demJob.state === "downloading" ? "Downloading" : demJob.state === "error" ? "Error" : demTiles.length ? "Ready" : "Not downloaded",
                description: "Hills and contours around you, for offline use.",
                meta: demJob.state === "downloading"
                  ? `${demJob.done} of ${demJob.total} tiles · Near you`
                  : demTiles.length ? `${demTiles.length} tiles · Near you` : "About 2 MB · Near you",
                about: `${DEM_ATTRIBUTION.replace(/^Elevation:\s*/, "")} · public domain. May be dated.`,
                canDownload: true,
                job: demJob.state === "downloading" ? { received: demJob.done, total: demJob.total } : null
              }}
              onDownload={startElevation}
              onCancel={cancelElevation}
              onShow={() => setLayersOpen(false)}
              onRemove={removeElevation}
            />
            {packCards(mapPacks || emptyPackStore(), packJobs).map((card) => (
              <PackCard
                key={card.key}
                card={card}
                onDownload={() => approvePackDownload(card.catalogId)}
                onCancel={() => cancelPackDownload(card.catalogId)}
                onShow={() => setLayersOpen(false)}
                onRemove={() => card.packId && setMapPacks(deletePack(mapPacks, card.packId))}
                onUpdate={() => approvePackDownload(card.catalogId)}
              />
            ))}
            <Action
              label="Import a map file"
              tone="quiet"
              onPress={() => {
                if (Platform.OS !== "web" || typeof document === "undefined") {
                  setImportNote("Adding a map file isn't available on this phone yet.");
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
                      ? `Added ${pack.name} (${formatBytes(pack.bytes)}).`
                      : (pack.reason || saved.reason));
                  };
                  reader.readAsArrayBuffer(file);
                };
                input.click();
              }}
            />
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}

// Hand control back to the UI between heavy steps so the screen never freezes.
function yieldFrame() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

const PACK_TEXT_LIMIT = 24 * 1024 * 1024;

function PackCard({ card, onDownload, onCancel, onShow, onRemove, onUpdate }) {
  const [about, setAbout] = useState(false);
  const state = card.state;
  const progress = card.job?.total ? Math.min(1, (card.job.received || 0) / card.job.total) : null;
  return (
    <View style={styles.packCard}>
      <View style={styles.packHead}>
        <Text style={styles.packName}>{card.name}</Text>
        <Text style={styles.packState}>{state}</Text>
      </View>
      <Text style={styles.packText}>{card.description}</Text>
      {state === "Downloading" && progress != null ? (
        <View style={styles.packBar}><View style={[styles.packBarFill, { width: `${Math.round(progress * 100)}%` }]} /></View>
      ) : null}
      <Text style={styles.packMeta}>{card.meta}</Text>
      {state === "Error" ? <Text style={styles.packText}>Couldn't finish this download. Nothing new was saved.</Text> : null}
      <View style={styles.cardRow}>
        {state === "Not downloaded" && card.canDownload && !card.waitingForSignal ? <Action label="Download" onPress={onDownload} /> : null}
        {state === "Not downloaded" && card.waitingForSignal ? <Quiet>Will download when you're back online.</Quiet> : null}
        {state === "Downloading" ? <Action label="Cancel" tone="quiet" onPress={onCancel} /> : null}
        {state === "Ready" ? <Action label="Show on map" onPress={onShow} /> : null}
        {state === "Ready" && onRemove ? <Action label="Remove" tone="clay" onPress={onRemove} /> : null}
        {state === "Ready" && card.canUpdate && onUpdate ? <Action label="Update" tone="quiet" onPress={onUpdate} /> : null}
        {state === "Error" ? <Action label="Try again" onPress={onDownload || onUpdate} /> : null}
        {state === "Error" ? <Action label="Cancel" tone="quiet" onPress={onCancel} /> : null}
      </View>
      {card.about ? (
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: about }} onPress={() => setAbout((value) => !value)} style={styles.packAbout}>
          <Text style={styles.packAboutLink}>About this data</Text>
        </Pressable>
      ) : null}
      {about ? <Text style={styles.packMeta}>{card.about}</Text> : null}
    </View>
  );
}

function HudCard({ label, value, sub }) {
  return (
    <View style={styles.hudCard} accessibilityLabel={`${label}: ${value}. ${sub}`}>
      <Text style={styles.hudLabel}>{label.toUpperCase()}</Text>
      <Text style={styles.hudValue}>{value}</Text>
      <Text style={styles.hudSub}>{sub}</Text>
    </View>
  );
}

function DisplayPane({ display, onChange, onBack, backLabel }) {
  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      <ScreenHeader title="Display" lead="Saved on this phone. The header chip changes it in one tap too." onBack={onBack} backLabel={backLabel} />
      <Text style={styles.sectionLabel}>Mode</Text>
      <ModeButtons display={display} onChange={onChange} />
      <Text style={[styles.sectionLabel, { marginTop: 16 }]}>Night color</Text>
      <View style={styles.modeRow}>
        {NIGHT_TINTS.map((tint) => {
          const on = display.night === tint.id;
          return (
            <Pressable
              key={tint.id}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              accessibilityLabel={`Night ${tint.label}`}
              onPress={() => onChange({ ...display, night: tint.id })}
              style={[styles.modeButton, webPointer, on && styles.modeButtonOn]}
            >
              <Ionicons name={on ? "radio-button-on" : "radio-button-off"} size={18} color={on ? colors.brassInk : colors.ink} />
              <Text style={[styles.modeText, on && styles.modeTextOn]}>{tint.label}</Text>
            </Pressable>
          );
        })}
      </View>
      <Quiet>Red keeps night vision best. Amber is easier to read for some color vision.</Quiet>
      <Pressable
        accessibilityRole="switch"
        accessibilityState={{ checked: display.largeText }}
        accessibilityLabel="Larger text"
        onPress={() => onChange({ ...display, largeText: !display.largeText })}
        style={[styles.switchRow, webPointer, { marginTop: 12 }]}
      >
        <Text style={styles.switchLabel}>Larger text</Text>
        <Ionicons name={display.largeText ? "checkbox" : "square-outline"} size={24} color={colors.ink} />
        <Text style={styles.switchState}>{display.largeText ? "On" : "Off"}</Text>
      </Pressable>
    </ScrollView>
  );
}

// Field, Sunlight, Night: each one tap. Word and icon, never color alone.
function ModeButtons({ display, onChange, compact }) {
  return (
    <View style={styles.modeRow}>
      {DISPLAY_MODES.map((mode) => {
        const on = display.mode === mode.id;
        return (
          <Pressable
            key={mode.id}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            accessibilityLabel={`${mode.label} mode`}
            onPress={() => onChange(setMode(display, mode.id))}
            style={[styles.modeButton, compact && styles.modeButtonCompact, webPointer, on && styles.modeButtonOn]}
          >
            <Ionicons name={mode.icon} size={18} color={on ? colors.brassInk : colors.ink} />
            <Text style={[styles.modeText, on && styles.modeTextOn]}>{mode.label}</Text>
            {on ? <Ionicons name="checkmark" size={16} color={colors.brassInk} /> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

function HelpersPane({ position, onConsent, models, onOpen, onBack, backLabel }) {
  const consented = position?.consent === true;
  const modelOn = Boolean(models?.selectedId);
  const rows = [
    { id: "location", label: "Location", state: consented ? "On" : "Off", toggle: () => onConsent(!consented) },
    { id: "models", label: "Model", state: modelOn ? "On" : "Off", open: "models" },
    { id: "radio", label: "Radio scan", state: "Off until you tap Scan", open: null },
    { id: "voice", label: "Microphone", state: "Only while you hold Mic", open: null }
  ];
  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      <ScreenHeader title="Helpers" lead="Each helper shows whether it is on, and how to turn it off." onBack={onBack} backLabel={backLabel} />
      {rows.map((row) => (
        <View key={row.id} style={styles.helperRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.switchLabel}>{row.label}</Text>
            <Text style={styles.note}>{row.state}</Text>
          </View>
          {row.toggle ? (
            <Action label={consented ? "Turn off" : "Turn on"} tone="quiet" style={styles.helperAction} onPress={row.toggle} />
          ) : row.open ? (
            <Action label="Open" tone="quiet" style={styles.helperAction} onPress={() => onOpen(row.open)} />
          ) : null}
        </View>
      ))}
    </ScrollView>
  );
}

function AskChip({ summary, onPress }) {
  const line = summary?.pending
    ? "An action is waiting for Approve in Ask"
    : summary?.busy
      ? "Yehsa is reading the notes…"
      : "Ask or go";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={summary?.pending ? "Open Ask. An action is waiting for Approve." : "Ask or go"}
      onPress={onPress}
      style={({ pressed }) => [styles.askChip, webPointer, summary?.pending && styles.askChipPending, pressed && styles.sosPressed]}
    >
      <Ionicons name={summary?.pending ? "alert-circle-outline" : "chatbubble-ellipses-outline"} size={18} color={colors.brass} />
      <Text numberOfLines={1} style={styles.askChipText}>{line}</Text>
      <Text style={styles.askChipGo}>{summary?.pending ? "Open" : "Go"}</Text>
    </Pressable>
  );
}

function heldPhrase(source) {
  if (source === "typed") return "typed coordinates";
  if (source === "gnss") return "a termux-location GPS fix";
  if (source === "expo-location") return "an Expo Location fix";
  return "a fix";
}

function PositionPane({ position, setPosition, onConsent, onBack, backLabel }) {
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
        title="Location"
        lead="Your place stays off until you turn it on."
        onBack={onBack}
        backLabel={backLabel}
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
          trackColor={{ false: colors.line, true: colors.moss }}
          thumbColor={consented ? colors.ink : "#d7ddd2"}
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
      <Text style={styles.foot}>Turn this on yourself. Nothing is shared from this screen.</Text>
    </ScrollView>
  );
}

function peerLabel(peer) {
  const id = peer.address || peer.id || "peer";
  const rssi = typeof peer.rssi === "number" ? `, ${peer.rssi} dBm` : "";
  return `${peer.name} — ${id}${rssi}`;
}

function MeshPane({ mesh, setMesh, owner, position, onBack }) {
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
        title="Scan and radio"
        lead="Look for other Yehsa phones when you ask."
        onBack={onBack}
        backLabel="People"
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

function PeoplePane({ mesh, setMesh, owner, position, onChatView, scanRequest, partyRequest }) {
  const [scan, setScan] = useState(false);
  const [party, setParty] = useState(false);
  useBackLayer(party, () => setParty(false));
  useEffect(() => {
    if (partyRequest) setParty(true);
  }, [partyRequest]);
  const [chatView, setChatView] = useState("list");
  useBackLayer(scan, () => setScan(false));
  useEffect(() => {
    if (scanRequest) setScan(true);
  }, [scanRequest]);
  useEffect(() => {
    onChatView?.(!scan && chatView === "chat");
  }, [scan, chatView]);
  return (
    <View style={{ flex: 1 }}>
      <View style={[styles.pane, scan && styles.hidden]}>
        <PeerChat
          includeLocation={position?.consent === true && position.status === "locked"}
          header={<ScreenHeader compact title="People" lead="Private chat with phones you trust." />}
          onView={setChatView}
          toolbar={(
            <>
              <Action label="Scan and radio" tone="quiet" onPress={() => setScan(true)} accessibilityHint="Look for Yehsa phones nearby. The radio stays off until you scan." />
              <Action label="Hunt party" tone="quiet" onPress={() => setParty(true)} />
            </>
          )}
        />
      </View>
      {party ? (
        <View style={[styles.pane, { position: "absolute", left: 0, right: 0, top: 0, bottom: 0, backgroundColor: colors.bg }]}>
          <ScrollView contentContainerStyle={styles.scroll}>
            <ScreenHeader title="Hunt party" lead="Coming with hunting mode." onBack={() => setParty(false)} backLabel="People" />
            <Quiet>Party members will be paired contacts only, each with a verified safety number.</Quiet>
            <Quiet>Live location will be opt-in for a session you start, with the end time on screen, and it stops on its own.</Quiet>
            <Quiet>Nothing is shared from here today.</Quiet>
          </ScrollView>
        </View>
      ) : null}
      {scan ? <MeshPane mesh={mesh} setMesh={setMesh} owner={owner} position={position} onBack={() => setScan(false)} /> : null}
    </View>
  );
}

const styles = themedStyles((colors) => ({
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
  askChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 48,
    marginHorizontal: 12,
    marginBottom: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    backgroundColor: colors.surface
  },
  askChipPending: {
    borderColor: colors.brass
  },
  askChipText: {
    flex: 1,
    color: colors.ink,
    fontSize: 15
  },
  mapPane: {
    flex: 1,
    paddingTop: Platform.OS === "ios" ? 52 : 22,
    paddingHorizontal: 16,
    paddingBottom: 8
  },
  mapStatus: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 10
  },
  mapGps: {
    marginBottom: 0,
    minHeight: 40,
    paddingVertical: 8
  },
  mapFill: {
    flex: 1,
    overflow: "hidden"
  },
  mapTools: {
    flexDirection: "row",
    gap: 8,
    marginTop: 8
  },
  mapToolButton: {
    flex: 1,
    marginBottom: 0
  },
  mapToolSmall: {
    marginBottom: 0,
    minWidth: 96
  },
  hud: {
    marginBottom: 8,
    gap: 6
  },
  hudRow: { flexDirection: "row", gap: 6 },
  hudCard: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    borderRadius: 12,
    backgroundColor: colors.surface,
    padding: 8
  },
  hudLabel: { color: colors.muted, fontSize: 11, fontWeight: "700", letterSpacing: 0.8 },
  hudValue: { color: colors.ink, fontSize: 18, fontWeight: "700", marginTop: 2 },
  hudSub: { color: colors.muted, fontSize: 12, marginTop: 2 },
  hudNote: { color: colors.muted, fontSize: 12 },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: "80%",
    backgroundColor: colors.bg,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    borderColor: colors.lineStrong,
    zIndex: 10,
    elevation: 10
  },
  sheetHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingTop: 12
  },
  sheetTitle: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: "600"
  },
  sheetClose: {
    marginBottom: 0
  },
  sheetScroll: {
    paddingHorizontal: 18,
    paddingBottom: 32,
    gap: 4
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
    paddingBottom: 40
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
    borderColor: colors.moss,
    backgroundColor: colors.surface
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
  // Capped safety-red plate with an ink outline. The word SOS is required:
  // under protanopia the red shifts toward gold, so color is not enough.
  sos: {
    width: 72,
    minHeight: 64,
    margin: 4,
    marginRight: 2,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.sos,
    borderWidth: 2,
    borderColor: colors.ink,
    borderRadius: 10,
    paddingVertical: 6
  },
  sosCap: {
    width: 26,
    height: 6,
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
    borderWidth: 2,
    borderBottomWidth: 0,
    borderColor: colors.sosInk,
    marginBottom: 4
  },
  sosPressed: { opacity: 0.82 },
  sosText: {
    color: colors.sosInk,
    fontSize: 15,
    fontWeight: "800",
    letterSpacing: 1
  },
  onboardHost: {},
  trust: {
    borderWidth: 1,
    borderColor: colors.lineStrong,
    borderRadius: 16,
    padding: 16,
    gap: 8,
    marginBottom: 16
  },
  trustKicker: { color: colors.muted, fontSize: 12, fontWeight: "700", letterSpacing: 1.2 },
  trustBadge: {
    alignSelf: "flex-start",
    color: colors.brassInk,
    backgroundColor: colors.brass,
    borderWidth: 1,
    borderColor: colors.ink,
    borderRadius: 999,
    overflow: "hidden",
    paddingHorizontal: 10,
    paddingVertical: 3,
    fontSize: 12,
    fontWeight: "700"
  },
  trustTitle: { color: colors.ink, fontSize: 18, fontWeight: "600" },
  trustLine: { color: colors.ink, fontSize: 16, lineHeight: 23 },
  modeRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 },
  modeButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 48,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.lineStrong
  },
  modeButtonCompact: { minHeight: 40, paddingHorizontal: 10 },
  modeButtonOn: { backgroundColor: colors.brass, borderColor: colors.ink, borderWidth: 2 },
  modeText: { color: colors.ink, fontSize: 15, fontWeight: "600" },
  modeTextOn: { color: colors.brassInk },
  switchState: { color: colors.muted, fontSize: 14, marginLeft: 8, minWidth: 28 },
  helperRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.line },
  helperAction: { marginBottom: 0, minHeight: 44, paddingVertical: 8 },
  askChipGo: { color: colors.brassText, fontSize: 15, fontWeight: "700" },
  tab: {
    flex: 1,
    minHeight: 64,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8
  },
  tabOn: {},
  tabMark: {
    width: 28,
    height: 3,
    borderRadius: 2,
    marginBottom: 6,
    backgroundColor: "transparent"
  },
  chatWrap: { flex: 1, paddingHorizontal: 14, paddingTop: Platform.OS === "ios" ? 52 : 22, paddingBottom: 12 },
  thread: { paddingBottom: 12, gap: 10 },
  bubbleYou: { alignSelf: "flex-end", maxWidth: "86%", backgroundColor: colors.youBubble, borderRadius: 16, padding: 12 },
  bubbleYehsa: { alignSelf: "flex-start", maxWidth: "86%", backgroundColor: colors.yehsaBubble, borderRadius: 16, padding: 12 },
  bubbleText: { color: colors.ink, fontSize: 16, lineHeight: 22 },
  typing: { color: colors.brass, marginTop: 8 },
  thumb: { width: 88, height: 66, borderRadius: 10, backgroundColor: colors.field },
  info: { position: "absolute", right: 4, bottom: 4 },
  sourceChip: { color: colors.muted, fontSize: 12, marginRight: 8 },
  sourceLine: { color: colors.muted, fontSize: 13, lineHeight: 18, marginTop: 6 },
  undoLink: { color: colors.brass, fontSize: 15, marginTop: 6 },
  packCard: { backgroundColor: colors.surface, borderRadius: 16, borderWidth: 2, borderColor: colors.lineStrong, padding: 14, gap: 8, marginTop: 10 },
  packHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  packName: { color: colors.ink, fontSize: 16, fontWeight: "600", flex: 1 },
  packState: { color: colors.ink, fontSize: 12, borderWidth: 1, borderColor: colors.lineStrong, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 2 },
  packText: { color: colors.ink, fontSize: 15, lineHeight: 21 },
  packMeta: { color: colors.muted, fontSize: 13 },
  packBar: { height: 6, borderRadius: 3, backgroundColor: colors.line, overflow: "hidden" },
  packBarFill: { height: 6, backgroundColor: colors.brass },
  packAbout: { minHeight: 44, justifyContent: "center", alignSelf: "flex-start" },
  packAboutLink: { color: colors.brassText, fontSize: 14, fontWeight: "600" },
  feedbackRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 4, marginTop: 8, paddingTop: 6, borderTopWidth: 1, borderTopColor: colors.line },
  feedbackPrompt: { color: colors.muted, fontSize: 14, marginRight: 4 },
  feedbackLink: { minHeight: 44, minWidth: 44, paddingHorizontal: 8, alignItems: "center", justifyContent: "center" },
  feedbackLinkText: { color: colors.brassText, fontSize: 15, fontWeight: "600" },
  feedbackLinkClay: { color: colors.clay, fontSize: 15, fontWeight: "600" },
  feedbackThanks: { color: colors.muted, fontSize: 14, marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.line },
  feedbackBox: { gap: 10, marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.line },
  feedbackReasons: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  reasonChip: { minHeight: 44, paddingHorizontal: 14, borderRadius: 22, borderWidth: 1, borderColor: colors.lineStrong, justifyContent: "center" },
  reasonChipOn: { borderColor: colors.brass },
  reasonText: { color: colors.ink, fontSize: 14 },
  reasonTextOn: { color: colors.brassText },
  feedbackInput: { minHeight: 48, color: colors.ink, borderWidth: 1, borderColor: colors.lineStrong, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 },
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
    color: colors.brassText
  }
}));
