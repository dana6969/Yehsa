// More > Yehsa AI: the on-device AI switch, whether this phone can run it, and what the model is.
// Free and offline: open-license weights bundled in the app, no account, no key, no charges.
import React, { useEffect, useState } from "react";
import { ScrollView, Switch, Text, View } from "react-native";
import { Action, Quiet, ScreenHeader, colors, themedStyles } from "./ui.js";
import { space, type } from "./tokens.js";
import { currentAiSettings, ensureAiSettings, setAiSettings, subscribeAiSettings } from "./ai_settings.js";
import { llmStatus, releaseLlm } from "./llm_engine";
import { AI_LABEL, LLM_MODEL } from "../../symbolic/llm/model_info.js";

const REASON = {
  "low-ram": "This phone has less than 4 GB of memory, so Yehsa AI stays off here. Yehsa's own answers work as always.",
  "not-bundled": "This build of Yehsa was made without the AI model.",
  "no-native-module": "Yehsa AI runs only in the Android app.",
  "not-on-this-platform": "Yehsa AI runs only in the Android app."
};

function gb(bytes) {
  return `${(Number(bytes || 0) / 1024 ** 3).toFixed(1)} GB`;
}

function Row({ label, hint, value, onChange, disabled }) {
  return (
    <View style={styles.row}>
      <View style={styles.body}>
        <Text style={styles.title}>{label}</Text>
        <Text style={styles.meta}>{hint}</Text>
      </View>
      <Switch accessibilityLabel={label} value={value} onValueChange={onChange} disabled={disabled} trackColor={{ true: colors.brass, false: colors.line }} thumbColor={colors.ink} />
    </View>
  );
}

export default function AiPane({ onBack, backLabel }) {
  const [settings, setSettings] = useState(currentAiSettings());
  const [status, setStatus] = useState(null);
  const [note, setNote] = useState("");

  useEffect(() => {
    const off = subscribeAiSettings(setSettings);
    ensureAiSettings();
    llmStatus().then(setStatus).catch(() => setStatus({ available: false, reason: "not-on-this-platform" }));
    return off;
  }, []);

  const can = status?.available === true;
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <ScreenHeader title="Yehsa AI" lead="A small AI model that runs on this phone, offline. It reads the passages Yehsa found and explains them in plain words, with the sources. It's free: no account, no key, no charges." onBack={onBack} backLabel={backLabel} />
      {note ? <Quiet live>{note}</Quiet> : null}
      <Row
        label="Yehsa AI (on-device)"
        hint={can ? "Adds a short explanation under answers that come from Yehsa's notes, books, and documents." : (status ? (REASON[status.reason] || "Not available on this phone.") : "Checking this phone…")}
        value={settings.enabled && can}
        disabled={!can}
        onChange={(v) => { setAiSettings({ enabled: v }); if (!v) releaseLlm(); setNote(v ? "Yehsa AI is on." : "Yehsa AI is off. Yehsa answers from its notes alone."); }}
      />
      <Row
        label="Explain web quotes too"
        hint="When you look something up online (Wikipedia and web search, free), the AI explains the quotes it brought back. Only your search words leave the phone, as before."
        value={settings.useWebQuotes && settings.enabled && can}
        disabled={!can || !settings.enabled}
        onChange={(v) => setAiSettings({ useWebQuotes: v })}
      />
      <Text style={styles.sub}>How it stays safe</Text>
      <Quiet>Yehsa answers first, from its own notes. The AI only adds to that answer, marked "{AI_LABEL}". It may use only the passages shown, and it cites them by number; a sentence with a number or claim that isn't in those passages is removed.</Quiet>
      <Quiet>It never runs on first aid, emergencies, doses, or safety warnings. Those answers come from Yehsa's notes alone.</Quiet>
      <Text style={styles.sub}>The model</Text>
      <Quiet>{`${LLM_MODEL.name}, by ${LLM_MODEL.publisher}. License: ${LLM_MODEL.license}. ${gb(LLM_MODEL.bytes)}, inside the app.`}</Quiet>
      <Quiet>The first time it runs, Yehsa sets it up on this phone (a one-time copy, about a minute). After that it wakes in a few seconds and goes back to sleep after a few idle minutes to save memory and battery.</Quiet>
      {status?.totalRam ? <Quiet>{`This phone: ${gb(status.totalRam)} memory${status.cores ? `, ${status.cores} cores` : ""}.`}</Quiet> : null}
      {can && status?.loaded ? <Action label="Put Yehsa AI to sleep now" tone="quiet" onPress={() => { releaseLlm(); setNote("Yehsa AI is asleep. Its memory is free."); setStatus({ ...status, loaded: false }); }} /> : null}
    </ScrollView>
  );
}

const styles = themedStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: space.lg, paddingBottom: 180 },
  sub: { ...type.label, color: colors.muted, marginTop: space.xl, marginBottom: space.sm, textTransform: "uppercase", letterSpacing: 1 },
  row: { flexDirection: "row", alignItems: "center", paddingVertical: space.md, borderBottomWidth: 1, borderBottomColor: colors.line, gap: space.md },
  body: { flex: 1 },
  title: { ...type.action, color: colors.ink },
  meta: { ...type.label, color: colors.muted, marginVertical: space.xs }
}));
