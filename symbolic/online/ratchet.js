// Double ratchet, kept small. Used for Yehsa-to-Yehsa messages that cross a relay.
//
//   X25519 (tweetnacl) for the DH steps and for the static identity DH.
//   HKDF-SHA256 and HMAC-SHA256 (@noble/hashes) for the key schedule.
//   ChaCha20-Poly1305 (@noble/ciphers, RFC 8439) for each message, with the header authenticated.
//
// Start-up is a Noise IK style first flight, not X3DH with prekeys: the initiator mixes
// DH(identity, identity) with a fresh ephemeral against the recipient's static key. The recipient's
// static key is used as the first ratchet key. Until the recipient answers once, the first flight
// is not forward secret against a later theft of that static key. After the first answer both sides
// hold fresh keys and each reply moves the ratchet on. See docs/SECURITY_ONLINE.md.
//
// A message key is used once and then dropped. A message that arrives twice, or that is forged,
// is refused and leaves the state untouched.

import nacl from "tweetnacl";
import { hkdf } from "@noble/hashes/hkdf";
import { hmac } from "@noble/hashes/hmac";
import { sha256 } from "@noble/hashes/sha2";
import { chacha20poly1305 } from "@noble/ciphers/chacha";
import { b64, concat, readU32, sameBytes, u32, unb64, utf8, wipe } from "./codec.js";

export const VERSION = 1;
export const FLAG_INIT = 1;
export const HEADER_BYTES = 42;
export const MAX_SKIP = 100;
export const MAX_SKIPPED_KEPT = 256;
export const BUCKETS = [256, 512, 1024, 2048, 4096];
export const MAX_BODY_BYTES = BUCKETS[BUCKETS.length - 1] - 2;

const ZERO32 = new Uint8Array(32);
const INFO_INIT = utf8("yehsa-online-init-v1");
const INFO_RK = utf8("yehsa-online-rk-v1");
const INFO_MK = utf8("yehsa-online-mk-v1");
const AD_DOMAIN = utf8("yehsa-online-ad-v1");

function dh(secret, pub) {
  const out = nacl.scalarMult(secret, pub);
  if (sameBytes(out, ZERO32)) throw new Error("bad public key");
  return out;
}

function orderedPair(a, b) {
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return a[i] < b[i] ? concat(a, b) : concat(b, a);
  }
  return concat(a, b);
}

export function kdfRoot(rk, dhOut) {
  const out = hkdf(sha256, dhOut, rk, INFO_RK, 64);
  return { rk: out.slice(0, 32), ck: out.slice(32, 64) };
}

export function kdfChain(ck) {
  return {
    mk: hmac(sha256, ck, Uint8Array.of(1)),
    ck: hmac(sha256, ck, Uint8Array.of(2))
  };
}

export function messageKeys(mk) {
  const out = hkdf(sha256, mk, undefined, INFO_MK, 44);
  return { key: out.slice(0, 32), nonce: out.slice(32, 44) };
}

export function pad(body) {
  const raw = body instanceof Uint8Array ? body : utf8(String(body));
  if (raw.length > MAX_BODY_BYTES) throw new Error("message too long");
  const size = BUCKETS.find((bucket) => bucket >= raw.length + 2);
  const out = new Uint8Array(size);
  out[0] = (raw.length >>> 8) & 255;
  out[1] = raw.length & 255;
  out.set(raw, 2);
  return out;
}

export function unpad(framed) {
  if (!BUCKETS.includes(framed.length)) throw new Error("bad padding");
  const length = (framed[0] << 8) | framed[1];
  if (length + 2 > framed.length) throw new Error("bad padding");
  for (let i = length + 2; i < framed.length; i += 1) if (framed[i] !== 0) throw new Error("bad padding");
  return framed.slice(2, 2 + length);
}

function pairOf(me) {
  return { pk: unb64(me.boxPublic), sk: unb64(me.boxSecret) };
}

function startRoot(me, peer) {
  const mine = pairOf(me);
  const theirs = unb64(peer.boxPublic);
  const shared = dh(mine.sk, theirs);
  return hkdf(sha256, shared, ZERO32, concat(INFO_INIT, orderedPair(mine.pk, theirs)), 32);
}

function freshState(me, peer) {
  return {
    v: VERSION,
    me: me.boxPublic,
    peer: peer.boxPublic,
    rk: null,
    dhs: null,
    dhr: null,
    cks: null,
    ckr: null,
    ns: 0,
    nr: 0,
    pn: 0,
    heard: false,
    skipped: {},
    order: []
  };
}

/** We send first. Needs the other person's key from pairing. */
export function initiate(me, peer) {
  const state = freshState(me, peer);
  const rk0 = startRoot(me, peer);
  const ek = nacl.box.keyPair();
  const theirs = unb64(peer.boxPublic);
  const step = kdfRoot(rk0, dh(ek.secretKey, theirs));
  state.rk = b64(step.rk);
  state.dhs = { pk: b64(ek.publicKey), sk: b64(ek.secretKey) };
  state.dhr = peer.boxPublic;
  state.cks = b64(step.ck);
  return state;
}

/** They send first. We hold our static key as the first ratchet key and wait for their first packet. */
export function respond(me, peer) {
  const state = freshState(me, peer);
  state.rk = b64(startRoot(me, peer));
  state.dhs = { pk: me.boxPublic, sk: me.boxSecret };
  return state;
}

