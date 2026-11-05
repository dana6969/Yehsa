import { startAutonomyLoop } from "./core/autonomy_loop.js";
import { evaluateTriggers } from "./core/AGITriggers.js";

console.log("🌐 Yehsa Central Dispatch Initialized");

startAutonomyLoop();
setInterval(() => {
  evaluateTriggers();
}, 3000);
