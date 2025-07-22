import fs from "fs";

export function chainNarrative(topic) {
  const ts = Date.now();
  const memory = JSON.parse(fs.readFileSync("./symbolic_memory/trainer_learned.json", "utf-8"));
  const matches = memory.filter(e => e.context.toLowerCase().includes(topic.toLowerCase()));
  if (matches.length === 0) return console.log(
    `❌ No symbolic links found for "${topic}"`);
  const output = matches.filter((v,i,a)=>a.findIndex(t=>t.symbol===v.symbol)===i).slice(0, 5).map(e => `🔗 ${e.symbol}: ${e.context}`).join("\n");
  console.log(`🧵 Symbolic Thread on "${topic}":\n${output}`);
  console.log(`⏱️ Duration: ${Date.now() - ts} ms`);
}
