import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { CLONE_MESSAGE, attestationStatus, cloneDecision } from "./symbolic/clone_guard.js";
import { KEYSTORE_FACTS, auditStorageText } from "./symbolic/storage_audit.js";
import { SCRYPT_PARAMS, createPeerVault, memoryAdapter, notePeerKey, secureStoreOptions } from "./symbolic/peer_vault.js";
import { generateIdentity, publicCard } from "./symbolic/peer_chat.js";

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
  assert.match(rules, /domain="sharedpref"/);
  assert.match(rules, /domain="database"/);
  assert.match(rules, /path="\."/);
  assert.match(extraction, /device-transfer/);
  assert.match(extraction, /cloud-backup/);
  assert.match(extraction, /domain="file"/);
  const plugin = fs.readFileSync("plugins/withPeerKeyBackup.js", "utf8");
  assert.match(plugin, /allowBackup/);
  assert.equal(generateIdentity().boxSecret.length > 0, true);
});

test("the identity survives a restart and reset deletes it only after approval", async () => {
  const disk = new Map();
  const first = createPeerVault(memoryAdapter(disk));
  const created = await first.loadOrCreate();
  await first.saveHistory({ messages: [{ text: "keep" }], peers: {} });
  const second = createPeerVault(memoryAdapter(disk));
  const loaded = await second.loadOrCreate();
  assert.equal(loaded.identity.boxSecret, created.identity.boxSecret);
  assert.equal(loaded.created, false);
  assert.equal((await second.loadHistory()).messages[0].text, "keep");
  const held = await second.reset({ approved: false });
  assert.equal(held.ok, false);
  assert.equal((await second.loadOrCreate()).identity.boxPublic, created.identity.boxPublic);
  const wiped = await second.reset({ approved: true });
  assert.equal(wiped.ok, true);
  assert.match(wiped.warning, /re-verify/);
  const third = createPeerVault(memoryAdapter(disk));
  const fresh = await third.loadOrCreate();
  assert.notEqual(fresh.identity.boxPublic, created.identity.boxPublic);
  assert.equal(await third.loadHistory(), null);
  const home = fs.readFileSync("src/phone/PeerSecurity.js", "utf8");
  assert.match(home, /Approve reset/);
  assert.match(home, /Your key fingerprint/);
  assert.match(home, /Contacts must re-verify/);
});

test("a backup round trip needs the passphrase and a peer key change warns", async () => {
  assert.ok(SCRYPT_PARAMS.N >= 16384);
  const fast = { N: 1024, r: 8, p: 1, dkLen: 32 };
  const vault = createPeerVault(memoryAdapter());
  const { identity } = await vault.loadOrCreate();
  const file = vault.exportBackup(identity, "correct horse", fast);
  assert.equal(file.ok, true);
  assert.equal(JSON.stringify(file.file).includes(identity.boxSecret), false);
  assert.equal(file.file.kdf, "scrypt");
  assert.equal(vault.importBackup(file.file, "wrong horse", { approved: true }, fast).ok, false);
  assert.match(vault.importBackup(file.file, "correct horse", { approved: false }, fast).reason, /until you approve/);
  const opened = vault.importBackup(file.file, "correct horse", { approved: true }, fast);
  assert.equal(opened.ok, true);
  assert.equal(opened.identity.boxSecret, identity.boxSecret);
  assert.match(opened.warning, /re-verify/);
  const card = publicCard(identity);
  const other = publicCard(generateIdentity());
  const seen = notePeerKey({}, "ada", card);
  assert.equal(seen.changed, false);
  const changed = notePeerKey(seen.known, "ada", other);
  assert.equal(changed.changed, true);
  assert.match(changed.warning, /Safety number changed/);
  assert.match(changed.warning, /Re-verify/);
  const same = notePeerKey(changed.known, "ada", other);
  assert.equal(same.changed, false);
  const screen = fs.readFileSync("src/phone/PeerChat.js", "utf8");
  assert.match(screen, /Safety number changed|warning/);
  assert.match(screen, /demo identity only/);
  assert.match(fs.readFileSync("src/phone/mesh_keys.js", "utf8"), /demo identity only/);
});

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) walk(full, out);
    else if (name.endsWith(".js")) out.push(full);
  }
  return out;
}

