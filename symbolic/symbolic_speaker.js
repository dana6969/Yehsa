import fs from "fs"; import { execSync } from "child_process";
export function speakContext(symbol) {
  const data = JSON.parse(fs.readFileSync("./symbolic_memory/trainer_learned.json", "utf-8"));
  const match = data.find(e => e.symbol === symbol);
  if (match) {
    const context = match.context.replace(/"/g, "'");
    console.log(`🗣️ (Speak): ${context}`);
    try {
      execSync(`termux-tts-speak "${context}"`, { stdio: "ignore" });
    } catch (e) {
      console.warn("⚠️ Termux TTS failed. Using Android fallback...");
      try {
        execSync(`am start --user 0 -a android.intent.action.VIEW -d "data:text/plain,${context}"`);
      } catch (err) {
        console.error("❌ Android TTS fallback also failed:", err.message);
      }
    }
  } else {
    console.log(`❌ No context found for: ${symbol}`);
  }
}
