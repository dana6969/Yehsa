// Kit: your pack lists on this phone, with expiry dates, plus the Family card.
import React, { useState } from "react";
import { Image, Pressable, ScrollView, Share, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import { Action, Field, Quiet, ScreenHeader, themedStyles, colors } from "./ui.js";
import { Card, Line, screenStyles } from "./hunt_ui.js";
import { setHunt, useHunt } from "./hunt_state.js";
import { FAMILY_FIELDS, FAMILY_PRIVACY, addItem, expiryNote, familyCardText, familyIsEmpty, listSummary, normalizeKit, parseExpiry, removeItem, resetList, setFamilyField, toggleItem } from "../../symbolic/hunt/kit.js";

function when(t) {
  return t ? new Date(t).toLocaleDateString([], { month: "short", day: "numeric" }) : "never";
}

export default function KitScreen({ onBack, onOpenFamily, initialList = "" }) {
  const hunt = useHunt();
  const kit = normalizeKit(hunt.kit);
  const [open, setOpen] = useState(initialList);
  const [label, setLabel] = useState("");
  const [expires, setExpires] = useState("");
  const [problem, setProblem] = useState("");
  const list = kit.lists.find((item) => item.id === open);
  const update = (fn) => setHunt("kit", (current) => fn(normalizeKit(current)));

  if (list) {
    const summary = listSummary(list);
    return (
      <ScrollView contentContainerStyle={screenStyles.scroll} keyboardShouldPersistTaps="handled">
        <ScreenHeader title={list.name} lead={`${summary.text}. Last checked ${when(list.checkedAt)}.`} onBack={() => setOpen("")} backLabel="Kit" />
        {list.items.length === 0 ? <Quiet>No kit items yet.</Quiet> : null}
        <Card>
          {list.items.map((item) => {
            const note = expiryNote(item);
            return (
              <View key={item.id} style={styles.item}>
                <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: item.done }} accessibilityLabel={`${item.label}${item.done ? ", packed" : ", not packed"}`} onPress={() => update((k) => toggleItem(k, list.id, item.id))} style={styles.check}>
                  <Ionicons name={item.done ? "checkbox" : "square-outline"} size={26} color={item.done ? colors.brassText : colors.muted} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.itemText, item.done && styles.done]}>{item.label}{item.done ? ", packed" : ""}</Text>
                    {note ? <Text style={[styles.note, note.soon && { color: colors.clay }]}>{note.text}</Text> : null}
                  </View>
                </Pressable>
                <Action label="Remove" tone="clay" style={styles.remove} onPress={() => update((k) => removeItem(k, list.id, item.id))} accessibilityHint={`Removes ${item.label} from this list`} />
              </View>
            );
          })}
        </Card>
        <Card title="Add an item">
          <Field label="Item" value={label} onChangeText={setLabel} placeholder="Spare batteries" />
          <Field label="Expiry date (optional, YYYY-MM-DD)" value={expires} onChangeText={setExpires} placeholder="2027-03-01" />
          {problem ? <Quiet live>{problem}</Quiet> : null}
          <Action label="Add an item" tone="quiet" onPress={() => {
            if (!label.trim()) { setProblem("Type what you want to add."); return; }
            if (expires.trim() && parseExpiry(expires) == null) { setProblem("Write the date as YYYY-MM-DD, like 2027-03-01."); return; }
            setProblem("");
            update((k) => addItem(k, list.id, label, expires));
            setLabel("");
            setExpires("");
          }} />
        </Card>
        <Action label="Start this list over" tone="quiet" onPress={() => update((k) => resetList(k, list.id))} accessibilityHint="Puts the starting items back and clears the check marks." />
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={screenStyles.scroll}>
      <ScreenHeader title="Kit" lead="Your pack list on this phone, with expiry dates." onBack={onBack} backLabel="Field" />
      {kit.lists.map((item) => {
        const summary = listSummary(item);
        const soon = item.items.filter((entry) => expiryNote(entry)?.soon).length;
        return (
          <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={`${item.name}, ${summary.text}`} onPress={() => setOpen(item.id)} style={({ pressed }) => [styles.listCard, pressed && { opacity: 0.8 }]}>
            <Text style={styles.listName}>{item.name}</Text>
            <Text style={styles.note}>{item.items.length} items · {summary.text} · checked {when(item.checkedAt)}</Text>
            {soon ? <Text style={[styles.note, { color: colors.clay }]}>{soon} item{soon === 1 ? "" : "s"} expiring soon</Text> : null}
          </Pressable>
        );
      })}
      <Action label="Family card" tone="quiet" onPress={onOpenFamily} accessibilityHint="ICE contacts and medicines, also in More." />
      <Quiet>Before you go checks the list you pick here.</Quiet>
    </ScrollView>
  );
}

