// Axionet Symbolic Bootstrap Loader
// Calls the CommonJS autonomy loop (core/loops/autonomy_loop.cjs), which is the
// callable module.exports implementation. core/autonomy_loop.js is a separate
// ESM stub used by yesha.js.
const identity = require("../config/identity.json");
const runAutonomyLoop = require("../core/loops/autonomy_loop.cjs");

console.log(`Axionet Boot: ${identity.codename} v${identity.version} ownership=${identity.ownership || "per-device"} exterior=${identity.exterior_access || "deny"}`);

runAutonomyLoop({
  intent: "boot",
  context: {
    codename: identity.codename,
    seed: identity.seed,
    origin: identity.origin || "core_identity"
  }
}).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
