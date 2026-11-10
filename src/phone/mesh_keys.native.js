// Private keys live in expo-secure-store. On Android that is an Android Keystore AES key.
// WHEN_UNLOCKED_THIS_DEVICE_ONLY is the iOS accessibility. The same options object is passed
// on Android. requireAuthentication maps to setUserAuthenticationRequired when the toggle is on.
// The chat history key is a separate SecureStore item. The ciphertext is not a secret slot.

import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { CLONE_MESSAGE, createPeerVault, secureStoreOptions } from "../../symbolic/peer_vault.js";

const NAMES = {
  identity: "yehsa.peer.secret.v1",
  historyKey: "yehsa.peer.history.key.v1",
  authFlag: "yehsa.peer.auth.flag.v1"
};

function nativeOptions(options) {
  return {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    requireAuthentication: options?.requireAuthentication === true,
    keychainService: options?.keychainService || "yehsa.peer",
    authenticationPrompt: options?.authenticationPrompt || "Unlock Yehsa chat"
  };
}

const adapter = {
  async getSecret(name) {
    const flag = name === "authFlag" ? false : (await SecureStore.getItemAsync(NAMES.authFlag, nativeOptions(secureStoreOptions(false)))) === "1";
    const options = nativeOptions(secureStoreOptions(name === "authFlag" ? false : flag));
    return SecureStore.getItemAsync(NAMES[name], options);
  },
  async setSecret(name, value, options) {
    await SecureStore.setItemAsync(NAMES[name], value, nativeOptions(options));
  },
  async deleteSecret(name) {
    const flag = (await SecureStore.getItemAsync(NAMES.authFlag, nativeOptions(secureStoreOptions(false)))) === "1";
    await SecureStore.deleteItemAsync(NAMES[name], nativeOptions(secureStoreOptions(name === "authFlag" ? false : flag)));
  },
  async getData(name) {
    const raw = await AsyncStorage.getItem(`yehsa.peer.data.${name}`);
    return raw ? JSON.parse(raw) : null;
  },
  async setData(name, value) {
    await AsyncStorage.setItem(`yehsa.peer.data.${name}`, JSON.stringify(value));
  },
  async deleteData(name) {
    await AsyncStorage.removeItem(`yehsa.peer.data.${name}`);
  }
};

const vault = createPeerVault(adapter);
let session = null;

export function peerVault() {
  return vault;
}

export async function loadOrCreateIdentity() {
  if (!session) session = vault.openSession();
  const loaded = await session;
  if (loaded.foreign) {
    return { foreign: true, identity: null, persisted: false, demo: false, created: false, message: loaded.message || CLONE_MESSAGE };
  }
  return { identity: loaded.identity, foreign: false, persisted: true, demo: false, created: loaded.created, message: null };
}

export async function approveFreshIdentity() {
  const result = await vault.replaceForeign({ approved: true });
  if (result.ok) session = Promise.resolve({ identity: result.identity, foreign: false, created: true });
  return result;
}

export async function savePeerSecret(identity) {
  await vault.saveIdentity(identity);
  session = Promise.resolve({ identity, created: false });
  return { ok: true };
}

export async function readPeerSecret() {
  const identity = await vault.loadIdentity();
  return identity ? JSON.stringify(identity) : null;
}

export async function readChatUnlock() {
  return vault.deviceAuth();
}

export async function setChatUnlock(requireAuthentication) {
  session = null;
  return vault.setDeviceAuth(requireAuthentication === true);
}

export async function resetPeerIdentity({ approved } = {}) {
  const result = await vault.reset({ approved });
  if (result.ok) session = null;
  return result;
}

export async function savePeerHistory(record) {
  return vault.saveHistory(record);
}

export async function loadPeerHistory() {
  return vault.loadHistory();
}

export async function exportPeerBackup(passphrase) {
  const identity = await vault.loadIdentity();
  if (!identity) return { ok: false, reason: "No key is stored yet." };
  return vault.exportBackup(identity, passphrase);
}

export async function importPeerBackup(file, passphrase, { approved } = {}) {
  const opened = vault.importBackup(file, passphrase, { approved });
  if (!opened.ok) return opened;
  await vault.adoptImported(opened.identity);
  session = Promise.resolve({ identity: opened.identity, created: false });
  return opened;
}
