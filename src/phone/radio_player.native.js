// Streams an internet radio station through expo-audio. Needs signal. Only runs after a tap on Play.
import { createAudioPlayer, setAudioModeAsync } from "expo-audio";

let player = null;

export function radioPlayerAvailable() {
  return true;
}

export async function playStream(url) {
  stopStream();
  await setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: false }).catch(() => {});
  player = createAudioPlayer({ uri: url });
  player.play();
  return player;
}

export function stopStream() {
  if (player) {
    try { player.pause(); player.remove(); } catch {}
    player = null;
  }
}
