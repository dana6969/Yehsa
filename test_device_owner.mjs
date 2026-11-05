import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import { describe, test } from "node:test";
import { ensureLocalOwner } from "./symbolic/device_owner.js";
import { localConfirm } from "./symbolic/biometric_lock.js";
import { admitLocalIngress, bindHost, isLoopbackAddress } from "./symbolic/mesh_guard.js";
import { receiveMeshCommand } from "./symbolic/mesh_listener.js";
import { discoverMeshPeers } from "./utils/mesh_utils.mjs";

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "yehsa-owner-"));
}

const PHONE = "abcd1234ef567890";
const OTHER_PHONE = "1234abcd5678ef90";

describe("per-device ownership and exterior deny", { concurrency: 1 }, () => {
  test("identity labels are phone-bound and claim no cipher", () => {
    const identity = JSON.parse(fs.readFileSync("yesha_modules/config/identity.json", "utf8"));
    assert.equal(identity.origin, "local-device");
    assert.equal(identity.ownership, "per-device");
    assert.equal(identity.access, "this-phone");
    assert.equal(identity.security_tier, "phone-bound");
    assert.equal(identity.encryption, "none");
    assert.equal(identity.exterior_access, "deny");
    assert.equal(identity.install_scope, "every-phone");
    assert.equal(identity.phone_whitelist, "none");
    assert.equal(identity.linked_identity.binding, "this-phone");
    assert.equal(identity.linked_identity.attestation, "android-id");
    assert.equal(identity.linked_identity.exterior, "deny");
    assert.equal(identity.linked_identity.phone_whitelist, "none");
  });

  test("unlock, erase, and shutdown refuse when this is not the bound phone", async () => {
    assert.equal(await localConfirm("unlock"), false);
    assert.equal(await localConfirm("erase"), false);
    assert.equal(await localConfirm("shutdown"), false);
    assert.equal(await localConfirm("speak"), true);
  });

  test("a machine without a phone id is refused and no owner file is written", () => {
    const dir = tempDir();
    const ownerPath = path.join(dir, "owner.json");
    const owner = ensureLocalOwner({ ownerPath });
    assert.equal(owner.recognized, false);
    assert.equal(owner.phoneBound, false);
    assert.match(owner.reason, /no phone identity/);
    assert.equal(fs.existsSync(ownerPath), false);
  });

  test("each install on this phone gets its own owner id", () => {
    const dir = tempDir();
    const firstPath = path.join(dir, "a.json");
    const secondPath = path.join(dir, "b.json");
    const first = ensureLocalOwner({ ownerPath: firstPath, phoneId: PHONE });
    const second = ensureLocalOwner({ ownerPath: secondPath, phoneId: PHONE });
    const again = ensureLocalOwner({ ownerPath: firstPath, phoneId: PHONE });
    assert.equal(first.recognized, true);
    assert.equal(first.phoneBound, true);
    assert.equal(second.recognized, true);
    assert.equal(again.installId, first.installId);
    assert.notEqual(first.installId, second.installId);
    assert.equal(first.ownership, "local-device");
    assert.equal(first.exterior, "deny");
    assert.equal(first.installScope, "every-phone");
    assert.equal(first.phoneWhitelist, "none");
    assert.equal(first.binding, "this-phone");
    const other = ensureLocalOwner({ ownerPath: firstPath, phoneId: OTHER_PHONE });
    assert.equal(other.recognized, false);
    assert.match(other.reason, /not this phone/);
  });

  test("a copied owner file is not this device and is not rewritten", () => {
    const dir = tempDir();
    const ownerPath = path.join(dir, "owner.json");
    const foreign = {
      ownership: "local-device",
      exterior: "deny",
      installId: "ab".repeat(16),
      deviceMark: "ff".repeat(32),
      phoneWhitelist: "none"
    };
    fs.writeFileSync(ownerPath, `${JSON.stringify(foreign)}\n`);
    const before = fs.readFileSync(ownerPath);
    const owner = ensureLocalOwner({ ownerPath, phoneId: PHONE });
    assert.equal(owner.recognized, false);
    assert.equal(owner.phoneBound, true);
    assert.equal(owner.reason, "owner file is not this phone");
    assert.equal(owner.installId, null);
    assert.deepEqual(fs.readFileSync(ownerPath), before);
  });

  test("listeners cannot bind outside loopback", () => {
    const previous = process.env.YEHSA_BIND_HOST;
    try {
      for (const exterior of ["0.0.0.0", "::", "192.168.1.20", "203.0.113.8", "2001:db8::1"]) {
        process.env.YEHSA_BIND_HOST = exterior;
        assert.equal(bindHost(), null, exterior);
      }
      process.env.YEHSA_BIND_HOST = "127.0.0.1";
      assert.equal(bindHost(), "127.0.0.1");
      process.env.YEHSA_BIND_HOST = "::1";
      assert.equal(bindHost(), "127.0.0.1");
      delete process.env.YEHSA_BIND_HOST;
      assert.equal(bindHost(), "127.0.0.1");
      assert.equal(isLoopbackAddress("::ffff:127.0.0.1"), true);
      assert.equal(isLoopbackAddress("::ffff:8.8.8.8"), false);
      assert.equal(isLoopbackAddress(undefined), false);
    } finally {
      if (previous === undefined) delete process.env.YEHSA_BIND_HOST;
      else process.env.YEHSA_BIND_HOST = previous;
    }
  });

  test("ingress from outside the device is denied", () => {
    const dir = tempDir();
    const ownerPath = path.join(dir, "owner.json");
    ensureLocalOwner({ ownerPath, phoneId: PHONE });
    const previous = process.env.YEHSA_MESH_TOKEN;
    delete process.env.YEHSA_MESH_TOKEN;
    try {
      const remote = admitLocalIngress({
        remoteAddress: "203.0.113.5",
        presentedToken: "nope",
        symbol: "echo",
        ownerPath,
        phoneId: PHONE
      });
      assert.equal(remote.ok, false);
      assert.equal(remote.status, 403);
      assert.equal(remote.error, "exterior denied");

      const missing = admitLocalIngress({
        remoteAddress: undefined,
        presentedToken: "nope",
        symbol: "echo",
        ownerPath,
        phoneId: PHONE
      });
      assert.equal(missing.error, "exterior denied");

      const local = admitLocalIngress({
        remoteAddress: "::ffff:127.0.0.1",
        presentedToken: "",
        symbol: "echo",
        ownerPath,
        phoneId: PHONE
      });
      assert.equal(local.status, 503);
      assert.equal(local.error, "YEHSA_MESH_TOKEN is not set");

      const foreignPath = path.join(dir, "foreign.json");
      fs.writeFileSync(foreignPath, `${JSON.stringify({
        ownership: "local-device",
        exterior: "deny",
        installId: "cd".repeat(16),
        deviceMark: "11".repeat(32)
      })}\n`);
      const transplanted = admitLocalIngress({
        remoteAddress: "127.0.0.1",
        presentedToken: "nope",
        symbol: "echo",
        ownerPath: foreignPath,
        phoneId: PHONE
      });
      assert.equal(transplanted.status, 403);
      assert.equal(transplanted.error, "device ownership denied");
      const tokenOnly = admitLocalIngress({
        remoteAddress: "127.0.0.1",
        presentedToken: "mesh-token-not-enough",
        symbol: "echo"
      });
      assert.equal(tokenOnly.status, 403);
      assert.match(tokenOnly.error, /no phone identity/);
    } finally {
      if (previous === undefined) delete process.env.YEHSA_MESH_TOKEN;
      else process.env.YEHSA_MESH_TOKEN = previous;
    }
  });

  test("a BLE or mesh payload cannot execute inside this install", () => {
    const denied = receiveMeshCommand({
      symbol: "echo",
      action: "return_ping",
      ingress: "ble",
      localOwner: false
    });
    assert.deepEqual(denied, { ok: false, error: "exterior denied" });
    const unlabeled = receiveMeshCommand({ symbol: "echo", action: "return_ping" });
    assert.equal(unlabeled.error, "exterior denied");
  });

  test("mesh discovery does not run for a transplanted owner file", async () => {
    const dir = tempDir();
    const ownerPath = path.join(dir, "owner.json");
    const peersPath = path.join(dir, "peers.json");
    fs.writeFileSync(ownerPath, `${JSON.stringify({
      ownership: "local-device",
      exterior: "deny",
      installId: "ef".repeat(16),
      deviceMark: "22".repeat(32)
    })}\n`);
    const before = fs.readFileSync(ownerPath);
      const result = await discoverMeshPeers({
      ownerPath,
      phoneId: PHONE,
      peersPath,
      linkPath: path.join(dir, "link.json"),
      observations: [{ name: "YEHSA-far", address: "11:22:33:44:55:66", rssi: -90 }]
    });
    assert.equal(result.ok, false);
    assert.equal(result.reason, "owner file is not this phone");
    assert.equal(result.invoked, false);
    assert.equal(result.interfered, false);
    assert.equal(result.localOwner.recognized, false);
    assert.equal(fs.existsSync(peersPath), false);
    assert.deepEqual(fs.readFileSync(ownerPath), before);
  });
});
