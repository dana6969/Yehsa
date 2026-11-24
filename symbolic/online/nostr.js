// Minimal Nostr (NIP-01) client for carrying sealed Yehsa packets over public relays.
// A relay only ever sees: a throwaway event key, a rotating tag, a padded blob, and your network address.
// Every event is signed with a new random key, so events cannot be tied to one sender key.
// wss:// only. Nothing here is published unless the person turned Online on and a message is sent.

import { schnorr } from "@noble/curves/secp256k1";
import { sha256 } from "@noble/hashes/sha2";
import { b64, hex, unb64, utf8 } from "./codec.js";

export const KIND = 4219;
export const MAX_CONTENT_CHARS = 12000;
export const EVENT_TTL_SECONDS = 7 * 24 * 60 * 60;
export const JITTER_SECONDS = 120;
export const MAX_RELAYS = 6;

// Public relays. Replaceable in Settings. None of these is operated by Yehsa.
export const DEFAULT_RELAYS = ["wss://relay.damus.io", "wss://nos.lol", "wss://relay.primal.net"];

export function validateRelayUrl(text) {
  let url;
  try {
    url = new URL(String(text || "").trim());
  } catch {
    return { ok: false, reason: "That is not a web address." };
  }
  if (url.protocol !== "wss:") return { ok: false, reason: "Relays must use wss:// so the connection is encrypted." };
  if (url.username || url.password) return { ok: false, reason: "A relay address cannot hold a login." };
  const host = url.hostname.toLowerCase();
  if (!host.includes(".") || host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) {
    return { ok: false, reason: "That is a local address, not a public relay." };
  }
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(":") || host.startsWith("[")) {
    return { ok: false, reason: "Use a relay name, not a numeric address." };
  }
  if (url.port && url.port !== "443") return { ok: false, reason: "Use the standard port." };
  return { ok: true, url: `wss://${host}${url.pathname === "/" ? "" : url.pathname}` };
}

export function serializeForId(event) {
  return JSON.stringify([0, event.pubkey, event.created_at, event.kind, event.tags, event.content]);
}

export function eventId(event) {
  return hex(sha256(utf8(serializeForId(event))));
}

/** One sealed packet as one event. A new random key signs it, so no sender key is reused. */
export function wrapPacket(packet, tag, nowSeconds, random = (n) => crypto.getRandomValues(new Uint8Array(n))) {
  const secret = schnorr.utils.randomPrivateKey();
  const jitter = (random(2)[0] % (2 * JITTER_SECONDS + 1)) - JITTER_SECONDS;
  const event = {
    pubkey: hex(schnorr.getPublicKey(secret)),
    created_at: Math.max(0, Math.floor(nowSeconds) + jitter),
    kind: KIND,
    tags: [["p", tag], ["expiration", String(Math.floor(nowSeconds) + EVENT_TTL_SECONDS)]],
    content: b64(packet)
  };
  event.id = eventId(event);
  event.sig = hex(schnorr.sign(unb64Hex(event.id), secret));
  return event;
}

