// Ask-tab voice for the Expo shell.
// Speaking is Expo Speech (the OS voice, or speech synthesis on the web).
// Listening is the platform file: Web Speech API, or the native recognizer.
// probeVoice() does not open the microphone.
// Platform and Expo Speech are static imports. A dynamic import of react-native
// resolved as "node" in the web bundle and hid a recognizer the browser had.

import { Platform } from "react-native";
import * as Speech from "expo-speech";
import {
  chooseSpeakRoute,
  listenPlan,
  listenUnavailableNotice,
  spokenAnswer,
  speakUnavailableNotice
} from "../../symbolic/voice_adapter.js";
import { listenCapabilities, openRecognizer } from "./speech_listen.js";

function hostOs() {
  const os = Platform?.OS;
  if (os === "android" || os === "ios" || os === "web") return os;
  return "node";
}

function speechApi() {
  const speak = typeof Speech.speak === "function" ? Speech.speak : Speech.default?.speak;
  const stop = typeof Speech.stop === "function" ? Speech.stop : Speech.default?.stop;
  return {
    speak: typeof speak === "function" ? speak : null,
    stop: typeof stop === "function" ? stop : null
  };
}

function speakCapabilities() {
  const speech = speechApi();
  const expoSpeech = speech.speak != null;
  const webSynthesis = typeof globalThis.speechSynthesis?.speak === "function"
    && typeof globalThis.SpeechSynthesisUtterance === "function";
  return { expoSpeech, webSynthesis };
}

export async function probeVoice() {
  const os = hostOs();
  let listen = {
    nativeModule: false,
    recognitionAvailable: false,
    webSpeech: false,
    onDevice: false,
    runtime: null
  };
  try {
    const caps = await listenCapabilities();
    if (caps && typeof caps === "object") listen = { ...listen, ...caps };
  } catch {
    // A probe that throws is the same as no recognizer.
  }
  let speak = { expoSpeech: false, webSynthesis: false };
  try {
    speak = speakCapabilities();
  } catch {
    speak = { expoSpeech: false, webSynthesis: false };
  }
  return {
    ...listenPlan({ os, ...listen }),
    speakRoute: chooseSpeakRoute(speak)
  };
}

export function silenceSpeakers() {
  try {
    globalThis.speechSynthesis?.cancel?.();
  } catch {
    // The browser has no speech synthesis.
  }
  try {
    speechApi().stop?.();
  } catch {
    // Stopping a missing voice is not an answer.
  }
}

function micDidNotStart() {
  return {
    started: false,
    reason: listenUnavailableNotice(),
    code: "audio-capture",
    stop: async () => "",
    abort() {}
  };
}

export function openMic(options = {}) {
  try {
    return Promise.resolve(openRecognizer(options)).catch(() => micDidNotStart());
  } catch {
    return Promise.resolve(micDidNotStart());
  }
}

export async function stopProse() {
  silenceSpeakers();
}

function afterTurn() {
  return new Promise((resolve) => {
    setTimeout(resolve, 60);
  });
}

export async function speakProse(text, hooks = {}) {
  const prose = spokenAnswer(text);
  if (!prose) return { ok: false, route: "none", reason: speakUnavailableNotice() };
  // Canceling speech synthesis and speaking in the same turn makes Chrome
  // drop the new utterance. The next turn keeps the click's user activation.
  silenceSpeakers();
  await afterTurn();
  try {
    const speak = speechApi().speak;
    if (speak) {
      speak(prose, {
        language: "en-US",
        rate: 0.95,
        onDone: () => hooks.onDone?.(),
        onStopped: () => hooks.onDone?.(),
        onError: () => hooks.onError?.()
      });
      return { ok: true, route: "expo-speech" };
    }
  } catch {
    // Fall through to the browser voice when Expo Speech did not load.
  }
  const synth = globalThis.speechSynthesis;
  if (synth && typeof synth.speak === "function" && typeof globalThis.SpeechSynthesisUtterance === "function") {
    try {
      const utterance = new globalThis.SpeechSynthesisUtterance(prose);
      utterance.lang = "en-US";
      utterance.rate = 0.95;
      utterance.onend = () => hooks.onDone?.();
      utterance.onerror = () => hooks.onError?.();
      synth.speak(utterance);
      return { ok: true, route: "web-speech-synthesis" };
    } catch {
      // The note stays on screen.
    }
  }
  return { ok: false, route: "none", reason: speakUnavailableNotice() };
}
