import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import nacl from "tweetnacl";
import { hkdf } from "@noble/hashes/hkdf";
import { hmac } from "@noble/hashes/hmac";
import { sha256 } from "@noble/hashes/sha2";
import { chacha20poly1305 } from "@noble/ciphers/chacha";
import { schnorr } from "@noble/curves/secp256k1";
import { generateIdentity, publicCard } from "./symbolic/peer_chat.js";
import { hex, unhex, utf8, b64, unb64 } from "./symbolic/online/codec.js";
import * as R from "./symbolic/online/ratchet.js";
import { safetyNumber, sameNumber } from "./symbolic/online/safety.js";
import { conversationKey, epochOf, tagFor, tagsToWatch, EPOCH_SECONDS } from "./symbolic/online/tags.js";
import { eventId, validateRelayUrl, verifyEvent, wrapPacket } from "./symbolic/online/nostr.js";
import { createSealedVault } from "./symbolic/sealed_vault.js";
import { memoryAdapter } from "./symbolic/peer_vault.js";
import { auditStorageText } from "./symbolic/storage_audit.js";

const text = (bytes) => new TextDecoder().decode(bytes);

// Known-answer tests for the primitives the protocol is built from.

test("X25519 matches RFC 7748 section 5.2", () => {
  const out = nacl.scalarMult(
    unhex("a546e36bf0527c9d3b16154b82465edd62144c0ac1fc5a18506a2244ba449ac4"),
    unhex("e6db6867583030db3594c1a424b15f7c726624ec26b3353b10a903a6d0ab1c4c")
  );
  assert.equal(hex(out), "c3da55379de9c6908e94ea4df28d084f32eccf03491c71f754b4075577a28552");
});

test("Ed25519 matches RFC 8032 test 1", () => {
  const pair = nacl.sign.keyPair.fromSeed(unhex("9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60"));
  assert.equal(hex(pair.publicKey), "d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a");
  const sig = nacl.sign.detached(new Uint8Array(0), pair.secretKey);
  assert.equal(hex(sig), "e5564300c360ac729086e2cc806e828a84877f1eb8e5d974d873e065224901555fb8821590a33bacc61e39701cf9b46bd25bf5f0595bbe24655141438e7a100b");
  assert.equal(nacl.sign.detached.verify(new Uint8Array(0), sig, pair.publicKey), true);
});

test("HKDF-SHA256 matches RFC 5869 case 1 and HMAC-SHA256 matches RFC 4231 case 1", () => {
  const okm = hkdf(sha256, new Uint8Array(22).fill(0x0b), unhex("000102030405060708090a0b0c"), unhex("f0f1f2f3f4f5f6f7f8f9"), 42);
  assert.equal(hex(okm), "3cb25f25faacd57a90434f64d0362f2a2d2d0a90cf1a5a4c5db02d56ecc4c5bf34007208d5b887185865");
  assert.equal(hex(hmac(sha256, new Uint8Array(20).fill(0x0b), utf8("Hi There"))), "b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7");
});

test("ChaCha20-Poly1305 matches RFC 8439 section 2.8.2", () => {
  const key = unhex("808182838485868788898a8b8c8d8e8f909192939495969798999a9b9c9d9e9f");
  const nonce = unhex("070000004041424344454647");
  const aad = unhex("50515253c0c1c2c3c4c5c6c7");
  const plain = utf8("Ladies and Gentlemen of the class of '99: If I could offer you only one tip for the future, sunscreen would be it.");
  const sealed = chacha20poly1305(key, nonce, aad).encrypt(plain);
  assert.equal(hex(sealed.slice(0, 16)), "d31a8d34648e60db7b86afbc53ef7ec2");
  assert.equal(hex(sealed.slice(-16)), "1ae10b594f09e26a7e902ecbd0600691");
  assert.equal(text(chacha20poly1305(key, nonce, aad).decrypt(sealed)), text(plain));
});

test("BIP340 Schnorr signing matches vector 0 (relay events use it)", () => {
  const sk = unhex("0000000000000000000000000000000000000000000000000000000000000003");
  assert.equal(hex(schnorr.getPublicKey(sk)).toUpperCase(), "F9308A019258C31049344F85F89D5229B531C845836F99B08601F113BCE036F9");
  const sig = schnorr.sign(new Uint8Array(32), sk, new Uint8Array(32));
  assert.equal(hex(sig).toUpperCase(), "E907831F80848D1069A5371B402410364BDF1C5F8307B0084C55F1CE2DCA821525F66A4A85EA8B71E482A74F382D2CE5EBEEE8FDB2172F477DF4900D310536C0");
});

// Regression vectors for this project's own key schedule. They pin today's output so a change is noticed.

