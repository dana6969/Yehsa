import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { GPS_ARGS, lockPosition } from "./symbolic/position_lock.js";
import { ensureLocalOwner } from "./symbolic/device_owner.js";
import { meshPhoneService, sendMeshMessage } from "./utils/mesh_service.mjs";
import {
  applyConnect,
  applyScan,
  attachOwner,
  initialMeshSession,
  queueServiceText
} from "./symbolic/phone_mesh.js";

const FAR = "11:22:33:44:55:66";

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "yehsa-svc-"));
}

const PHONE = "abcd1234ef567890";

function paths(dir) {
  return {
    peersPath: path.join(dir, "peers.json"),
    linkPath: path.join(dir, "link.json"),
    ownerPath: path.join(dir, "owner.json"),
    positionPath: path.join(dir, "position.json"),
    queuePath: path.join(dir, "queue.jsonl"),
    phoneId: PHONE
  };
}

test("offline phone service stays up without a position lock", async () => {
  const dir = tempDir();
  const file = paths(dir);
  let locationCalls = 0;
  const phone = await meshPhoneService({
    ...file,
    observations: [{ name: "YEHSA-far", address: FAR, rssi: -70 }],
    runFile() {
      locationCalls += 1;
    }
  });
  assert.equal(locationCalls, 0);
  assert.equal(phone.service, "offline-phone");
  assert.equal(phone.cellular, false);
  assert.equal(phone.billing, "none");
  assert.equal(phone.staysUp, true);
  assert.equal(phone.dependsOnPosition, false);
  assert.equal(phone.positionLock, "opt-in");
  assert.equal(phone.positionShared, false);
  assert.equal(phone.interfered, false);
  assert.equal(phone.peerCount, 1);
  assert.equal(phone.activeLink.owner, false);
  assert.equal(fs.existsSync(file.positionPath), false);
});

test("position lock does nothing until local consent", async () => {
  const dir = tempDir();
  const file = paths(dir);
  ensureLocalOwner({ ownerPath: file.ownerPath, phoneId: PHONE });
  let calls = 0;
  const refused = await lockPosition({
    ...file,
    share: true,
    fix: { latitude: 44.7, longitude: -69.8, accuracy: 5 },
    runFile() {
      calls += 1;
    },
    send() {
      calls += 1;
    }
  });
  assert.equal(refused.locked, false);
  assert.equal(refused.shared, false);
  assert.match(refused.reason, /opt-in/);
  assert.equal(calls, 0);
  assert.equal(fs.existsSync(file.positionPath), false);
});

test("consented lock uses the satellite gps provider and does not share", async () => {
  const dir = tempDir();
  const file = paths(dir);
  ensureLocalOwner({ ownerPath: file.ownerPath, phoneId: PHONE });
  const calls = [];
  const locked = await lockPosition({
    ...file,
    consent: true,
    ingress: "local",
    runFile(cmd, args, _opts, cb) {
      calls.push({ cmd, args });
      cb(null, JSON.stringify({
        latitude: 44.7128,
        longitude: -69.0123,
        accuracy: 4,
        provider: "gps"
      }));
    },
    send() {
      calls.push("send");
    }
  });
  assert.equal(locked.locked, true);
  assert.equal(locked.shared, false);
  assert.equal(locked.source, "gnss");
  assert.equal(locked.fix.latitude, 44.7128);
  assert.deepEqual(calls, [{ cmd: "termux-location", args: [...GPS_ARGS] }]);
  const saved = JSON.parse(fs.readFileSync(file.positionPath, "utf8"));
  assert.equal(saved.provider, "gps");
  assert.equal(saved.shared, false);
  assert.equal(saved.exterior, "deny");
});

