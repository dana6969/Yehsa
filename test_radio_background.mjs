import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import { getPlayback, pauseStream, playStream, radioPlayerAvailable, resumeStream, stopStream, subscribePlayback } from "./src/phone/radio_player.js";

const require = createRequire(import.meta.url);
const plugin = require("./plugins/withRadioBackground.js");

test("the background plugin declares the media playback service and permissions", () => {
  const manifest = { manifest: { application: [{ $: {}, service: [] }], "uses-permission": [] } };
  const out = plugin.applyRadioManifest(manifest);
  const names = out.manifest["uses-permission"].map((item) => item.$["android:name"]);
  for (const permission of plugin.PERMISSIONS) {
    assert.ok(names.includes(permission), permission);
  }
  const service = out.manifest.application[0].service.find((item) => item.$["android:name"] === plugin.SERVICE_NAME);
  assert.ok(service);
  assert.equal(service.$["android:exported"], "false");
  assert.equal(service.$["android:foregroundServiceType"], "mediaPlayback");
  assert.equal(service.$["android:stopWithTask"], "true");
  // Running the plugin twice does not duplicate the service or permissions.
  const again = plugin.applyRadioManifest(out);
  assert.equal(again.manifest.application[0].service.filter((item) => item.$["android:name"] === plugin.SERVICE_NAME).length, 1);
  assert.equal(again.manifest["uses-permission"].filter((item) => item.$["android:name"] === "android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK").length, 1);
});

test("app.json enables background audio and the radio playback plugin", () => {
  const app = JSON.parse(fs.readFileSync(new URL("./app.json", import.meta.url), "utf8"));
  const plugins = app.expo.plugins.map((item) => (Array.isArray(item) ? item[0] : item));
  assert.ok(plugins.includes("./plugins/withRadioBackground.js"));
  const permissions = app.expo.android.permissions;
  assert.ok(permissions.includes("FOREGROUND_SERVICE"));
  assert.ok(permissions.includes("FOREGROUND_SERVICE_MEDIA_PLAYBACK"));
  assert.ok(permissions.includes("WAKE_LOCK"));
  assert.ok(permissions.includes("POST_NOTIFICATIONS"));
  assert.ok(app.expo.ios.infoPlist.UIBackgroundModes.includes("audio"));
});

test("the native service source uses unique names and lock-screen actions", () => {
  const source = fs.readFileSync(new URL("./modules/yehsa-radio-playback/android/src/main/java/com/dana6969/axi0net/radio/RadioPlaybackService.kt", import.meta.url), "utf8");
  assert.match(source, /FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK/);
  assert.match(source, /CHANNEL_ID = "yehsa_radio_playback"/);
  assert.match(source, /WAKE_TAG = "YehsaRadioPlayback:wake"/);
  assert.match(source, /MediaSessionCompat/);
  assert.match(source, /"Play"/);
  assert.match(source, /"Pause"/);
  assert.match(source, /"Stop"/);
  const moduleJson = JSON.parse(fs.readFileSync(new URL("./modules/yehsa-radio-playback/expo-module.config.json", import.meta.url), "utf8"));
  assert.deepEqual(moduleJson.android.modules, ["com.dana6969.axi0net.radio.RadioPlaybackModule"]);
});

test("web and test playback stays a stub and does not start a stream", async () => {
  assert.equal(radioPlayerAvailable(), false);
  assert.equal(getPlayback(), null);
  await assert.rejects(() => playStream("https://example.com/live"), /phone app/);
  pauseStream();
  resumeStream();
  stopStream();
  let seen = "unset";
  const unsub = subscribePlayback((value) => { seen = value; });
  assert.equal(seen, null);
  unsub();
});