test("the key schedule gives the same bytes for the same inputs (pinned regression vector)", () => {
  const root = R.kdfRoot(new Uint8Array(32).fill(1), new Uint8Array(32).fill(2));
  assert.equal(hex(root.rk), "50d545900de8b6d7411c9a3459a56138ba5572b05f9e79c28f1773d65473f5c2");
  assert.equal(hex(root.ck), "572f6c6f81e93cbcd66a226ce1820ff9b68f9dde04ce2cfacdf29634034c9306");
  const chain = R.kdfChain(root.ck);
  assert.equal(hex(chain.mk), "61cb992e8bd6232b8680eea3e57b1f9addb311eb466a9033cb6b46944fd6070f");
  assert.equal(hex(chain.ck), "63ff60f2e06dba59be29ca72b315c250bb55aadb9b1ffe8e2caf278b8e40ea28");
  assert.equal(hex(chain.mk), hex(hmac(sha256, root.ck, Uint8Array.of(1))));
  const keys = R.messageKeys(chain.mk);
  assert.equal(hex(keys.key), "a875637d95153077d035969cf4115cf081a55a7226d7180e74e58d2eb682c8d6");
  assert.equal(hex(keys.nonce), "bcdecf537021783d232aa972");
});

test("the safety number for fixed keys is pinned", () => {
  const one = { boxPublic: b64(new Uint8Array(32).fill(5)), signPublic: b64(new Uint8Array(32).fill(6)) };
  const two = { boxPublic: b64(new Uint8Array(32).fill(7)), signPublic: b64(new Uint8Array(32).fill(8)) };
  assert.equal(safetyNumber(one, two), "3545 8175 5031 4523 1777 7442 3571 3753");
});

function pairUp() {
  const alice = generateIdentity();
  const bob = generateIdentity();
  return { alice, bob, a: R.initiate(alice, publicCard(bob)), b: R.respond(bob, publicCard(alice)) };
}

function send(state, body) {
  const out = R.encrypt(state, body);
  return { state: out.state, packet: out.packet };
}

function receive(state, packet) {
  const out = R.decrypt(state, packet);
  return out;
}

test("a conversation goes back and forth with the ratchet moving on each reply", () => {
  let { a, b } = pairUp();
  const log = [];
  for (let i = 0; i < 6; i += 1) {
    const s = send(a, `a${i}`);
    a = s.state;
    const r = receive(b, s.packet);
    assert.equal(r.ok, true);
    b = r.state;
    log.push(text(r.body));
    const back = send(b, `b${i}`);
    b = back.state;
    const rr = receive(a, back.packet);
    assert.equal(rr.ok, true);
    a = rr.state;
    log.push(text(rr.body));
  }
  assert.deepEqual(log.slice(0, 4), ["a0", "b0", "a1", "b1"]);
  assert.notEqual(a.dhs.pk, null);
});

test("out-of-order and delayed packets are opened once each", () => {
  let { a, b } = pairUp();
  const packets = [];
  for (let i = 0; i < 4; i += 1) {
    const s = send(a, `m${i}`);
    a = s.state;
    packets.push(s.packet);
  }
  for (const index of [2, 0, 3, 1]) {
    const r = receive(b, packets[index]);
    assert.equal(r.ok, true, `packet ${index}`);
    assert.equal(text(r.body), `m${index}`);
    b = r.state;
  }
  for (const packet of packets) assert.equal(receive(b, packet).ok, false);
});

test("a replayed packet is refused, and so is one whose key was already used", () => {
  let { a, b } = pairUp();
  const s = send(a, "once");
  const r = receive(b, s.packet);
  assert.equal(r.ok, true);
  const again = receive(r.state, s.packet);
  assert.equal(again.ok, false);
  assert.equal(again.reason, "replay");
});

test("every byte region is authenticated: flipping any bit is refused and leaves the state unchanged", () => {
  const { a, b } = pairUp();
  const { packet } = send(a, "check me");
  const before = JSON.stringify(b);
  const spots = [1, 2, 20, 33, 36, 39, 41, 42, 60, 100, packet.length - 1, packet.length - 17];
  for (const spot of spots) {
    const forged = packet.slice();
    forged[spot] ^= 0x01;
    const r = receive(b, forged);
    assert.equal(r.ok, false, `byte ${spot}`);
  }
  assert.equal(JSON.stringify(b), before, "the receiver state is untouched by forged packets");
  assert.equal(receive(b, packet).ok, true, "the real packet still opens afterwards");
});

test("a packet cannot be redirected: wrong recipient and swapped sender both fail", () => {
  const { alice, bob, a } = pairUp();
  const carol = generateIdentity();
  const { packet } = send(a, "for bob");
  const wrongRecipient = R.respond(carol, publicCard(alice));
  assert.equal(receive(wrongRecipient, packet).ok, false);
  const wrongSender = R.respond(bob, publicCard(carol));
  assert.equal(receive(wrongSender, packet).ok, false);
});