export function FamilyCardScreen({ onBack, backLabel = "More" }) {
  const hunt = useHunt();
  const card = hunt.family;
  const [editing, setEditing] = useState(familyIsEmpty(card));
  const [note, setNote] = useState("");
  const photos = card.photos || [];

  async function addPhoto() {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.5 });
      if (result.canceled || !result.assets?.[0]?.uri) return;
      const small = await ImageManipulator.manipulateAsync(result.assets[0].uri, [{ resize: { width: 240 } }], { compress: 0.5, base64: true, format: ImageManipulator.SaveFormat.JPEG });
      if (!small.base64) throw new Error("none");
      setHunt("family", (current) => ({ ...current, photos: [...(current.photos || []), `data:image/jpeg;base64,${small.base64}`].slice(0, 8), updatedAt: Date.now() }));
    } catch {
      setNote("I couldn't read that photo. Try another one.");
    }
  }

  async function share() {
    try {
      await Share.share({ message: familyCardText(card), title: "Family card" });
    } catch {
      setNote("The share sheet did not open.");
    }
  }

  return (
    <ScrollView contentContainerStyle={screenStyles.scroll} keyboardShouldPersistTaps="handled">
      <ScreenHeader title="Family card" lead="ICE contacts and medicines, also in Kit." onBack={onBack} backLabel={backLabel} />
      {familyIsEmpty(card) && !editing ? <Quiet>No family card yet. Add a contact or a medicine so it is here if you need it.</Quiet> : null}
      {editing ? (
        <>
          {FAMILY_FIELDS.map((field) => (
            <Field key={field.id} label={field.label} hint={field.hint} multiline value={card.fields[field.id] || ""} onChangeText={(value) => setHunt("family", (current) => setFamilyField(current, field.id, value))} />
          ))}
          <Card title="Photos">
            {photos.length === 0 ? <Quiet>No photos yet.</Quiet> : <Quiet>{photos.length} photo{photos.length === 1 ? "" : "s"} saved, sealed on this phone.</Quiet>}
            <Action label="Add a photo" tone="quiet" onPress={addPhoto} />
            {photos.length ? <Action label="Remove photos" tone="clay" onPress={() => setHunt("family", (current) => ({ ...current, photos: [] }))} /> : null}
          </Card>
          <Action label="Done" onPress={() => setEditing(false)} />
        </>
      ) : (
        <>
          {FAMILY_FIELDS.filter((field) => String(card.fields[field.id] || "").trim()).map((field) => (
            <Card key={field.id} title={field.label}><Text style={styles.value}>{card.fields[field.id]}</Text></Card>
          ))}
          {photos.length ? <View style={styles.photos}>{photos.map((uri, index) => <Image key={index} source={{ uri }} style={styles.photo} accessibilityIgnoresInvertColors accessibilityLabel="Family photo" />)}</View> : null}
          <Action label="Edit the card" tone="quiet" onPress={() => setEditing(true)} />
          {!familyIsEmpty(card) ? <Action label="Share as text" tone="quiet" onPress={share} accessibilityHint="Opens the share sheet. You choose who gets it." /> : null}
        </>
      )}
      {note ? <Quiet live>{note}</Quiet> : null}
      <Quiet>{FAMILY_PRIVACY}</Quiet>
    </ScrollView>
  );
}

const styles = themedStyles((c) => ({
  item: { borderBottomWidth: 1, borderBottomColor: c.line, paddingVertical: 4, gap: 4 },
  check: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 48 },
  itemText: { color: c.ink, fontSize: 16 },
  done: { color: c.muted },
  note: { color: c.muted, fontSize: 13 },
  remove: { alignSelf: "flex-start", minHeight: 40, paddingVertical: 4 },
  listCard: { borderWidth: 1, borderColor: c.lineStrong, borderRadius: 16, backgroundColor: c.surface, padding: 14, gap: 4, minHeight: 72 },
  listName: { color: c.ink, fontSize: 16, fontWeight: "600" },
  value: { color: c.ink, fontSize: 16, lineHeight: 24 },
  photos: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  photo: { width: 96, height: 96, borderRadius: 12 }
}));
