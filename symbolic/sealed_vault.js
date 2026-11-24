// A small encrypted store for one JSON value. The key is a random 32-byte secret kept in the
// platform secure store (Android Keystore through expo-secure-store). The ciphertext sits in
// ordinary app storage. Copy the app data to another phone and the key does not come with it,
// so the value cannot be opened there. Used by the learned-from-the-web notes and the online channel.

import nacl from "tweetnacl";
import { b64, fromUtf8, unb64, utf8 } from "./online/codec.js";

export const SEALED_VERSION = 1;

export function secretValue(entry) {
  if (entry == null) return null;
  return typeof entry === "string" ? entry : entry.value;
}

export function sealJson(value, key) {
  const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
  const boxed = nacl.secretbox(utf8(JSON.stringify(value)), nonce, key);
  return { v: SEALED_VERSION, nonce: b64(nonce), box: b64(boxed) };
}

export function openJson(sealed, key) {
  try {
    if (!sealed || sealed.v !== SEALED_VERSION) return null;
    const opened = nacl.secretbox.open(unb64(sealed.box), unb64(sealed.nonce), key);
    if (!opened) return null;
    return JSON.parse(fromUtf8(opened));
  } catch {
    return null;
  }
}

/**
 * adapter: { getSecret(name), setSecret(name, value, options), deleteSecret(name), getData(name), setData(name, value), deleteData(name) }
 * open() returns { status: "empty" | "ok" | "foreign", value }.
 * "foreign" means there is ciphertext here but this phone cannot open it (copied data, lost key, or tampering).
 * Nothing is overwritten until the caller approves with clear().
 */
export function createSealedVault(adapter, { keyName, dataName, options = {} }) {
  async function readKey() {
    const raw = secretValue(await adapter.getSecret(keyName));
    return raw ? unb64(raw) : null;
  }
  return {
    async open() {
      let key;
      try {
        key = await readKey();
      } catch (err) {
        if (err?.code === "unwrap-failed") return { status: "foreign", value: null };
        throw err;
      }
      const sealed = await adapter.getData(dataName);
      if (!sealed) return { status: "empty", value: null };
      if (!key) return { status: "foreign", value: null };
      const value = openJson(sealed, key);
      if (value == null) return { status: "foreign", value: null };
      return { status: "ok", value };
    },
    async save(value) {
      let key = await readKey();
      if (!key) {
        key = nacl.randomBytes(nacl.secretbox.keyLength);
        await adapter.setSecret(keyName, b64(key), options);
      }
      const sealed = sealJson(value, key);
      await adapter.setData(dataName, sealed);
      return sealed;
    },
    async clear() {
      await adapter.deleteData(dataName);
      await adapter.deleteSecret(keyName);
    }
  };
}
