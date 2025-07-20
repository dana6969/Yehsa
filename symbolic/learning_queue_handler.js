import fs from "fs";
const path = "./symbolic_memory/learning_queue.json";
const data = JSON.parse(fs.readFileSync(path, "utf-8"));
const cleaned = data.filter(e =>
  e && typeof e.symbol === "string" && typeof e.context === "string"
);
fs.writeFileSync(path, JSON.stringify(cleaned, null, 2));
console.log(`🧹 Cleaned ${cleaned.length} entries in learning_queue.json`);
