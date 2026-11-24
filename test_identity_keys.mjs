import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { createIdentityKeys, verifySignature, KEY_ERROR_TITLE } from "./symbolic/identity_keys.js";
import { createPeerVault, memoryAdapter } from "./symbolic/peer_vault.js";
import { SECRET_KEYS, secureKeyFor } from "./symbolic/peer_secret_names.js";
import { publicCard } from "./symbolic/peer_chat.js";
import { createChannel, emptyOnlineState } from "./symbolic/online/channel.js";
import { createRelayPool } from "./symbolic/online/nostr.js";
import { createFakeRelayNetwork, tick } from "./test_support_fake_relay.mjs";

function phoneKeys(disk = new Map(), device = "phone-a") {
  return createIdentityKeys(createPeerVault(memoryAdapter(disk, device)));
}

test("first use makes one identity, and concurrent callers get the same keys", async () => {
  const keys = phoneKeys();
  const [a, b, c] = await Promise.all([keys.getOrCreateIdentity(), keys.getOrCreateIdentity(), keys.publicKey()]);
  assert.equal(a.state, "ready");
  assert.equal(a.identity.boxPublic, b.identity.boxPublic);
  assert.equal(c.boxPublic, a.identity.boxPublic);
  const again = await keys.getOrCreateIdentity();
  assert.equal(again.created, false);
  assert.equal(again.identity.boxPublic, a.identity.boxPublic);
});

test("copied app data on another phone is foreign, never a silent new key", async () => {
  const disk = new Map();
  await phoneKeys(disk, "phone-a").getOrCreateIdentity();
  const copy = await phoneKeys(disk, "phone-b").getOrCreateIdentity();
  assert.equal(copy.state, "foreign");
  assert.equal(copy.identity, null);
  assert.equal(phoneKeys().explain(copy).canReplace, true);
});

test("a secure-store failure is an error with a retry, and is not remembered", async () => {
  let fail = true;
  const base = memoryAdapter(new Map(), "phone-a");
  const flaky = { ...base, async getSecret(name) { if (fail) throw new Error("keystore locked"); return base.getSecret(name); } };
  const keys = createIdentityKeys(createPeerVault(flaky));
  const bad = await keys.getOrCreateIdentity();
  assert.equal(bad.state, "error");
  assert.equal(bad.message, KEY_ERROR_TITLE);
  assert.doesNotMatch(JSON.stringify(bad), /Secret/);
  fail = false;
  assert.equal((await keys.getOrCreateIdentity()).state, "ready");
});

test("sign and verify, seal and open between two phones", async () => {
  const alice = phoneKeys(new Map(), "a");
  const bob = phoneKeys(new Map(), "b");
  const signed = await alice.sign("hello");
  assert.equal(verifySignature("hello", signed.signature, signed.signPublic), true);
  assert.equal(verifySignature("hellO", signed.signature, signed.signPublic), false);
  const bobCard = await bob.publicKey();
  const sealed = await alice.seal(bobCard, "north stand at 5:30");
  assert.equal(sealed.ok, true);
  const opened = await bob.open(sealed.envelope);
  assert.equal(opened.ok, true);
  assert.equal(opened.text, "north stand at 5:30");
  assert.equal(await alice.safetyNumber(bobCard), await bob.safetyNumber(await alice.publicKey()));
});

test("every secret slot the vault uses has a valid secure-store name", () => {
  for (const slot of ["identity", "historyKey", "authFlag", "bindToken"]) assert.match(secureKeyFor(slot), /^[A-Za-z0-9._-]+$/);
  assert.throws(() => secureKeyFor("nope"));
  assert.equal(new Set(Object.values(SECRET_KEYS)).size, Object.keys(SECRET_KEYS).length);
});

test("the online channel runs on the shared identity, not keys of its own", async () => {
  const net = createFakeRelayNetwork();
  const relays = ["wss://relay-one.example.org"];
  async function phone(name) {
    const keys = phoneKeys(new Map(), name);
    const me = (await keys.getOrCreateIdentity()).identity;
    let channel;
    const pool = createRelayPool({ relays, WebSocketImpl: net.FakeSocket, onEvent: (e) => channel.onEvent(e), setTimer: (fn) => setTimeout(fn, 1e9).unref(), clearTimer: clearTimeout });
    channel = createChannel({ me, state: { ...emptyOnlineState(), relays }, pool, now: () => 1_800_000_000_000 });
    return { keys, channel, pool, card: publicCard(me) };
  }
  const a = await phone("a");
  const b = await phone("b");
  const one = await a.channel.addContact({ name: "B", card: b.card });
  const two = await b.channel.addContact({ name: "A", card: a.card });
  assert.equal(one.contact.safety, two.contact.safety);
  for (const p of [a, b]) { await p.channel.setEnabled(true); p.pool.connect(); }
  await tick();
  for (const p of [a, b]) p.channel.refreshSubscriptions();
  await tick();
  assert.equal((await a.channel.send(one.contact.id, "hi from the shared key")).ok, true);
  await tick();
  await tick();
  assert.equal(b.channel.state().contacts[two.contact.id].messages[0].text, "hi from the shared key");
});

test("phone online code takes keys from src/phone/identity.js and never makes its own", () => {
  const body = fs.readFileSync("src/phone/online_link.js", "utf8");
  assert.match(body, /from "\.\/identity\.js"/);
  assert.doesNotMatch(body, /generateIdentity|nacl\.box\.keyPair|nacl\.sign\.keyPair/);
  const ids = fs.readFileSync("src/phone/identity.js", "utf8");
  assert.match(ids, /createIdentityKeys\(peerVault\(\)\)/);
});
