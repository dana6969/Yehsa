// Native speech recognition for the Expo shell on Android and iOS.
// expo-speech-recognition is not in Expo Go. A missing module stays unavailable.
// The microphone starts only inside openRecognizer(), after the person holds or taps.

import {
  applyRecognitionEvent,
  listenUnavailableNotice,
  recognitionErrorNotice,
  recognitionStartOptions,
  transcriptText
} from "../../symbolic/voice_adapter.js";

let modulePromise = null;
const ON_DEVICE_RETRY = new Set(["language-not-supported", "service-not-allowed", "network", "audio-capture", "client"]);

function loadModule() {
  if (!modulePromise) {
    modulePromise = import("expo-speech-recognition").then(
      (mod) => mod?.ExpoSpeechRecognitionModule || null,
      () => null
    );
  }
  return modulePromise;
}

async function executionEnvironment() {
  try {
    const mod = await import("expo-constants");
    const constants = mod?.default || mod;
    return constants?.executionEnvironment || null;
  } catch {
    return null;
  }
}

export async function listenCapabilities() {
  const runtime = await executionEnvironment();
  if (runtime === "storeClient") {
    return {
      nativeModule: false,
      recognitionAvailable: false,
      webSpeech: false,
      onDevice: false,
      runtime: "expo-go"
    };
  }
  const speech = await loadModule();
  if (!speech || typeof speech.isRecognitionAvailable !== "function") {
    return {
      nativeModule: false,
      recognitionAvailable: false,
      webSpeech: false,
      onDevice: false,
      runtime
    };
  }
  let recognitionAvailable = false;
  let onDevice = false;
  try {
    recognitionAvailable = speech.isRecognitionAvailable() === true;
  } catch {
    recognitionAvailable = false;
  }
  if (recognitionAvailable && typeof speech.supportsOnDeviceRecognition === "function") {
    try {
      onDevice = speech.supportsOnDeviceRecognition() === true;
    } catch {
      onDevice = false;
    }
  }
  return {
    nativeModule: true,
    recognitionAvailable,
    webSpeech: false,
    onDevice,
    runtime
  };
}

function closed(reason, code) {
  return {
    started: false,
    reason,
    code,
    stop: async () => "",
    abort() {}
  };
}

export async function openRecognizer({ onDevice, onTranscript, onEnd, onError } = {}) {
  const caps = await listenCapabilities();
  if (caps.nativeModule !== true) {
    return closed(
      listenUnavailableNotice({ os: "android", runtime: caps.runtime, nativeModule: false }),
      "service-not-allowed"
    );
  }
  if (caps.recognitionAvailable !== true) {
    return closed(
      listenUnavailableNotice({ os: "android", nativeModule: true, recognitionAvailable: false }),
      "service-not-allowed"
    );
  }
  const speech = await loadModule();
  let permission = null;
  try {
    permission = await speech.requestPermissionsAsync();
  } catch {
    permission = null;
  }
  if (permission?.granted !== true && permission?.status !== "granted") {
    return closed(recognitionErrorNotice("not-allowed"), "not-allowed");
  }

  let state = { finals: [], interim: "" };
  let onDeviceTry = onDevice === true;
  let retried = false;
  let restartPending = false;
  let finished = false;
  let accepted = false;
  let resultText = "";
  let resolveStop = () => {};
  const done = new Promise((resolve) => {
    resolveStop = resolve;
  });
  const subs = [];
  const listen = (name, fn) => {
    try {
      const sub = speech.addListener(name, fn);
      if (sub) subs.push(sub);
    } catch {
      // A missing event is not a transcript.
    }
  };
  const clear = () => {
    while (subs.length) {
      try {
        subs.pop().remove();
      } catch {
        // Removing a listener is not a question.
      }
    }
  };
  const finish = () => {
    if (finished) return;
    finished = true;
    resultText = transcriptText(state);
    clear();
    resolveStop(resultText);
    if (!accepted) return;
    try {
      onEnd?.(resultText);
    } catch {
      // The screen owns the transcript.
    }
  };

  listen("result", (event) => {
    state = applyRecognitionEvent(state, {
      isFinal: event?.isFinal === true,
      results: event?.results
    });
    try {
      onTranscript?.(transcriptText(state));
    } catch {
      // A live transcript is not yet the asked question.
    }
  });
  listen("error", (event) => {
    // R10: Android says it can recognize on the device even when the offline language pack is not
    // downloaded, then fails at once. Before anything is heard, start again once with the phone's
    // regular recognizer instead of leaving the mic dead.
    const code = event?.error || "unknown";
    if (onDeviceTry && !retried && !transcriptText(state) && ON_DEVICE_RETRY.has(code)) {
      retried = true;
      onDeviceTry = false;
      restartPending = true;
      return;
    }
    try {
      onError?.(event?.error || "unknown");
    } catch {
      // The screen reports the code.
    }
  });
  listen("end", () => {
    // The end of the failed on-device try is not the end of listening: start the regular one now.
    if (restartPending) {
      restartPending = false;
      try {
        speech.start(recognitionStartOptions({ onDevice: false }));
        return;
      } catch {
        // could not start again; finish below
      }
    }
    finish();
  });

  try {
    speech.start(recognitionStartOptions({ onDevice: onDevice === true }));
  } catch {
    finished = true;
    clear();
    return closed(
      "Speech recognition did not start. Type the question. The notes stay on this phone.",
      "audio-capture"
    );
  }
  accepted = true;

  return {
    started: true,
    reason: null,
    code: null,
    stop() {
      if (finished) return Promise.resolve(resultText);
      try {
        speech.stop();
      } catch {
        finish();
      }
      setTimeout(finish, 2500);
      return done;
    },
    abort() {
      try {
        speech.abort();
      } catch {
        finish();
      }
    }
  };
}
