import fs from "fs";

export function writeToSymbolicMemory(data) {
  const row = { ...data, at: new Date().toISOString() };
  fs.mkdirSync("yesha_modules/logs", { recursive: true });
  fs.appendFileSync("yesha_modules/logs/symbolic_memory.jsonl", `${JSON.stringify(row)}\n`);
  return row;
}