test("a skip of more than 100 messages is refused", () => {
  let { a, b } = pairUp();
  let last;
  for (let i = 0; i < R.MAX_SKIP + 3; i += 1) {
    const s = send(a, "x");
    a = s.state;
    last = s.packet;
  }
  const r = receive(b, last);
  assert.equal(r.ok, false);
  assert.equal(r.reason, "too-far-ahead");
});

test("forward secrecy: a state stolen after a message cannot open that message", () => {
  let { a, b } = pairUp();
  const first = send(a, "secret one");
  a = first.state;
  const opened = receive(b, first.packet);
  b = opened.state;
  const stolen = JSON.parse(JSON.stringify(b));
  assert.equal(receive(stolen, first.packet).ok, false);
  assert.equal(JSON.stringify(stolen).includes(b64(R.kdfChain(unb64(a.cks)).mk)), false);
});

test("post-compromise recovery: after a round trip the stolen state no longer reads new messages", () => {
  let { a, b } = pairUp();
  let s = send(a, "hi");
  a = s.state;
  let r = receive(b, s.packet);
  b = r.state;
  s = send(b, "hello");
  b = s.state;
  r = receive(a, s.packet);
  a = r.state;
  const stolenB = JSON.parse(JSON.stringify(b));
  s = send(a, "after theft 1");
  a = s.state;
  r = receive(b, s.packet);
  b = r.state;
  s = send(b, "reply with fresh key");
  b = s.state;
  r = receive(a, s.packet);
  a = r.state;
  s = send(a, "after healing");
  a = s.state;
  assert.equal(receive(stolenB, s.packet).ok, false);
  assert.equal(receive(b, s.packet).ok, true);
});

test("padding hides message length inside fixed buckets and refuses oversize bodies", () => {
  const { a } = pairUp();
  const short = send(a, "k").packet.length;
  const longer = send(a, "k".repeat(200)).packet.length;
  const longest = send(a, "k".repeat(300)).packet.length;
  assert.equal(short, longer);
  assert.ok(longest > short);
  assert.deepEqual(R.BUCKETS, [256, 512, 1024, 2048, 4096]);
  assert.throws(() => R.encrypt(a, "k".repeat(R.MAX_BODY_BYTES + 1)), /too long/);
  assert.equal(text(R.unpad(R.pad("hello"))), "hello");
  assert.throws(() => R.unpad(new Uint8Array(100)));
});

test("a responder cannot send before the other side has written", () => {
  const { b } = pairUp();
  assert.equal(R.canSend(b), false);
  assert.throws(() => R.encrypt(b, "early"));
});

test("a low-order public key is refused", () => {
  const alice = generateIdentity();
  const zero = { boxPublic: b64(new Uint8Array(32)), signPublic: alice.signPublic };
  assert.throws(() => R.initiate(alice, zero));
});

test("the safety number is the same on both phones and changes if either key changes", () => {
  const a = generateIdentity();
  const b = generateIdentity();
  assert.equal(safetyNumber(publicCard(a), publicCard(b)), safetyNumber(publicCard(b), publicCard(a)));
  assert.match(safetyNumber(publicCard(a), publicCard(b)), /^\d{4}( \d{4}){7}$/);
  const swappedSigner = { boxPublic: b.boxPublic, signPublic: generateIdentity().signPublic };
  assert.notEqual(safetyNumber(publicCard(a), publicCard(b)), safetyNumber(publicCard(a), swappedSigner));
  const swappedBox = { boxPublic: generateIdentity().boxPublic, signPublic: b.signPublic };
  assert.notEqual(safetyNumber(publicCard(a), publicCard(b)), safetyNumber(publicCard(a), swappedBox));
  assert.equal(sameNumber("1234 5678", "1234 5678"), false, "too short to count");
  const n = safetyNumber(publicCard(a), publicCard(b));
  assert.equal(sameNumber(n, n.replace(/ /g, "")), true);
});

