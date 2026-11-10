import assert from "node:assert/strict";
import test from "node:test";
import { attachOwner, initialMeshSession, queueServiceText } from "./symbolic/phone_mesh.js";
import {
  acceptOnce,
  chunkEnvelope,
  deleteChat,
  generateIdentity,
  meshChunkText,
  openAtRest,
  openDirect,
  publicCard,
  qrPayload,
  reassembleChunks,
  relayEnvelope,
  safetyNumber,
  sealAtRest,
  sealDirect,
  storageKeyFrom,
  sweepExpired
} from "./symbolic/peer_chat.js";

test("two peers round-trip, a tamper is rejected, and a relay cannot read", () => {
  const alice = generateIdentity();
  const bob = generateIdentity();
  const relay = generateIdentity();
  const envelope = sealDirect(alice, publicCard(bob), "meet at the ridge");
  assert.equal(JSON.stringify(publicCard(alice)).includes(alice.boxSecret), false);
  assert.equal(JSON.stringify(qrPayload(alice)).includes(alice.signSecret), false);
  const opened = openDirect(bob, envelope);
  assert.equal(opened.ok, true);
  assert.equal(opened.text, "meet at the ridge");
  assert.equal(opened.location, null);

  const tampered = { ...envelope, box: `${envelope.box.slice(0, -2)}aa` };
  assert.equal(openDirect(bob, tampered).ok, false);

  const forwarded = relayEnvelope(envelope);
  assert.equal(openDirect(relay, forwarded).ok, false);
  assert.equal(openDirect(bob, forwarded).text, "meet at the ridge");
  assert.equal(safetyNumber(alice.boxPublic, bob.boxPublic), safetyNumber(bob.boxPublic, alice.boxPublic));
});

test("replay is rejected, chunks reassemble, and the held mesh link is not replaced", () => {
  const alice = generateIdentity();
  const bob = generateIdentity();
  const envelope = sealDirect(alice, publicCard(bob), "second");
  let seen = new Set();
  const first = acceptOnce(seen, envelope);
  assert.equal(first.ok, true);
  seen = first.seen;
  assert.equal(acceptOnce(seen, envelope).ok, false);

  const parts = chunkEnvelope(envelope, 80);
  assert.ok(parts.length > 1);
  assert.ok(parts.every((part) => meshChunkText(part).length < 500));
  const rebuilt = reassembleChunks(parts);
  assert.equal(openDirect(bob, rebuilt).text, "second");

  const owner = { recognized: true, source: "test", exterior: "deny" };
  const session = attachOwner({ ...initialMeshSession(), link: { primary: { radio: true, address: "aa" }, secondary: null } }, owner);
  const queued = queueServiceText(session, meshChunkText(parts[0]));
  assert.equal(queued.ok, true);
  assert.equal(queued.session.link.primary.address, "aa");
  assert.equal(queued.item.text.includes("second"), false);
  assert.equal(queued.positionShared, false);
});

test("location is omitted unless opted in, and stored messages stay sealed", () => {
  const alice = generateIdentity();
  const bob = generateIdentity();
  const quiet = sealDirect(alice, publicCard(bob), "sos", { includeLocation: false, fix: { latitude: 10, longitude: 20 } });
  assert.equal(openDirect(bob, quiet).location, null);
  const loud = sealDirect(alice, publicCard(bob), "sos", { includeLocation: true, fix: { latitude: 10, longitude: 20 } });
  assert.equal(openDirect(bob, loud).location.latitude, 10);

  const key = storageKeyFrom(alice);
  const sealed = sealAtRest([{ peerId: "bob", text: "hidden" }], key);
  assert.equal(JSON.stringify(sealed).includes("hidden"), false);
  assert.equal(openAtRest(sealed, key)[0].text, "hidden");
  const kept = sweepExpired([{ expireAt: 5, text: "old" }, { expireAt: 50, text: "new" }], 10);
  assert.equal(kept.length, 1);
  assert.equal(deleteChat([{ peerId: "bob" }, { peerId: "cara" }], "bob").length, 1);
});
