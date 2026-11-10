// Keep peer keys and the encrypted chat store off Android Auto Backup and device transfer.
// allowBackup=false is the switch. The rules name the SecureStore prefs and the history database
// so a later edit that turns backup on still leaves those paths behind.

const fs = require("fs");
const path = require("path");
const { AndroidConfig, withAndroidManifest, withDangerousMod } = require("expo/config-plugins");

const BACKUP_XML = `<?xml version="1.0" encoding="utf-8"?>
<full-backup-content>
  <exclude domain="sharedpref" path="SecureStore"/>
  <exclude domain="database" path="RKStorage"/>
  <exclude domain="file" path="yehsa-peer-history"/>
</full-backup-content>
`;

const EXTRACTION_XML = `<?xml version="1.0" encoding="utf-8"?>
<data-extraction-rules>
  <cloud-backup>
    <exclude domain="sharedpref" path="SecureStore"/>
    <exclude domain="database" path="RKStorage"/>
    <exclude domain="file" path="yehsa-peer-history"/>
  </cloud-backup>
  <device-transfer>
    <exclude domain="sharedpref" path="SecureStore"/>
    <exclude domain="database" path="RKStorage"/>
    <exclude domain="file" path="yehsa-peer-history"/>
  </device-transfer>
</data-extraction-rules>
`;

function setAllowBackupFalse(manifest) {
  const app = AndroidConfig.Manifest.getMainApplicationOrThrow(manifest);
  app.$["android:allowBackup"] = "false";
  app.$["android:fullBackupContent"] = "@xml/peer_key_backup_rules";
  app.$["android:dataExtractionRules"] = "@xml/peer_key_data_extraction_rules";
  return manifest;
}

function withPeerKeyBackup(config) {
  config = withAndroidManifest(config, (mod) => {
    mod.modResults = setAllowBackupFalse(mod.modResults);
    return mod;
  });
  return withDangerousMod(config, [
    "android",
    (mod) => {
      const dir = path.join(mod.modRequest.platformProjectRoot, "app/src/main/res/xml");
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, "peer_key_backup_rules.xml"), BACKUP_XML);
      fs.writeFileSync(path.join(dir, "peer_key_data_extraction_rules.xml"), EXTRACTION_XML);
      return mod;
    }
  ]);
}

module.exports = withPeerKeyBackup;
module.exports.setAllowBackupFalse = setAllowBackupFalse;
module.exports.BACKUP_XML = BACKUP_XML;
module.exports.EXTRACTION_XML = EXTRACTION_XML;
