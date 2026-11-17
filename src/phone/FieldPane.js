import React, { useEffect, useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import PictureGuide from "./PictureGuide.js";
import { Action, Field, Quiet, ScreenHeader, colors, tokens, useDisplay, themedStyles } from "./ui.js";
import { useBackLayer } from "./back_layers.js";
import { courseText, declinationText, sunText } from "../../symbolic/phone_land.js";
import { calculate } from "../../symbolic/calculator.js";

const webPointer = Platform.OS === "web" ? { cursor: "pointer" } : null;

// Grouped as in the design: Everyday, Hunt, More tools. Tiles marked
// later are placeholders that say so; hunting features come in a later pass.
export const FIELD_GROUPS = [
  {
    id: "everyday",
    label: "Everyday",
    tiles: [
      { id: "pictures", label: "Pictures", sub: "Guide and look-alikes", icon: "images-outline" },
      { id: "compass", label: "Compass", sub: "Bearing and declination", icon: "compass-outline" },
      { id: "sun", label: "Sun times", sub: "Sunrise and sunset", icon: "sunny-outline" },
      { id: "weather", label: "Weather", sub: "Later", icon: "cloud-outline", later: true },
      { id: "morse", label: "Morse", sub: "Text to code", icon: "radio-outline" },
      { id: "timers", label: "Timers", sub: "Countdown", icon: "timer-outline" },
      { id: "calculator", label: "Calculator", sub: "Units and field math", icon: "calculator-outline" }
    ]
  },
  {
    id: "hunt",
    label: "Hunt",
    tiles: [
      { id: "before", label: "Before you go", sub: "Plan, packs, check", icon: "checkbox-outline" },
      { id: "ballistics", label: "Ballistics", sub: "Later", icon: "analytics-outline", later: true },
      { id: "sightings", label: "Sightings", sub: "Later. Private log", icon: "eye-outline", later: true },
      { id: "wind", label: "Wind", sub: "Later. Scent cone entry", icon: "flag-outline", later: true }
    ]
  },
  {
    id: "more",
    label: "More tools",
    tiles: [
      { id: "first-aid", label: "First aid", sub: "Pictures and steps", icon: "medkit-outline" },
      { id: "kit", label: "Kit", sub: "Later. Pack list, family card", icon: "bag-outline", later: true },
      { id: "identify", label: "Identify", sub: "Later. Camera ID", icon: "camera-outline", later: true }
    ]
  }
];

const LATER_COPY = {
  weather: "Saved weather alerts and a barometer trend come in a later update. Yehsa will not promise live weather without signal.",
  ballistics: "A drop and wind calculator from numbers you enter comes with hunting mode.",
  sightings: "A private sightings log, kept on this phone, comes with hunting mode. It will compare the deer estimate with what you actually saw.",
  wind: "Wind entry for the scent cone on the Map comes with hunting mode.",
  kit: "A kit list with expiry dates, linked to the family card in More, comes in a later update.",
  identify: "Offline camera ID comes in a later update. It will never give an edibility verdict."
};

const MORSE = { a: ".-", b: "-...", c: "-.-.", d: "-..", e: ".", f: "..-.", g: "--.", h: "....", i: "..", j: ".---", k: "-.-", l: ".-..", m: "--", n: "-.", o: "---", p: ".--.", q: "--.-", r: ".-.", s: "...", t: "-", u: "..-", v: "...-", w: ".--", x: "-..-", y: "-.--", z: "--..", 0: "-----", 1: ".----", 2: "..---", 3: "...--", 4: "....-", 5: ".....", 6: "-....", 7: "--...", 8: "---..", 9: "----." };

export function toMorse(text) {
  return String(text || "").toLowerCase().split(/\s+/).filter(Boolean)
    .map((word) => [...word].map((ch) => MORSE[ch]).filter(Boolean).join(" "))
    .filter(Boolean).join("  /  ");
}

function todayText() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function heldPair(position) {
  if (position?.consent !== true || position.status !== "locked" || !position.fix) return "";
  return `${position.fix.latitude.toFixed(5)}, ${position.fix.longitude.toFixed(5)}`;
}

export default function FieldPane({ position, onEmergency, openRequest, onOpenLayers, onOpenScreen }) {
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
  if (open === "compass" || open === "course") return <CompassTool position={position} onBack={close} />;
  if (open === "sun") return <SunTool position={position} onBack={close} />;
  if (open === "declination") return <CompassTool position={position} onBack={close} />;
  if (open === "morse") return <MorseTool onBack={close} />;
  if (open === "timers") return <TimerTool onBack={close} />;
  if (open === "calculator") return <CalculatorTool onBack={close} />;
  if (open === "before") return <BeforeYouGo onBack={close} onOpenLayers={onOpenLayers} onOpenScreen={onOpenScreen} />;
  if (LATER_COPY[open]) {
    const tile = FIELD_GROUPS.flatMap((group) => group.tiles).find((item) => item.id === open);
    return (
      <ScrollView contentContainerStyle={styles.scroll}>
        <ScreenHeader title={tile.label} lead="Coming in a later update." onBack={close} backLabel="Field" />
        <Quiet>{LATER_COPY[open]}</Quiet>
        {open === "kit" ? <Action label="Family card in More" tone="quiet" onPress={() => onOpenScreen?.("family")} /> : null}
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      <ScreenHeader title="Field" lead="Tools that work with no signal." />
      {FIELD_GROUPS.map((group) => (
        <View key={group.id} style={styles.group}>
          <Text accessibilityRole="header" style={styles.groupLabel}>{group.label.toUpperCase()}</Text>
          <View style={styles.grid}>
            {group.tiles.map((tile) => (
              <Tile key={tile.id} tile={tile} onPress={() => setOpen(tile.id)} />
            ))}
          </View>
        </View>
      ))}
      <Action label="Emergency" tone="quiet" onPress={onEmergency} accessibilityHint="The same screen as the SOS button." />
      <Quiet>A picture is not a safe identification. Position stays off unless you turned it on.</Quiet>
    </ScrollView>
  );
}

function Tile({ tile, onPress }) {
  const display = useDisplay();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={tile.later ? `${tile.label}, coming later` : tile.label}
      accessibilityHint={tile.sub}
      onPress={onPress}
      style={({ pressed }) => [styles.tile, webPointer, { borderColor: display.line }, pressed && styles.pressed]}
    >
      <View style={styles.tileTop}>
        <Ionicons name={tile.icon} size={22} color={tile.later ? colors.muted : colors.brassText} />
        {tile.later ? <Text style={styles.laterTag}>Later</Text> : null}
      </View>
      <Text style={[styles.tileLabel, { fontSize: display.size(16) }]}>{tile.label}</Text>
      <Text style={[styles.tileSub, { color: display.muted, fontSize: display.size(13) }]}>{tile.sub}</Text>
    </Pressable>
  );
}

function CompassTool({ position, onBack }) {
  const [from, setFrom] = useState(heldPair(position));
  const [to, setTo] = useState("");
  const [result, setResult] = useState(null);
  const [bearing, setBearing] = useState("");
  const [decl, setDecl] = useState("");
  const [declResult, setDeclResult] = useState(null);
  return (
    <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
      <ScreenHeader title="Compass" lead="Straight-line bearing and distance. Not a road route." onBack={onBack} backLabel="Field" />
      <Field label="From (latitude, longitude)" value={from} onChangeText={setFrom} placeholder="45.1, -69.2" />
      <Field label="To (latitude, longitude)" value={to} onChangeText={setTo} placeholder="45.2, -69.1" />
      <Action label="Work out bearing and distance" onPress={() => setResult(courseText(from, to))} />
      {result ? <Quiet live>{result.text}</Quiet> : null}
      <Text style={styles.groupLabel}>DECLINATION</Text>
      <Field label="Magnetic bearing in degrees" value={bearing} onChangeText={setBearing} placeholder="90" />
      <Field label="Declination from your map, east positive" value={decl} onChangeText={setDecl} placeholder="-15" />
      <Action label="Convert to true" tone="quiet" onPress={() => setDeclResult(declinationText(bearing, decl))} />
      {declResult ? <Quiet live>{declResult.text}</Quiet> : null}
    </ScrollView>
  );
}

function MorseTool({ onBack }) {
  const [text, setText] = useState("SOS");
  return (
    <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
      <ScreenHeader title="Morse" lead="Letters to dots and dashes, for a light or a whistle." onBack={onBack} backLabel="Field" />
      <Field label="Words" value={text} onChangeText={setText} placeholder="SOS" />
      <Text selectable accessibilityLabel={`Morse code ${toMorse(text)}`} style={styles.morse}>{toMorse(text) || " "}</Text>
      <Quiet>Short is one unit, long is three. One unit between marks, three between letters, seven between words. SOS is three short, three long, three short.</Quiet>
    </ScrollView>
  );
}

function TimerTool({ onBack }) {
  const [minutes, setMinutes] = useState("10");
  const [endsAt, setEndsAt] = useState(null);
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!endsAt) return undefined;
    const timer = setInterval(() => setTick((value) => value + 1), 500);
    return () => clearInterval(timer);
  }, [endsAt]);
  const left = endsAt ? Math.max(0, Math.round((endsAt - Date.now()) / 1000)) : null;
  const done = left === 0;
  const clock = left == null ? "" : `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;
  return (
    <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
      <ScreenHeader title="Timers" lead="A countdown on this screen." onBack={onBack} backLabel="Field" />
      <Field label="Minutes" value={minutes} onChangeText={setMinutes} placeholder="10" />
      <Action label={endsAt ? "Restart" : "Start"} onPress={() => {
        const value = Number(minutes);
        if (Number.isFinite(value) && value > 0 && value <= 24 * 60) setEndsAt(Date.now() + value * 60000);
      }} />
      {endsAt ? <Action label="Stop" tone="quiet" onPress={() => setEndsAt(null)} /> : null}
      {endsAt ? <Text accessibilityLiveRegion="polite" style={styles.clock}>{done ? "Time is up" : clock}</Text> : null}
      <Quiet>The timer runs while this screen is open. It does not ring when the phone is locked on this build.</Quiet>
    </ScrollView>
  );
}

function CalculatorTool({ onBack }) {
  const [input, setInput] = useState("");
  const [result, setResult] = useState(null);
  function run() {
    const text = input.trim();
    const steps = (text.match(/[+*/×÷]|\s-\s|\b(plus|minus|times|divided)\b/gi) || []).length;
    if (steps > 1) {
      setResult("One step at a time, for example 12 * 7, then the next step.");
      return;
    }
    const answer = calculate(text);
    setResult(answer?.text || "That was not read as one step or a unit change. Try 12 * 7 or 2 km in miles.");
  }
  return (
    <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
      <ScreenHeader title="Calculator" lead="Units and one-step field math." onBack={onBack} backLabel="Field" />
      <Field label="Math or a unit change" value={input} onChangeText={setInput} placeholder="2 km in miles" />
      <Action label="Work it out" onPress={run} />
      {result ? <Quiet live>{result}</Quiet> : null}
    </ScrollView>
  );
}

function BeforeYouGo({ onBack, onOpenLayers, onOpenScreen }) {
  const [done, setDone] = useState({});
  const items = [
    { id: "maps", label: "Map pack and elevation for the area", action: "Open Layers", go: () => onOpenLayers?.() },
    { id: "location", label: "Decide whether Location is on", action: "Open Location", go: () => onOpenScreen?.("location") },
    { id: "people", label: "Pair with the people you are going with", action: null },
    { id: "plan", label: "Tell someone your plan and when you will be back", action: null },
    { id: "regs", label: "Check the season, unit, and shooting hours with the state agency", action: null },
    { id: "display", label: "Pick a display mode for dawn and dusk", action: "Open Display", go: () => onOpenScreen?.("display") }
  ];
  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      <ScreenHeader title="Before you go" lead="A short check while you still have signal." onBack={onBack} backLabel="Field" />
      {items.map((item) => (
        <View key={item.id} style={styles.checkRow}>
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: done[item.id] === true }}
            accessibilityLabel={item.label}
            onPress={() => setDone((current) => ({ ...current, [item.id]: !current[item.id] }))}
            style={[styles.check, webPointer]}
          >
            <Ionicons name={done[item.id] ? "checkbox" : "square-outline"} size={22} color={colors.ink} />
            <Text style={styles.checkText}>{item.label}</Text>
          </Pressable>
          {item.action ? <Action label={item.action} tone="quiet" style={styles.checkAction} onPress={item.go} /> : null}
        </View>
      ))}
      <Quiet>The checklist stays on this screen. Saved trip plans come with hunting mode.</Quiet>
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

const styles = themedStyles((colors) => ({
  scroll: {
    paddingTop: Platform.OS === "ios" ? 52 : 22,
    paddingHorizontal: tokens.space.xl,
    paddingBottom: 40
  },
  group: { marginBottom: 6 },
  groupLabel: { color: colors.muted, fontSize: 12, fontWeight: "700", letterSpacing: 1.2, marginBottom: 8, marginTop: 8 },
  tileTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  laterTag: { color: colors.muted, fontSize: 11, fontWeight: "700", borderWidth: 1, borderColor: colors.lineStrong, borderRadius: 999, paddingHorizontal: 6, paddingVertical: 1 },
  morse: { color: colors.ink, fontSize: 26, letterSpacing: 2, marginVertical: 16, fontVariant: ["tabular-nums"] },
  clock: { color: colors.ink, fontSize: 48, fontWeight: "700", textAlign: "center", marginVertical: 16, fontVariant: ["tabular-nums"] },
  checkRow: { borderBottomWidth: 1, borderBottomColor: colors.line, paddingVertical: 6 },
  check: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 48 },
  checkText: { color: colors.ink, fontSize: 16, flex: 1 },
  checkAction: { alignSelf: "flex-start", minHeight: 40, paddingVertical: 6 },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 16
  },
  tile: {
    flexBasis: "47%",
    flexGrow: 1,
    minHeight: 96,
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
}));
