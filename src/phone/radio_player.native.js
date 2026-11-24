// Streams an internet radio station through expo-audio. Needs signal. Only runs after a tap on Play.
// On Android a foreground media service keeps the stream going when the phone is locked.
import { createAudioPlayer, setAudioModeAsync } from "expo-audio";
import { PermissionsAndroid, Platform } from "react-native";
import { addRadioCommandListener, setRadioPaused, startRadioService, stopRadioService } from "./radio_background.js";

let player = null;
let playback = null;
const listeners = new Set();
let commandUnsub = null;

function notify() {
  for (const fn of listeners) {
    try { fn(playback); } catch {}
  }
}

function setPlayback(next) {
  playback = next;
  notify();
}

async function allowNotifications() {
  if (Platform.OS !== "android" || (Platform.Version || 0) < 33) return;
  try {
    await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
  } catch {}
}

function ensureCommandListener() {
  if (commandUnsub) return;
  commandUnsub = addRadioCommandListener((action) => {
    if (action === "pause") pauseStream();
    else if (action === "play") resumeStream();
    else if (action === "stop") stopStream();
  });
}

export function radioPlayerAvailable() {
  return true;
}

export function getPlayback() {
  return playback;
}

export function subscribePlayback(fn) {
  listeners.add(fn);
  try { fn(playback); } catch {}
  return () => listeners.delete(fn);
}

export async function playStream(url, info = {}) {
  stopStream();
  await setAudioModeAsync({
    playsInSilentMode: true,
    shouldPlayInBackground: true,
    interruptionMode: "doNotMix",
    interruptionModeAndroid: "duckOthers",
    allowsRecording: false
  }).catch(() => {});
  await allowNotifications();
  ensureCommandListener();
  player = createAudioPlayer({ uri: url });
  player.play();
  const name = String(info.name || "").trim() || "Yehsa Radio";
  setPlayback({ url, id: info.id || url, name, paused: false });
  startRadioService({ title: name, artist: "Yehsa Radio" });
  return player;
}

export function pauseStream() {
  if (!player || !playback || playback.paused) return;
  try { player.pause(); } catch {}
  setPlayback({ ...playback, paused: true });
  setRadioPaused(true);
}

export function resumeStream() {
  if (!player || !playback || !playback.paused) return;
  try { player.play(); } catch {}
  setPlayback({ ...playback, paused: false });
  setRadioPaused(false);
}

export function stopStream() {
  if (player) {
    try { player.pause(); player.remove(); } catch {}
    player = null;
  }
  const wasPlaying = !!playback;
  setPlayback(null);
  if (wasPlaying) stopRadioService();
}
