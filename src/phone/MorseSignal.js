// Copy, Flash and Whistle for the Morse screen. Flash uses the camera's torch and says so plainly
// when it cannot. Whistle is a tone pattern from the speaker, not a physical whistle.
import React, { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as Clipboard from "expo-clipboard";
import * as FileSystem from "expo-file-system";
import { createAudioPlayer } from "expo-audio";
import { Action, Quiet } from "./ui.js";
import { MAX_CHARS, NEEDS_CAMERA_PERMISSION, NO_FLASHLIGHT, WHISTLE_NOTE, base64, timeline, toMorse, wavBytes } from "../../symbolic/morse_signal.js";

export default function MorseSignal({ text }) {
  const [permission, requestPermission] = useCameraPermissions();
  const [status, setStatus] = useState("");
  const [running, setRunning] = useState(null);
  const [torch, setTorch] = useState(false);
  const stop = useRef(false);
  const player = useRef(null);
  const code = toMorse(text);
  const tooLong = String(text || "").length > MAX_CHARS;

  useEffect(() => () => {
    stop.current = true;
    try { player.current?.remove(); } catch {}
  }, []);

  async function copy() {
    try {
      await Clipboard.setStringAsync(code);
      setStatus("Copied.");
    } catch {
      setStatus("I couldn't copy that. Select the code above and copy it by hand.");
    }
  }

  async function flash() {
    if (running) { stop.current = true; return; }
    if (tooLong) { setStatus(`Keep it under ${MAX_CHARS} characters for a light signal.`); return; }
    let available = false;
    try { available = await CameraView.isAvailableAsync(); } catch {}
    if (!available) { setStatus(NO_FLASHLIGHT); return; }
    let granted = permission?.granted === true;
    if (!granted) granted = (await requestPermission())?.granted === true;
    if (!granted) { setStatus(NEEDS_CAMERA_PERMISSION); return; }
    stop.current = false;
    setRunning("flash");
    setStatus("Flashing. Tap Stop to end it.");
    await new Promise((resolve) => setTimeout(resolve, 400));
    for (const step of timeline(text, 200)) {
      if (stop.current) break;
      setTorch(step.on);
      await new Promise((resolve) => setTimeout(resolve, step.ms));
    }
    setTorch(false);
    setRunning(null);
    setStatus(stop.current ? "Stopped." : "Done.");
  }

  async function whistle() {
    if (running) { stop.current = true; try { player.current?.pause(); } catch {} return; }
    if (tooLong) { setStatus(`Keep it under ${MAX_CHARS} characters for a tone signal.`); return; }
    try {
      const uri = `${FileSystem.cacheDirectory}yehsa-morse.wav`;
      await FileSystem.writeAsStringAsync(uri, base64(wavBytes(text)), { encoding: FileSystem.EncodingType.Base64 });
      try { player.current?.remove(); } catch {}
      player.current = createAudioPlayer({ uri });
      player.current.volume = 1;
      stop.current = false;
      setRunning("whistle");
      setStatus("Playing the tone pattern. Tap Stop to end it.");
      player.current.play();
      const total = timeline(text, 160).reduce((sum, step) => sum + step.ms, 0);
      await new Promise((resolve) => setTimeout(resolve, total));
      setRunning(null);
      setStatus(stop.current ? "Stopped." : "Done.");
    } catch {
      setRunning(null);
      setStatus("I couldn't play the tone on this phone.");
    }
  }

  return (
    <View style={{ gap: 8 }}>
      <Action label="Copy the code" tone="quiet" disabled={!code} onPress={copy} />
      <Action label={running === "flash" ? "Stop flashing" : "Flash it"} tone="quiet" disabled={!code || running === "whistle"} onPress={flash} accessibilityHint="Blinks the phone's flashlight in the pattern." />
      <Action label={running === "whistle" ? "Stop the tone" : "Whistle it"} tone="quiet" disabled={!code || running === "flash"} onPress={whistle} accessibilityHint="Plays the pattern as a loud tone." />
      {status ? <Quiet live>{status}</Quiet> : null}
      <Quiet>{WHISTLE_NOTE}</Quiet>
      {running === "flash" ? (
        <CameraView style={{ width: 1, height: 1, opacity: 0.01 }} facing="back" enableTorch={torch} />
      ) : null}
    </View>
  );
}
