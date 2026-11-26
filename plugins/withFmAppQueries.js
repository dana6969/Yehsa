// Expo config plugin. Lets Yehsa ask Android whether the phone maker's own FM radio app is
// installed so the Radio screen can open it. Yehsa itself cannot tune FM: Android gives apps
// no access to a phone's FM chip. This only declares which packages Yehsa may look for.
// This file is not in the app bundle.

const { withAndroidManifest } = require("expo/config-plugins");

const PACKAGES = [
  "com.android.fmradio",
  "com.caf.fmradio",
  "com.sec.android.app.fm",
  "com.motorola.fmplayer",
  "com.miui.fm",
  "com.huawei.android.FMRadio",
  "com.lge.fmradio",
  "com.htc.fm"
];

module.exports = function withFmAppQueries(config) {
  return withAndroidManifest(config, (mod) => {
    const root = mod.modResults.manifest;
    if (!Array.isArray(root.queries)) root.queries = [];
    let block = root.queries[0];
    if (!block || typeof block !== "object") {
      block = {};
      root.queries[0] = block;
    }
    if (!Array.isArray(block.package)) block.package = [];
    for (const name of PACKAGES) {
      if (!block.package.some((item) => item?.$?.["android:name"] === name)) block.package.push({ $: { "android:name": name } });
    }
    return mod;
  });
};

module.exports.PACKAGES = PACKAGES;
