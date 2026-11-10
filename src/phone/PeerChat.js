import React, { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import QRCode from "qrcode";
import {
  PEER_CHAT_PLAIN,
  deleteChat,
  generateIdentity,
  openDirect,
  publicCard,
  qrPayload,
  safetyNumber,
  sealDirect,
  sweepExpired
} from "../../symbolic/peer_chat.js";
import { KEY_CHANGE_WARNING, notePeerKey } from "../../symbolic/peer_vault.js";
import { loadOrCreateIdentity, loadPeerHistory, savePeerHistory } from "./mesh_keys.js";
import { Action, Quiet, colors } from "./ui.js";

function qrCells(text) {
  const code = QRCode.create(text, { errorCorrectionLevel: "L" });
  const cells = [];
  for (let y = 0; y < code.modules.size; y += 1) {
    const row = [];
    for (let x = 0; x < code.modules.size; x += 1) row.push(code.modules.get(x, y));
    cells.push(row);
  }
  return cells;
}

export default function PeerChat({ includeLocation = false }) {
  const [me, setMe] = useState(null);
  const [view, setView] = useState("list");
  const [practice, setPractice] = useState(null);
  const [trusted, setTrusted] = useState(false);
  const [typedNumber, setTypedNumber] = useState("");
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState([]);
  const [peers, setPeers] = useState({});
  const [nearby, setNearby] = useState(false);
  const [vanish, setVanish] = useState(false);
  const [sosPlace, setSosPlace] = useState(false);
  const [demo, setDemo] = useState(false);
  const [warning, setWarning] = useState("");
  const [ready, setReady] = useState(false);
  const [about, setAbout] = useState(false);
  useEffect(() => {
    let live = true;
    loadOrCreateIdentity().then(async (result) => {
      if (!live) return;
      setMe(result.identity);
      setDemo(result.demo === true);
      const history = await loadPeerHistory();
      if (!live) return;
      const storedPractice = history?.practice?.boxSecret ? history.practice : generateIdentity();
      const known = history?.peers || {};
      const noticed = notePeerKey(known, "practice", publicCard(storedPractice));
      setPractice(storedPractice);
      setPeers(noticed.known);
      setMessages(history?.messages || []);
      if (noticed.changed) setWarning(noticed.warning || KEY_CHANGE_WARNING);
      setReady(true);
    }).catch(() => {
      if (live) setWarning("The private key was not saved.");
    });
    return () => {
      live = false;
    };
  }, []);
  useEffect(() => {
    if (!ready || !practice) return;
    savePeerHistory({ messages, peers, practice }).catch(() => {});
  }, [ready, messages, peers, practice]);
  const number = me && practice ? safetyNumber(me.boxPublic, practice.boxPublic) : "";
  const cells = useMemo(() => (me ? qrCells(qrPayload(me)) : []), [me]);
  const visible = sweepExpired(messages, Date.now());

  function send(text, { sos = false } = {}) {
    if (!me || !practice) return;
    const envelope = sealDirect(me, publicCard(practice), text, {
      includeLocation: sos && sosPlace === true && includeLocation === true,
      fix: includeLocation ? { latitude: 45.1, longitude: -69.2 } : null,
      nearby,
      expireAt: vanish ? Date.now() + 60 * 60 * 1000 : null
    });
    const opened = openDirect(practice, envelope);
    setMessages((current) => [...current, {
      id: envelope.id,
      peerId: "practice",
      mine: true,
      text: opened.ok ? opened.text : "Could not open.",
      nearby: envelope.nearby,
      location: opened.location,
      status: "delivered",
      expireAt: envelope.expireAt
    }]);
    setDraft("");
  }

  return (
    <View style={styles.screen}>
      <View style={styles.top}>
        <Text style={styles.title}>People</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="About this chat" onPress={() => setAbout((value) => !value)} style={styles.info}>
          <Ionicons name="information-circle-outline" size={22} color={colors.brass} />
        </Pressable>
      </View>
      <Quiet>Private: only you and this person can read these</Quiet>
      {demo ? <Quiet>This web preview is a demo identity only.</Quiet> : null}
      {warning ? <Quiet>{warning}</Quiet> : null}
      {about ? <Quiet>{PEER_CHAT_PLAIN}</Quiet> : null}
      <View style={styles.row}>
        <Action label="Contacts" tone={view === "list" ? "brass" : "quiet"} onPress={() => setView("list")} />
        <Action label="Pair" tone={view === "pair" ? "brass" : "quiet"} onPress={() => setView("pair")} />
      </View>

      {view === "pair" ? (
        <ScrollView contentContainerStyle={styles.pair} keyboardShouldPersistTaps="handled">
          <Quiet>Compare this safety number, or let the other phone scan the code.</Quiet>
          <Text accessibilityLabel="Safety number" style={styles.number}>{number}</Text>
          <View accessibilityLabel="Pairing code" style={styles.qr}>
            {cells.map((row, y) => (
              <View key={y} style={styles.qrRow}>
                {row.map((on, x) => <View key={x} style={[styles.cell, on && styles.cellOn]} />)}
              </View>
            ))}
          </View>
          <TextInput accessibilityLabel="Their safety number" value={typedNumber} onChangeText={setTypedNumber} placeholder="Their safety number" placeholderTextColor="#8f9a8c" style={styles.input} />
          <Action label="Trust this number" onPress={() => setTrusted(typedNumber.replace(/\s+/g, "") === number.replace(/\s+/g, ""))} />
          <Quiet>{trusted ? "Trusted on this phone." : "Unverified until the numbers match."}</Quiet>
        </ScrollView>
      ) : view === "list" ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Practice contact" onPress={() => setView("chat")} style={styles.person}>
          <Ionicons name="lock-closed" size={16} color={colors.brass} />
          <Text style={styles.personName}>Practice contact</Text>
          <Text style={styles.badge}>{trusted ? "Trusted" : "Unverified"}</Text>
          <Quiet>Not another phone.</Quiet>
        </Pressable>
      ) : (
        <View style={styles.chat}>
          <Pressable accessibilityRole="button" accessibilityLabel="Practice contact" onPress={() => setView("list")} style={styles.person}>
            <Ionicons name="lock-closed" size={16} color={colors.brass} />
            <Text style={styles.personName}>Practice contact</Text>
            <Text style={styles.badge}>{trusted ? "Trusted" : "Unverified"}</Text>
          </Pressable>
          <ScrollView contentContainerStyle={styles.thread} keyboardShouldPersistTaps="handled">
            {visible.map((message) => (
              <View key={message.id} style={[styles.bubble, message.mine && styles.mine]}>
                <Text style={styles.body}>{message.text}</Text>
                <Text style={styles.meta}>{message.status}{message.location ? " · location" : ""}</Text>
              </View>
            ))}
          </ScrollView>
          <View style={styles.composer}>
            <TextInput accessibilityLabel="Peer message" value={draft} onChangeText={setDraft} placeholder="Message" placeholderTextColor="#8f9a8c" style={styles.input} />
            <Pressable accessibilityRole="button" accessibilityLabel="Send" onPress={() => draft && send(draft)} style={styles.send}>
              <Ionicons name="send" size={18} color="#141a16" />
            </Pressable>
          </View>
          <View style={styles.row}>
            <Action label={nearby ? "Nearby on" : "Nearby"} tone="quiet" onPress={() => setNearby((value) => !value)} />
            <Action label={vanish ? "Disappearing" : "Keep"} tone="quiet" onPress={() => setVanish((value) => !value)} />
            <Action label="SOS" tone="clay" onPress={() => send("SOS", { sos: true })} />
            <Action label="Delete" tone="clay" onPress={() => setMessages((current) => deleteChat(current, "practice"))} />
          </View>
          <Quiet>{sosPlace ? "SOS can include your location." : "SOS does not include your location."}</Quiet>
          <Action label={sosPlace ? "Location on for SOS" : "Location off for SOS"} tone="quiet" onPress={() => setSosPlace((value) => !value)} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingTop: 12, paddingHorizontal: 16, gap: 8 },
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { color: colors.ink, fontSize: 28, fontWeight: "600" },
  info: { padding: 6 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8, alignItems: "center" },
  pair: { gap: 8, paddingBottom: 24 },
  chat: { flex: 1, gap: 8 },
  person: { flexDirection: "row", alignItems: "center", gap: 8 },
  personName: { color: colors.ink, fontSize: 16, fontWeight: "600" },
  badge: { color: colors.clay, fontSize: 13 },
  thread: { gap: 8, paddingVertical: 8 },
  bubble: { alignSelf: "flex-start", maxWidth: "80%", backgroundColor: "#243029", borderRadius: 16, paddingHorizontal: 12, paddingVertical: 8 },
  mine: { alignSelf: "flex-end", backgroundColor: "#3c4a34" },
  body: { color: colors.ink, fontSize: 16 },
  meta: { color: "#8f9a8c", fontSize: 12, marginTop: 2 },
  composer: { flexDirection: "row", alignItems: "center", gap: 8 },
  input: { flex: 1, minHeight: 48, color: colors.ink, backgroundColor: colors.field, borderRadius: 22, paddingHorizontal: 14 },
  send: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.brass, alignItems: "center", justifyContent: "center" },
  number: { color: colors.brass, fontSize: 20, letterSpacing: 1, lineHeight: 28 },
  qr: { alignSelf: "flex-start", backgroundColor: "#f4f0e6", padding: 6 },
  qrRow: { flexDirection: "row" },
  cell: { width: 5, height: 5, backgroundColor: "#f4f0e6" },
  cellOn: { backgroundColor: "#141a16" }
});
