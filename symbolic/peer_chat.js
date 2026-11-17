// Peer chat envelopes. NaCl box: X25519 and XSalsa20-Poly1305, plus an Ed25519 signature.
// This does not claim the radio link is encrypted, and it does not replace a held mesh link.
// A relay that does not hold the recipient key cannot read the message.

import nacl from "tweetnacl";
import { ensureSecurePrng } from "./secure_prng.js";

const BLE_CHUNK = 160;

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

function utf8(text) {
  return new TextEncoder().encode(text);
}

function textOf(bytes) {
  return new TextDecoder().decode(bytes);
}

export function generateIdentity() {
  ensureSecurePrng();
  const box = nacl.box.keyPair();
  const sign = nacl.sign.keyPair();
  return {
    boxPublic: encode(box.publicKey),
    boxSecret: encode(box.secretKey),
    signPublic: encode(sign.publicKey),
    signSecret: encode(sign.secretKey)
  };
}

export function publicCard(identity) {
  return {
    boxPublic: identity.boxPublic,
    signPublic: identity.signPublic
  };
}

export function keyFingerprint(boxPublic) {
  return safetyNumber(boxPublic, boxPublic);
}

export function safetyNumber(first, second) {
  const a = decode(first);
  const b = decode(second);
  const ordered = compare(a, b) <= 0 ? concat(a, b) : concat(b, a);
  const hash = nacl.hash(ordered);
  const groups = [];
  for (let i = 0; i < 8; i += 1) {
    const value = (hash[i * 2] << 8) + hash[i * 2 + 1];
    groups.push(String(value % 10000).padStart(4, "0"));
  }
  return groups.join(" ");
}

function compare(a, b) {
  const length = Math.min(a.length, b.length);
  for (let i = 0; i < length; i += 1) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return a.length - b.length;
}

function concat(a, b) {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

function envelopeId() {
  return encode(nacl.randomBytes(12)).replace(/=+$/g, "");
}

function finishOpen(opened) {
  try {
    const body = JSON.parse(textOf(opened));
    return { ok: true, text: body.text, location: body.location || null, nearby: body.nearby === true };
  } catch {
    return { ok: false, reason: "The message could not be read." };
  }
}

export function sealDirect(from, to, text, options = {}) {
  const nonce = nacl.randomBytes(nacl.box.nonceLength);
  const body = { text: String(text || ""), nearby: options.nearby === true };
  if (options.includeLocation === true && options.fix) {
    body.location = { latitude: options.fix.latitude, longitude: options.fix.longitude };
  }
  const boxed = nacl.box(utf8(JSON.stringify(body)), nonce, decode(to.boxPublic), decode(from.boxSecret));
  const signed = nacl.sign.detached(boxed, decode(from.signSecret));
  return {
    v: 1,
    id: envelopeId(),
    from: from.signPublic,
    senderBox: from.boxPublic,
    to: to.boxPublic,
    nonce: encode(nonce),
    box: encode(boxed),
    sig: encode(signed),
    nearby: options.nearby === true,
    expireAt: options.expireAt || null
  };
}

export function openDirect(recipient, envelope) {
  if (!envelope?.box || !envelope.sig || !envelope.senderBox) return { ok: false, reason: "The message could not be read." };
  const boxed = decode(envelope.box);
  const verified = nacl.sign.detached.verify(boxed, decode(envelope.sig), decode(envelope.from));
  if (!verified) return { ok: false, reason: "The signature does not match. Nothing was shown." };
  const opened = nacl.box.open(boxed, decode(envelope.nonce), decode(envelope.senderBox), decode(recipient.boxSecret));
  if (!opened) return { ok: false, reason: "The message could not be opened." };
  return finishOpen(opened);
}

export function relayEnvelope(envelope) {
  return {
    v: envelope.v,
    id: envelope.id,
    from: envelope.from,
    senderBox: envelope.senderBox,
    to: envelope.to,
    nonce: envelope.nonce,
    box: envelope.box,
    sig: envelope.sig,
    nearby: envelope.nearby === true,
    expireAt: envelope.expireAt || null
  };
}

export function acceptOnce(seen, envelope) {
  const id = envelope?.id;
  if (!id) return { ok: false, seen, reason: "The message has no id." };
  if (seen?.has?.(id)) return { ok: false, seen, reason: "That message was already seen." };
  const next = new Set(seen || []);
  next.add(id);
  return { ok: true, seen: next, reason: null };
}

export function chunkEnvelope(envelope, size = BLE_CHUNK) {
  const raw = JSON.stringify(relayEnvelope(envelope));
  const parts = [];
  const count = Math.ceil(raw.length / size) || 1;
  for (let index = 0; index < count; index += 1) {
    parts.push({ id: envelope.id, index, count, data: raw.slice(index * size, (index + 1) * size) });
  }
  return parts;
}

export function reassembleChunks(parts) {
  const ordered = [...parts].sort((a, b) => a.index - b.index);
  if (!ordered.length || ordered.length !== ordered[0].count) return null;
  if (ordered.some((part, index) => part.index !== index || part.id !== ordered[0].id)) return null;
  return JSON.parse(ordered.map((part) => part.data).join(""));
}

export function meshChunkText(part) {
  return `yehsa-peer ${part.id} ${part.index} ${part.count} ${part.data}`;
}

export function sealAtRest(records, storageKey) {
  const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
  const boxed = nacl.secretbox(utf8(JSON.stringify(records)), nonce, storageKey);
  return { nonce: encode(nonce), box: encode(boxed) };
}

export function openAtRest(sealed, storageKey) {
  const opened = nacl.secretbox.open(decode(sealed.box), decode(sealed.nonce), storageKey);
  if (!opened) return null;
  return JSON.parse(textOf(opened));
}

export function storageKeyFrom(identity) {
  return nacl.hash(decode(identity.boxSecret)).slice(0, nacl.secretbox.keyLength);
}

export function sweepExpired(messages, now) {
  return (messages || []).filter((message) => !message.expireAt || message.expireAt > now);
}

export function deleteChat(messages, peerId) {
  return (messages || []).filter((message) => message.peerId !== peerId);
}

export function qrPayload(identity) {
  return JSON.stringify(publicCard(identity));
}

export const PEER_CHAT_PLAIN = "End-to-end encrypted with NaCl box (X25519 and XSalsa20-Poly1305) and an Ed25519 signature. A relay cannot read it. This is not a claim that the radio link itself is encrypted, and it is not unbreakable.";
