import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { askField } from "./symbolic/phone_field.js";
import {
  TAP_LOCK_MS,
  applyRecognitionEvent,
  chooseListenRoute,
  chooseSpeakRoute,
  listenPlan,
  recognitionErrorNotice,
  recognitionStartOptions,
  reduceVoiceGesture,
  releaseKeepsListening,
  spokenAnswer,
  submitHeard,
  transcriptText,
  voiceButtonLabel,
  webRecognitionSettings
} from "./symbolic/voice_adapter.js";
import { listenCapabilities, openRecognizer } from "./src/phone/speech_listen.js";

const passages = JSON.parse(fs.readFileSync("symbolic_memory/books_index.json", "utf8")).passages;

test("listen and speak routes stay honest when a platform is missing", () => {
  assert.equal(chooseListenRoute({ os: "web", webSpeech: true }), "web-speech");
  assert.equal(chooseListenRoute({ os: "web", webSpeech: false }), "none");
  assert.equal(chooseListenRoute({
    os: "android",
    nativeModule: true,
    recognitionAvailable: true,
    webSpeech: true
  }), "native-speech");
  assert.equal(chooseListenRoute({
    os: "ios",
    nativeModule: false,
    recognitionAvailable: false,
    webSpeech: true
  }), "none");
  assert.equal(chooseListenRoute({
    os: "android",
    nativeModule: true,
    recognitionAvailable: false
  }), "none");
  assert.equal(chooseListenRoute({}), "none");

  assert.equal(chooseSpeakRoute({ expoSpeech: true, webSynthesis: true }), "expo-speech");
  assert.equal(chooseSpeakRoute({ webSynthesis: true }), "web-speech-synthesis");
  assert.equal(chooseSpeakRoute({}), "none");

  const expoGo = listenPlan({ os: "ios", runtime: "expo-go", nativeModule: false });
  assert.equal(expoGo.route, "none");
  assert.equal(expoGo.onDevice, false);
  assert.match(expoGo.notice, /Expo Go/);
  assert.match(expoGo.notice, /Type the question/);
  assert.match(expoGo.notice, /notes stay on this phone/);

  const onDevice = listenPlan({
    os: "android",
    nativeModule: true,
    recognitionAvailable: true,
    onDevice: true
  });
  assert.equal(onDevice.route, "native-speech");
  assert.equal(onDevice.service, "on-device");
  assert.match(onDevice.notice, /on-device/);

  const service = listenPlan({ os: "web", webSpeech: true, onDevice: false });
  assert.equal(service.service, "os-speech-service");
  assert.match(service.notice, /speech service/);
  assert.match(service.notice, /field notes stay on this phone/);
  assert.doesNotMatch(service.notice, /on-device recognizer/);
});

test("on-device start options are requested only when the recognizer can do it", () => {
  const local = recognitionStartOptions({ onDevice: true });
  assert.equal(local.requiresOnDeviceRecognition, true);
  assert.equal(local.interimResults, true);
  assert.equal(local.continuous, true);
  assert.deepEqual(local.contextualStrings, ["Yehsa"]);
  const remote = recognitionStartOptions({ onDevice: false });
  assert.equal(Object.hasOwn(remote, "requiresOnDeviceRecognition"), false);
  assert.equal(webRecognitionSettings({ onDevice: true }).processLocally, true);
  assert.equal(webRecognitionSettings({ onDevice: false }).processLocally, false);
});

test("transcripts keep wording and a later final segment", () => {
  let state = applyRecognitionEvent(null, {
    isFinal: false,
    results: [{ transcript: "  how   do " }]
  });
  state = applyRecognitionEvent(state, {
    isFinal: false,
    results: [{ transcript: "how do I carry water" }]
  });
  assert.equal(transcriptText(state), "how do I carry water");
  state = applyRecognitionEvent(state, {
    isFinal: true,
    results: [{ transcript: "how do I carry water" }]
  });
  state = applyRecognitionEvent(state, {
    isFinal: true,
    results: [{ transcript: "I am scared" }]
  });
  assert.equal(transcriptText(state), "how do I carry water I am scared");

  const web = applyRecognitionEvent(null, {
    replace: true,
    results: [
      { transcript: "I am scared, how do I carry drinking water?", isFinal: true },
      { transcript: "please", isFinal: false }
    ]
  });
  assert.equal(
    transcriptText(web),
    "I am scared, how do I carry drinking water? please"
  );
});

test("a spoken question keeps the wording cue and still answers when the cue is unclear", () => {
  const scared = transcriptText(applyRecognitionEvent(null, {
    isFinal: true,
    results: [{ transcript: "I am scared, how do I carry drinking water?" }]
  }));
  const withFear = askField(scared, passages);
  assert.equal(withFear.answered, true);
  assert.match(withFear.text.toLowerCase(), /water/);
  assert.match(withFear.cue, /fear/);
  assert.equal(spokenAnswer(withFear.text).includes("Wording cue"), false);

  const plain = transcriptText(applyRecognitionEvent(null, {
    isFinal: true,
    results: [{ transcript: "How do I carry drinking water?" }]
  }));
  const unclear = askField(plain, passages);
  assert.equal(unclear.answered, true);
  assert.equal(unclear.cue, null);
  assert.match(unclear.text.toLowerCase(), /water/);
  assert.equal(spokenAnswer(unclear.text), unclear.text.replace(/\s+/g, " ").trim());
  assert.equal(spokenAnswer("   "), null);
});

