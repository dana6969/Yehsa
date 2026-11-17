import React, { useEffect, useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import PictureGuide from "./PictureGuide.js";
import { Action, Field, Quiet, ScreenHeader, colors, tokens, useDisplay } from "./ui.js";
import { useBackLayer } from "./back_layers.js";
import { courseText, declinationText, sunText } from "../../symbolic/phone_land.js";

const webPointer = Platform.OS === "web" ? { cursor: "pointer" } : null;

// Tools that work on this phone today. Later tools (camera ID, kit, weather,
// hunting) get tiles here instead of new tabs.
const TILES = [
  { id: "pictures", label: "Pictures", sub: "Plants, knots, first aid, sky", icon: "images" },
  { id: "first-aid", label: "First-aid pictures", sub: "Bleeding, splints, burns", icon: "medkit" },
  { id: "course", label: "Course and bearing", sub: "Distance between two points", icon: "navigate" },
  { id: "sun", label: "Sunrise and sunset", sub: "From coordinates and a date", icon: "sunny" },
  { id: "declination", label: "Declination", sub: "Magnetic to true bearing", icon: "compass" }
];

function todayText() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function heldPair(position) {
  if (position?.consent !== true || position.status !== "locked" || !position.fix) return "";
  return `${position.fix.latitude.toFixed(5)}, ${position.fix.longitude.toFixed(5)}`;
}

export default function FieldPane({ position, onEmergency, openRequest }) {
  const [open, setOpen] = useState(null);
  useEffect(() => {
    if (openRequest?.tile) setOpen(openRequest.tile);
  }, [openRequest?.id]);
  useBackLayer(open != null, () => setOpen(null));
  const close = () => setOpen(null);

  if (open === "pictures" || open === "first-aid") {
    return (
      <PictureGuide
        key={open}
        onBack={close}
        backLabel="Field"
        initialDomain={open === "first-aid" ? "first-aid" : ""}
      />
    );
  }
  if (open === "course") return <CourseTool position={position} onBack={close} />;
  if (open === "sun") return <SunTool position={position} onBack={close} />;
  if (open === "declination") return <DeclinationTool onBack={close} />;

  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      <ScreenHeader title="Field" lead="Tools that work with no signal." />
      <View style={styles.grid}>
        {TILES.map((tile) => (
          <Tile key={tile.id} tile={tile} onPress={() => setOpen(tile.id)} />
        ))}
      </View>
      <Action label="Emergency" tone="clay" onPress={onEmergency} accessibilityHint="The same screen as the SOS button." />
      <Quiet>A picture is not a safe identification. Position stays off unless you turned it on.</Quiet>
    </ScrollView>
  );
}

function Tile({ tile, onPress }) {
  const display = useDisplay();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={tile.label}
      accessibilityHint={tile.sub}
      onPress={onPress}
      style={({ pressed }) => [styles.tile, webPointer, { borderColor: display.line }, pressed && styles.pressed]}
    >
      <Ionicons name={tile.icon} size={24} color={colors.brass} />
      <Text style={[styles.tileLabel, { fontSize: display.size(16) }]}>{tile.label}</Text>
      <Text style={[styles.tileSub, { color: display.muted, fontSize: display.size(13) }]}>{tile.sub}</Text>
    </Pressable>
  );
}

function CourseTool({ position, onBack }) {
  const [from, setFrom] = useState(heldPair(position));
  const [to, setTo] = useState("");
  const [result, setResult] = useState(null);
  return (
    <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
      <ScreenHeader title="Course and bearing" lead="Straight-line distance and bearing. Not a road route." onBack={onBack} backLabel="Field" />
      <Field label="From (latitude, longitude)" value={from} onChangeText={setFrom} placeholder="45.1, -69.2" />
      <Field label="To (latitude, longitude)" value={to} onChangeText={setTo} placeholder="45.2, -69.1" />
      <Action label="Work it out" onPress={() => setResult(courseText(from, to))} />
      {result ? <Quiet live>{result.text}</Quiet> : null}
    </ScrollView>
  );
}

function SunTool({ position, onBack }) {
  const [where, setWhere] = useState(heldPair(position));
  const [date, setDate] = useState(todayText());
  const [result, setResult] = useState(null);
  return (
    <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
      <ScreenHeader title="Sunrise and sunset" lead="Worked out on this phone." onBack={onBack} backLabel="Field" />
      <Field label="Where (latitude, longitude)" value={where} onChangeText={setWhere} placeholder="45.1, -69.2" />
      <Field label="Date (YYYY-MM-DD)" value={date} onChangeText={setDate} placeholder={todayText()} />
      <Action label="Show sun times" onPress={() => setResult(sunText(where, date))} />
      {result ? <Quiet live>{result.text}</Quiet> : null}
    </ScrollView>
  );
}

function DeclinationTool({ onBack }) {
  const [bearing, setBearing] = useState("");
  const [decl, setDecl] = useState("");
  const [result, setResult] = useState(null);
  return (
    <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
      <ScreenHeader title="Declination" lead="Use the declination printed on your map." onBack={onBack} backLabel="Field" />
      <Field label="Magnetic bearing in degrees" value={bearing} onChangeText={setBearing} placeholder="90" />
      <Field label="Declination, east positive" value={decl} onChangeText={setDecl} placeholder="-15" />
      <Action label="Convert" onPress={() => setResult(declinationText(bearing, decl))} />
      {result ? <Quiet live>{result.text}</Quiet> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    paddingTop: Platform.OS === "ios" ? 52 : 22,
    paddingHorizontal: tokens.space.xl,
    paddingBottom: 40
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 16
  },
  tile: {
    flexBasis: "47%",
    flexGrow: 1,
    minHeight: 112,
    borderWidth: 1,
    borderRadius: tokens.radius.lg,
    backgroundColor: colors.surface,
    padding: 14,
    gap: 6
  },
  tileLabel: {
    color: colors.ink,
    fontWeight: "600"
  },
  tileSub: {
    lineHeight: 18
  },
  pressed: { opacity: 0.82 }
});
