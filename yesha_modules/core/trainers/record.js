import fs from "fs";
import { register } from "../../../symbolic/symbol_registry.js";
import { emit } from "../../../symbolic/memory_hooks.js";

export function recordTraining(kind, input) {
  const symbol = typeof input === "string" ? input : input?.symbol;
  if (symbol) register(String(symbol), { kind });
  const output = { kind, trained: true, input };
  fs.appendFileSync("symbolic_memory/trainer_events.jsonl", `${JSON.stringify({ at: new Date().toISOString(), ...output })}\n`);
  emit("learn", output);
  return output;
}
