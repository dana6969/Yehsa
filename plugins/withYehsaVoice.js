// Expo config plugin. A microphone is optional hardware so a device without one
// can still install Yehsa and ask by typing. This file is not in the app bundle.

const { withAndroidManifest } = require("expo/config-plugins");

const FEATURE = "android.hardware.microphone";

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

module.exports = function withYehsaVoice(config) {
  return withAndroidManifest(config, (mod) => {
    mod.modResults = ensureOptional(mod.modResults);
    return mod;
  });
};
