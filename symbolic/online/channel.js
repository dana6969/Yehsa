// The online channel: Yehsa to Yehsa over public relays, end to end. Pure logic with injected
// storage, relay pool and clock, so it runs the same in tests as on the phone.
//
// What it does: pairing keys, safety numbers, sealed messages with a double ratchet, a held outbox
// while there is no connection, replay refusal, signed key rotation and revoke.
// What it never does: send in the clear, invent an account, or report "sent" for a message that no
// relay accepted.

import nacl from "tweetnacl";
import { sha256 } from "@noble/hashes/sha2";
import { b64, fromUtf8, hex, unb64, utf8 } from "./codec.js";
import { DEFAULT_RELAYS, KIND, packetOf, tagOf, validateRelayUrl, wrapPacket, MAX_RELAYS } from "./nostr.js";
import { canSend, decrypt, encrypt, initiate, parsePacket, respond, MAX_BODY_BYTES } from "./ratchet.js";
import { safetyNumber, sameNumber } from "./safety.js";
import { conversationKey, epochOf, tagFor, tagsToWatch } from "./tags.js";

export const HELD_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
export const LOCATION_MAX_AGE_MS = 5 * 60 * 1000;
export const MESSAGE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
export const MAX_SESSIONS = 3;
export const MAX_SEEN = 1000;
export const MAX_MESSAGES = 200;
export const MAX_TEXT = 3000;

export const TEXT = {
  notice: "Messages in an Online thread leave this phone through a connection you already have. Mesh stays on the radios between you. Yehsa does not create an account for you.",
  waiting: "Waiting for a connection. Messages are held on this phone until you are back online.",
  keyChanged: "Safety number changed. Re-verify this person before you trust the new key.",
  revoked: "This person retired their key. Pair again before you send anything.",
  blocked: "Re-verify this person before you send. Nothing was sent."
};

export function emptyOnlineState() {
  return { v: 1, enabled: false, noticeSeen: false, relays: [...DEFAULT_RELAYS], contacts: {}, outbox: [], seen: [], since: 0 };
}

export function cleanCard(card) {
  try {
    if (unb64(card?.boxPublic).length !== 32 || unb64(card?.signPublic).length !== 32) return null;
    return { boxPublic: card.boxPublic, signPublic: card.signPublic };
  } catch {
    return null;
  }
}

export function contactIdFor(boxPublic) {
  return `c-${hex(sha256(unb64(boxPublic))).slice(0, 12)}`;
}

function rotationText(old, next, ts) {
  return utf8(`yehsa-rot-v1|${old.boxPublic}|${old.signPublic}|${next.boxPublic}|${next.signPublic}|${ts}`);
}

function revokeText(card, ts) {
  return utf8(`yehsa-rev-v1|${card.boxPublic}|${card.signPublic}|${ts}`);
}

export function signRotation(me, next, ts) {
  const sig = nacl.sign.detached(rotationText(me, next, ts), unb64(me.signSecret));
  return { t: "rot", oldBox: me.boxPublic, oldSign: me.signPublic, newBox: next.boxPublic, newSign: next.signPublic, ts, sig: b64(sig) };
}

export function signRevoke(me, ts) {
  const sig = nacl.sign.detached(revokeText(me, ts), unb64(me.signSecret));
  return { t: "rev", box: me.boxPublic, sign: me.signPublic, ts, sig: b64(sig) };
}

function idOf() {
  return hex(nacl.randomBytes(9));
}

