import { logToLearningQueue } from "./symbolic_memory/learning_queue_handler.js"; const input = process.argv[2]; const symbol = input.split(" ")[0]; const context = `phase4:input_text:${input}`; const triggers = ["unlock", "mirror", "speak", "fear", "hope", "breach"];
let input_symbol = "unknown";
for (const trigger of triggers) { if (input.includes(trigger)) { input_symbol = trigger; break; } }
logToLearningQueue({ symbol: input_symbol, context: `phase4:input_text:${input}`, timestamp: Math.floor((Date.now() + (4 * 60 * 60 * 1000)) / 1000) });
