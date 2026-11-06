// Web Speech API for the Ask tab, and the stub Node and web bundles use.
// Metro loads speech_listen.native.js on Android and iOS.
// Nothing here starts the microphone until openRecognizer() is called.

import {
  applyRecognitionEvent,
  listenUnavailableNotice,
  transcriptText,
  webRecognitionSettings
} from "../../symbolic/voice_adapter.js";

const AVAILABLE_MS = 1500;

function speechCtor() {
  const root = globalThis;
  return root.SpeechRecognition || root.webkitSpeechRecognition || null;
}

function withTimeout(promise, ms) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (value) => {
      if (done) return;
      done = true;
      resolve(value);
    };
    const timer = setTimeout(() => finish(null), ms);
    Promise.resolve(promise).then(
      (value) => {
        clearTimeout(timer);
        finish(value);
      },
      () => {
        clearTimeout(timer);
        finish(null);
      }
    );
  });
}

async function onDeviceReady(Ctor) {
  if (!Ctor || typeof Ctor.available !== "function") return false;
  const status = await withTimeout(
    Ctor.available({ langs: ["en-US"], processLocally: true }),
    AVAILABLE_MS
  );
  return status === "available";
}

export async function listenCapabilities() {
  const Ctor = speechCtor();
  if (typeof Ctor !== "function") {
    return {
      nativeModule: false,
      recognitionAvailable: false,
      webSpeech: false,
      onDevice: false,
      runtime: "web"
    };
  }
  const onDevice = await onDeviceReady(Ctor);
  return {
    nativeModule: false,
    recognitionAvailable: true,
    webSpeech: true,
    onDevice,
    runtime: "web"
  };
}

function bindRecognizer(rec, handlers) {
  let state = { finals: [], interim: "" };
  let finished = false;
  let accepted = false;
  let resultText = "";
  let resolveStop = () => {};
  const done = new Promise((resolve) => {
    resolveStop = resolve;
  });

  const finish = () => {
    if (finished) return;
    finished = true;
    resultText = transcriptText(state);
    resolveStop(resultText);
    if (!accepted) return;
    try {
      handlers.onEnd?.(resultText);
    } catch {
      // The screen owns what to do with the transcript.
    }
  };

  rec.onresult = (event) => {
    const results = [];
    const list = event?.results;
    const count = Number(list?.length) || 0;
    for (let i = 0; i < count; i += 1) {
      const item = list[i];
      results.push({
        transcript: item?.[0]?.transcript || "",
        isFinal: item?.isFinal === true
      });
    }
    state = applyRecognitionEvent(state, { replace: true, results });
    try {
      handlers.onTranscript?.(transcriptText(state));
    } catch {
      // A transcript update is not a stored question.
    }
  };
  rec.onerror = (event) => {
    if (!accepted) return;
    try {
      handlers.onError?.(event?.error || "unknown");
    } catch {
      // The screen reports the code.
    }
  };
  rec.onend = () => finish();

  return {
    accept() {
      accepted = true;
    },
    stop() {
      if (finished) return Promise.resolve(resultText);
      try {
        rec.stop();
      } catch {
        finish();
      }
      setTimeout(finish, 2500);
      return done;
    },
    abort() {
      try {
        rec.abort();
      } catch {
        finish();
      }
    }
  };
}

function arm(Ctor, settings) {
  const rec = new Ctor();
  rec.lang = settings.lang;
  rec.interimResults = settings.interimResults;
  rec.continuous = settings.continuous;
  rec.maxAlternatives = settings.maxAlternatives;
  if (settings.processLocally === true) {
    try {
      rec.processLocally = true;
    } catch {
      // The property is absent. The caller already labeled this as the browser service.
    }
  }
  return rec;
}

export function openRecognizer({ onDevice, onTranscript, onEnd, onError } = {}) {
  const Ctor = speechCtor();
  if (typeof Ctor !== "function") {
    return {
      started: false,
      reason: listenUnavailableNotice({ os: "web" }),
      code: "service-not-allowed",
      stop: async () => "",
      abort() {}
    };
  }
  const settings = webRecognitionSettings({ onDevice: onDevice === true });
  const handlers = { onTranscript, onEnd, onError };
  const failed = {
    started: false,
    reason: "This browser did not start speech recognition. Type the question.",
    code: "audio-capture",
    stop: async () => "",
    abort() {}
  };
  let rec = arm(Ctor, settings);
  let session = bindRecognizer(rec, handlers);
  try {
    rec.start();
  } catch {
    try {
      session.abort();
    } catch {
      // The first start did not begin.
    }
    if (settings.continuous !== true) return failed;
    rec = arm(Ctor, { ...settings, continuous: false });
    session = bindRecognizer(rec, handlers);
    try {
      rec.start();
    } catch {
      return failed;
    }
  }
  session.accept();
  return {
    started: true,
    reason: null,
    code: null,
    stop: () => session.stop(),
    abort: () => session.abort()
  };
}
