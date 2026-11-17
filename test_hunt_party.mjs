import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { generateIdentity, publicCard, openDirect } from "./symbolic/peer_chat.js";
import { MAX_MINUTES, MIN_MINUTES, addMember, buildUpdates, dueForUpdate, emptyRoster, isSharing, noteSent, shareLine, startSession, stopSession, tickSession, verifiedMembers, verifyMember } from "./symbolic/hunt/party.js";
import { keyFromText, keyToText, newKey, open, seal } from "./symbolic/hunt/secure_box.js";
import { base64, timeline, toMorse, totalMs, wavBytes } from "./symbolic/morse_signal.js";
import { creditLine, guideView, pictureHealth } from "./symbolic/picture_guide.js";
import manifest from "./assets/pictures/manifest.json" with { type: "json" };

const me = generateIdentity();
const sam = generateIdentity();
const fix = { latitude: 44.8, longitude: -68.8 };

function verifiedRoster() {
  let roster = emptyRoster();
  const added = addMember(roster, { name: "Sam", card: publicCard(sam), me });
  assert.equal(added.ok, true);
  roster = added.roster;
  const bad = verifyMember(roster, added.member.id, "1234 5678");
  assert.equal(bad.ok, false);
  const good = verifyMember(roster, added.member.id, added.member.safety);
  assert.equal(good.ok, true);
  return { roster: good.roster, id: added.member.id };
}

test("a contact is not trusted until the typed safety number matches", () => {
  let roster = emptyRoster();
  const added = addMember(roster, { name: "Sam", card: publicCard(sam), me });
  assert.equal(added.member.verified, false);
  assert.equal(verifiedMembers(added.roster).length, 0);
  assert.equal(startSession(added.roster, { memberIds: [added.member.id] }).ok, false);
  assert.equal(addMember(added.roster, { name: "Me", card: publicCard(me), me }).ok, false);
});

test("sharing is a timed session that stops by itself", () => {
  const { roster, id } = verifiedRoster();
  const t0 = Date.UTC(2026, 10, 17, 14);
  const started = startSession(roster, { memberIds: [id], minutes: 30, now: t0 });
  assert.equal(started.ok, true);
  assert.equal(isSharing(started.roster, t0 + 10 * 60000), true);
  assert.match(shareLine(started.roster), /Shares your spot with Sam until .* Stop anytime\./);
  const later = tickSession(started.roster, t0 + 31 * 60000);
  assert.equal(isSharing(later, t0 + 31 * 60000), false);
  assert.equal(later.session.stoppedBecause, "ended");
  assert.equal(startSession(roster, { memberIds: [id], minutes: 1, now: t0 }).session.endsAt - t0, MIN_MINUTES * 60000);
  assert.equal(startSession(roster, { memberIds: [id], minutes: 99999, now: t0 }).session.endsAt - t0, MAX_MINUTES * 60000);
});

test("nothing is sealed unless a session runs, consent is on, a fix is held, and the member is verified", () => {
  const { roster, id } = verifiedRoster();
  const t0 = Date.UTC(2026, 10, 17, 14);
  assert.deepEqual(buildUpdates(roster, me, { fix, consent: true, now: t0 }), []);
  const { roster: running } = startSession(roster, { memberIds: [id], minutes: 60, now: t0 });
  assert.deepEqual(buildUpdates(running, me, { fix, consent: false, now: t0 + 1000 }), []);
  assert.deepEqual(buildUpdates(running, me, { fix: null, consent: true, now: t0 + 1000 }), []);
  const updates = buildUpdates(running, me, { fix, consent: true, now: t0 + 1000 });
  assert.equal(updates.length, 1);
  const opened = openDirect(sam, updates[0].envelope);
  assert.ok(opened);
  assert.deepEqual(buildUpdates(stopSession(running), me, { fix, consent: true, now: t0 + 2000 }), []);
  assert.deepEqual(buildUpdates(running, me, { fix, consent: true, now: t0 + 61 * 60000 }), []);
  assert.equal(dueForUpdate(running, t0 + 1000), true);
  assert.equal(dueForUpdate(noteSent(running, t0 + 1000), t0 + 2000), false);
});

test("sealed storage round-trips and a wrong key opens nothing", () => {
  const key = newKey();
  const sealed = seal({ entries: [{ note: "private" }] }, key);
  assert.doesNotMatch(JSON.stringify(sealed), /private/);
  assert.deepEqual(open(sealed, key), { entries: [{ note: "private" }] });
  assert.equal(open(sealed, newKey()), null);
  assert.deepEqual(Array.from(keyFromText(keyToText(key))), Array.from(key));
});

test("morse timing: SOS is 3 short, 3 long, 3 short, with the right gaps", () => {
  assert.equal(toMorse("SOS"), "... --- ...");
  const steps = timeline("SOS", 100).filter((step) => step.on).map((step) => step.ms);
  assert.deepEqual(steps, [100, 100, 100, 300, 300, 300, 100, 100, 100]);
  assert.equal(totalMs(timeline("e", 100)), 100 + 700);
  assert.equal(timeline("   ").length, 1);
});

test("morse tone is a valid WAV and base64 is exact", () => {
  const wav = wavBytes("e", { unitMs: 100, rate: 8000 });
  assert.equal(String.fromCharCode(...wav.slice(0, 4)), "RIFF");
  assert.equal(String.fromCharCode(...wav.slice(8, 12)), "WAVE");
  assert.equal(wav.length, 44 + Math.round(0.1 * 8000) + Math.round(0.7 * 8000));
  assert.equal(base64(new Uint8Array([77, 97, 110])), "TWFu");
  assert.equal(base64(new Uint8Array([77, 97])), "TWE=");
  assert.equal(base64(new Uint8Array([77])), "TQ==");
});

test("every guide entry has a picture, every credit is short and clean, and none are doubled", () => {
  const view = guideView(manifest);
  for (const entry of view) assert.equal(entry.placeholder, false, `${entry.title} has no picture`);
  assert.equal(pictureHealth(manifest, fs.readdirSync("public/pictures/files")).length, 0);
  for (const image of manifest.images) {
    const line = creditLine(image);
    assert.ok(line.length < 100, line);
    assert.doesNotMatch(line, /File:|\.jpg|\.png/i);
    const parts = line.split(/[.,]\s*/);
    assert.equal(new Set(parts).size, parts.length, `doubled credit: ${line}`);
  }
  assert.equal(creditLine({ author: "Rama", license: "CC BY-SA 3.0 fr" }), "Rama, CC BY-SA 3.0 fr");
  for (const symbol of ["unknown_plant", "toxic_vs_edible", "frostbite_warming", "watershed"]) {
    assert.ok(manifest.images.some((image) => image.symbol === symbol && /commons\.wikimedia\.org/.test(image.sourceUrl) && !/NC|ND|GFDL/.test(image.license)), symbol);
  }
  for (const file of fs.readdirSync("assets/pictures").filter((name) => name.endsWith(".webp"))) {
    assert.ok(fs.existsSync(`public/pictures/files/${file}`), `${file} missing from public copy`);
  }
});
