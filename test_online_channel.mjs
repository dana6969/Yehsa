import assert from "node:assert/strict";
import test from "node:test";
import { generateIdentity, publicCard } from "./symbolic/peer_chat.js";
import { createChannel, emptyOnlineState, routeFor, TEXT } from "./symbolic/online/channel.js";
import { createRelayPool, wrapPacket, verifyEvent, tagOf, KIND } from "./symbolic/online/nostr.js";
import { createFakeRelayNetwork, tick } from "./test_support_fake_relay.mjs";

const RELAYS = ["wss://relay-one.example.org", "wss://relay-two.example.org"];

function phone(net, name, clock, identity = generateIdentity()) {
  const store = { saved: null };
  let channel;
  const pool = createRelayPool({
    relays: RELAYS,
    WebSocketImpl: net.FakeSocket,
    onEvent: (event) => channel.onEvent(event),
    setTimer: (fn) => setTimeout(fn, 1e9).unref(),
    clearTimer: clearTimeout
  });
  channel = createChannel({
    me: identity,
    state: { ...emptyOnlineState(), relays: RELAYS },
    persist: async (state) => { store.saved = JSON.stringify(state); },
    pool,
    now: () => clock.t
  });
  return { name, identity, channel, pool, store, card: publicCard(identity) };
}

async function pair(a, b) {
  const one = await a.channel.addContact({ name: b.name, card: b.card });
  const two = await b.channel.addContact({ name: a.name, card: a.card });
  assert.equal(one.ok && two.ok, true);
  assert.equal(one.contact.safety, two.contact.safety, "both phones show the same number");
  return { aId: one.contact.id, bId: two.contact.id };
}

async function online(...phones) {
  for (const p of phones) {
    await p.channel.setEnabled(true);
    p.pool.connect();
  }
  await tick();
  for (const p of phones) p.channel.refreshSubscriptions();
  await tick();
}

test("a message crosses a relay, is acknowledged, and the relay sees no plaintext", async () => {
  const net = createFakeRelayNetwork();
  const clock = { t: 1_800_000_000_000 };
  const a = phone(net, "Alice", clock);
  const b = phone(net, "Bob", clock);
  const { aId, bId } = await pair(a, b);
  await online(a, b);
  const sent = await a.channel.send(aId, "Meet at the north stand at 5:30");
  assert.equal(sent.ok, true);
  await tick();
  await tick();
  const got = b.channel.state().contacts[bId].messages;
  assert.equal(got.length, 1);
  assert.equal(got[0].text, "Meet at the north stand at 5:30");
  assert.equal(a.channel.state().contacts[aId].messages[0].status, "delivered");
  const everything = JSON.stringify(net.relay(RELAYS[0]).seenByRelay) + JSON.stringify(net.relay(RELAYS[1]).seenByRelay);
  assert.equal(everything.includes("north stand"), false);
  assert.equal(everything.includes(a.identity.boxPublic), false);
  assert.equal(everything.includes(b.identity.boxPublic), false);
  for (const event of net.relay(RELAYS[0]).seenByRelay) {
    assert.equal(verifyEvent(event), true);
    assert.equal(event.kind, KIND);
  }
});

test("each event is signed by a new throwaway key and the tag changes between epochs", async () => {
  const net = createFakeRelayNetwork();
  const clock = { t: 1_800_000_000_000 };
  const a = phone(net, "Alice", clock);
  const b = phone(net, "Bob", clock);
  const { aId } = await pair(a, b);
  await online(a, b);
  await a.channel.send(aId, "one");
  await a.channel.send(aId, "two");
  await tick();
  const early = net.relay(RELAYS[0]).events.filter((e) => e.kind === KIND);
  clock.t += 13 * 3600 * 1000;
  b.channel.refreshSubscriptions();
  await a.channel.send(aId, "three");
  await tick();
  const all = net.relay(RELAYS[0]).events.filter((e) => e.kind === KIND);
  const late = all.slice(early.length);
  assert.equal(new Set(all.map((e) => e.pubkey)).size, all.length, "no event key is reused");
  const earlyTags = new Set(early.map(tagOf));
  assert.equal(late.length > 0, true);
  for (const event of late) assert.equal(earlyTags.has(tagOf(event)), false, "the tag rotates");
});

