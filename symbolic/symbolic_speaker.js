import fs from "fs";
import { execFileSync } from "child_process";

const MAX_SPEECH_LENGTH = 500;
// Shell metacharacters and control characters are rejected. The text is passed
// as an argv element, never interpolated into a shell command.
const UNSAFE_SPEECH = /[\u0000-\u001F\u007F`$|&;<>\\]/;

export function assertSpeakable(text) {
  if (typeof text !== "string") {
    throw new Error("Speech text rejected: not a string");
  }
  const normalized = text.replace(/"/g, "'").trim();
  if (!normalized || normalized.length > MAX_SPEECH_LENGTH || UNSAFE_SPEECH.test(normalized)) {
    throw new Error("Speech text rejected: empty, too long, or unexpected characters");
  }
  return normalized;
}

export function speakContext(symbol) {
  const data = JSON.parse(fs.readFileSync("./symbolic_memory/trainer_learned.json", "utf-8"));
  const match = data.find(e => e.symbol === symbol);
  if (!match) {
    console.log(`❌ No context found for: ${symbol}`);
    return;
  }

  let context;
  try {
    context = assertSpeakable(match.context);
  } catch (err) {
    console.error(`❌ Refusing to speak context for ${symbol}: ${err.message}`);
    return;
  }

  console.log(`🗣️ (Speak): ${context}`);
  try {
    execFileSync("termux-tts-speak", [context], { stdio: "ignore" });
  } catch (e) {
    console.warn("⚠️ Termux TTS failed. Using Android fallback...");
    try {
      execFileSync("am", [
        "start",
        "--user",
        "0",
        "-a",
        "android.intent.action.VIEW",
        "-d",
        `data:text/plain,${encodeURIComponent(context)}`
      ], { stdio: "ignore" });
    } catch (err) {
      console.error("❌ Android TTS fallback also failed:", err.message);
    }
  }
}
