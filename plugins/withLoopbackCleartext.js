// Android blocks plain http by default. The map reads its tiles from a small server that runs
// inside the app and listens on 127.0.0.1 only. This allows plain http to 127.0.0.1 and
// localhost and nothing else. Every other address stays https only.
const fs = require("fs");
const path = require("path");
const { withAndroidManifest, withDangerousMod } = require("@expo/config-plugins");

const FILE = "yehsa_network_security.xml";
const XML = `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
  <base-config cleartextTrafficPermitted="false" />
  <domain-config cleartextTrafficPermitted="true">
    <domain includeSubdomains="false">127.0.0.1</domain>
    <domain includeSubdomains="false">localhost</domain>
  </domain-config>
</network-security-config>
`;

function withConfigFile(config) {
  return withDangerousMod(config, [
    "android",
    async (mod) => {
      const dir = path.join(mod.modRequest.platformProjectRoot, "app", "src", "main", "res", "xml");
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, FILE), XML);
      return mod;
    }
  ]);
}

function withManifestAttribute(config) {
  return withAndroidManifest(config, (mod) => {
    const app = mod.modResults.manifest.application?.[0];
    if (app) app.$["android:networkSecurityConfig"] = `@xml/${FILE.replace(/\.xml$/, "")}`;
    return mod;
  });
}

module.exports = function withLoopbackCleartext(config) {
  return withManifestAttribute(withConfigFile(config));
};
module.exports.XML = XML;
