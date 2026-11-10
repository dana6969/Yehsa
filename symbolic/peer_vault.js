// Peer identity and chat history. Secrets stay in the adapter's secret slot.
// The history blob is ciphertext. The key that opens it is itself a secret.

import nacl from "tweetnacl";
import { scrypt } from "@noble/hashes/scrypt";
import {
  generateIdentity,
  keyFingerprint,
  openAtRest,
  publicCard,
  sealAtRest
} from "./peer_chat.js";

export const KEY_ACCESS = "WHEN_UNLOCKED_THIS_DEVICE_ONLY";
export const SCRYPT_PARAMS = { N: 32768, r: 8, p: 1, dkLen: 32 };
export const KEY_CHANGE_WARNING = "Safety number changed. Re-verify this person before you trust the new key.";
export const RESET_WARNING = "Your keys and chat history are gone. Contacts must re-verify you.";

const IDENTITY = "identity";
const HISTORY_KEY = "historyKey";
const HISTORY = "history";
const AUTH = "authFlag";

export function secureStoreOptions(requireAuthentication) {
  return {
    keychainAccessible: KEY_ACCESS,
    requireAuthentication: requireAuthentication === true,
    keychainService: requireAuthentication === true ? "yehsa.peer.auth" : "yehsa.peer",
    authenticationPrompt: "Unlock Yehsa chat"
  };
}

export function memoryAdapter(disk = new Map()) {
  return {
    disk,
    async getSecret(name) {
      return disk.has(`secret:${name}`) ? disk.get(`secret:${name}`) : null;
    },
    async setSecret(name, value, options) {
      disk.set(`secret:${name}`, { value, options });
    },
    async deleteSecret(name) {
      disk.delete(`secret:${name}`);
    },
    async getData(name) {
      return disk.has(`data:${name}`) ? disk.get(`data:${name}`) : null;
    },
    async setData(name, value) {
      disk.set(`data:${name}`, value);
    },
    async deleteData(name) {
      disk.delete(`data:${name}`);
    }
  };
}

function encode(bytes) {
  if (typeof Buffer !== "undefined") return Buffer.from(bytes).toString("base64");
  let raw = "";
  for (const value of bytes) raw += String.fromCharCode(value);
  return btoa(raw);
}

function decode(text) {
  if (typeof Buffer !== "undefined") return new Uint8Array(Buffer.from(text, "base64"));
  const raw = atob(text);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

function secretValue(entry) {
  if (entry == null) return null;
  return typeof entry === "string" ? entry : entry.value;
}

async function authOn(adapter) {
  return secretValue(await adapter.getSecret(AUTH)) === "1";
}

export function createPeerVault(adapter) {
  async function writeIdentity(identity) {
    const options = secureStoreOptions(await authOn(adapter));
    await adapter.setSecret(IDENTITY, JSON.stringify(identity), options);
    return options;
  }

  async function historyKeyBytes() {
    const existing = secretValue(await adapter.getSecret(HISTORY_KEY));
    if (existing) return decode(existing);
    const created = encode(nacl.randomBytes(nacl.secretbox.keyLength));
    await adapter.setSecret(HISTORY_KEY, created, secureStoreOptions(await authOn(adapter)));
    return decode(created);
  }

  return {
    async loadIdentity() {
      const raw = secretValue(await adapter.getSecret(IDENTITY));
      if (!raw) return null;
      return JSON.parse(raw);
    },
    async saveIdentity(identity) {
      return writeIdentity(identity);
    },
    async loadOrCreate() {
      const existing = await this.loadIdentity();
      if (existing?.boxSecret) return { identity: existing, created: false };
      const identity = generateIdentity();
      await writeIdentity(identity);
      return { identity, created: true };
    },
    async deviceAuth() {
      return secretValue(await adapter.getSecret(AUTH)) === "1";
    },
    async setDeviceAuth(requireAuthentication) {
      const identity = await this.loadIdentity();
      await adapter.setSecret(AUTH, requireAuthentication === true ? "1" : "0", secureStoreOptions(false));
      if (identity) await writeIdentity(identity);
      const historyKey = secretValue(await adapter.getSecret(HISTORY_KEY));
      if (historyKey) await adapter.setSecret(HISTORY_KEY, historyKey, secureStoreOptions(requireAuthentication === true));
      return secureStoreOptions(requireAuthentication === true);
    },
    async saveHistory(record) {
      const sealed = sealAtRest(record, await historyKeyBytes());
      await adapter.setData(HISTORY, sealed);
      return sealed;
    },
    async loadHistory() {
      const sealed = await adapter.getData(HISTORY);
      if (!sealed) return null;
      return openAtRest(sealed, await historyKeyBytes());
    },
    async reset({ approved } = {}) {
      if (approved !== true) {
        return { ok: false, reason: "Nothing was deleted. Contacts keep the old key until you approve." };
      }
      await adapter.deleteSecret(IDENTITY);
      await adapter.deleteSecret(HISTORY_KEY);
      await adapter.deleteData(HISTORY);
      return { ok: true, warning: RESET_WARNING };
    },
    exportBackup(identity, passphrase, params = SCRYPT_PARAMS) {
      const phrase = String(passphrase || "");
      if (phrase.length < 8) return { ok: false, reason: "Use a passphrase of at least 8 characters. Nothing was exported." };
      const salt = nacl.randomBytes(16);
      const key = scrypt(phrase, salt, params);
      const sealed = sealAtRest(identity, key);
      return {
        ok: true,
        file: {
          v: 1,
          kdf: "scrypt",
          N: params.N,
          r: params.r,
          p: params.p,
          salt: encode(salt),
          nonce: sealed.nonce,
          box: sealed.box
        }
      };
    },
    importBackup(file, passphrase, { approved } = {}, params) {
      if (approved !== true) return { ok: false, identity: null, reason: "Nothing is imported until you approve." };
      if (!file || file.kdf !== "scrypt" || !file.salt || !file.box) {
        return { ok: false, identity: null, reason: "That file is not a Yehsa key backup." };
      }
      const used = params || { N: file.N, r: file.r, p: file.p, dkLen: 32 };
      let key;
      try {
        key = scrypt(String(passphrase || ""), decode(file.salt), used);
      } catch {
        return { ok: false, identity: null, reason: "That passphrase did not open the backup." };
      }
      const identity = openAtRest({ nonce: file.nonce, box: file.box }, key);
      if (!identity?.boxSecret) return { ok: false, identity: null, reason: "That passphrase did not open the backup." };
      return { ok: true, identity, warning: "Your safety number changed. Contacts must re-verify you." };
    },
    async adoptImported(identity) {
      await adapter.deleteData(HISTORY);
      await adapter.deleteSecret(HISTORY_KEY);
      await writeIdentity(identity);
      return identity;
    }
  };
}

export function notePeerKey(known, peerId, card) {
  const previous = known?.[peerId];
  const next = { ...(known || {}), [peerId]: { boxPublic: card.boxPublic, signPublic: card.signPublic } };
  if (!previous) return { known: next, changed: false, warning: null };
  const same = previous.boxPublic === card.boxPublic && previous.signPublic === card.signPublic;
  if (same) return { known: next, changed: false, warning: null };
  return { known: next, changed: true, warning: KEY_CHANGE_WARNING, fingerprint: keyFingerprint(card.boxPublic) };
}

export function ownFingerprint(identity) {
  return {
    fingerprint: keyFingerprint(identity.boxPublic),
    card: publicCard(identity)
  };
}