test("a local coordinate is used when the satellite helper is absent", async () => {
  const dir = tempDir();
  const file = paths(dir);
  ensureLocalOwner({ ownerPath: file.ownerPath, phoneId: PHONE });
  const locked = await lockPosition({
    ...file,
    consent: true,
    fix: { latitude: 45, longitude: -70, accuracy: 12 }
  });
  assert.equal(locked.locked, true);
  assert.equal(locked.source, "local-coords");
  assert.equal(locked.shared, false);
  const missing = await lockPosition({
    ...file,
    consent: true,
    positionPath: path.join(dir, "none.json"),
    runFile(_cmd, _args, _opts, cb) {
      const err = new Error("spawn termux-location ENOENT");
      err.code = "ENOENT";
      cb(err, "");
    }
  });
  assert.equal(missing.locked, false);
  assert.equal(missing.degraded, true);
  assert.match(missing.reason, /not installed/);
});

test("network and peer fixes are not a position lock", async () => {
  const dir = tempDir();
  const file = paths(dir);
  ensureLocalOwner({ ownerPath: file.ownerPath, phoneId: PHONE });
  const network = await lockPosition({
    ...file,
    consent: true,
    runFile(_c, _a, _o, cb) {
      cb(null, JSON.stringify({ latitude: 1, longitude: 2, accuracy: 30, provider: "network" }));
    }
  });
  assert.equal(network.locked, false);
  assert.match(network.reason, /satellite fix unavailable/);
  const exterior = await lockPosition({
    ...file,
    consent: true,
    share: true,
    ingress: "ble",
    fix: { latitude: 10, longitude: 10 }
  });
  assert.equal(exterior.ok, false);
  assert.equal(exterior.reason, "exterior denied");
  assert.equal(fs.existsSync(file.positionPath), false);
});

test("sharing requires consent and does not drop the held link", async () => {
  const dir = tempDir();
  const file = paths(dir);
  ensureLocalOwner({ ownerPath: file.ownerPath, phoneId: PHONE });
  const link = {
    primary: { address: FAR, name: "YEHSA-far", radio: true, held: true, since: 1 },
    secondary: null
  };
  fs.writeFileSync(file.linkPath, `${JSON.stringify(link)}\n`);
  const sent = [];
  const shared = await lockPosition({
    ...file,
    consent: true,
    share: true,
    fix: { latitude: 44.1, longitude: -69.2, accuracy: 3 },
    send(payload) {
      sent.push(payload);
    }
  });
  assert.equal(shared.shared, true);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].service, "position");
  assert.equal(JSON.stringify(sent[0]).includes("disconnect"), false);
  const still = JSON.parse(fs.readFileSync(file.linkPath, "utf8"));
  assert.equal(still.primary.address, FAR);
  assert.equal(still.primary.radio, true);
});

test("a mesh phone message carries no coordinates", () => {
  const dir = tempDir();
  const file = paths(dir);
  ensureLocalOwner({ ownerPath: file.ownerPath, phoneId: PHONE });
  const sent = [];
  const message = sendMeshMessage("three flashes, staying at the ridge", {
    ...file,
    send(payload) {
      sent.push(payload);
    }
  });
  assert.equal(message.ok, true);
  assert.equal(message.positionShared, false);
  assert.equal(sent[0].service, "offline-phone");
  assert.equal(Object.hasOwn(sent[0], "latitude"), false);
  const queued = fs.readFileSync(file.queuePath, "utf8");
  assert.equal(queued.includes("latitude"), false);
  const rejected = sendMeshMessage("", file);
  assert.equal(rejected.ok, false);
});

test("phone service cli does not lock position", () => {
  const root = path.dirname(new URL(import.meta.url).pathname);
  const ownerFile = path.join(root, "symbolic_memory/device_owner.json");
  const peersFile = path.join(root, "symbolic_memory/mesh_peers.json");
  const positionFile = path.join(root, "symbolic_memory/position_lock.json");
  const beforeOwner = fs.existsSync(ownerFile) ? fs.readFileSync(ownerFile) : null;
  const beforePeers = fs.existsSync(peersFile) ? fs.readFileSync(peersFile) : null;
  const out = spawnSync(process.execPath, ["utils/mesh_service.mjs"], {
    cwd: root,
    env: { ...process.env, YEHSA_MESH_DRY_RUN: "1" },
    encoding: "utf8"
  });
  try {
    assert.notEqual(out.status, 0);
    const parsed = JSON.parse(out.stdout);
    assert.equal(parsed.available, false);
    assert.equal(parsed.staysUp, false);
    assert.equal(parsed.positionShared, false);
    assert.equal(fs.existsSync(positionFile), false);
    if (beforeOwner === null) assert.equal(fs.existsSync(ownerFile), false);
  } finally {
    if (beforeOwner === null) fs.rmSync(ownerFile, { force: true });
    else fs.writeFileSync(ownerFile, beforeOwner);
    if (beforePeers === null) fs.rmSync(peersFile, { force: true });
    else fs.writeFileSync(peersFile, beforePeers);
    fs.rmSync(positionFile, { force: true });
  }
});

