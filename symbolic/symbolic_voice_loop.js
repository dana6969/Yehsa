import { listenAndTrigger } from "./symbolic_voice_listener.js";
import { isDirectRun } from "./direct_run.js";

async function loopVoiceInput() {
  console.log("🔁 Voice loop started. Say a symbol or press Ctrl+C to exit.");
  while (true) {
    try {
      await new Promise(resolve => setTimeout(resolve, 500));
      listenAndTrigger();
    } catch (e) {
      console.error("❌ Loop error:", e.message);
    }
  }
}

if (isDirectRun(import.meta.url)) loopVoiceInput();
