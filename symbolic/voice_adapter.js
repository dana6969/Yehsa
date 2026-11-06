// Voice decisions for the Ask tab. No microphone, no speaker, no React Native.
// Listening prefers an on-device recognizer. Speaking is Expo Speech when the
// shell has it. A missing recognizer stays a typed question.

export const TAP_LOCK_MS = 280;

export function normalizeHeard(text) {
  return String(text ?? "").replace(/\s+/g, " ").trim();
}

export function chooseListenRoute(caps = {}) {
  const os = caps.os;
  if (os === "android" || os === "ios") {
    if (caps.nativeModule === true && caps.recognitionAvailable === true) return "native-speech";
    return "none";
  }
  if (os === "web" && caps.webSpeech === true) return "web-speech";
  return "none";
}

export function chooseSpeakRoute(caps = {}) {
  if (caps.expoSpeech === true) return "expo-speech";
  if (caps.webSynthesis === true) return "web-speech-synthesis";
  return "none";
}

export function listenUnavailableNotice(caps = {}) {
  const os = caps.os;
  if (os === "android" || os === "ios") {
    if (caps.runtime === "expo-go") {
      return "Expo Go does not include the speech recognizer. An EAS preview build includes it, the same way it includes the radio. Type the question. The notes stay on this phone.";
    }
    if (caps.nativeModule === true && caps.recognitionAvailable !== true) {
      return "This phone's speech recognizer is off or has no language pack. Type the question. The notes stay on this phone.";
    }
    return "This install has no speech recognizer. An EAS preview build includes it, the same way it includes the radio. Type the question. The notes stay on this phone.";
  }
  if (os === "web") {
    return "This browser has no speech recognizer. Chrome, Edge, and Safari can listen when their speech service is present. Type the question. The notes stay on this phone.";
  }
  return "This screen has no speech recognizer. Type the question. The notes stay on this phone.";
}

export function serviceNotice(route, onDevice) {
  if (route === "none") return listenUnavailableNotice();
  if (onDevice === true && route === "web-speech") {
    return "Listening uses this browser's on-device recognizer. Yehsa hears you only while the button is held, or after a short tap until you tap again. The field notes stay on this phone.";
  }
  if (onDevice === true) {
    return "Listening uses this phone's on-device recognizer. Yehsa hears you only while the button is held, or after a short tap until you tap again. The field notes stay on this phone.";
  }
  if (route === "web-speech") {
    return "Listening uses this browser's speech service. Audio may leave the phone when that service needs a network. Yehsa hears you only while the button is held, or after a short tap until you tap again. The field notes stay on this phone.";
  }
  return "Listening uses the OS speech service. Audio may leave the phone when that service needs a network. Yehsa hears you only while the button is held, or after a short tap until you tap again. The field notes stay on this phone.";
}

export function speakHint(route) {
  if (route === "expo-speech") {
    return "Spoken answers use Expo Speech and the voice installed on this device. On iOS, the silent switch mutes that voice.";
  }
  if (route === "web-speech-synthesis") {
    return "Spoken answers use this browser's speech synthesis. Some browsers fetch that voice over the network.";
  }
  return "This screen has no speaking voice. The note stays on screen.";
}

export function speakUnavailableNotice() {
  return "This screen cannot speak the answer. The note stays on screen.";
}

export function listenPlan(caps = {}) {
  const route = chooseListenRoute(caps);
  const onDevice = route !== "none" && caps.onDevice === true;
  return {
    route,
    onDevice,
    service: route === "none" ? "none" : (onDevice ? "on-device" : "os-speech-service"),
    notice: route === "none" ? listenUnavailableNotice(caps) : serviceNotice(route, onDevice)
  };
}

export function recognitionStartOptions({ onDevice, lang = "en-US" } = {}) {
  const options = {
    lang,
    interimResults: true,
    continuous: true,
    maxAlternatives: 1,
    addsPunctuation: onDevice === true,
    contextualStrings: ["Yehsa"],
    iosTaskHint: "dictation"
  };
  if (onDevice === true) options.requiresOnDeviceRecognition = true;
  return options;
}

export function webRecognitionSettings({ onDevice, lang = "en-US" } = {}) {
  return {
    lang,
    interimResults: true,
    continuous: true,
    maxAlternatives: 1,
    processLocally: onDevice === true
  };
}