test("storage writes do not put private keys in AsyncStorage or files", () => {
  const files = [...walk("src"), ...walk("symbolic")];
  const problems = [];
  for (const file of files) problems.push(...auditStorageText(file, fs.readFileSync(file, "utf8")));
  assert.deepEqual(problems, []);
  const secure = fs.readFileSync("node_modules/expo-secure-store/android/src/main/java/expo/modules/securestore/SecureStoreModule.kt", "utf8");
  const aes = fs.readFileSync("node_modules/expo-secure-store/android/src/main/java/expo/modules/securestore/encryptors/AESEncryptor.kt", "utf8");
  assert.match(secure, /AndroidKeyStore/);
  assert.match(secure, /SecureStore/);
  assert.match(aes, /setUserAuthenticationRequired/);
  assert.match(KEYSTORE_FACTS.proves, /not exported/);
  const native = fs.readFileSync("src/phone/mesh_keys.native.js", "utf8");
  assert.match(native, /setSecret/);
  assert.doesNotMatch(native, /AsyncStorage\.setItem\([^)]*boxSecret/);
});

test("a copied directory cannot unwrap the identity or the history", async () => {
  const disk = new Map();
  const original = createPeerVault(memoryAdapter(disk, "phone-a"));
  const created = await original.loadOrCreate();
  await original.saveHistory({ messages: [{ text: "secret ridge" }], peers: {} });
  const sealed = disk.get("data:history");
  assert.equal(JSON.stringify(sealed).includes("secret ridge"), false);
  assert.equal(JSON.stringify(sealed).includes(created.identity.boxSecret), false);
  const copy = createPeerVault(memoryAdapter(disk, "phone-b"));
  const session = await copy.openSession();
  assert.equal(session.foreign, true);
  assert.equal(session.identity, null);
  assert.equal(session.useOldIdentity, false);
  assert.equal(session.recover, false);
  assert.equal(session.message, CLONE_MESSAGE);
  assert.equal(JSON.stringify(session).includes("secret ridge"), false);
  assert.equal(JSON.stringify(session).includes(created.identity.boxSecret), false);
  const held = await copy.replaceForeign({ approved: false });
  assert.equal(held.ok, false);
  assert.equal((await copy.openSession()).identity, null);
  const moved = await copy.exportForDevice("correct horse", { N: 1024, r: 8, p: 1, dkLen: 32 });
  assert.equal(moved.ok, false);
  assert.match(moved.reason, /passphrase/);
  const ownerStillRecognized = cloneDecision({ unwrapFailed: true, bindOk: true, ownerRecognized: true });
  assert.equal(ownerStillRecognized.foreign, true);
  assert.equal(ownerStillRecognized.useOldIdentity, false);
  const fresh = await copy.replaceForeign({ approved: true });
  assert.equal(fresh.ok, true);
  assert.notEqual(fresh.identity.boxPublic, created.identity.boxPublic);
  assert.match(fresh.warning, /Re-verify/);
  assert.equal(await copy.loadHistory(), null);
  const screen = fs.readFileSync("src/phone/PeerChat.js", "utf8");
  assert.equal(CLONE_MESSAGE, "This copy can't open the original owner's chats");
  assert.match(screen, /CLONE_MESSAGE/);
  assert.match(screen, /Approve a new identity/);
  assert.equal(attestationStatus().available, false);
  assert.match(attestationStatus().proves, /TEE or StrongBox/);
  assert.doesNotMatch(fs.readFileSync("symbolic/clone_guard.js", "utf8"), /getAndroidId\s*\(/);
});
