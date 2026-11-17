// Seals private hunt data (sightings, family card, party list) before it is written to disk.
// XSalsa20-Poly1305 with a random 32-byte key that lives in the phone's secure store, never
// next to the data. Without the key the stored text is not readable. Pure functions.

import nacl from "tweetnacl";
import { sealAtRest, openAtRest } from "../peer_chat.js";
import { ensureSecurePrng } from "../secure_prng.js";

export function newKey() {
  ensureSecurePrng();
  return nacl.randomBytes(nacl.secretbox.keyLength);
}

export function keyToText(key) {
  if (typeof Buffer !== "undefined") return Buffer.from(key).toString("base64");
  let raw = "";
  for (const value of key) raw += String.fromCharCode(value);
  return btoa(raw);
}

export function keyFromText(text) {
  let bytes;
  try {
    if (typeof Buffer !== "undefined") bytes = new Uint8Array(Buffer.from(String(text || ""), "base64"));
    else {
      const raw = atob(String(text || ""));
      bytes = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
    }
  } catch {
    return null;
  }
  return bytes.length === nacl.secretbox.keyLength ? bytes : null;
}

export function seal(value, key) {
  return sealAtRest(value, key);
}

export function open(sealed, key) {
  try {
    return sealed ? openAtRest(sealed, key) : null;
  } catch {
    return null;
  }
}
