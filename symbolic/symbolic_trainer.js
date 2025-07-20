import fs from "fs";

const queuePath = "./symbolic_memory/learning_queue.json";
const learnedPath = "./symbolic_memory/trainer_learned.json";
const ts = Date.now();

// Load queue
let queue = [];
try {
  queue = JSON.parse(fs.readFileSync(queuePath, "utf-8"));
} catch (err) {
  console.error("❌ Failed to read learning queue:", err.message);
  process.exit(1);
}

// Load already learned
let learned = [];
if (fs.existsSync(learnedPath)) {
  try {
    learned = JSON.parse(fs.readFileSync(learnedPath, "utf-8"));
  } catch (err) {
    console.warn("⚠️ Corrupt trainer_learned.json, resetting.");
    learned = [];
  }
}

// Build learned symbol map
const learnedMap = new Set(learned.map(e => e.symbol));

// Filter
const unlearned = queue.filter(e =>
  e.symbol && e.context &&
  typeof e.symbol === "string" &&
  typeof e.context === "string" &&
  !learnedMap.has(e.symbol)
);

console.log(`[TRAINER] Auto-training ${unlearned.length} symbol(s)...`);

if (unlearned.length > 0) {
  learned.push(...unlearned);
  fs.writeFileSync(learnedPath, JSON.stringify(learned, null, 2));
}

console.log(`[TRAINER] Complete in ${Date.now() - ts} ms.`);