export function createChannel({ me: initialMe, state: initialState, persist = async () => {}, pool, now = () => Date.now(), callbacks = {} }) {
  let me = initialMe;
  let state = { ...emptyOnlineState(), ...(initialState || {}) };
  let chain = Promise.resolve();
  const keyCache = new Map();

  function locked(task) {
    const run = chain.then(task, task);
    chain = run.catch(() => {});
    return run;
  }

  async function save() {
    await persist(state);
    callbacks.onChange?.(state);
  }

  function nowSeconds() {
    return Math.floor(now() / 1000);
  }

  function keyFor(contact) {
    const cacheKey = `${me.boxPublic}|${contact.boxPublic}`;
    if (!keyCache.has(cacheKey)) keyCache.set(cacheKey, conversationKey(me, contact.boxPublic));
    return keyCache.get(cacheKey);
  }

  function contactList() {
    return Object.values(state.contacts);
  }

  function addMessage(contact, record) {
    contact.messages = [...(contact.messages || []), record].slice(-MAX_MESSAGES);
  }

  function setStatus(contactId, messageId, status) {
    const contact = state.contacts[contactId];
    const found = contact?.messages?.find((m) => m.id === messageId);
    if (found && !(found.status === "delivered")) found.status = status;
  }

  function usable(contact) {
    if (!contact) return { ok: false, reason: "That person is not in your contacts." };
    if (contact.revoked) return { ok: false, reason: TEXT.revoked };
    if (contact.keyChanged) return { ok: false, reason: TEXT.blocked };
    return { ok: true };
  }

  function sealFor(contact, body) {
    const text = JSON.stringify(body);
    if (utf8(text).length > MAX_BODY_BYTES) throw new Error("message too long");
    let session = contact.sessions?.[0];
    if (!session || !canSend(session)) {
      session = initiate(me, contact);
      contact.sessions = [session, ...(contact.sessions || [])].slice(0, MAX_SESSIONS);
    }
    const sealed = encrypt(session, text);
    contact.sessions[0] = sealed.state;
    return b64(sealed.packet);
  }

  async function publishPacket(contact, packetB64) {
    const tag = tagFor(keyFor(contact), contact.boxPublic, epochOf(nowSeconds()));
    const event = wrapPacket(unb64(packetB64), tag, nowSeconds());
    return pool.publish(event);
  }

  function trimOutbox() {
    const t = now();
    state.outbox = state.outbox.filter((item) => t - item.queuedAt <= item.maxAge);
  }

  async function flushInner() {
    trimOutbox();
    const connected = pool?.status().connected === true;
    let sent = 0;
    if (connected) {
      for (const item of [...state.outbox]) {
        const contact = state.contacts[item.contactId];
        if (!usable(contact).ok) {
          state.outbox = state.outbox.filter((x) => x !== item);
          setStatus(item.contactId, item.messageId, "failed");
          continue;
        }
        if (!item.packet) {
          try {
            item.packet = sealFor(contact, item.body);
          } catch {
            state.outbox = state.outbox.filter((x) => x !== item);
            setStatus(item.contactId, item.messageId, "failed");
            continue;
          }
          await save();
        }
        const result = await publishPacket(contact, item.packet);
        if (result.accepted > 0) {
          state.outbox = state.outbox.filter((x) => x !== item);
          setStatus(item.contactId, item.messageId, "sent");
          sent += 1;
        } else {
          break;
        }
      }
    }
    await save();
    return { sent, held: state.outbox.length, connected };
  }

  function watchMap() {
    const map = new Map();
    const t = nowSeconds();
    for (const contact of contactList()) {
      if (contact.revoked) continue;
      for (const tag of tagsToWatch(keyFor(contact), me.boxPublic, t, t - 36 * 3600)) map.set(tag, contact.id);
    }
    return map;
  }

  function handleBody(contact, body) {
    const t = now();
    if (body.t === "msg") {
      if (typeof body.text !== "string" || body.text.length > MAX_TEXT || typeof body.id !== "string") return "bad";
      if (!Number.isFinite(body.ts) || t - body.ts > MESSAGE_MAX_AGE_MS || body.ts - t > 10 * 60 * 1000) return "stale";
      if (contact.messages?.some((m) => m.id === body.id)) return "dup";
      addMessage(contact, { id: body.id, mine: false, text: body.text, ts: body.ts, status: "received", transport: "online" });
      contact.lastSeen = t;
      callbacks.onMessage?.(contact, body);
      return "ok";
    }
    if (body.t === "ack") {
      setStatus(contact.id, String(body.id), "delivered");
      const found = contact.messages?.find((m) => m.id === body.id);
      if (found) found.status = "delivered";
      return "ok";
    }
    if (body.t === "loc") {
      if (!contact.verified) return "unverified";
      const lat = Number(body.lat);
      const lon = Number(body.lon);
      const exp = Number(body.exp);
      if (!(lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180)) return "bad";
      if (!Number.isFinite(exp) || exp <= t || exp - t > 12 * 3600 * 1000) return "expired";
      if (!Number.isFinite(body.ts) || t - body.ts > LOCATION_MAX_AGE_MS) return "stale";
      contact.location = { latitude: lat, longitude: lon, at: body.ts, exp };
      callbacks.onLocation?.(contact, contact.location);
      return "ok";
    }
    if (body.t === "rot") {
      if (body.oldBox !== contact.boxPublic || body.oldSign !== contact.signPublic) return "bad";
      const next = cleanCard({ boxPublic: body.newBox, signPublic: body.newSign });
      if (!next) return "bad";
      let valid = false;
      try {
        valid = nacl.sign.detached.verify(rotationText(contact, next, body.ts), unb64(body.sig), unb64(contact.signPublic));
      } catch {
        valid = false;
      }
      if (!valid) return "bad";
      applyNewKeys(contact, next);
      return "rotated";
    }
    if (body.t === "rev") {
      if (body.box !== contact.boxPublic || body.sign !== contact.signPublic) return "bad";
      let valid = false;
      try {
        valid = nacl.sign.detached.verify(revokeText(contact, body.ts), unb64(body.sig), unb64(contact.signPublic));
      } catch {
        valid = false;
      }
      if (!valid) return "bad";
      contact.revoked = true;
      contact.verified = false;
      contact.sessions = [];
      return "revoked";
    }
    return "bad";
  }

  function applyNewKeys(contact, card) {
    keyCache.clear();
    contact.boxPublic = card.boxPublic;
    contact.signPublic = card.signPublic;
    contact.safety = safetyNumber(me, card);
    contact.verified = false;
    contact.keyChanged = true;
    contact.revoked = false;
    contact.sessions = [];
    contact.location = null;
  }

  async function receiveInner(event) {
    if (!event || state.seen.includes(event.id)) return { ok: false, reason: "seen" };
    const contact = state.contacts[watchMap().get(tagOf(event))];
    state.seen = [...state.seen, event.id].slice(-MAX_SEEN);
    if (!contact) return { ok: false, reason: "not-for-us" };
    const packet = packetOf(event);
    const parsed = packet ? parsePacket(packet) : null;
    if (!parsed) return { ok: false, reason: "malformed" };
    let opened = null;
    let which = -1;
    for (let i = 0; i < (contact.sessions || []).length && !opened; i += 1) {
      const result = decrypt(contact.sessions[i], packet);
      if (result.ok) {
        opened = result;
        which = i;
      }
    }
    if (!opened && parsed.init) {
      const result = decrypt(respond(me, contact), packet);
      if (result.ok) {
        opened = result;
        which = -1;
      }
    }
    if (!opened) {
      await save();
      return { ok: false, reason: "refused" };
    }
    if (which === -1) contact.sessions = [opened.state, ...(contact.sessions || [])].slice(0, MAX_SESSIONS);
    else {
      const rest = contact.sessions.filter((_, i) => i !== which);
      contact.sessions = [opened.state, ...rest];
    }
    let body;
    try {
      body = JSON.parse(fromUtf8(opened.body));
    } catch {
      await save();
      return { ok: false, reason: "malformed" };
    }
    const outcome = handleBody(contact, body);
    if (outcome === "ok" && body.t === "msg") queueBody(contact, { t: "ack", id: body.id, ts: now() }, { maxAge: HELD_MAX_AGE_MS, messageId: null });
    await save();
    if (outcome === "ok" && body.t === "msg") await flushInner();
    return { ok: outcome === "ok" || outcome === "rotated" || outcome === "revoked", reason: outcome, type: body.t };
  }

  function queueBody(contact, body, { maxAge, messageId }) {
    if (body.t === "loc") state.outbox = state.outbox.filter((x) => !(x.contactId === contact.id && x.body.t === "loc"));
    state.outbox.push({ id: idOf(), contactId: contact.id, body, messageId, queuedAt: now(), maxAge, packet: null });
  }

  let activeSubs = new Set();

  function refreshSubs() {
    if (!pool) return;
    const t = nowSeconds();
    const wanted = new Set();
    for (const contact of contactList()) {
      if (contact.revoked) continue;
      const id = `y-${contact.id}`;
      wanted.add(id);
      const since = Math.max(0, (state.since || t) - 3600);
      pool.subscribe(id, [{ kinds: [KIND], "#p": tagsToWatch(keyFor(contact), me.boxPublic, t, since), since: Math.max(0, since - 3600) }]);
    }
    for (const id of activeSubs) if (!wanted.has(id)) pool.unsubscribe(id);
    activeSubs = wanted;
  }

  return {
    me: () => me,
    state: () => state,
    text: TEXT,
    status() {
      const connected = pool?.status().connected === true;
      return { enabled: state.enabled, connected, held: state.outbox.length, text: state.enabled && !connected ? TEXT.waiting : "" };
    },
    contacts: contactList,
    setEnabled(on) {
      return locked(async () => {
        state.enabled = on === true;
        if (!state.enabled) pool?.close();
        else {
          pool?.connect();
          refreshSubs();
        }
        await save();
        return state.enabled;
      });
    },
    markNoticeSeen() {
      return locked(async () => {
        state.noticeSeen = true;
        await save();
      });
    },
    setRelays(list) {
      return locked(async () => {
        const checked = (list || []).map(validateRelayUrl);
        const bad = checked.find((r) => !r.ok);
        if (bad) return { ok: false, reason: bad.reason };
        const urls = [...new Set(checked.map((r) => r.url))].slice(0, MAX_RELAYS);
        if (urls.length === 0) return { ok: false, reason: "Keep at least one relay." };
        state.relays = urls;
        await save();
        return { ok: true, relays: urls };
      });
    },
    addContact({ name, card }) {
      return locked(async () => {
        const clean = cleanCard(card);
        const label = String(name || "").trim().slice(0, 40);
        if (!label) return { ok: false, reason: "Add a name so you know who this is." };
        if (!clean) return { ok: false, reason: "That did not look like a pairing code." };
        if (clean.boxPublic === me.boxPublic) return { ok: false, reason: "That is your own code." };
        const id = contactIdFor(clean.boxPublic);
        if (state.contacts[id]) return { ok: false, reason: "That person is already here.", contact: state.contacts[id] };
        const contact = { id, name: label, ...clean, safety: safetyNumber(me, clean), verified: false, keyChanged: false, revoked: false, sessions: [], messages: [], createdAt: now() };
        state.contacts[id] = contact;
        await save();
        refreshSubs();
        return { ok: true, contact };
      });
    },
    verify(id, typed) {
      return locked(async () => {
        const contact = state.contacts[id];
        if (!contact) return { ok: false, reason: "That person is not in your contacts." };
        if (!sameNumber(typed, contact.safety)) return { ok: false, reason: "Those numbers did not match. Read them out loud again, or scan the code on their phone." };
        contact.verified = true;
        contact.keyChanged = false;
        await save();
        return { ok: true };
      });
    },
    verifyByCode(id, cardText) {
      return locked(async () => {
        const contact = state.contacts[id];
        let card = null;
        try {
          card = cleanCard(JSON.parse(String(cardText || "")));
        } catch {
          card = null;
        }
        if (!contact || !card || card.boxPublic !== contact.boxPublic || card.signPublic !== contact.signPublic) {
          return { ok: false, reason: "That code does not match this person. Do not trust it." };
        }
        contact.verified = true;
        contact.keyChanged = false;
        await save();
        return { ok: true };
      });
    },
    removeContact(id) {
      return locked(async () => {
        delete state.contacts[id];
        state.outbox = state.outbox.filter((x) => x.contactId !== id);
        await save();
        refreshSubs();
      });
    },
    deleteThread(id) {
      return locked(async () => {
        if (state.contacts[id]) state.contacts[id].messages = [];
        state.outbox = state.outbox.filter((x) => x.contactId !== id || x.body.t !== "msg");
        await save();
      });
    },
    /** Queues the message. It is only "sent" after a relay accepted it. */
    send(id, text) {
      return locked(async () => {
        const contact = state.contacts[id];
        const gate = usable(contact);
        if (!gate.ok) return { ok: false, reason: gate.reason };
        if (state.enabled !== true) return { ok: false, reason: "Online is off. Turn it on in People first. Nothing was sent." };
        const clean = String(text || "").trim();
        if (!clean) return { ok: false, reason: "There is nothing to send." };
        if (clean.length > MAX_TEXT) return { ok: false, reason: "That message is too long." };
        const messageId = idOf();
        const body = { t: "msg", id: messageId, ts: now(), text: clean };
        addMessage(contact, { id: messageId, mine: true, text: clean, ts: body.ts, status: "held", transport: "online" });
        queueBody(contact, body, { maxAge: HELD_MAX_AGE_MS, messageId });
        await save();
        const result = await flushInner();
        const status = contact.messages.find((m) => m.id === messageId)?.status || "held";
        return { ok: true, status, held: result.held, message: status === "held" ? TEXT.waiting : "" };
      });
    },
    /** Location for a hunt party. Only to verified people. Held updates older than five minutes are dropped. */
    shareLocation(ids, fix, exp) {
      return locked(async () => {
        if (state.enabled !== true) return { ok: false, queued: 0 };
        let queued = 0;
        for (const id of ids) {
          const contact = state.contacts[id];
          if (!usable(contact).ok || !contact.verified) continue;
          queueBody(contact, { t: "loc", ts: now(), lat: Number(fix.latitude), lon: Number(fix.longitude), exp }, { maxAge: LOCATION_MAX_AGE_MS, messageId: null });
          queued += 1;
        }
        await save();
        const result = await flushInner();
        return { ok: true, queued, connected: result.connected, held: result.held };
      });
    },
    flush() {
      return locked(flushInner);
    },
    onEvent(event) {
      return locked(() => receiveInner(event));
    },
    refreshSubscriptions() {
      refreshSubs();
    },
    noteOnline() {
      return locked(async () => {
        state.since = nowSeconds();
        await save();
      });
    },
    /** Tell contacts about a new key, signed by the old one, then switch. newMe must already exist. */
    rotate(newMe, saveIdentity) {
      return locked(async () => {
        if (pool?.status().connected !== true) return { ok: false, reason: "Connect first so your contacts can be told. Nothing changed." };
        const ts = now();
        const cert = signRotation(me, newMe, ts);
        let notified = 0;
        const unreachable = [];
        for (const contact of contactList()) {
          if (contact.revoked) continue;
          try {
            const packet = sealFor(contact, cert);
            const result = await publishPacket(contact, packet);
            if (result.accepted > 0) notified += 1;
            else unreachable.push(contact.name);
          } catch {
            unreachable.push(contact.name);
          }
        }
        await saveIdentity(newMe);
        keyCache.clear();
        me = newMe;
        for (const contact of contactList()) {
          contact.sessions = [];
          contact.safety = safetyNumber(me, contact);
          contact.verified = false;
          contact.location = null;
        }
        state.outbox = [];
        await save();
        refreshSubs();
        return { ok: true, notified, unreachable };
      });
    },
    /** Retire the key. Contacts are told if there is a connection; the caller then deletes the identity. */
    revoke(deleteIdentity) {
      return locked(async () => {
        const ts = now();
        const cert = signRevoke(me, ts);
        let notified = 0;
        if (pool?.status().connected === true) {
          for (const contact of contactList()) {
            if (contact.revoked) continue;
            try {
              const result = await publishPacket(contact, sealFor(contact, cert));
              if (result.accepted > 0) notified += 1;
            } catch {
              // Best effort.
            }
          }
        }
        await deleteIdentity();
        state = { ...emptyOnlineState(), relays: state.relays, noticeSeen: state.noticeSeen };
        keyCache.clear();
        await save();
        return { ok: true, notified };
      });
    }
  };
}

export function routeFor({ meshNearby = false, onlineOn = false, onlineConnected = false, preferred = null }) {
  if (preferred === "mesh") return meshNearby ? { route: "mesh", why: "nearby" } : { route: "held", why: "No peers nearby. Messages are held on this phone." };
  if (preferred === "online") {
    if (!onlineOn) return { route: "held", why: "Online is off." };
    return onlineConnected ? { route: "online", why: "connected" } : { route: "held", why: TEXT.waiting };
  }
  if (meshNearby) return { route: "mesh", why: "nearby" };
  if (onlineOn && onlineConnected) return { route: "online", why: "no peers nearby, using your connection" };
  return { route: "held", why: onlineOn ? TEXT.waiting : "No peers nearby. Messages are held on this phone." };
}