export function canSend(state) {
  return Boolean(state?.cks);
}

function copy(state) {
  return JSON.parse(JSON.stringify(state));
}

function header(flags, dhPublic, pn, n) {
  return concat(Uint8Array.of(VERSION, flags), dhPublic, u32(pn), u32(n));
}

function adFor(senderBox, receiverBox, headerBytes) {
  return concat(AD_DOMAIN, unb64(senderBox), unb64(receiverBox), headerBytes);
}

export function parsePacket(packet) {
  if (!(packet instanceof Uint8Array) || packet.length < HEADER_BYTES + 16 + BUCKETS[0]) return null;
  if (packet[0] !== VERSION) return null;
  const flags = packet[1];
  if ((flags & ~FLAG_INIT) !== 0) return null;
  const headerBytes = packet.slice(0, HEADER_BYTES);
  const body = packet.slice(HEADER_BYTES);
  if (!BUCKETS.includes(body.length - 16)) return null;
  return {
    flags,
    init: (flags & FLAG_INIT) !== 0,
    dh: packet.slice(2, 34),
    pn: readU32(packet, 34),
    n: readU32(packet, 38),
    headerBytes,
    body
  };
}

/** Returns { state, packet }. The input state is not changed. Save the returned state before sending. */
export function encrypt(state, body) {
  if (!canSend(state)) throw new Error("This session cannot send until the other side has written first.");
  const next = copy(state);
  const framed = pad(body);
  const step = kdfChain(unb64(next.cks));
  next.cks = b64(step.ck);
  const head = header(next.heard ? 0 : FLAG_INIT, unb64(next.dhs.pk), next.pn, next.ns);
  next.ns += 1;
  const { key, nonce } = messageKeys(step.mk);
  const sealed = chacha20poly1305(key, nonce, adFor(next.me, next.peer, head)).encrypt(framed);
  wipe(step.mk);
  wipe(key);
  return { state: next, packet: concat(head, sealed) };
}

function remember(next, id, mk) {
  next.skipped[id] = b64(mk);
  next.order.push(id);
  while (next.order.length > MAX_SKIPPED_KEPT) {
    const old = next.order.shift();
    delete next.skipped[old];
  }
}

function skipTo(next, until) {
  if (!next.ckr) return;
  if (until - next.nr > MAX_SKIP) throw new Error("too many skipped messages");
  let ck = unb64(next.ckr);
  while (next.nr < until) {
    const step = kdfChain(ck);
    ck = step.ck;
    remember(next, `${next.dhr}:${next.nr}`, step.mk);
    next.nr += 1;
  }
  next.ckr = b64(ck);
}

function ratchetStep(next, theirDh) {
  next.pn = next.ns;
  next.ns = 0;
  next.nr = 0;
  next.dhr = b64(theirDh);
  const received = kdfRoot(unb64(next.rk), dh(unb64(next.dhs.sk), theirDh));
  next.ckr = b64(received.ck);
  const pair = nacl.box.keyPair();
  next.dhs = { pk: b64(pair.publicKey), sk: b64(pair.secretKey) };
  const sent = kdfRoot(received.rk, dh(pair.secretKey, theirDh));
  next.rk = b64(sent.rk);
  next.cks = b64(sent.ck);
}

function open(next, parsed, mk) {
  const { key, nonce } = messageKeys(mk);
  try {
    const framed = chacha20poly1305(key, nonce, adFor(next.peer, next.me, parsed.headerBytes)).decrypt(parsed.body);
    return unpad(framed);
  } catch {
    return null;
  } finally {
    wipe(key);
  }
}

/**
 * Returns { ok: true, state, body } or { ok: false, reason }. A failed packet changes nothing.
 * reason is one of: malformed, replay, too-far-ahead, bad-tag.
 */
export function decrypt(state, packet) {
  const parsed = parsePacket(packet);
  if (!parsed) return { ok: false, reason: "malformed" };
  const next = copy(state);
  const dhB64 = b64(parsed.dh);
  const slot = `${dhB64}:${parsed.n}`;
  try {
    if (Object.prototype.hasOwnProperty.call(next.skipped, slot)) {
      const body = open(next, parsed, unb64(next.skipped[slot]));
      if (!body) return { ok: false, reason: "bad-tag" };
      delete next.skipped[slot];
      next.order = next.order.filter((id) => id !== slot);
      return { ok: true, state: next, body };
    }
    if (next.dhr === dhB64 && parsed.n < next.nr) return { ok: false, reason: "replay" };
    if (next.dhr !== dhB64) {
      if (next.dhr === null && !parsed.init && !next.cks) return { ok: false, reason: "malformed" };
      skipTo(next, parsed.pn);
      ratchetStep(next, parsed.dh);
    }
    skipTo(next, parsed.n);
    const step = kdfChain(unb64(next.ckr));
    const body = open(next, parsed, step.mk);
    wipe(step.mk);
    if (!body) return { ok: false, reason: "bad-tag" };
    next.ckr = b64(step.ck);
    next.nr += 1;
    next.heard = true;
    return { ok: true, state: next, body };
  } catch (err) {
    return { ok: false, reason: /skipped/.test(err?.message || "") ? "too-far-ahead" : "malformed" };
  }
}
