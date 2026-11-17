// Node needs explicit ".js" in ESM imports, but Metro then takes that exact file and skips
// the platform variant. Prefer a sibling "name.<platform>.js" or "name.native.js" when one exists,
// so the phone loads ble_native.native.js, mesh_keys.native.js, speech_listen.native.js and so on.
const fs = require("fs");
const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);
// The offline meaning matcher ships its model (.onnx) and int8 scripture rows (.i8) as assets.
config.resolver.assetExts = [...new Set([...config.resolver.assetExts, "onnx", "i8"])];
// The camera-ID model ships as a bundled asset and is opened only on the Identify screen.
if (!config.resolver.assetExts.includes("tflite")) config.resolver.assetExts.push("tflite");
const upstream = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform && moduleName.startsWith(".") && moduleName.endsWith(".js")) {
    const base = path.resolve(path.dirname(context.originModulePath), moduleName.slice(0, -3));
    const variants = [`${base}.${platform}.js`];
    if (platform === "android" || platform === "ios") variants.push(`${base}.native.js`);
    for (const candidate of variants) {
      if (fs.existsSync(candidate)) return { type: "sourceFile", filePath: candidate };
    }
  }
  return upstream ? upstream(context, moduleName, platform) : context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
