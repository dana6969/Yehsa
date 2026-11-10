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
import { savePeerSecret } from "./mesh_keys.js";
import { Action, Quiet, ScreenHeader, colors } from "./ui.js";

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
  const [me] = useState(() => generateIdentity());
  const [view, setView] = useState("pair");
  const [practice] = useState(() => generateIdentity());
  const [trusted, setTrusted] = useState(false);
  const [typedNumber, setTypedNumber] = useState("");
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState([]);
  const [nearby, setNearby] = useState(false);
  const [vanish, setVanish] = useState(false);
  const [sosPlace, setSosPlace] = useState(false);
  const [storeNote, setStoreNote] = useState("");
  useEffect(() => {
    savePeerSecret(me).then((result) => {
      if (!result?.ok && result?.reason) setStoreNote(result.reason);
    }).catch(() => setStoreNote("The private key was not saved."));
  }, [me]);
  const number = safetyNumber(me.boxPublic, practice.boxPublic);
  const cells = useMemo(() => qrCells(qrPayload(me)), [me]);
  const visible = sweepExpired(messages, Date.now());

  function send(text, { sos = false } = {}) {
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
    <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
      <ScreenHeader title="People" lead="End-to-end encrypted. A relay cannot read it." />
      <Quiet>{PEER_CHAT_PLAIN}</Quiet>
      {storeNote ? <Quiet>{storeNote}</Quiet> : null}
      <View style={styles.row}>
        <Action label="Contacts" tone={view === "list" ? "brass" : "quiet"} onPress={() => setView("list")} />
        <Action label="Pair" tone={view === "pair" ? "brass" : "quiet"} onPress={() => setView("pair")} />
        <Action label="Chat" tone={view === "chat" ? "brass" : "quiet"} onPress={() => setView("chat")} />
      </View>

      {view === "pair" ? (
        <View style={styles.card}>
          <Text style={styles.title}>Pair this phone</Text>
          <Quiet>Compare this safety number, or let the other phone scan the code. The private key stays on this phone.</Quiet>
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
        </View>
      ) : null}

      {view === "list" ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Practice contact" onPress={() => setView("chat")} style={styles.card}>
          <View style={styles.row}>
            <Ionicons name="lock-closed" size={18} color={colors.brass} />
            <Text style={styles.title}>Practice contact</Text>
            <Text style={styles.badge}>{trusted ? "Trusted" : "Unverified"}</Text>
          </View>
          <Quiet>Not another phone. Nearby channel is less private.</Quiet>
        </Pressable>
      ) : null}

      {view === "chat" ? (
        <View style={styles.card}>
          <View style={styles.row}>
            <Ionicons name="lock-closed" size={18} color={colors.brass} />
            <Text style={styles.title}>Practice contact</Text>
            <Text style={styles.badge}>{trusted ? "Trusted" : "Unverified"}</Text>
          </View>
          {visible.map((message) => (
            <View key={message.id} style={styles.bubble}>
              <Text style={styles.body}>{message.text}</Text>
              <Quiet>{`${message.status}${message.nearby ? " · Nearby, less private" : ""}${message.location ? " · location included" : ""}`}</Quiet>
            </View>
          ))}
          <TextInput accessibilityLabel="Peer message" value={draft} onChangeText={setDraft} placeholder="Message" placeholderTextColor="#8f9a8c" style={styles.input} />
          <View style={styles.row}>
            <Action label="Send" onPress={() => draft && send(draft)} />
            <Action label={nearby ? "Nearby on" : "Nearby off"} tone="quiet" onPress={() => setNearby((value) => !value)} />
            <Action label={vanish ? "Disappearing" : "Keep"} tone="quiet" onPress={() => setVanish((value) => !value)} />
          </View>
          <Action label={sosPlace ? "SOS with location" : "SOS without location"} tone="quiet" onPress={() => setSosPlace((value) => !value)} />
          <Action label="Send SOS" tone="clay" onPress={() => send("SOS", { sos: true })} />
          <Action label="Delete chat" tone="clay" onPress={() => setMessages((current) => deleteChat(current, "practice"))} />
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingTop: 22, paddingHorizontal: 22, paddingBottom: 180, gap: 10 },
  card: { backgroundColor: colors.surface, borderRadius: 16, padding: 12, gap: 8 },
  title: { color: colors.ink, fontSize: 18, fontWeight: "600" },
  number: { color: colors.brass, fontSize: 20, letterSpacing: 1, lineHeight: 28 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8, alignItems: "center" },
  badge: { color: colors.clay, fontSize: 13 },
  input: { minHeight: 48, color: colors.ink, backgroundColor: colors.field, borderRadius: 12, paddingHorizontal: 12 },
  bubble: { backgroundColor: "#243029", borderRadius: 12, padding: 10 },
  body: { color: colors.ink, fontSize: 16 },
  qr: { alignSelf: "flex-start", backgroundColor: "#f4f0e6", padding: 6 },
  qrRow: { flexDirection: "row" },
  cell: { width: 5, height: 5, backgroundColor: "#f4f0e6" },
  cellOn: { backgroundColor: "#141a16" }
});
