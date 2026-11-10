import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import test from "node:test";
import { createPeerVault, memoryAdapter, secureStoreOptions } from "./symbolic/peer_vault.js";
import { generateIdentity } from "./symbolic/peer_chat.js";

test("a secure-store mock round trip keeps the key and seals history", async () => {
  const vault = createPeerVault(memoryAdapter());
  const { identity } = await vault.loadOrCreate();
  const options = await vault.saveIdentity(identity);
  assert.equal(options.keychainAccessible, "WHEN_UNLOCKED_THIS_DEVICE_ONLY");
  assert.equal(options.requireAuthentication, false);
  assert.equal(secureStoreOptions(true).requireAuthentication, true);
  assert.equal(secureStoreOptions(true).keychainService, "yehsa.peer.auth");
  const sealed = await vault.saveHistory({ messages: [{ text: "hidden ridge" }], peers: {} });
  assert.equal(JSON.stringify(sealed).includes("hidden ridge"), false);
  assert.equal((await vault.loadHistory()).messages[0].text, "hidden ridge");
  const native = fs.readFileSync("src/phone/mesh_keys.native.js", "utf8");
  assert.match(native, /WHEN_UNLOCKED_THIS_DEVICE_ONLY/);
  assert.match(native, /requireAuthentication/);
  assert.match(native, /expo-secure-store/);
  assert.match(native, /historyKey/);
  assert.doesNotMatch(native, /Math\.random/);
});

test("prebuild keeps peer keys out of Android backup", () => {
  const manifestPath = "android/app/src/main/AndroidManifest.xml";
  const rulesPath = "android/app/src/main/res/xml/peer_key_backup_rules.xml";
  const extractionPath = "android/app/src/main/res/xml/peer_key_data_extraction_rules.xml";
  const packageText = fs.readFileSync("package.json", "utf8");
  execFileSync("npx", ["expo", "prebuild", "--platform", "android", "--no-install"], { stdio: "pipe" });
  fs.writeFileSync("package.json", packageText);
  const manifest = fs.readFileSync(manifestPath, "utf8");
  const rules = fs.readFileSync(rulesPath, "utf8");
  const extraction = fs.readFileSync(extractionPath, "utf8");
  assert.match(manifest, /android:allowBackup="false"/);
  assert.match(manifest, /peer_key_backup_rules/);
  assert.match(manifest, /peer_key_data_extraction_rules/);
  assert.match(rules, /SecureStore/);
  assert.match(rules, /RKStorage/);
  assert.match(extraction, /device-transfer/);
  assert.match(extraction, /SecureStore/);
  const plugin = fs.readFileSync("plugins/withPeerKeyBackup.js", "utf8");
  assert.match(plugin, /allowBackup/);
  assert.equal(generateIdentity().boxSecret.length > 0, true);
});
