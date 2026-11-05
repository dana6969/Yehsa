import path from "path";
import { pathToFileURL } from "url";
import { logToLearningQueue } from "./symbolic_memory/learning_queue_handler.mjs";

export function receiveMeshText(input) {
  if (typeof input !== "string" || !input.trim()) {
    throw new Error("Usage: node mesh_receiver.mjs <text>");
  }
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
    context: `phase4:input_text:${input}`,
    timestamp: Math.floor(Date.now() / 1000)
  });
  return input_symbol;
}

const entry = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (import.meta.url === entry) {
  const input = process.argv[2];
  if (!input) {
    console.error("Usage: node mesh_receiver.mjs <text>");
    process.exit(1);
  }
  console.log(receiveMeshText(input));
}