function unb64Hex(text) {
  const out = new Uint8Array(text.length / 2);
  for (let i = 0; i < out.length; i += 1) out[i] = parseInt(text.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export function verifyEvent(event) {
  try {
    if (!event || typeof event !== "object") return false;
    if (event.kind !== KIND) return false;
    if (typeof event.content !== "string" || event.content.length > MAX_CONTENT_CHARS) return false;
    if (!/^[0-9a-f]{64}$/.test(event.id || "") || !/^[0-9a-f]{64}$/.test(event.pubkey || "") || !/^[0-9a-f]{128}$/.test(event.sig || "")) return false;
    if (!Array.isArray(event.tags) || event.tags.length > 8) return false;
    if (!Number.isInteger(event.created_at)) return false;
    if (eventId(event) !== event.id) return false;
    return schnorr.verify(unb64Hex(event.sig), unb64Hex(event.id), unb64Hex(event.pubkey));
  } catch {
    return false;
  }
}

export function tagOf(event) {
  const row = (event.tags || []).find((entry) => entry?.[0] === "p" && typeof entry[1] === "string");
  return row ? row[1] : null;
}

export function packetOf(event) {
  try {
    return unb64(event.content);
  } catch {
    return null;
  }
}

/**
 * A small pool of relay connections. WebSocketImpl and timers are injected so tests run with a
 * fake relay and no network. It never retries a message by itself: the caller decides.
 */
export function createRelayPool({
  relays = DEFAULT_RELAYS,
  WebSocketImpl = globalThis.WebSocket,
  onEvent = () => {},
  onStatus = () => {},
  setTimer = setTimeout,
  clearTimer = clearTimeout,
  publishTimeoutMs = 8000
} = {}) {
  const sockets = new Map();
  const subs = new Map();
  const waiting = new Map();
  const attempts = new Map();
  let closed = false;

  const urls = relays.map(validateRelayUrl).filter((r) => r.ok).map((r) => r.url).slice(0, MAX_RELAYS);

  function openCount() {
    let n = 0;
    for (const entry of sockets.values()) if (entry.open) n += 1;
    return n;
  }

  function status() {
    return { open: openCount(), total: urls.length, connected: openCount() > 0 };
  }

  function emitStatus() {
    onStatus(status());
  }

  function sendReq(entry, id, filters) {
    try {
      entry.ws.send(JSON.stringify(["REQ", id, ...filters]));
    } catch {
      // The socket dropped between check and send. The reconnect path resubscribes.
    }
  }

  function handle(url, raw) {
    let message;
    try {
      message = JSON.parse(typeof raw === "string" ? raw : String(raw?.data ?? raw));
    } catch {
      return;
    }
    if (!Array.isArray(message)) return;
    if (message[0] === "EVENT" && message.length >= 3) {
      if (verifyEvent(message[2])) onEvent(message[2], url);
      return;
    }
    if (message[0] === "OK") {
      const pending = waiting.get(message[1]);
      if (pending && message[2] === true) pending.accept(url);
      else if (pending) pending.reject(url);
    }
  }

  function connectOne(url) {
    if (closed || typeof WebSocketImpl !== "function") return;
    let ws;
    try {
      ws = new WebSocketImpl(url);
    } catch {
      return;
    }
    const entry = { ws, open: false };
    sockets.set(url, entry);
    ws.onopen = () => {
      entry.open = true;
      attempts.set(url, 0);
      for (const [id, filters] of subs) sendReq(entry, id, filters);
      emitStatus();
    };
    ws.onmessage = (message) => handle(url, message.data ?? message);
    const dropped = () => {
      const was = entry.open;
      entry.open = false;
      if (sockets.get(url) === entry) sockets.delete(url);
      if (was) emitStatus();
      if (closed) return;
      const n = (attempts.get(url) || 0) + 1;
      attempts.set(url, n);
      setTimer(() => connectOne(url), Math.min(60000, 1000 * 2 ** Math.min(n, 6)));
    };
    ws.onclose = dropped;
    ws.onerror = () => {
      try {
        ws.close();
      } catch {
        // Already closed.
      }
    };
  }

  return {
    urls,
    status,
    connect() {
      closed = false;
      for (const url of urls) if (!sockets.has(url)) connectOne(url);
    },
    subscribe(id, filters) {
      subs.set(id, filters);
      for (const entry of sockets.values()) if (entry.open) sendReq(entry, id, filters);
    },
    unsubscribe(id) {
      subs.delete(id);
      for (const entry of sockets.values()) {
        if (!entry.open) continue;
        try {
          entry.ws.send(JSON.stringify(["CLOSE", id]));
        } catch {
          // Ignore.
        }
      }
    },
    /** Resolves with how many relays said OK. 0 means nothing left this phone successfully. */
    publish(event) {
      const targets = [...sockets.entries()].filter(([, entry]) => entry.open);
      if (targets.length === 0) return Promise.resolve({ accepted: 0, tried: 0 });
      return new Promise((resolve) => {
        let accepted = 0;
        let answered = 0;
        const finish = () => {
          clearTimer(timer);
          waiting.delete(event.id);
          resolve({ accepted, tried: targets.length });
        };
        const timer = setTimer(finish, publishTimeoutMs);
        waiting.set(event.id, {
          accept: () => {
            accepted += 1;
            answered += 1;
            if (answered >= targets.length || accepted >= 2) finish();
          },
          reject: () => {
            answered += 1;
            if (answered >= targets.length) finish();
          }
        });
        for (const [, entry] of targets) {
          try {
            entry.ws.send(JSON.stringify(["EVENT", event]));
          } catch {
            answered += 1;
          }
        }
      });
    },
    close() {
      closed = true;
      for (const entry of sockets.values()) {
        try {
          entry.ws.close();
        } catch {
          // Ignore.
        }
      }
      sockets.clear();
      subs.clear();
      emitStatus();
    }
  };
}
