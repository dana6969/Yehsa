// Copy, Light, Screen and Tone for the Morse screen (R10).
// Light is the phone's flashlight through the YehsaTorch module: no camera preview, timed on its own
// native thread, so dots, dashes and gaps keep Morse timing. If that module is missing it falls back to
// expo-camera's torch. Screen flashes the whole display white; Tone plays the pattern from the speaker.
// Every one stops on Stop, when you leave the screen, and when the app goes to the background (unless
// you chose to keep the light going with the screen off).
import React, { useEffect, useRef, useState } from "react";
import { AppState, Modal, Pressable, Switch, Text, View } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as Clipboard from "expo-clipboard";
import * as FileSystem from "expo-file-system";
import { createAudioPlayer } from "expo-audio";
import { Action, Quiet, colors } from "./ui.js";
import { keepTorchInBackground, onTorchState, playTorch, stopTorch, torchAvailable } from "./torch";
import {
  DEFAULT_WPM, MAX_CHARS, NEEDS_CAMERA_PERMISSION, NO_FLASHLIGHT, WHISTLE_NOTE, WPM_CHOICES,
  alternating, base64, signalSteps, toMorse, totalMs, unitForWpm, wavBytes
} from "../../symbolic/morse_signal.js";

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function Chip({ label, on, onPress, hint }) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: on }}
      accessibilityLabel={label}
      accessibilityHint={hint}
      onPress={onPress}
      hitSlop={4}
      style={{ minHeight: 40, paddingHorizontal: 12, justifyContent: "center", borderRadius: 20, borderWidth: 2, borderColor: on ? colors.brass : colors.lineStrong, backgroundColor: on ? colors.brass : "transparent" }}
    >
      <Text style={{ color: on ? colors.brassInk : colors.ink, fontWeight: "600" }}>{label}</Text>
    </Pressable>
  );
}

function Toggle({ label, value, onChange }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 44 }}>
      <Text style={{ color: colors.ink, flex: 1 }}>{label}</Text>
      <Switch accessibilityLabel={label} value={value} onValueChange={onChange} />
    </View>
  );
}