test("messages are held while offline and never reported as sent until a relay accepts", async () => {
  const net = createFakeRelayNetwork();
  const clock = { t: 1_800_000_000_000 };
  const a = phone(net, "Alice", clock);
  const b = phone(net, "Bob", clock);
  const { aId, bId } = await pair(a, b);
  for (const url of RELAYS) net.relay(url).down = true;
  await a.channel.setEnabled(true);
  await b.channel.setEnabled(true);
  await tick();
  const first = await a.channel.send(aId, "held one");
  assert.equal(first.status, "held");
  assert.equal(first.message, TEXT.waiting);
  assert.equal(net.relay(RELAYS[0]).seenByRelay.length, 0, "nothing left the phone");
  assert.equal(a.channel.status().held, 1);
  for (const url of RELAYS) net.relay(url).down = false;
  a.pool.connect();
  b.pool.connect();
  await tick();
  b.channel.refreshSubscriptions();
  await a.channel.flush();
  await tick();
  await tick();
  assert.equal(a.channel.state().contacts[aId].messages[0].status === "held", false);
  assert.equal(b.channel.state().contacts[bId].messages[0].text, "held one");
  assert.equal(a.channel.status().held, 0);
});

test("a relay that rejects everything leaves the message held, not sent", async () => {
  const net = createFakeRelayNetwork();
  const clock = { t: 1_800_000_000_000 };
  net.relay(RELAYS[0]).rejectAll = true;
  net.relay(RELAYS[1]).rejectAll = true;
  const a = phone(net, "Alice", clock);
  const b = phone(net, "Bob", clock);
  const { aId } = await pair(a, b);
  await online(a);
  const result = await a.channel.send(aId, "will not land");
  assert.equal(result.status, "held");
  assert.equal(a.channel.status().held, 1);
});

test("a replayed event and a replayed packet in a fresh event are both refused", async () => {
  const net = createFakeRelayNetwork();
  const clock = { t: 1_800_000_000_000 };
  const a = phone(net, "Alice", clock);
  const b = phone(net, "Bob", clock);
  const { aId, bId } = await pair(a, b);
  await online(a, b);
  await a.channel.send(aId, "once");
  await tick();
  const original = net.relay(RELAYS[0]).events.find((e) => e.kind === KIND);
  assert.equal((await b.channel.onEvent(original)).reason, "seen");
  // An attacker re-wraps the same sealed packet under a new event key.
  const packet = Uint8Array.from(Buffer.from(original.content, "base64"));
  const rewrapped = wrapPacket(packet, tagOf(original), clock.t / 1000);
  const result = await b.channel.onEvent(rewrapped);
  assert.equal(result.ok, false);
  assert.equal(b.channel.state().contacts[bId].messages.length, 1);
});

test("a tampered packet is refused and does not damage the session", async () => {
  const net = createFakeRelayNetwork();
  const clock = { t: 1_800_000_000_000 };
  const a = phone(net, "Alice", clock);
  const b = phone(net, "Bob", clock);
  const { aId, bId } = await pair(a, b);
  await online(a, b);
  await a.channel.send(aId, "first");
  await tick();
  const before = JSON.stringify(b.channel.state().contacts[bId].sessions);
  const real = net.relay(RELAYS[0]).events.at(-1);
  const bytes = Uint8Array.from(Buffer.from(real.content, "base64"));
  bytes[bytes.length - 3] ^= 1;
  const forged = wrapPacket(bytes, tagOf(real), clock.t / 1000);
  const result = await b.channel.onEvent(forged);
  assert.equal(result.ok, false);
  assert.equal(JSON.stringify(b.channel.state().contacts[bId].sessions), before);
  await a.channel.send(aId, "second");
  await tick();
  assert.equal(b.channel.state().contacts[bId].messages.at(-1).text, "second");
});

