// One identity per phone: the shared key module. Anything that needs "who am I to other Yehsa
// phones" uses this file and nothing else (Hunt party, People pairing, the online channel).
//
// The identity is two NaCl keypairs made on first use: X25519 (box, for encryption) and Ed25519
// (sign). The private halves live only in the phone's secure store (expo-secure-store, backed by the
// Android Keystore). They never go to chat, logs, the network or a file. Public halves are shareable.
//
// API (all async calls resolve, none throws):
//   const keys = createIdentityKeys(vault)            // phone: src/phone/identity.js does this for you
//   await keys.getOrCreateIdentity()
//        -> { state: "ready", identity, created }                    first use makes the keys
//         | { state: "foreign", message, identity: null }            copied app data, cannot open the original keys
//         | { state: "error", reason, message, detail, identity: null }   secure store failed: show a banner and Try again
//   await keys.publicKey()                  -> { boxPublic, signPublic } (base64) or null
//   await keys.safetyNumber(theirKey?)      -> "1234 5678 ..." for you + them (their card or boxPublic);
//                                              no argument gives your own fingerprint
//   await keys.sign(message)                -> { ok, signature, signPublic }   Ed25519 detached, base64
//   verifySignature(message, signature, signPublic) -> boolean      (pure, exported)
//   await keys.seal(theirCard, text, options?)  -> { ok, envelope }   box + signature (peer_chat.sealDirect)
//   await keys.open(envelope)               -> { ok, text, location? } | { ok:false, reason }
//   await keys.replaceIdentity({ approved })   new keys after a copy or a reset; contacts must re-verify
//   keys.explain(result)                    -> { title, body, canRetry } friendly words for a non-ready state
//
// Nothing here uses Math.random. Keys come from the installed CSPRNG (src/phone/install_prng.js).

import nacl from "tweetnacl";
import { keyFingerprint, openDirect, safetyNumber as pairSafetyNumber, sealDirect } from "./peer_chat.js";
import { CLONE_MESSAGE } from "./clone_guard.js";

export const KEY_ERROR_TITLE = "I couldn't open your key.";
export const KEY_ERROR_BODY = "Pairing and sessions are paused until this is fixed.";

function b64encode(bytes) {
  if (typeof Buffer !== "undefined") return Buffer.from(bytes).toString("base64");
  let raw = "";
  for (const value of bytes) raw += String.fromCharCode(value);
  return btoa(raw);
}

function b64decode(text) {
  if (typeof Buffer !== "undefined") return new Uint8Array(Buffer.from(text, "base64"));
  const raw = atob(text);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

function bytesOf(message) {
  if (message instanceof Uint8Array) return message;
  return new TextEncoder().encode(String(message ?? ""));
}

export function verifySignature(message, signature, signPublic) {
  try {
    return nacl.sign.detached.verify(bytesOf(message), b64decode(signature), b64decode(signPublic));
  } catch {
    return false;
  }
}

function classify(err) {
  const text = `${err?.code || ""} ${err?.message || ""}`;
  let reason = "unknown";
  if (/invalid key|keys must not be empty|no secure-store name/i.test(text)) reason = "store-key";
  else if (/decrypt|keystore|unwrap|authenticat|biometric|locked/i.test(text)) reason = "keystore";
  else if (/no csprng|prng|random/i.test(text)) reason = "random";
  else if (/secure.?store|native module|not available/i.test(text)) reason = "store-unavailable";
  // A short code for the screen. Never the key, never a value from the store.
  const detail = `${reason}${err?.code ? `:${String(err.code).slice(0, 40)}` : ""}`;
  return { reason, detail };
}

export function createIdentityKeys(vault) {
  async function getOrCreateIdentity() {
    let last = null;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const loaded = await vault.openSession();
        if (loaded.foreign || !loaded.identity) {
          return { state: "foreign", identity: null, created: false, message: loaded.message || CLONE_MESSAGE };
        }
        return { state: "ready", identity: loaded.identity, created: loaded.created === true, message: null };
      } catch (err) {
        last = err;
      }
    }
    const { reason, detail } = classify(last);
    return { state: "error", reason, detail, identity: null, created: false, message: KEY_ERROR_TITLE };
  }

  async function ready() {
    const got = await getOrCreateIdentity();
    return got.state === "ready" ? got.identity : null;
  }

  return {
    getOrCreateIdentity,
    async publicKey() {
      const identity = await ready();
      return identity ? { boxPublic: identity.boxPublic, signPublic: identity.signPublic } : null;
    },
    async safetyNumber(their) {
      const identity = await ready();
      if (!identity) return null;
      if (!their) return keyFingerprint(identity.boxPublic);
      const theirBox = typeof their === "string" ? their : their.boxPublic;
      if (!theirBox) return null;
      return pairSafetyNumber(identity.boxPublic, theirBox);
    },
    async sign(message) {
      const identity = await ready();
      if (!identity) return { ok: false, reason: KEY_ERROR_TITLE };
      const signature = nacl.sign.detached(bytesOf(message), b64decode(identity.signSecret));
      return { ok: true, signature: b64encode(signature), signPublic: identity.signPublic };
    },
    async seal(their, text, options = {}) {
      const identity = await ready();
      if (!identity) return { ok: false, reason: KEY_ERROR_TITLE };
      if (!their?.boxPublic || !their?.signPublic) return { ok: false, reason: "That contact has no key yet." };
      return { ok: true, envelope: sealDirect(identity, their, text, options) };
    },
    async open(envelope) {
      const identity = await ready();
      if (!identity) return { ok: false, reason: KEY_ERROR_TITLE };
      try {
        return openDirect(identity, envelope);
      } catch {
        return { ok: false, reason: "The message could not be read." };
      }
    },
    async replaceIdentity({ approved } = {}) {
      try {
        const got = await vault.replaceForeign({ approved });
        return got.ok ? { ok: true, identity: got.identity, warning: got.warning } : { ok: false, reason: got.reason };
      } catch (err) {
        return { ok: false, reason: KEY_ERROR_TITLE, detail: classify(err).detail };
      }
    },
    explain(result) {
      if (result?.state === "foreign") return { title: result.message || CLONE_MESSAGE, body: "Chats and keys stay on the original phone. You can start a new key here. Your contacts will have to check you again.", canRetry: false, canReplace: true };
      if (result?.state === "error") return { title: KEY_ERROR_TITLE, body: KEY_ERROR_BODY, canRetry: true, canReplace: false };
      return { title: "", body: "", canRetry: false, canReplace: false };
    }
  };
}
