import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import { spawnSync } from "node:child_process";
import test, { after } from "node:test";
import { dispatchSymbol } from "./symbolic/ble_dispatch.js";
import { receive } from "./symbolic/radio_driver.js";
import {
  PASSIVE_SCAN_ARGS,
  connectArgs,
  connectMeshPeer,
  discoverMeshPeers,
  joinMesh
} from "./utils/mesh_utils.mjs";

const rootDir = path.dirname(new URL(import.meta.url).pathname);
const defaultOwnerFile = path.join(rootDir, "symbolic_memory/device_owner.json");
const defaultOwnerBefore = fs.existsSync(defaultOwnerFile) ? fs.readFileSync(defaultOwnerFile) : null;
after(() => {
  if (defaultOwnerBefore === null) fs.rmSync(defaultOwnerFile, { force: true });
  else fs.writeFileSync(defaultOwnerFile, defaultOwnerBefore);
});

const SCAN_NAME = "termux-bluetooth-scan";
const CONNECT_NAME = "termux-bluetooth-connect";
const NEAR = "AA:BB:CC:DD:EE:01";
const FAR = "11:22:33:44:55:66";
const OTHER = "AA:BB:CC:DD:EE:02";

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "yehsa-ble-"));
}

const PHONE = "abcd1234ef567890";

function paths(dir) {
  return {
    peersPath: path.join(dir, "peers.json"),
    linkPath: path.join(dir, "link.json"),
    phoneId: PHONE
  };
}

function writeScript(dir, name, body) {
  const file = path.join(dir, name);
  fs.writeFileSync(file, body);
  fs.chmodSync(file, 0o755);
  return file;
}

const PASSIVE_SCAN_SCRIPT = `#!/bin/sh
# YEHSA_PASSIVE_LE_SCAN
# LE passive low-power observer. Held link stays up.
printf '%s\\n' '{"devices":[]}'
`;

const PASSIVE_CONNECT_SCRIPT = `#!/bin/sh
# YEHSA_PASSIVE_LE_CONNECT
# keep-existing link stays up while another Yehsa peer is added.
printf '%s\\n' '{"ok":true}'
`;

let tokenChain = Promise.resolve();

function withToken(token, fn) {
  const run = tokenChain.then(async () => {
    const previous = process.env.YEHSA_MESH_TOKEN;
    if (token === undefined) delete process.env.YEHSA_MESH_TOKEN;
    else process.env.YEHSA_MESH_TOKEN = token;
    try {
      return await fn();
    } finally {
      if (previous === undefined) delete process.env.YEHSA_MESH_TOKEN;
      else process.env.YEHSA_MESH_TOKEN = previous;
    }
  });
  tokenChain = run.then(() => {}, () => {});
  return run;
}

test("passive scan arguments do not disconnect or start classic inquiry", () => {
  const joined = PASSIVE_SCAN_ARGS.join(" ");
  assert.match(joined, /--scan-type passive/);
  assert.match(joined, /--scan-mode low-power/);
  assert.match(joined, /--mode observer/);
  assert.match(joined, /--keep-link 1/);
  assert.match(joined, /--transport le/);
  assert.doesNotMatch(joined, /disconnect|startDiscovery|classic|bredr|inquiry|disable/i);
  const connect = connectArgs(NEAR).join(" ");
  assert.match(connect, /--keep-existing 1/);
  assert.match(connect, new RegExp(NEAR));
  assert.doesNotMatch(connect, /disconnect|disable|reset|unpair/i);
});

