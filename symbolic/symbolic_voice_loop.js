import { listenAndTrigger } from "./symbolic_voice_listener.js";

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

loopVoiceInput();
