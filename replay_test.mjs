// Yehsa Autonomy Replay Test
import { runAutonomyLoop } from "./yesha_modules/core/autonomy_loop.js";

console.log("🌀 Running Full Autonomy Replay...");
const result = runAutonomyLoop("♾️ Symbol:Chronos");
console.log("🔁 Output:", JSON.stringify(result, null, 2));
