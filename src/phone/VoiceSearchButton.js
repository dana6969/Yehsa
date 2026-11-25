// R10: one mic button for every search field. It uses the same recognizer as the Ask mic
// (speech_provider.openMic over expo-speech-recognition, on-device when the phone has it).
// Tap to talk, tap again to stop; it also stops by itself when you go quiet. Words fill the field
// as you speak, and the final words run the search. The microphone opens only after the tap.
import React, { useEffect, useRef, useState } from "react";
import { Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "./ui.js";
import { openMic, probeVoice } from "./speech_provider.js";
import { voiceSearchText } from "../../symbolic/voice_search.js";

let planPromise = null;
function voicePlanOnce() {
  if (!planPromise) planPromise = probeVoice().catch(() => ({ route: "none", onDevice: false }));
  return planPromise;
}

export default function VoiceSearchButton({ onText, onDone, onNote, label = "Voice search", size = 20, style }) {
  const [plan, setPlan] = useState(null);
  const [listening, setListening] = useState(false);
  const handle = useRef(null);
  const heard = useRef("");
  const live = useRef(true);

  useEffect(() => {
    live.current = true;
    voicePlanOnce().then((p) => { if (live.current) setPlan(p); });
    return () => {
      live.current = false;
      try { handle.current?.abort?.(); } catch {}
    };
  }, []);

  const canListen = plan?.route === "native-speech" || plan?.route === "web-speech";

  function finish(text) {
    handle.current = null;
    if (!live.current) return;
    setListening(false);
    const words = voiceSearchText(text || heard.current);
    if (words) onDone?.(words);
    else onNote?.("I didn't catch that. Tap the mic and try again, or type it.");
  }

  async function press() {
    if (!canListen) {
      onNote?.(plan?.notice || "This phone has no speech recognizer I can use. Type it instead.");
      return;
    }
    if (handle.current) {
      const h = handle.current;
      handle.current = null;
      try { finish(await h.stop()); } catch { finish(heard.current); }
      return;
    }
    heard.current = "";
    setListening(true);
    onNote?.("Listening…");
    const h = await openMic({
      onDevice: plan?.onDevice === true,
      onTranscript: (text) => {
        heard.current = text;
        const words = voiceSearchText(text);
        if (words && live.current) onText?.(words);
      },
      onEnd: (text) => { if (handle.current === h) finish(text); }
    });
    if (!h?.started) {
      setListening(false);
      onNote?.(h?.reason || "The microphone did not start. Type it instead.");
      return;
    }
    handle.current = h;
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={listening ? "Stop listening" : label}
      accessibilityHint="Say what to search for. The words fill the box and the search runs."
      accessibilityState={{ busy: listening }}
      onPress={press}
      hitSlop={8}
      style={[{ minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center", opacity: plan && !canListen ? 0.5 : 1 }, style]}
    >
      <Ionicons name={listening ? "mic" : "mic-outline"} size={size} color={listening ? colors.clay : colors.ink} />
    </Pressable>
  );
}
