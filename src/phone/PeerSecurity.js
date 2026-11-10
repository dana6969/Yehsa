import React, { useEffect, useState } from "react";
import { Platform, Share, Switch, Text, TextInput, View } from "react-native";
import { keyFingerprint } from "../../symbolic/peer_chat.js";
import {
  exportPeerBackup,
  importPeerBackup,
  loadOrCreateIdentity,
  readChatUnlock,
  resetPeerIdentity,
  setChatUnlock
} from "./mesh_keys.js";
import { Action, Quiet, colors } from "./ui.js";

export default function PeerSecurity() {
  const [fingerprint, setFingerprint] = useState("");
  const [demo, setDemo] = useState(false);
  const [auth, setAuth] = useState(false);
  const [resetOffer, setResetOffer] = useState(false);
  const [exportOffer, setExportOffer] = useState(false);
  const [importOffer, setImportOffer] = useState(false);
  const [passphrase, setPassphrase] = useState("");
  const [backupText, setBackupText] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    loadOrCreateIdentity().then((result) => {
      setFingerprint(keyFingerprint(result.identity.boxPublic));
      setDemo(result.demo === true);
    }).catch(() => setNote("The key could not be read."));
    readChatUnlock().then(setAuth).catch(() => {});
  }, []);

  async function toggleAuth(value) {
    const result = await setChatUnlock(value);
    if (result?.demo) {
      setNote(result.reason);
      return;
    }
    setAuth(value === true);
  }

  return (
    <View style={{ gap: 8 }}>
      <Text style={{ color: colors.ink, fontSize: 18, fontWeight: "600" }}>Chat keys</Text>
      <Quiet>Keys stay on this phone. A lost phone is a new identity.</Quiet>
      {demo ? <Quiet>This web preview is a demo identity only.</Quiet> : null}
      <Text accessibilityLabel="Your key fingerprint" style={{ color: colors.brass, letterSpacing: 1 }}>{fingerprint}</Text>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Text style={{ color: colors.ink }}>Unlock chat with PIN or biometrics</Text>
        <Switch accessibilityLabel="Unlock chat with PIN or biometrics" value={auth} onValueChange={toggleAuth} />
      </View>
      <Action label="Export backup" tone="quiet" onPress={() => { setExportOffer(true); setImportOffer(false); setResetOffer(false); }} />
      <Action label="Import backup" tone="quiet" onPress={() => { setImportOffer(true); setExportOffer(false); setResetOffer(false); }} />
      <Action label="Reset identity" tone="clay" onPress={() => { setResetOffer(true); setExportOffer(false); setImportOffer(false); }} />
      {resetOffer ? (
        <View style={{ gap: 8 }}>
          <Quiet>This deletes your keys and chat history. Contacts must re-verify you.</Quiet>
          <Action label="Approve reset" onPress={async () => {
            const result = await resetPeerIdentity({ approved: true });
            setResetOffer(false);
            setNote(result.warning || result.reason);
            const next = await loadOrCreateIdentity();
            setFingerprint(keyFingerprint(next.identity.boxPublic));
          }} />
          <Action label="Decline" tone="clay" onPress={() => setResetOffer(false)} />
        </View>
      ) : null}
      {exportOffer ? (
        <View style={{ gap: 8 }}>
          <TextInput accessibilityLabel="Backup passphrase" value={passphrase} onChangeText={setPassphrase} placeholder="Passphrase" placeholderTextColor="#8f9a8c" secureTextEntry style={field} />
          <Action label="Approve export" onPress={async () => {
            const result = await exportPeerBackup(passphrase);
            if (!result?.ok) {
              setNote(result?.reason || "Nothing was exported.");
              return;
            }
            const text = JSON.stringify(result.file);
            if (Platform.OS === "web" && typeof document !== "undefined") {
              const link = document.createElement("a");
              link.href = URL.createObjectURL(new Blob([text], { type: "application/json" }));
              link.download = "yehsa-peer-backup.json";
              link.click();
            } else {
              await Share.share({ message: text });
            }
            setExportOffer(false);
            setPassphrase("");
            setNote("The backup was handed to you. Yehsa did not upload it.");
          }} />
          <Action label="Decline" tone="clay" onPress={() => setExportOffer(false)} />
        </View>
      ) : null}
      {importOffer ? (
        <View style={{ gap: 8 }}>
          <TextInput accessibilityLabel="Backup file" value={backupText} onChangeText={setBackupText} placeholder="Paste the backup" placeholderTextColor="#8f9a8c" style={field} />
          <TextInput accessibilityLabel="Import passphrase" value={passphrase} onChangeText={setPassphrase} placeholder="Passphrase" placeholderTextColor="#8f9a8c" secureTextEntry style={field} />
          <Action label="Approve import" onPress={async () => {
            let file;
            try { file = JSON.parse(backupText); } catch { setNote("That file is not a Yehsa key backup."); return; }
            const result = await importPeerBackup(file, passphrase, { approved: true });
            setNote(result.warning || result.reason);
            if (result.ok) {
              setFingerprint(keyFingerprint(result.identity.boxPublic));
              setImportOffer(false);
              setBackupText("");
              setPassphrase("");
            }
          }} />
          <Action label="Decline" tone="clay" onPress={() => setImportOffer(false)} />
        </View>
      ) : null}
      {note ? <Quiet>{note}</Quiet> : null}
    </View>
  );
}

const field = { minHeight: 48, color: "#f4f0e6", backgroundColor: "#0e1411", borderRadius: 12, paddingHorizontal: 12 };
