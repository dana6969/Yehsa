// Before you go: pre-trip checklist. Icon + word + label for every item, never colour alone.
// Contacts and the trip plan stay on this phone. Sharing the plan opens the phone's own
// share sheet, so the person picks who gets it and sends it themselves.

import React, { useCallback, useEffect, useState } from "react";
import { ScrollView, Share, StyleSheet, Text, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { beforeYouGo, tripPlanText } from "../../symbolic/before_you_go.js";
import { phoneCorpusMeta } from "../../symbolic/phone_corpus.js";
import { loadAreas } from "./area_store";
import { probeBattery, probeGps, probeMesh } from "./device_probe.js";
import { currentImported } from "../../symbolic/imported_registry.js";
import StatusRow from "./parts/StatusRow.js";
import DownloadArea from "./DownloadArea.js";
import { Action, Field, Quiet, ScreenHeader, colors, themedStyles } from "./ui.js";
import { Chips } from "./hunt_ui.js";
import { useHunt } from "./hunt_state.js";
import { radius, space, type } from "./tokens.js";

const CONTACTS_KEY = "yehsa.contacts.v1";
const PLAN_KEY = "yehsa.tripplan.v1";
const TICK_KEY = "yehsa.beforeyougo.ticks.v1";
const PACK_KEY = "yehsa.beforeyougo.packlist.v1";

async function readJson(key, fallback) {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

// Drop-in for the checklist shell in FieldPane.js (PR #16): same onBack / onOpenLayers /
// onOpenScreen props, plus optional live inputs. Every prop is optional.
export default function BeforeYouGo({ target, position, packs, mesh, fieldNotes, onBack, onClose, onOpenLayers, onOpenScreen, onOpenKit }) {
  const hunt = useHunt();
  const [packList, setPackList] = useState("");
  const [areas, setAreas] = useState([]);
  const [battery, setBattery] = useState(null);
  const [gps, setGps] = useState(null);
  const [contacts, setContacts] = useState([]);
  const [plan, setPlan] = useState({});
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState({ name: "", phone: "" });
  const [note, setNote] = useState(null);
  const [ticked, setTicked] = useState({});
  const back = onBack || onClose;
  const here = target || (position && Number.isFinite(Number(position.latitude)) ? { latitude: Number(position.latitude), longitude: Number(position.longitude) } : null);

  const refresh = useCallback(async () => {
    AsyncStorage.getItem(PACK_KEY).then((id) => { if (id) setPackList(id); }).catch(() => {});
    const [list, level, perm, saved, trip, ticks] = await Promise.all([
      loadAreas(),
      probeBattery(),
      probeGps(),
      readJson(CONTACTS_KEY, []),
      readJson(PLAN_KEY, {}),
      readJson(TICK_KEY, {})
    ]);
    setTicked(ticks && typeof ticks === "object" ? ticks : {});
    setAreas(list);
    setBattery(level);
    setGps(perm);
    setContacts(Array.isArray(saved) ? saved : []);
    setPlan(trip && typeof trip === "object" ? trip : {});
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const imported = currentImported();
  const result = beforeYouGo({
    areas,
    packs: packs?.packs || packs || [],
    target: here,
    ticked,
    battery,
    gps,
    mesh: mesh || probeMesh(),
    knowledge: { fieldNotes: fieldNotes ?? phoneCorpusMeta.fieldNotes ?? 0, importedBooks: imported?.books?.length || 0 },
    contacts,
    plan,
    kit: hunt.loaded ? hunt.kit : null,
    kitListId: packList || hunt.kit?.lists?.[0]?.id
  });

  async function saveContacts(next) {
    setContacts(next);
    await AsyncStorage.setItem(CONTACTS_KEY, JSON.stringify(next)).catch(() => {});
  }

  async function savePlan(next) {
    setPlan(next);
    await AsyncStorage.setItem(PLAN_KEY, JSON.stringify(next)).catch(() => {});
  }

  async function sharePlan() {
    const message = tripPlanText(plan);
    try {
      const outcome = await Share.share({ message, title: "My trip plan" });
      if (outcome?.action !== Share.dismissedAction) {
        await savePlan({ ...plan, toldAt: new Date().toISOString() });
        setNote("Plan shared. Tell them when you are back safe.");
      }
    } catch {
      setNote("The share sheet did not open. Copy the plan below and send it yourself.");
    }
  }

  async function toggle(id) {
    const next = { ...ticked, [id]: !ticked[id] };
    setTicked(next);
    await AsyncStorage.setItem(TICK_KEY, JSON.stringify(next)).catch(() => {});
  }

  function extra(id) {
    if (id === "regs") return <Action label={ticked.regs ? "Mark not done" : "I checked them"} tone="quiet" onPress={() => toggle("regs")} />;
    if (id === "display") {
      return (
        <View style={styles.row}>
          {onOpenScreen ? <Action label="Open Display" tone="quiet" onPress={() => onOpenScreen("display")} /> : null}
          <Action label={ticked.display ? "Mark not done" : "Done"} tone="quiet" onPress={() => toggle("display")} />
        </View>
      );
    }
    if (id === "pack") {
      return (
        <View>
          <Chips label="Pack list" value={packList || hunt.kit?.lists?.[0]?.id} onChange={(next) => { setPackList(next); AsyncStorage.setItem(PACK_KEY, next).catch(() => {}); }} options={(hunt.kit?.lists || []).map((list) => ({ id: list.id, label: list.name }))} />
          {onOpenKit ? <Action label="Open the pack list" tone="quiet" onPress={onOpenKit} /> : null}
        </View>
      );
    }
    if (id === "mesh" && onOpenScreen) return <Action label="Open People" tone="quiet" onPress={() => onOpenScreen("people")} />;
    if (id === "gps" && gps?.status !== "granted") {
      return <Action label="Allow GPS" tone="quiet" onPress={async () => setGps(await probeGps({ ask: true }))} />;
    }
    if (id === "maps") {
      return (
        <View style={styles.row}>
          {onOpenLayers ? <Action label="Open Layers" tone="quiet" onPress={() => onOpenLayers()} /> : null}
          <Action label={editing === "maps" ? "Hide download" : "Download this area"} tone="quiet" onPress={() => setEditing(editing === "maps" ? null : "maps")} />
        </View>
      );
    }
    if (id === "contacts") {
      return (
        <View>
          {contacts.map((entry, index) => (
            <View key={`${entry.phone}-${index}`} style={styles.contact}>
              <Text style={styles.contactText}>{entry.name || "Contact"} · {entry.phone}</Text>
              <Action label="Remove" tone="clay" onPress={() => saveContacts(contacts.filter((_, i) => i !== index))} />
            </View>
          ))}
          {editing === "contacts" ? (
            <View>
              <Field label="Name" value={draft.name} onChangeText={(name) => setDraft({ ...draft, name })} />
              <Field label="Phone" value={draft.phone} onChangeText={(phone) => setDraft({ ...draft, phone })} />
              <Action label="Save contact" onPress={() => {
                if (!draft.phone.trim()) return;
                saveContacts([...contacts, { name: draft.name.trim(), phone: draft.phone.trim() }]);
                setDraft({ name: "", phone: "" });
                setEditing(null);
              }} />
            </View>
          ) : <Action label="Add contact" tone="quiet" onPress={() => setEditing("contacts")} />}
        </View>
      );
    }
    if (id === "plan") {
      return editing === "plan" ? (
        <View>
          <Field label="Where you are going" value={plan.where || ""} onChangeText={(where) => savePlan({ ...plan, where })} />
          <Field label="Route" value={plan.route || ""} onChangeText={(route) => savePlan({ ...plan, route })} />
          <Field label="Who is with you" value={plan.party || ""} onChangeText={(party) => savePlan({ ...plan, party })} />
          <Field label="Back by (day and time)" value={plan.backBy || ""} onChangeText={(backBy) => savePlan({ ...plan, backBy })} />
          <Field label="Vehicle or parking spot" value={plan.vehicle || ""} onChangeText={(vehicle) => savePlan({ ...plan, vehicle })} />
          <Field label="Who you are telling" value={plan.toldWho || ""} onChangeText={(toldWho) => savePlan({ ...plan, toldWho })} />
          <Text selectable style={styles.planText}>{tripPlanText(plan)}</Text>
          <Action label="Share plan" onPress={sharePlan} accessibilityHint="Opens the phone's share sheet; you choose who gets it" />
          <Action label="Done" tone="quiet" onPress={() => setEditing(null)} />
        </View>
      ) : <Action label="Write plan" tone="quiet" onPress={() => setEditing("plan")} />;
    }
    return null;
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <ScreenHeader title="Before you go" lead="A quick check while you still have signal and power." onBack={back} backLabel="Field" />
      <View style={styles.summary} accessibilityLiveRegion="polite">
        <Text style={styles.summaryText}>{result.summary}</Text>
      </View>
      {result.items.map((entry) => (
        <StatusRow key={entry.id} state={entry.state} label={entry.label} detail={entry.detail}>
          {extra(entry.id)}
          {entry.id === "maps" && editing === "maps" ? (
            <DownloadArea center={here && !here.box ? here : null} visibleBox={here?.box || null} onAreasChange={setAreas} />
          ) : null}
        </StatusRow>
      ))}
      {note ? <Quiet live>{note}</Quiet> : null}
      <Action label="Check again" tone="quiet" onPress={refresh} />
      {back ? <Action label="Back" tone="quiet" onPress={back} /> : null}
    </ScrollView>
  );
}

const styles = themedStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: space.lg, paddingBottom: 180 },
  summary: {
    borderWidth: 1,
    borderColor: colors.lineStrong,
    borderRadius: radius.md,
    padding: space.md,
    marginBottom: space.sm,
    backgroundColor: colors.surface
  },
  summaryText: { ...type.prose, color: colors.ink },
  row: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  contact: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: space.sm },
  contactText: { ...type.quiet, color: colors.ink, flexShrink: 1, marginRight: space.sm },
  planText: { ...type.quiet, color: colors.muted, backgroundColor: colors.field, padding: space.md, borderRadius: radius.sm, marginVertical: space.sm }
}));
