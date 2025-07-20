import fs from "fs";
import { speakContext } from "./symbolic_speaker.js";

export function semanticAnswer(keyword) {
  const ts = Date.now();
  const data = JSON.parse(fs.readFileSync("./symbolic_memory/trainer_learned.json", "utf-8"));
  const results = data.filter(e =>
    e.context.toLowerCase().includes(keyword.toLowerCase())
  );

  if (results.length === 0) {
    console.log(`❌ No matches for "${keyword}"`);
  } else {
    const match = results[0];
    console.log(`🧠 Semantic matches for "${keyword}":`);
    console.log(`🔹 ${match.symbol}: ${match.context}`);
    console.log(`⏱️ Duration: ${Date.now() - ts} ms`);
    speakContext(match.symbol);
  logTrace(match.symbol, match.context);
  }
}
