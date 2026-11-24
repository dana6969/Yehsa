// Expo config plugin. Keeps internet radio playing when the phone is locked or
// the app is in the background by declaring an Android media-playback foreground
// service, the permissions it needs, and iOS audio background mode.
// This file is not in the app bundle.

// Loaded only when Expo applies the plugin, so unit tests can check the
// manifest helpers without installing Expo in this process.
function configPlugins() {
  return require("expo/config-plugins");
}

const SERVICE_NAME = "com.dana6969.axi0net.radio.RadioPlaybackService";

const PERMISSIONS = [
  "android.permission.FOREGROUND_SERVICE",
  "android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK",
  "android.permission.WAKE_LOCK",
  "android.permission.POST_NOTIFICATIONS"
];

function permissionName(item) {
  return item?.$?.["android:name"] || "";
}

function ensurePermissions(manifest) {
  const root = manifest.manifest;
  if (!Array.isArray(root["uses-permission"])) root["uses-permission"] = [];
  const list = root["uses-permission"];
  for (const name of PERMISSIONS) {
    if (!list.some((item) => permissionName(item) === name)) {
      list.push({ $: { "android:name": name } });
    }
  }
  return manifest;
}

function ensureService(manifest) {
  const app = manifest.manifest.application?.[0];
  if (!app) return manifest;
  if (!Array.isArray(app.service)) app.service = [];
  let service = app.service.find((item) => item?.$?.["android:name"] === SERVICE_NAME);
  if (!service) {
    service = { $: {} };
    app.service.push(service);
  }
  service.$["android:name"] = SERVICE_NAME;
  service.$["android:exported"] = "false";
  service.$["android:foregroundServiceType"] = "mediaPlayback";
  service.$["android:stopWithTask"] = "true";
  return manifest;
}

function applyRadioManifest(manifest) {
  return ensureService(ensurePermissions(manifest));
}

function withManifest(config) {
  const { withAndroidManifest } = configPlugins();
  return withAndroidManifest(config, (mod) => {
    mod.modResults = applyRadioManifest(mod.modResults);
    return mod;
  });
}

function withAudioBackgroundMode(config) {
  const { withInfoPlist } = configPlugins();
  return withInfoPlist(config, (mod) => {
    const modes = new Set(mod.modResults.UIBackgroundModes || []);
    modes.add("audio");
    mod.modResults.UIBackgroundModes = [...modes];
    return mod;
  });
}

function withRadioBackground(config) {
  return withAudioBackgroundMode(withManifest(config));
}

module.exports = withRadioBackground;
module.exports.SERVICE_NAME = SERVICE_NAME;
module.exports.PERMISSIONS = PERMISSIONS;
module.exports.applyRadioManifest = applyRadioManifest;