test("the phone mesh adapter scans only real peers and keeps the phone hook without a position lock", () => {
  const owner = { recognized: true, source: "expo-install", exterior: "deny", encryption: "none" };
  const bound = attachOwner(initialMeshSession(), owner);
  assert.equal(bound.phone.available, true);
  assert.equal(bound.phone.dependsOnPosition, false);
  assert.equal(bound.phone.cellular, false);
  assert.equal(bound.phone.billing, "none");
  assert.equal(bound.phone.positionLock, "opt-in");

  const invented = applyScan(bound, {
    available: false,
    invoked: false,
    peers: [{ name: "YEHSA-fake", address: FAR, rssi: -40 }],
    reason: "This runtime has no Bluetooth API. No peers were invented."
  });
  assert.equal(invented.degraded, true);
  assert.equal(invented.invoked, false);
  assert.equal(invented.peers.length, 0);
  assert.equal(invented.interfered, false);
  assert.match(invented.reason, /No peers were invented/);

  const heard = applyScan(bound, {
    available: true,
    invoked: true,
    scanMode: "passive-observer",
    peers: [
      { name: "YEHSA-near", address: "AA:BB:CC:DD:EE:01", rssi: -40 },
      { name: "Other Radio", address: "AA:BB:CC:DD:EE:09", rssi: -30 }
    ]
  });
  assert.equal(heard.degraded, false);
  assert.equal(heard.peers.length, 1);
  assert.equal(heard.peers[0].owner, false);
  assert.equal(heard.peers[0].relation, "exterior-mesh-peer");
  assert.equal(heard.link.primary, null);

  const linked = applyConnect(heard, "AA:BB:CC:DD:EE:01", { radio: true });
  assert.equal(linked.ok, true);
  assert.equal(linked.interfered, false);
  assert.equal(linked.session.link.primary.radio, true);
  assert.equal(linked.session.link.primary.address, "AA:BB:CC:DD:EE:01");

  const second = applyConnect(linked.session, FAR, { radio: false });
  assert.equal(second.ok, false);
  assert.match(second.reason, /not a remembered/);
  assert.equal(second.session.link.primary.radio, true);

  const extra = applyScan(linked.session, {
    available: true,
    invoked: true,
    peers: [{ name: "YEHSA-far", address: FAR, rssi: -80 }]
  });
  assert.equal(extra.link.primary.radio, true);
  assert.equal(extra.link.primary.address, "AA:BB:CC:DD:EE:01");
  const joined = applyConnect(extra, FAR, { radio: true });
  assert.equal(joined.ok, true);
  assert.equal(joined.interfered, false);
  assert.equal(joined.session.link.primary.address, "AA:BB:CC:DD:EE:01");
  assert.equal(joined.session.link.secondary.address, FAR);
  assert.equal(joined.session.link.secondary.owner, false);

  const replaced = applyConnect(joined.session, FAR, { radio: true });
  assert.equal(replaced.session.link.primary.address, "AA:BB:CC:DD:EE:01");
  assert.equal(replaced.interfered, false);

  const note = queueServiceText(bound, "three flashes, staying at the ridge");
  assert.equal(note.ok, true);
  assert.equal(note.transmitted, false);
  assert.equal(note.positionShared, false);
  assert.equal(note.session.phone.dependsOnPosition, false);
  assert.equal(note.session.phone.available, true);
  assert.equal(JSON.stringify(note.item).includes("latitude"), false);
  const denied = queueServiceText(initialMeshSession(), "hello");
  assert.equal(denied.ok, false);
  assert.match(denied.reason, /ownership/);
});
