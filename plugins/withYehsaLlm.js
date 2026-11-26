// Yehsa AI (on-device): puts the open-license GGUF model inside the APK so the AI works offline
// from the first launch, with nothing to download on the phone.
//
// - At prebuild (on EAS or locally) the model is taken from YEHSA_LLM_MODEL_PATH, a local cache,
//   or downloaded once from its official Hugging Face URL, and its SHA-256 is checked.
// - It is written to android/app/src/main/assets/llm/ and marked noCompress, so the APK stores
//   it as-is (a 1 GB file does not shrink, and stored assets copy out fast).
// - The model file is never committed to git; only its URL and hash are (symbolic/llm/model_info.js).
// Set YEHSA_LLM_SKIP=1 to build an APK without the model (the AI then reports it is not included).
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const https = require("https");
const { withAppBuildGradle, withDangerousMod, withGradleProperties } = require("@expo/config-plugins");

const MODEL = {
  file: "qwen2.5-1.5b-instruct-q4_0.gguf",
  bytes: 1066227232,
  sha256: "dcd819ff094852c38faba6873d8ff0c9d51eadb2844539e52042ae5d647bbfdb",
  url: "https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q4_0.gguf"
};
const TAG = "// yehsa: llm noCompress";

function sha256File(file) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    fs.createReadStream(file).on("data", (d) => hash.update(d)).on("error", reject).on("end", () => resolve(hash.digest("hex")));
  });
}

function download(url, dest, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 8) return reject(new Error("too many redirects"));
    https.get(url, { headers: { "User-Agent": "yehsa-build" } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return resolve(download(new URL(res.headers.location, url).toString(), dest, redirects + 1));
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error(`HTTP ${res.statusCode} for ${url}`)); }
      const out = fs.createWriteStream(dest);
      res.pipe(out);
      out.on("finish", () => out.close(resolve));
      out.on("error", reject);
    }).on("error", reject);
  });
}

async function verified(file) {
  try {
    if (!fs.existsSync(file) || fs.statSync(file).size !== MODEL.bytes) return false;
    return (await sha256File(file)) === MODEL.sha256;
  } catch {
    return false;
  }
}

async function provideModel(target) {
  if (await verified(target)) return "already in place";
  const candidates = [
    process.env.YEHSA_LLM_MODEL_PATH,
    path.join(os.homedir(), "yehsa-llm-cache", MODEL.file),
    path.join(os.homedir(), ".cache", "yehsa-llm", MODEL.file)
  ].filter(Boolean);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  for (const c of candidates) {
    if (await verified(c)) {
      fs.copyFileSync(c, target);
      return `copied from ${c}`;
    }
  }
  const part = `${target}.part`;
  // eslint-disable-next-line no-console
  console.log(`[yehsa-llm] downloading ${MODEL.file} (${(MODEL.bytes / 1e9).toFixed(2)} GB) from Hugging Face`);
  await download(MODEL.url, part);
  if (!(await verified(part))) {
    fs.rmSync(part, { force: true });
    throw new Error("[yehsa-llm] the downloaded model did not match its SHA-256; refusing to bundle it");
  }
  fs.renameSync(part, target);
  return "downloaded and verified";
}

function withModelAsset(config) {
  return withDangerousMod(config, ["android", async (mod) => {
    if (process.env.YEHSA_LLM_SKIP === "1") {
      // eslint-disable-next-line no-console
      console.log("[yehsa-llm] YEHSA_LLM_SKIP=1: building without the on-device model");
      return mod;
    }
    const target = path.join(mod.modRequest.platformProjectRoot, "app", "src", "main", "assets", "llm", MODEL.file);
    const how = await provideModel(target);
    // eslint-disable-next-line no-console
    console.log(`[yehsa-llm] model ${how}: ${target}`);
    return mod;
  }]);
}

function withNoCompress(config) {
  return withAppBuildGradle(config, (mod) => {
    if (mod.modResults.language !== "groovy" || mod.modResults.contents.includes(TAG)) return mod;
    mod.modResults.contents = mod.modResults.contents.replace(
      /\nandroid\s*\{/,
      (match) => `${match}\n    ${TAG}\n    androidResources { noCompress += ["gguf"] }`
    );
    return mod;
  });
}

// AGP's compressReleaseAssets reads each asset into the Gradle heap, even a stored one, so a
// 1 GB model fails with "Java heap space" at the default 2 GB. Give Gradle 6 GB (EAS Android
// workers have 16 GB; the box has 15 GB).
const JVM_ARGS = "-Xmx6g -XX:MaxMetaspaceSize=1g -Dfile.encoding=UTF-8";
function withGradleHeap(config) {
  return withGradleProperties(config, (mod) => {
    const items = mod.modResults.filter((item) => !(item.type === "property" && item.key === "org.gradle.jvmargs"));
    items.push({ type: "property", key: "org.gradle.jvmargs", value: JVM_ARGS });
    mod.modResults = items;
    return mod;
  });
}

module.exports = function withYehsaLlm(config) {
  return withGradleHeap(withNoCompress(withModelAsset(config)));
};
module.exports.MODEL = MODEL;
