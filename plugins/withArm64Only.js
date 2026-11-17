// Build the Android app for 64-bit ARM phones only (arm64-v8a). This keeps the ONNX
// Runtime and TFLite native libraries to one copy instead of four, which cuts the APK
// by more than 100 MB. To add older 32-bit phones back, add "armeabi-v7a" to ABIS.
const { withAppBuildGradle, withGradleProperties } = require("@expo/config-plugins");

const ABIS = ["arm64-v8a"];
const TAG = "// yehsa: abi filter";

function withArchProperty(config) {
  return withGradleProperties(config, (mod) => {
    const items = mod.modResults.filter((item) => !(item.type === "property" && item.key === "reactNativeArchitectures"));
    items.push({ type: "property", key: "reactNativeArchitectures", value: ABIS.join(",") });
    mod.modResults = items;
    return mod;
  });
}

function withAbiFilters(config) {
  return withAppBuildGradle(config, (mod) => {
    if (mod.modResults.language !== "groovy" || mod.modResults.contents.includes(TAG)) return mod;
    const filters = ABIS.map((abi) => `"${abi}"`).join(", ");
    mod.modResults.contents = mod.modResults.contents.replace(
      /defaultConfig\s*\{/,
      (match) => `${match}\n        ${TAG}\n        ndk { abiFilters ${filters} }`
    );
    return mod;
  });
}

module.exports = function withArm64Only(config) {
  return withAbiFilters(withArchProperty(config));
};