export function applyRecognitionEvent(state, event) {
  const finals = Array.isArray(state?.finals) ? state.finals.slice() : [];
  const results = Array.isArray(event?.results) ? event.results : [];
  if (event?.replace === true) {
    const nextFinals = [];
    let interim = "";
    for (const item of results) {
      const text = normalizeHeard(item?.transcript);
      if (!text) continue;
      if (item?.isFinal === true) nextFinals.push(text);
      else interim = text;
    }
    return { finals: nextFinals, interim };
  }
  if (event?.isFinal === true) {
    const text = normalizeHeard(results.map((item) => item?.transcript || "").join(" "));
    if (text && finals[finals.length - 1] !== text) finals.push(text);
    return { finals, interim: "" };
  }
  return { finals, interim: normalizeHeard(results[0]?.transcript || "") };
}

export function transcriptText(state) {
  if (!state) return "";
  const parts = Array.isArray(state.finals) ? state.finals.slice() : [];
  const interim = normalizeHeard(state.interim || "");
  if (interim) parts.push(interim);
  return normalizeHeard(parts.join(" "));
}

export function releaseKeepsListening(heldMs) {
  return Number.isFinite(heldMs) && heldMs >= 0 && heldMs < TAP_LOCK_MS;
}

export function reduceVoiceGesture(state, event) {
  const phase = state?.phase || "idle";
  const at = Number(event?.at);
  if (event?.type === "press-in") {
    if (phase === "locked" || phase === "arming" || phase === "listening") {
      return { phase: "idle", pressedAt: null, action: "stop" };
    }
    return { phase: "arming", pressedAt: Number.isFinite(at) ? at : 0, action: "start" };
  }
  if (event?.type === "press-out" || event?.type === "cancel") {
    if (phase !== "arming" && phase !== "listening") {
      return { phase, pressedAt: state?.pressedAt ?? null, action: "none" };
    }
    const started = Number(state?.pressedAt);
    const held = Number.isFinite(at) && Number.isFinite(started) ? at - started : TAP_LOCK_MS;
    if (event?.type === "press-out" && releaseKeepsListening(held)) {
      return { phase: "locked", pressedAt: null, action: "keep" };
    }
    return { phase: "idle", pressedAt: null, action: "stop" };
  }
  if (event?.type === "hearing") {
    if (phase === "arming") {
      return { phase: "listening", pressedAt: state?.pressedAt ?? null, action: "none" };
    }
    return { phase, pressedAt: state?.pressedAt ?? null, action: "none" };
  }
  return { phase, pressedAt: state?.pressedAt ?? null, action: "none" };
}

export function voiceButtonLabel({ gesture, canListen, checked }) {
  if (checked !== true) return "Checking the microphone…";
  if (canListen !== true) return "Speech recognition unavailable";
  if (gesture === "arming" || gesture === "listening") return "Listening… release to ask";
  if (gesture === "locked") return "Listening… tap to ask";
  return "Hold to talk";
}

export function recognitionErrorNotice(code) {
  switch (code) {
    case "not-allowed":
      return "Microphone or speech recognition permission was not granted. Nothing was heard. Type the question.";
    case "service-not-allowed":
      return "The speech recognizer is unavailable on this device. Type the question. The notes stay on this phone.";
    case "no-speech":
    case "speech-timeout":
      return "Nothing was heard. Hold to talk, or type the question.";
    case "network":
      return "The OS speech service needed a network and did not return words. Type the question. The notes stay on this phone.";
    case "language-not-supported":
      return "This recognizer has no English model ready. Type the question. The notes stay on this phone.";
    case "audio-capture":
      return "The microphone could not be opened. Type the question.";
    case "interrupted":
      return "Listening was interrupted. Hold to talk again, or type the question.";
    case "aborted":
      return null;
    default:
      return "Speech recognition stopped. Type the question. The notes stay on this phone.";
  }
}

export function submitHeard(text, errorCode) {
  const heard = normalizeHeard(text);
  if (heard) return { submit: true, text: heard, notice: null };
  if (errorCode === "aborted") return { submit: false, text: "", notice: null };
  if (errorCode && errorCode !== "no-speech" && errorCode !== "speech-timeout") {
    return { submit: false, text: "", notice: recognitionErrorNotice(errorCode) };
  }
  return { submit: false, text: "", notice: "Nothing was heard. Hold to talk, or type the question." };
}

export function spokenAnswer(text) {
  const prose = normalizeHeard(text);
  return prose || null;
}