test("someone who is not a contact cannot get a message in", async () => {
  const net = createFakeRelayNetwork();
  const clock = { t: 1_800_000_000_000 };
  const a = phone(net, "Alice", clock);
  const b = phone(net, "Bob", clock);
  const mallory = phone(net, "Mallory", clock);
  const { aId, bId } = await pair(a, b);
  await mallory.channel.addContact({ name: "Bob", card: b.card });
  await online(a, b, mallory);
  const mId = Object.keys(mallory.channel.state().contacts)[0];
  await mallory.channel.send(mId, "I am Alice");
  await tick();
  await tick();
  assert.equal(b.channel.state().contacts[bId].messages.length, 0);
  assert.equal(aId.length > 0, true);
});

test("location goes only to verified people, expires, and held updates are dropped when stale", async () => {
  const net = createFakeRelayNetwork();
  const clock = { t: 1_800_000_000_000 };
  const a = phone(net, "Alice", clock);
  const b = phone(net, "Bob", clock);
  const { aId, bId } = await pair(a, b);
  await online(a, b);
  const fix = { latitude: 44.55, longitude: -69.63 };
  const exp = clock.t + 3600_000;
  assert.equal((await a.channel.shareLocation([aId], fix, exp)).queued, 0, "not verified yet");
  await a.channel.verify(aId, a.channel.state().contacts[aId].safety);
  await b.channel.verify(bId, b.channel.state().contacts[bId].safety);
  assert.equal((await a.channel.shareLocation([aId], fix, exp)).queued, 1);
  await tick();
  await tick();
  assert.equal(b.channel.state().contacts[bId].location.latitude, 44.55);
  // A location that expired is refused by the receiver.
  clock.t += 2 * 3600_000;
  await a.channel.shareLocation([aId], { latitude: 1, longitude: 1 }, exp);
  await tick();
  await tick();
  assert.equal(b.channel.state().contacts[bId].location.latitude, 44.55);
});

test("a held location update is dropped after five minutes instead of going out late", async () => {
  const net = createFakeRelayNetwork();
  const clock = { t: 1_800_000_000_000 };
  const a = phone(net, "Alice", clock);
  const b = phone(net, "Bob", clock);
  const { aId } = await pair(a, b);
  await a.channel.verify(aId, a.channel.state().contacts[aId].safety);
  for (const url of RELAYS) net.relay(url).down = true;
  await a.channel.setEnabled(true);
  await tick();
  const queued = await a.channel.shareLocation([aId], { latitude: 44, longitude: -69 }, clock.t + 3600_000);
  assert.equal(queued.held, 1);
  clock.t += 6 * 60_000;
  for (const url of RELAYS) net.relay(url).down = false;
  a.pool.connect();
  await tick();
  await a.channel.flush();
  assert.equal(a.channel.status().held, 0);
  assert.equal(net.relay(RELAYS[0]).seenByRelay.length, 0, "the stale position never left the phone");
});

test("a signed key rotation moves the contact and forces a new check; a forged one is ignored", async () => {
  const net = createFakeRelayNetwork();
  const clock = { t: 1_800_000_000_000 };
  const a = phone(net, "Alice", clock);
  const b = phone(net, "Bob", clock);
  const { aId, bId } = await pair(a, b);
  await b.channel.verify(bId, b.channel.state().contacts[bId].safety);
  await online(a, b);
  await a.channel.send(aId, "before");
  await tick();
  const next = generateIdentity();
  let saved = null;
  const result = await a.channel.rotate(next, async (id) => { saved = id; });
  assert.equal(result.ok, true);
  assert.equal(saved, next);
  await tick();
  await tick();
  const contact = b.channel.state().contacts[bId];
  assert.equal(contact.boxPublic, next.boxPublic);
  assert.equal(contact.verified, false);
  assert.equal(contact.keyChanged, true);
  const blocked = await b.channel.send(bId, "should not go");
  assert.equal(blocked.ok, false);
  assert.equal(blocked.reason, TEXT.blocked);
  await b.channel.verify(bId, contact.safety);
  assert.equal(b.channel.state().contacts[bId].keyChanged, false);
});

