// Expo config plugin. Bluetooth LE is optional hardware so a phone without a
// radio can still install Yehsa and stay Degraded. This file is not in the app bundle.

const { withAndroidManifest } = require("expo/config-plugins");

const FEATURE = "android.hardware.bluetooth_le";

function ensureOptional(manifest) {
  const root = manifest.manifest;
  if (!Array.isArray(root["uses-feature"])) root["uses-feature"] = [];
  const features = root["uses-feature"];
  const existing = features.find((item) => item?.$?.["android:name"] === FEATURE);
  if (existing) {
    existing.$["android:required"] = "false";
    return manifest;
  }
  features.push({
    $: {
      "android:name": FEATURE,
      "android:required": "false"
    }
  });
  return manifest;
}

module.exports = function withYehsaRadio(config) {
  return withAndroidManifest(config, (mod) => {
    mod.modResults = ensureOptional(mod.modResults);
    return mod;
  });
};
