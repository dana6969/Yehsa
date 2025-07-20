import { execSync } from "child_process";
import { semanticAnswer } from "./symbolic_knowledge_tools.js";

export function listenAndTrigger() {
  console.log("🎤 Listening... Speak now:");
  try {
    const result = execSync("termux-speech-to-text").toString().trim();
    console.log(`📝 You said: "${result}"`);

    // Convert voice to symbolic keyword and trigger semantic answer
    const symbol = result.toLowerCase().replace(/\s+/g, "_");
    semanticAnswer(symbol);
  } catch (e) {
    console.error("❌ Voice input failed:", e.message);
  }
}