test("tags are the same for both people, differ by direction and by 12-hour epoch, and look random", () => {
  const a = generateIdentity();
  const b = generateIdentity();
  const keyA = conversationKey(a, b.boxPublic);
  const keyB = conversationKey(b, a.boxPublic);
  assert.equal(hex(keyA), hex(keyB));
  const now = 1_800_000_000;
  const toBob = tagFor(keyA, b.boxPublic, epochOf(now));
  const toAlice = tagFor(keyA, a.boxPublic, epochOf(now));
  assert.notEqual(toBob, toAlice);
  assert.notEqual(toBob, tagFor(keyA, b.boxPublic, epochOf(now) + 1));
  assert.match(toBob, /^[0-9a-f]{64}$/);
  const other = conversationKey(a, generateIdentity().boxPublic);
  assert.notEqual(tagFor(other, b.boxPublic, epochOf(now)), toBob);
  const watch = tagsToWatch(keyB, b.boxPublic, now, now - 3600);
  assert.ok(watch.includes(toBob));
  assert.ok(watch.length <= 4);
  const catchUp = tagsToWatch(keyB, b.boxPublic, now, now - 30 * 86400);
  assert.ok(catchUp.length <= (7 * 86400) / EPOCH_SECONDS + 4, "catch-up is capped at 7 days");
});

test("relay events verify, and any change to an event fails verification", () => {
  const event = wrapPacket(new Uint8Array(300).fill(9), "ab".repeat(32), 1_800_000_000);
  assert.equal(verifyEvent(event), true);
  assert.equal(event.id, eventId(event));
  for (const change of [{ content: event.content + "A" }, { created_at: event.created_at + 1 }, { kind: 1 }, { tags: [["p", "cd".repeat(32)]] }, { sig: "00".repeat(64) }]) {
    assert.equal(verifyEvent({ ...event, ...change }), false, JSON.stringify(Object.keys(change)));
  }
  assert.equal(verifyEvent({ ...event, content: "A".repeat(20000) }), false);
  assert.equal(verifyEvent(null), false);
});

test("relay addresses must be public wss:// names", () => {
  assert.equal(validateRelayUrl("wss://relay.damus.io").ok, true);
  for (const bad of ["ws://relay.damus.io", "https://relay.damus.io", "wss://localhost", "wss://192.168.1.4", "wss://user:pw@relay.damus.io", "wss://relay.damus.io:8080", "wss://printer.local", "not a url", "wss://[::1]"]) {
    assert.equal(validateRelayUrl(bad).ok, false, bad);
  }
});

test("copying the app data directory to another phone cannot open the sealed store", async () => {
  const disk = new Map();
  const original = createSealedVault(memoryAdapter(disk, "phone-A"), { keyName: "k", dataName: "d" });
  await original.save({ secret: "ratchet state and contacts" });
  assert.equal((await original.open()).status, "ok");
  // The ciphertext (the data directory) is copied. The Keystore key stays in phone A.
  const copiedData = new Map([...disk].filter(([key]) => key.startsWith("data:")));
  const phoneB = createSealedVault(memoryAdapter(copiedData, "phone-B"), { keyName: "k", dataName: "d" });
  const opened = await phoneB.open();
  assert.equal(opened.status, "foreign");
  assert.equal(opened.value, null);
  // Even if the secret slot was copied too, a different phone cannot unwrap it.
  const everything = createSealedVault(memoryAdapter(new Map(disk), "phone-B"), { keyName: "k", dataName: "d" });
  assert.equal((await everything.open()).status, "foreign");
  // A flipped bit in the ciphertext is refused, not read.
  const sealed = disk.get("data:d");
  const box = unb64(sealed.box);
  box[5] ^= 1;
  disk.set("data:d", { ...sealed, box: b64(box) });
  assert.equal((await original.open()).status, "foreign");
});

test("the sealed ciphertext holds no plaintext", async () => {
  const disk = new Map();
  const vault = createSealedVault(memoryAdapter(disk, "A"), { keyName: "k", dataName: "d" });
  await vault.save({ note: "needle-in-haystack" });
  assert.equal(JSON.stringify([...disk]).includes("needle-in-haystack"), false);
  await vault.clear();
  assert.equal((await vault.open()).status, "empty");
});

test("online and web code never use Math.random, never write keys beside a disk write, and keep secrets in secure storage", () => {
  const files = [
    ...fs.readdirSync("symbolic/online").map((f) => `symbolic/online/${f}`),
    "symbolic/sealed_vault.js",
    ...(fs.existsSync("symbolic/web") ? fs.readdirSync("symbolic/web").map((f) => `symbolic/web/${f}`) : []),
    ..."src/phone/secure_adapter.native.js src/phone/sealed_stores.js src/phone/secure_adapter.js".split(" ")
  ];
  assert.ok(files.length >= 8);
  for (const file of files) {
    const body = fs.readFileSync(file, "utf8");
    assert.doesNotMatch(body.replace(/\/\/.*$/gm, ""), /Math\.random/, file);
    assert.deepEqual(auditStorageText(file, body), [], file);
  }
  const native = fs.readFileSync("src/phone/secure_adapter.native.js", "utf8");
  assert.match(native, /expo-secure-store/);
  assert.match(native, /WHEN_UNLOCKED_THIS_DEVICE_ONLY/);
});