test("a forged rotation certificate does not change the contact", async () => {
  const net = createFakeRelayNetwork();
  const clock = { t: 1_800_000_000_000 };
  const a = phone(net, "Alice", clock);
  const b = phone(net, "Bob", clock);
  const { bId } = await pair(a, b);
  const { signRotation } = await import("./symbolic/online/channel.js");
  const mallory = generateIdentity();
  const next = generateIdentity();
  const forged = signRotation({ ...a.identity, signSecret: mallory.signSecret }, next, clock.t);
  assert.equal(forged.oldSign, a.identity.signPublic);
  const state = b.channel.state();
  // Feed it through a real session so only the signature stands in the way.
  const { initiate, encrypt } = await import("./symbolic/online/ratchet.js");
  const { conversationKey, tagFor, epochOf } = await import("./symbolic/online/tags.js");
  const session = initiate(a.identity, publicCard(b.identity));
  const sealed = encrypt(session, JSON.stringify(forged));
  const tag = tagFor(conversationKey(a.identity, b.identity.boxPublic), b.identity.boxPublic, epochOf(clock.t / 1000));
  const result = await b.channel.onEvent(wrapPacket(sealed.packet, tag, clock.t / 1000));
  assert.equal(result.ok, false);
  assert.equal(state.contacts[bId].boxPublic, a.identity.boxPublic);
});

test("a revoke notice marks the contact retired and stops sends to it", async () => {
  const net = createFakeRelayNetwork();
  const clock = { t: 1_800_000_000_000 };
  const a = phone(net, "Alice", clock);
  const b = phone(net, "Bob", clock);
  const { aId, bId } = await pair(a, b);
  await online(a, b);
  let deleted = false;
  const result = await a.channel.revoke(async () => { deleted = true; });
  assert.equal(result.ok, true);
  assert.equal(deleted, true);
  await tick();
  await tick();
  assert.equal(b.channel.state().contacts[bId].revoked, true);
  const send = await b.channel.send(bId, "hello?");
  assert.equal(send.ok, false);
  assert.equal(send.reason, TEXT.revoked);
  assert.equal(Object.keys(a.channel.state().contacts).length, 0);
  assert.equal(aId.length > 0, true);
});

test("Online off means send refuses and nothing leaves", async () => {
  const net = createFakeRelayNetwork();
  const clock = { t: 1_800_000_000_000 };
  const a = phone(net, "Alice", clock);
  const b = phone(net, "Bob", clock);
  const { aId } = await pair(a, b);
  const result = await a.channel.send(aId, "nope");
  assert.equal(result.ok, false);
  assert.equal(net.relay(RELAYS[0]).seenByRelay.length, 0);
});

test("the safety-number check accepts only matching digits and QR codes", async () => {
  const net = createFakeRelayNetwork();
  const clock = { t: 1_800_000_000_000 };
  const a = phone(net, "Alice", clock);
  const b = phone(net, "Bob", clock);
  const { aId, bId } = await pair(a, b);
  const bad = await a.channel.verify(aId, "0000 0000 0000 0000 0000 0000 0000 0000");
  assert.equal(bad.ok, false);
  assert.match(bad.reason, /did not match/);
  const mallory = generateIdentity();
  assert.equal((await a.channel.verifyByCode(aId, JSON.stringify(publicCard(mallory)))).ok, false);
  assert.equal((await a.channel.verifyByCode(aId, JSON.stringify(b.card))).ok, true);
  assert.equal(a.channel.state().contacts[aId].verified, true);
  assert.equal(bId.length > 0, true);
});

test("routing prefers mesh when someone is near and falls back to online, then to held", () => {
  assert.equal(routeFor({ meshNearby: true, onlineOn: true, onlineConnected: true }).route, "mesh");
  assert.equal(routeFor({ meshNearby: false, onlineOn: true, onlineConnected: true }).route, "online");
  assert.equal(routeFor({ meshNearby: false, onlineOn: true, onlineConnected: false }).route, "held");
  assert.equal(routeFor({ meshNearby: false, onlineOn: false }).route, "held");
  assert.equal(routeFor({ meshNearby: false, onlineOn: true, onlineConnected: true, preferred: "mesh" }).route, "held");
  assert.equal(routeFor({ meshNearby: true, onlineOn: true, onlineConnected: true, preferred: "online" }).route, "online");
});