test("mesh utils uses execFile and does not start classic discovery", () => {
  const source = fs.readFileSync(new URL("./utils/mesh_utils.mjs", import.meta.url), "utf8");
  assert.match(source, /from "child_process"/);
  assert.match(source, /execFile/);
  assert.doesNotMatch(source, /\bexec\(/);
  assert.doesNotMatch(source, /execSync/);
  assert.doesNotMatch(source, /spawn\(/);
  assert.doesNotMatch(source, /startDiscovery\(/);
  const ble = fs.readFileSync(new URL("./symbolic/ble_dispatch.js", import.meta.url), "utf8");
  const dispatchBody = ble.slice(
    ble.indexOf("export function dispatchSymbol"),
    ble.indexOf("export function discoverBlePeers")
  );
  assert.doesNotMatch(dispatchBody, /joinMesh|discoverMeshPeers|termux-bluetooth-scan/);
});

test("degrades when Termux Bluetooth tools are absent", async () => {
  const dir = tempDir();
  const result = await discoverMeshPeers(paths(dir));
  assert.equal(result.ok, true);
  assert.equal(result.degraded, true);
  assert.equal(result.invoked, false);
  assert.equal(result.interfered, false);
  assert.equal(result.scanMode, "passive-observer");
  assert.equal(result.activeLink, null);
  assert.deepEqual(result.peers, []);
  assert.match(result.reason, /not installed/);
});

test("dry-run remembers a distant Yehsa peer and does not call the radio", async () => {
  const dir = tempDir();
  const calls = [];
  const result = await joinMesh({
    ...paths(dir),
    observations: [
      { name: "YEHSA-far", address: FAR, rssi: -95 },
      { name: "YEHSABLE", address: "10:00:00:00:00:09", rssi: -20 },
      { name: "Pixel", address: OTHER, rssi: -30 },
      {
        name: "sensor",
        address: "10:00:00:00:00:04",
        rssi: -110,
        serviceUuids: ["59454853-4100-4d45-5348-000000000001"]
      }
    ],
    runFile: () => {
      calls.push("radio");
    }
  });
  assert.equal(calls.length, 0);
  assert.equal(result.interfered, false);
  assert.equal(result.degraded, true);
  assert.equal(result.connected, false);
  assert.equal(result.link.primary.radio, false);
  assert.equal(result.link.primary.address, FAR);
  assert.equal(result.link.primary.held, true);
  const addresses = result.peers.map((peer) => peer.address).sort();
  assert.deepEqual(addresses, ["10:00:00:00:00:04", FAR].sort());
  const far = result.peers.find((peer) => peer.address === FAR);
  assert.equal(far.rssi, -95);
  assert.equal(far.owner, false);
  assert.equal(far.relation, "exterior-mesh-peer");
  assert.equal(result.localOwner.recognized, true);
  assert.equal(result.localOwner.ownership, "local-device");
  assert.equal(result.localOwner.exterior, "deny");
  assert.equal(result.localOwner.phoneWhitelist, "none");
  assert.equal(result.link.primary.owner, false);
});

test("refuses a classic inquiry helper and leaves the active link up", async () => {
  const dir = tempDir();
  const scan = writeScript(
    dir,
    SCAN_NAME,
    "#!/bin/sh\n# YEHSA_PASSIVE_LE_SCAN\nstartDiscovery\n"
  );
  const { peersPath, linkPath } = paths(dir);
  const primary = {
    primary: {
      address: NEAR,
      name: "YEHSA-near",
      transport: "le",
      radio: true,
      held: true,
      status: "connected",
      since: 1
    },
    secondary: null
  };
  fs.writeFileSync(linkPath, `${JSON.stringify(primary)}\n`);
  const calls = [];
  await withToken("mesh-token", async () => {
    const result = await discoverMeshPeers({
      peersPath,
      linkPath,
      phoneId: PHONE,
      resolveCommand: (name) => (name === SCAN_NAME ? scan : null),
      runFile: () => {
        calls.push("called");
      }
    });
    assert.equal(calls.length, 0);
    assert.equal(result.invoked, false);
    assert.equal(result.interfered, false);
    assert.match(result.reason, /classic inquiry/);
    assert.equal(result.activeLink.address, NEAR);
    assert.equal(result.activeLink.radio, true);
  });
});

test("requires the mesh token before a real scan", async () => {
  const dir = tempDir();
  const scan = writeScript(dir, SCAN_NAME, PASSIVE_SCAN_SCRIPT);
  const calls = [];
  await withToken(undefined, async () => {
    const result = await discoverMeshPeers({
      ...paths(dir),
      resolveCommand: (name) => (name === SCAN_NAME ? scan : null),
      runFile: () => {
        calls.push("called");
      }
    });
    assert.equal(calls.length, 0);
    assert.equal(result.invoked, false);
    assert.match(result.reason, /YEHSA_MESH_TOKEN/);
  });
});

test("joins a second peer without replacing the active link", async () => {
  const dir = tempDir();
  const scan = writeScript(dir, SCAN_NAME, PASSIVE_SCAN_SCRIPT);
  const connect = writeScript(dir, CONNECT_NAME, PASSIVE_CONNECT_SCRIPT);
  const { peersPath, linkPath } = paths(dir);
  fs.writeFileSync(linkPath, `${JSON.stringify({
    primary: {
      address: NEAR,
      name: "YEHSA-near",
      transport: "le",
      radio: true,
      held: true,
      status: "connected",
      since: 1
    },
    secondary: null
  })}\n`);
  const calls = [];
  const stdout = JSON.stringify({
    devices: [
      { name: "YEHSA-near", address: NEAR, rssi: -42 },
      { name: "YEHSA-far", address: FAR, rssi: -90 },
      { name: "Pixel", address: OTHER, rssi: -20 }
    ]
  });
  await withToken("mesh-token", async () => {
    const result = await joinMesh({
      peersPath,
      linkPath,
      phoneId: PHONE,
      resolveCommand: (name) => {
        if (name === SCAN_NAME) return scan;
        if (name === CONNECT_NAME) return connect;
        return null;
      },
      runFile(file, args, _options, cb) {
        calls.push({ file, args });
        if (file === scan) cb(null, stdout, "");
        else cb(null, "{\"ok\":true}\n", "");
      }
    });
    assert.equal(result.interfered, false);
    assert.equal(result.connected, true);
    assert.equal(result.link.primary.address, NEAR);
    assert.equal(result.link.primary.radio, true);
    assert.equal(result.link.secondary.address, FAR);
    assert.equal(result.link.secondary.radio, true);
    assert.equal(calls.length, 2);
    assert.deepEqual(calls[0].args, [...PASSIVE_SCAN_ARGS]);
    assert.deepEqual(calls[1].args, connectArgs(FAR));
    assert.equal(result.peers.some((peer) => peer.address === OTHER), false);
  });
});

test("a failed connect does not clear the primary link", async () => {
  const dir = tempDir();
  const scan = writeScript(dir, SCAN_NAME, PASSIVE_SCAN_SCRIPT);
  const connect = writeScript(dir, CONNECT_NAME, PASSIVE_CONNECT_SCRIPT);
  const { peersPath, linkPath } = paths(dir);
  fs.writeFileSync(linkPath, `${JSON.stringify({
    primary: {
      address: NEAR,
      name: "YEHSA-near",
      radio: true,
      held: true,
      since: 1
    },
    secondary: null
  })}\n`);
  await withToken("mesh-token", async () => {
    const result = await joinMesh({
      peersPath,
      linkPath,
      phoneId: PHONE,
      resolveCommand: (name) => (name === SCAN_NAME ? scan : connect),
      runFile(file, args, _options, cb) {
        if (path.basename(file) === SCAN_NAME) {
          cb(null, JSON.stringify({ devices: [{ name: "YEHSA-far", address: FAR, rssi: -80 }] }), "");
          return;
        }
        cb(new Error("connect failed"));
      }
    });
    assert.equal(result.ok, false);
    assert.equal(result.interfered, false);
    assert.equal(result.link.primary.address, NEAR);
    assert.equal(result.link.primary.radio, true);
    assert.equal(result.link.secondary, null);
  });
});

test("connect refuses an address that is not a remembered mesh peer", async () => {
  const dir = tempDir();
  const result = await connectMeshPeer(OTHER, { ...paths(dir), dryRun: true });
  assert.equal(result.ok, false);
  assert.equal(result.invoked, false);
  assert.match(result.reason, /not a remembered/);
});

test("radio receive discovers without dropping a held link", async () => {
  const dir = tempDir();
  const { peersPath, linkPath } = paths(dir);
  fs.writeFileSync(linkPath, `${JSON.stringify({
    primary: {
      address: NEAR,
      name: "YEHSA-near",
      radio: true,
      held: true,
      since: 1
    },
    secondary: null
  })}\n`);
  const message = await receive(undefined, {
    peersPath,
    linkPath,
    phoneId: PHONE,
    observations: [
      { name: "YEHSA-near", address: NEAR, rssi: -40 },
      { name: "YEHSA-far", address: FAR, rssi: -99 }
    ]
  });
  assert.equal(message.symbol, "echo");
  assert.equal(message.action, "return_ping");
  assert.equal(message.interfered, false);
  assert.equal(message.link.primary.address, NEAR);
  assert.equal(message.link.primary.radio, true);
  assert.equal(message.link.secondary.address, FAR);
  assert.equal(message.link.secondary.radio, false);
  assert.equal(message.peers.length, 2);
});

test("symbol dispatch stays a queue and send, not a scan", () => {
  const queue = "symbolic_memory/mesh_queue.jsonl";
  const existed = fs.existsSync(queue);
  const before = existed ? fs.readFileSync(queue, "utf8") : "";
  const payload = dispatchSymbol("mesh-probe-symbol");
  assert.equal(payload.channel, "ble");
  assert.equal(payload.symbol, "mesh-probe-symbol");
  assert.equal(typeof payload.then, "undefined");
  const after = fs.readFileSync(queue, "utf8");
  assert.match(after, /mesh-probe-symbol/);
  if (existed) fs.writeFileSync(queue, before);
  else fs.rmSync(queue, { force: true });
});

test("discover CLI degrades cleanly without Termux", () => {
  const root = path.dirname(new URL(import.meta.url).pathname);
  const peersFile = path.join(root, "symbolic_memory/mesh_peers.json");
  const ownerFile = path.join(root, "symbolic_memory/device_owner.json");
  const before = fs.existsSync(peersFile) ? fs.readFileSync(peersFile) : null;
  const ownerBefore = fs.existsSync(ownerFile) ? fs.readFileSync(ownerFile) : null;
  const out = spawnSync(process.execPath, ["utils/mesh_utils.mjs", "discover"], {
    cwd: root,
    env: { ...process.env, YEHSA_MESH_DRY_RUN: "1" },
    encoding: "utf8"
  });
  try {
    assert.notEqual(out.status, 0);
    const parsed = JSON.parse(out.stdout);
    assert.equal(parsed.ok, false);
    assert.equal(parsed.invoked, false);
    assert.equal(parsed.interfered, false);
    assert.match(parsed.reason, /no phone identity/);
    if (ownerBefore === null) assert.equal(fs.existsSync(ownerFile), false);
  } finally {
    if (before === null) fs.rmSync(peersFile, { force: true });
    else fs.writeFileSync(peersFile, before);
    if (ownerBefore === null) fs.rmSync(ownerFile, { force: true });
    else fs.writeFileSync(ownerFile, ownerBefore);
  }
});
