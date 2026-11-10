import React, { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { MODEL_PRESETS, previewModelSend, buildOutbound } from "../../symbolic/model_link.js";
import { Action, Quiet, ScreenHeader, colors } from "./ui.js";

export default function ModelsPane({ settings, onChange, onSaveKey, onDeleteProvider, onTest, testNote }) {
  const [presetId, setPresetId] = useState("ollama");
  const [name, setName] = useState("Ollama on this network");
  const [baseUrl, setBaseUrl] = useState("http://127.0.0.1:11434");
  const [model, setModel] = useState("llama3.2");
  const [keyDraft, setKeyDraft] = useState("");
  const [keyNote, setKeyNote] = useState("A key is hidden after you save it. This screen cannot show it again.");
  const [pendingTest, setPendingTest] = useState(null);
  const [about, setAbout] = useState(false);
  const preset = MODEL_PRESETS.find((item) => item.id === presetId) || MODEL_PRESETS[0];

  function choosePreset(next) {
    setPresetId(next.id);
    setName(next.name);
    setBaseUrl(next.baseUrl);
    setModel(next.model);
    setKeyDraft("");
  }

  function addProvider() {
    const id = `${preset.id}-${Date.now()}`;
    const provider = {
      id,
      name: name.trim() || preset.name,
      baseUrl: baseUrl.trim(),
      model: model.trim(),
      style: preset.style,
      needsKey: preset.needsKey,
      enabled: false,
      keySaved: false
    };
    onChange({
      ...settings,
      providers: [...settings.providers, provider],
      selectedId: settings.selectedId
    });
    setKeyDraft("");
    setKeyNote("Added and left off. Turn it on after the key is saved, if it needs one.");
  }

  async function storeKey(provider) {
    const result = await onSaveKey(provider.id, keyDraft);
    setKeyDraft("");
    setKeyNote(result?.ok ? "Key saved on this device. It is not shown again." : (result?.reason || "The key was not saved."));
  }

  function setInclude(field, value) {
    onChange({ ...settings, include: { ...settings.include, [field]: value === true } });
  }

  return (
    <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
      <ScreenHeader
        title="Models"
        lead="Off until you connect one."
      />
      <Pressable accessibilityRole="button" accessibilityLabel="About models" onPress={() => setAbout((value) => !value)}>
        <Text style={{ color: "#d7c4a3" }}>i</Text>
      </Pressable>
      {about ? <Quiet>A key stays in the device secure store. It is never shown again and never written into the app. Yehsa is not retrained.</Quiet> : null}
      <Text style={styles.section}>Add a provider</Text>
      <View style={styles.row}>
        {MODEL_PRESETS.map((item) => (
          <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={item.name} onPress={() => choosePreset(item)} style={[styles.chip, presetId === item.id && styles.chipOn]}>
            <Text style={[styles.chipText, presetId === item.id && styles.chipTextOn]}>{item.name}</Text>
          </Pressable>
        ))}
      </View>
      <Labeled label="Name" value={name} onChangeText={setName} />
      <Labeled label="Endpoint URL" value={baseUrl} onChangeText={setBaseUrl} placeholder="https://example.com/v1" />
      <Labeled label="Model name" value={model} onChangeText={setModel} placeholder="model name" />
      {preset.needsKey ? (
        <Labeled label="API key" value={keyDraft} onChangeText={setKeyDraft} placeholder="Paste a key. It is hidden after you save." secure />
      ) : (
        <Quiet>This local endpoint does not use a key.</Quiet>
      )}
      <Quiet>{keyNote}</Quiet>
      <Action label="Add provider, left off" onPress={addProvider} />
      <Text style={styles.section}>Saved on this phone</Text>
      {settings.providers.length === 0 ? <Quiet>None yet.</Quiet> : settings.providers.map((provider) => (
        <View key={provider.id} style={styles.card}>
          <Text style={styles.cardTitle}>{provider.name}</Text>
          <Quiet>{`${provider.enabled ? "On" : "Off"}. ${provider.baseUrl || "No endpoint"} · ${provider.model || "No model name"}. ${provider.keySaved ? "A key is saved." : provider.needsKey ? "No key saved." : "No key used."}`}</Quiet>
          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>Use this model</Text>
            <Switch
              accessibilityLabel={`Use ${provider.name}`}
              value={provider.enabled === true}
              onValueChange={(value) => onChange({
                ...settings,
                selectedId: value ? provider.id : (settings.selectedId === provider.id ? null : settings.selectedId),
                providers: settings.providers.map((item) => item.id === provider.id ? { ...item, enabled: value === true } : item)
              })}
            />
          </View>
          {provider.needsKey ? <Action label="Save key" tone="quiet" onPress={() => storeKey(provider)} /> : null}
          <Action label="Review connection test" tone="quiet" onPress={() => setPendingTest(provider)} />
          <Action label="Remove" tone="clay" onPress={() => onDeleteProvider(provider.id)} />
        </View>
      ))}
      {pendingTest ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Test {pendingTest.name}</Text>
          <Quiet>{previewModelSend(pendingTest, buildOutbound({ question: "Reply with the word ready." }))} This test sends only that sentence.</Quiet>
          <View style={styles.row}>
            <Action label="Approve test" onPress={() => { const target = pendingTest; setPendingTest(null); onTest(target); }} />
            <Action label="Decline" tone="clay" onPress={() => setPendingTest(null)} />
          </View>
        </View>
      ) : null}
      {testNote ? <Quiet>{testNote}</Quiet> : null}
      <Text style={styles.section}>What may leave the phone</Text>
      <Quiet>These stay off. A question is sent only after you approve the exact text. Position, device id, contacts, and notes are left out unless you tick them here.</Quiet>
      <Tick label="Include the held position" value={settings.include.position} onChange={(value) => setInclude("position", value)} />
      <Tick label="Include the device id" value={settings.include.deviceId} onChange={(value) => setInclude("deviceId", value)} />
      <Tick label="Include contacts" value={settings.include.contacts} onChange={(value) => setInclude("contacts", value)} />
      <Tick label="Include saved model notes" value={settings.include.notes} onChange={(value) => setInclude("notes", value)} />
      <Text style={styles.section}>Unverified notes from models</Text>
      <Quiet>These are labeled from model, unverified. They are not part of the trusted field notes. Curator and Verifier flags stay with each one.</Quiet>
      {settings.unverified.length === 0 ? <Quiet>None saved.</Quiet> : settings.unverified.map((note) => (
        <View key={note.id} style={styles.card}>
          <Text style={styles.cardTitle}>{note.label}</Text>
          <Quiet>{`${note.providerName}: ${note.text}`}</Quiet>
          {(note.flags || []).map((flag) => <Quiet key={flag.agent}>{flag.text}</Quiet>)}
          <Action label="Delete this note" tone="clay" onPress={() => onChange({ ...settings, unverified: settings.unverified.filter((item) => item.id !== note.id) })} />
        </View>
      ))}
      <Action label="Reset all unverified notes" tone="clay" onPress={() => onChange({ ...settings, unverified: [] })} />
    </ScrollView>
  );
}

