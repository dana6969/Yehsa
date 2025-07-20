import fs from "fs";

const learnedPath = "./symbolic_memory/trainer_learned.json";
const executedPath = "./symbolic_memory/executed_log.json";

const learned = fs.existsSync(learnedPath) ? JSON.parse(fs.readFileSync(learnedPath, "utf-8")) : {};
const executed = fs.existsSync(executedPath)
  ? fs.readFileSync(executedPath, "utf-8")
      .split("\n")
      .filter(Boolean)
      .map(line => JSON.parse(line).symbol)
  : [];

console.log("🧠 SYMBOLIC KNOWLEDGE SUMMARY");
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

for (const [symbol, action] of Object.entries(learned)) {
  const status = executed.includes(symbol) ? "✅ executed" : "🕒 not yet triggered";
  console.log(`🔹 "${symbol}" → ${action} (${status})`);
}

console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log(`Total symbols learned: ${Object.keys(learned).length}`);
console.log(`Total executed: ${executed.length}`);

