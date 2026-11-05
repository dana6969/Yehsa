import { logToLearningQueue } from "./symbolic_memory/learning_queue_handler.mjs";

const input = process.argv[2];
if (!input) {
  console.error("Usage: node mesh_receiver.mjs <text>");
  process.exit(1);
}

const context = `phase4:input_text:${input}`;
const triggers = ["unlock", "mirror", "speak", "fear", "hope", "breach"];
let input_symbol = "unknown";
for (const trigger of triggers) {
  if (input.includes(trigger)) {
    input_symbol = trigger;
    break;
  }
}
logToLearningQueue({
  symbol: input_symbol,
  context,
  timestamp: Math.floor(Date.now() / 1000)
});