export default function MorseSignal({ text }) {
  const [permission, requestPermission] = useCameraPermissions();
  const [status, setStatus] = useState("");
  const [running, setRunning] = useState(null);
  const [torch, setTorch] = useState(false);
  const [screenOn, setScreenOn] = useState(false);
  const [wpm, setWpm] = useState(DEFAULT_WPM);
  const [loop, setLoop] = useState(false);
  const [keepOn, setKeepOn] = useState(false);
  const stop = useRef(false);
  const player = useRef(null);
  const keepRef = useRef(false);
  const code = toMorse(text);
  const tooLong = String(text || "").length > MAX_CHARS;

  function stopAll(note = "Stopped.") {
    stop.current = true;
    stopTorch();
    setTorch(false);
    setScreenOn(false);
    try { player.current?.pause(); } catch {}
    setRunning(null);
    if (note) setStatus(note);
  }

  useEffect(() => { keepRef.current = keepOn; keepTorchInBackground(keepOn); }, [keepOn]);

  useEffect(() => {
    const offState = onTorchState((event) => {
      if (event?.playing === false) {
        setRunning((now) => (now === "light" ? null : now));
        if (event.reason === "done") setStatus("Done.");
        if (event.reason === "background") setStatus("Stopped when Yehsa went to the background.");
      }
    });
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") return;
      // The native light keeps going only if you asked for that; the screen flash and tone always stop.
      if (!keepRef.current) stopAll("Stopped when Yehsa went to the background.");
    });
    return () => {
      offState();
      try { sub.remove(); } catch {}
      stop.current = true;
      stopTorch();
      keepTorchInBackground(false);
      try { player.current?.remove(); } catch {}
    };
  }, []);

  async function copy() {
    try {
      await Clipboard.setStringAsync(code);
      setStatus("Copied.");
    } catch {
      setStatus("I couldn't copy that. Select the code above and copy it by hand.");
    }
  }

  async function light() {
    if (running) { stopAll(); return; }
    if (tooLong) { setStatus(`Keep it under ${MAX_CHARS} characters for a light signal.`); return; }
    const steps = signalSteps(text, wpm);
    stop.current = false;
    if (torchAvailable()) {
      if (playTorch(alternating(steps), loop)) {
        setRunning("light");
        setStatus(loop ? "Flashing the light over and over. Tap Stop to end it." : "Flashing the light. Tap Stop to end it.");
        return;
      }
    }
    // Fallback: expo-camera's torch, timed from JavaScript.
    let available = false;
    try { available = await CameraView.isAvailableAsync(); } catch {}
    if (!available) { setStatus(NO_FLASHLIGHT); return; }
    let granted = permission?.granted === true;
    if (!granted) granted = (await requestPermission())?.granted === true;
    if (!granted) { setStatus(NEEDS_CAMERA_PERMISSION); return; }
    setRunning("camera");
    setStatus("Flashing the light. Tap Stop to end it.");
    await wait(600);
    do {
      for (const step of steps) {
        if (stop.current) break;
        setTorch(step.on);
        await wait(step.ms);
      }
    } while (loop && !stop.current);
    setTorch(false);
    setRunning(null);
    setStatus(stop.current ? "Stopped." : "Done.");
  }

  async function screen() {
    if (running) { stopAll(); return; }
    if (tooLong) { setStatus(`Keep it under ${MAX_CHARS} characters for a light signal.`); return; }
    const steps = signalSteps(text, wpm);
    stop.current = false;
    setRunning("screen");
    setStatus("Flashing the screen. Tap the screen to stop.");
    do {
      for (const step of steps) {
        if (stop.current) break;
        setScreenOn(step.on);
        await wait(step.ms);
      }
    } while (loop && !stop.current);
    setScreenOn(false);
    setRunning(null);
    setStatus(stop.current ? "Stopped." : "Done.");
  }

  async function tone() {
    if (running) { stopAll(); return; }
    if (tooLong) { setStatus(`Keep it under ${MAX_CHARS} characters for a tone signal.`); return; }
    try {
      const unitMs = unitForWpm(wpm);
      const uri = `${FileSystem.cacheDirectory}yehsa-morse.wav`;
      await FileSystem.writeAsStringAsync(uri, base64(wavBytes(text, { unitMs, steps: signalSteps(text, wpm) })), { encoding: FileSystem.EncodingType.Base64 });
      try { player.current?.remove(); } catch {}
      player.current = createAudioPlayer({ uri });
      player.current.volume = 1;
      player.current.loop = !!loop;
      stop.current = false;
      setRunning("tone");
      setStatus("Playing the tone pattern. Tap Stop to end it.");
      player.current.play();
      if (loop) return;
      await wait(totalMs(signalSteps(text, wpm)));
      if (!stop.current) { setRunning(null); setStatus("Done."); }
    } catch {
      setRunning(null);
      setStatus("I couldn't play the tone on this phone.");
    }
  }

  const busy = Boolean(running);
  return (
    <View style={{ gap: 8 }}>
      <Text style={{ color: colors.muted, fontWeight: "700", letterSpacing: 1 }}>SPEED</Text>
      <View accessibilityRole="radiogroup" accessibilityLabel="Speed in words per minute" style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {WPM_CHOICES.map((n) => (
          <Chip key={n} label={`${n} wpm`} on={wpm === n} onPress={() => !busy && setWpm(n)} hint={`A dot lasts ${unitForWpm(n)} milliseconds.`} />
        ))}
      </View>
      <Toggle label="Repeat until I stop it" value={loop} onChange={(v) => !busy && setLoop(v)} />
      <Toggle label="Keep the light going with the screen off" value={keepOn} onChange={setKeepOn} />
      <Action label={running === "light" || running === "camera" ? "Stop the light" : "Flash it with the light"} disabled={!code || (busy && running !== "light" && running !== "camera")} onPress={light} accessibilityHint="Blinks the phone's flashlight in the pattern." />
      <Action label={running === "screen" ? "Stop the screen" : "Flash it on the screen"} tone="quiet" disabled={!code || (busy && running !== "screen")} onPress={screen} accessibilityHint="Flashes the whole screen white in the pattern." />
      <Action label={running === "tone" ? "Stop the tone" : "Play it as a tone"} tone="quiet" disabled={!code || (busy && running !== "tone")} onPress={tone} accessibilityHint="Plays the pattern as a loud tone." />
      {busy ? <Action label="Stop" tone="clay" onPress={() => stopAll()} /> : null}
      <Action label="Copy the code" tone="quiet" disabled={!code} onPress={copy} />
      {status ? <Quiet live>{status}</Quiet> : null}
      <Quiet>{WHISTLE_NOTE}</Quiet>
      {running === "camera" ? (
        <CameraView style={{ width: 2, height: 2, opacity: 0.01 }} facing="back" enableTorch={torch} />
      ) : null}
      <Modal visible={running === "screen"} animationType="none" transparent={false} onRequestClose={() => stopAll()}>
        <Pressable accessibilityRole="button" accessibilityLabel="Stop the screen flash" onPress={() => stopAll()} style={{ flex: 1, backgroundColor: screenOn ? "#ffffff" : "#000000", alignItems: "center", justifyContent: "flex-end", paddingBottom: 48 }}>
          <Text style={{ color: screenOn ? "#000000" : "#888888" }}>Tap to stop</Text>
        </Pressable>
      </Modal>
    </View>
  );
}
