// onnxruntime-react-native asks Gradle for "latest.integration" of the ONNX Runtime Android
// library, which floats with every upstream release. Pin it to the same version as the JS
// package so a rebuild produces the same native runtime the meaning matcher was tested with.
const { withProjectBuildGradle } = require("@expo/config-plugins");
const ortPackage = require("onnxruntime-react-native/package.json");

const TAG = "// yehsa: pin onnxruntime-android";

module.exports = function withOrtVersion(config) {
  return withProjectBuildGradle(config, (mod) => {
    if (mod.modResults.language !== "groovy" || mod.modResults.contents.includes(TAG)) return mod;
    mod.modResults.contents += `
${TAG}
allprojects {
  configurations.all {
    resolutionStrategy.force "com.microsoft.onnxruntime:onnxruntime-android:${ortPackage.version}"
  }
}
`;
    return mod;
  });
};