function Labeled({ label, value, onChangeText, placeholder, secure }) {
  return (
    <View style={styles.field}>
      <Text style={styles.switchLabel}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#8f9a8c"
        secureTextEntry={secure === true}
        autoCapitalize="none"
        autoCorrect={false}
        style={styles.input}
      />
    </View>
  );
}

function Tick({ label, value, onChange }) {
  return (
    <View style={styles.switchRow}>
      <Text style={styles.switchLabel}>{label}</Text>
      <Switch accessibilityLabel={label} value={value === true} onValueChange={onChange} />
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingTop: 22, paddingHorizontal: 22, paddingBottom: 180, gap: 10 },
  section: { color: colors.brass, fontSize: 13, fontWeight: "700", marginTop: 12, letterSpacing: 0.4 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { minHeight: 44, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: colors.lineStrong, justifyContent: "center" },
  chipOn: { backgroundColor: colors.brass, borderColor: colors.brass },
  chipText: { color: colors.ink, fontWeight: "600" },
  chipTextOn: { color: colors.brassInk },
  field: { gap: 4 },
  input: { minHeight: 48, color: colors.ink, backgroundColor: colors.surface, borderRadius: 12, paddingHorizontal: 12 },
  card: { backgroundColor: colors.surface, borderRadius: 16, padding: 12, gap: 8 },
  cardTitle: { color: colors.ink, fontSize: 16, fontWeight: "600" },
  switchRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, minHeight: 48 },
  switchLabel: { color: colors.ink, flex: 1, fontSize: 15 }
});