test("hold releases to ask and a short tap stays listening", () => {
  assert.equal(releaseKeepsListening(TAP_LOCK_MS - 1), true);
  assert.equal(releaseKeepsListening(TAP_LOCK_MS), false);

  let gesture = reduceVoiceGesture({ phase: "idle" }, { type: "press-in", at: 1000 });
  assert.equal(gesture.action, "start");
  assert.equal(gesture.phase, "arming");
  gesture = reduceVoiceGesture(gesture, { type: "hearing" });
  assert.equal(gesture.phase, "listening");
  gesture = reduceVoiceGesture(gesture, { type: "press-out", at: 1000 + TAP_LOCK_MS });
  assert.equal(gesture.action, "stop");
  assert.equal(gesture.phase, "idle");

  gesture = reduceVoiceGesture({ phase: "idle" }, { type: "press-in", at: 2000 });
  gesture = reduceVoiceGesture(gesture, { type: "press-out", at: 2000 + TAP_LOCK_MS - 1 });
  assert.equal(gesture.action, "keep");
  assert.equal(gesture.phase, "locked");
  gesture = reduceVoiceGesture(gesture, { type: "press-in", at: 3000 });
  assert.equal(gesture.action, "stop");
  assert.equal(reduceVoiceGesture({ phase: "idle" }, { type: "press-out", at: 1 }).action, "none");

  assert.equal(voiceButtonLabel({ gesture: "idle", canListen: true, checked: false }), "Checking the microphone…");
  assert.equal(voiceButtonLabel({ gesture: "idle", canListen: false, checked: true }), "Speech recognition unavailable");
  assert.equal(voiceButtonLabel({ gesture: "idle", canListen: true, checked: true }), "Hold to talk");
  assert.equal(voiceButtonLabel({ gesture: "locked", canListen: true, checked: true }), "Listening… tap to ask");
});

test("empty audio does not become an answer", () => {
  assert.deepEqual(submitHeard("  ", "no-speech"), {
    submit: false,
    text: "",
    notice: "Nothing was heard. Hold to talk, or type the question."
  });
  assert.equal(submitHeard("", "aborted").notice, null);
  assert.match(submitHeard("", "not-allowed").notice, /permission/);
  assert.match(submitHeard("", "network").notice, /network/);
  assert.match(recognitionErrorNotice("network"), /notes stay on this phone/);
  const heard = submitHeard("how do I carry drinking water", "no-speech");
  assert.equal(heard.submit, true);
  assert.match(heard.text, /water/);
});

test("the ask screen uses the same path for speech and keeps typing", () => {
  const home = fs.readFileSync("src/phone/YehsaApp.js", "utf8");
  const askBody = home.slice(home.indexOf("function AskPane"), home.indexOf("function LandPane"));
  assert.match(askBody, /askField\(text, books\.passages/);
  assert.match(askBody, /speakProse\(result\.text/);
  assert.doesNotMatch(askBody, /speakProse\(result\.cue/);
  assert.match(askBody, /accessibilityLabel="Message"/);
  assert.match(askBody, /Hold to talk/);
  assert.match(askBody, /function ask\(\)/);
  assert.match(askBody, /probeVoice/);
  assert.doesNotMatch(askBody, /requestPermissionsAsync/);
  assert.match(home, /Hear the answer/);

  const adapter = fs.readFileSync("symbolic/voice_adapter.js", "utf8");
  assert.doesNotMatch(adapter, /\bimport\b|\brequire\b/);
  const web = fs.readFileSync("src/phone/speech_listen.js", "utf8");
  const native = fs.readFileSync("src/phone/speech_listen.native.js", "utf8");
  assert.match(web, /webkitSpeechRecognition/);
  assert.doesNotMatch(web, /expo-speech-recognition/);
  assert.match(native, /expo-speech-recognition/);
  assert.match(native, /storeClient/);
  assert.match(native, /requiresOnDeviceRecognition|recognitionStartOptions/);
  const provider = fs.readFileSync("src/phone/speech_provider.js", "utf8");
  assert.match(provider, /from "expo-speech"/);
  assert.match(provider, /from "react-native"/);
  assert.doesNotMatch(provider, /import\("react-native"\)|import\("expo-speech"\)/);

  const manifest = JSON.parse(fs.readFileSync("app.json", "utf8"));
  assert.equal(manifest.expo.name, "Yehsa");
  assert.ok(manifest.expo.android.permissions.includes("RECORD_AUDIO"));
  assert.match(manifest.expo.ios.infoPlist.NSMicrophoneUsageDescription, /microphone/);
  assert.match(manifest.expo.ios.infoPlist.NSSpeechRecognitionUsageDescription, /text/);
  assert.ok(manifest.expo.plugins.some((plugin) => {
    const name = Array.isArray(plugin) ? plugin[0] : plugin;
    return name === "expo-speech-recognition";
  }));
  assert.equal(fs.existsSync("symbolic_memory/webster_raw.json"), true);
  assert.equal(fs.existsSync("symbolic_memory/full_dictionary.json"), true);
});

test("a runtime with no Web Speech API does not invent words", async () => {
  const caps = await listenCapabilities();
  assert.equal(caps.webSpeech, false);
  assert.equal(caps.onDevice, false);
  const opened = openRecognizer({
    onDevice: true,
    onTranscript() {
      throw new Error("no transcript without a recognizer");
    }
  });
  assert.equal(opened.started, false);
  assert.match(opened.reason, /no speech recognizer/);
  assert.equal(await opened.stop(), "");
});
