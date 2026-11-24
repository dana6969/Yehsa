import React, { useEffect, useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import PictureGuide from "./PictureGuide.js";
import BeforeYouGoScreen from "./BeforeYouGo.js";
import CameraIdScreen from "./CameraIdScreen.js";
import WeatherScreen from "./WeatherScreen.js";
import BallisticsScreen from "./BallisticsScreen.js";
import SightingsScreen from "./SightingsScreen.js";
import KitScreen from "./KitScreen.js";
import CompassScreen from "./CompassScreen.js";
import RadioScreen from "./RadioScreen.js";
import { Action, Field, Quiet, ScreenHeader, colors, tokens, useDisplay, themedStyles } from "./ui.js";
import { useBackLayer } from "./back_layers.js";
import { courseText, declinationText, sunText } from "../../symbolic/phone_land.js";
import { calculate } from "../../symbolic/calculator.js";
import { GUIDE_ENTRIES } from "../../symbolic/picture_guide.js";
import { toMorse } from "../../symbolic/morse_signal.js";
import MorseSignal from "./MorseSignal.js";

const GUIDE_SYMBOLS = new Set(GUIDE_ENTRIES.map((entry) => entry.symbol));

const webPointer = Platform.OS === "web" ? { cursor: "pointer" } : null;

// Grouped as in the design: Everyday, Hunt, More tools. Every tile opens a working tool.
export const FIELD_GROUPS = [
  {
    id: "everyday",
    label: "Everyday",
    tiles: [
      { id: "pictures", label: "Pictures", sub: "Guide and look-alikes", icon: "images-outline" },
      { id: "compass", label: "Compass", sub: "Live heading, or a bearing", icon: "compass-outline" },
      { id: "sun", label: "Sun times", sub: "Sunrise and sunset", icon: "sunny-outline" },
      { id: "weather", label: "Weather", sub: "Pressure on this phone", icon: "cloud-outline" },
      { id: "radio", label: "Radio", sub: "Weather and emergency radio", icon: "radio-outline" },
      { id: "morse", label: "Morse", sub: "Text to code", icon: "megaphone-outline" },
      { id: "timers", label: "Timers", sub: "Countdown", icon: "timer-outline" },
      { id: "calculator", label: "Calculator", sub: "Units and field math", icon: "calculator-outline" }
    ]
  },
  {
    id: "hunt",
    label: "Hunt",
    tiles: [
      { id: "before", label: "Before you go", sub: "Plan, packs, check", icon: "checkbox-outline" },
      { id: "ballistics", label: "Ballistics", sub: "Drop and wind you enter", icon: "analytics-outline" },
      { id: "sightings", label: "Sightings", sub: "Private log", icon: "eye-outline" },
      { id: "wind", label: "Wind", sub: "Scent cone on the Hunt map", icon: "flag-outline" }
    ]
  },
  {
    id: "more",
    label: "More tools",
    tiles: [
      { id: "first-aid", label: "First aid", sub: "Pictures and steps", icon: "medkit-outline" },
      { id: "kit", label: "Kit", sub: "Pack list and expiry", icon: "bag-outline" },
      { id: "identify", label: "Identify", sub: "Photo hints, never a verdict", icon: "camera-outline" }
    ]
  }
];

export { toMorse };

function todayText() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function heldPair(position) {
  if (position?.consent !== true || position.status !== "locked" || !position.fix) return "";
  return `${position.fix.latitude.toFixed(5)}, ${position.fix.longitude.toFixed(5)}`;
}

export default function FieldPane({ position, mapPacks, waypoints, onEmergency, openRequest, onOpenLayers, onOpenScreen, onOpenWind, onAsk }) {
  const [open, setOpenRaw] = useState(null);
  // Wind is not a Field screen any more. It is a sheet on the Hunt map, with the cone on it.
  const setOpen = (id) => {
    if (id === "wind" && onOpenWind) { onOpenWind(); setOpenRaw(null); return; }
    setOpenRaw(id);
  };
  const [guideSymbol, setGuideSymbol] = useState("");
  useEffect(() => {
    if (openRequest?.tile) setOpen(openRequest.tile);
  }, [openRequest?.id]);
  useBackLayer(open != null, () => setOpen(null));
  const close = () => {
    setOpen(null);
    setGuideSymbol("");
  };

  if (open === "pictures" || open === "first-aid") {
    return (
      <PictureGuide
        key={`${open}-${guideSymbol}`}
        onBack={close}
        backLabel="Field"
        initialDomain={open === "first-aid" ? "first-aid" : ""}
        initialSymbol={guideSymbol}
      />
    );
  }
  if (open === "compass" || open === "course" || open === "declination") return <CompassScreen position={position} waypoints={waypoints || []} onBack={close} onOpenBearing={() => setOpen("bearing")}><ManualBearing position={position} /></CompassScreen>;
  if (open === "bearing") return <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled"><ScreenHeader title="Bearing between two points" lead="Straight-line bearing and distance. Not a road route." onBack={() => setOpen("compass")} backLabel="Compass" /><ManualBearing position={position} /></ScrollView>;
  if (open === "sun") return <SunTool position={position} onBack={close} />;
  if (open === "radio") return <RadioScreen position={position} onBack={close} onOpenMorse={() => setOpen("morse")} />;
  if (open === "morse") return <MorseTool onBack={close} />;
  if (open === "timers") return <TimerTool onBack={close} />;
  if (open === "calculator") return <CalculatorTool onBack={close} />;
  if (open === "before") {
    const fix = position?.consent === true && position.status === "locked" ? position.fix : null;
    return (
      <BeforeYouGoScreen
        target={fix ? { latitude: fix.latitude, longitude: fix.longitude } : null}
        packs={mapPacks}
        onBack={close}
        onOpenLayers={onOpenLayers}
        onOpenScreen={onOpenScreen}
        onOpenKit={() => setOpen("kit")}
      />
    );
  }
  if (open === "identify") {
    return (
      <CameraIdScreen
        onBack={close}
        onOpenGuide={() => { setGuideSymbol(""); setOpen("pictures"); }}
        onOpenNote={(symbol) => {
          if (!symbol) return;
          // A picture-guide entry opens here. A plant note with no pictures opens in Ask.
          if (GUIDE_SYMBOLS.has(symbol)) {
            setGuideSymbol(symbol);
            setOpen("pictures");
            return;
          }
          if (onAsk) {
            close();
            onAsk(`Tell me about ${String(symbol).replace(/_/g, " ")}`);
          }
        }}
      />
    );
  }
  if (open === "weather") return <WeatherScreen position={position} onBack={close} />;
  if (open === "ballistics") return <BallisticsScreen onBack={close} />;
  if (open === "sightings") return <SightingsScreen position={position} onBack={close} />;
  if (open === "kit") return <KitScreen onBack={close} onOpenFamily={() => onOpenScreen?.("family")} />;

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
      accessibilityLabel={tile.label}
      accessibilityHint={tile.sub}
      onPress={onPress}
      style={({ pressed }) => [styles.tile, webPointer, { borderColor: display.line }, pressed && styles.pressed]}
    >
      <View style={styles.tileTop}>
        <Ionicons name={tile.icon} size={22} color={colors.brassText} />
      </View>
      <Text style={[styles.tileLabel, { fontSize: display.size(16) }]}>{tile.label}</Text>
      <Text style={[styles.tileSub, { color: display.muted, fontSize: display.size(13) }]}>{tile.sub}</Text>
    </Pressable>
  );
}

// Typed-coordinate tools from before the live compass: bearing between two points and a
// magnetic-to-true converter that takes the angle printed on a paper map.
function ManualBearing({ position }) {
  const [from, setFrom] = useState(heldPair(position));
  const [to, setTo] = useState("");
  const [result, setResult] = useState(null);
  const [bearing, setBearing] = useState("");
  const [decl, setDecl] = useState("");
  const [declResult, setDeclResult] = useState(null);
  return (
    <View>
      <Text style={styles.groupLabel}>BEARING BETWEEN TWO POINTS</Text>
      <Field label="From (latitude, longitude)" value={from} onChangeText={setFrom} placeholder="45.1, -69.2" />
      <Field label="To (latitude, longitude)" value={to} onChangeText={setTo} placeholder="45.2, -69.1" />
      <Action label="Work out bearing and distance" onPress={() => setResult(courseText(from, to))} />
      {result ? <Quiet live>{result.text}</Quiet> : null}
      <Text style={styles.groupLabel}>CONVERT USING A MAP'S DECLINATION</Text>
      <Field label="Magnetic bearing in degrees" value={bearing} onChangeText={setBearing} placeholder="90" />
      <Field label="Declination from your map, east positive" value={decl} onChangeText={setDecl} placeholder="-15" />
      <Action label="Convert to true" tone="quiet" onPress={() => setDeclResult(declinationText(bearing, decl))} />
      {declResult ? <Quiet live>{declResult.text}</Quiet> : null}
    </View>
  );
}

function MorseTool({ onBack }) {
  const [text, setText] = useState("SOS");
  const code = toMorse(text);
  return (
    <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
      <ScreenHeader title="Morse" lead="Text to code, for a light or a tone." onBack={onBack} backLabel="Field" />
      <View style={styles.morseCard}>
        <Field label="Words" value={text} onChangeText={setText} placeholder="SOS" />
      </View>
      <View style={styles.morseCard}>
        <Text style={styles.groupLabel}>CODE</Text>
        <Text selectable accessibilityLabel={`Morse code ${code}`} style={styles.morse}>{code || " "}</Text>
        <MorseSignal text={text} />
      </View>
      <View style={styles.morseExplain}>
        <Text style={styles.groupLabel}>HOW THE TIMING WORKS</Text>
        <Quiet>Short is one unit, long is three. One unit between marks, three between letters, seven between words. SOS is three short, three long, three short.</Quiet>
      </View>
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
    const answer = calculate(input.trim());
    setResult(answer?.text || "That was not read as math or a unit change. Try 12 * 7 + 3 or 2 km in miles.");
  }
  return (
    <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
      <ScreenHeader title="Calculator" lead="Units and field math." onBack={onBack} backLabel="Field" />
      <Field label="Math or a unit change" value={input} onChangeText={setInput} placeholder="12 * 7 + 3 or 2 km in miles" />
      <Action label="Work it out" onPress={run} />
      {result ? <Quiet live>{result}</Quiet> : null}
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
  morseCard: { backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.lineStrong, borderRadius: 16, padding: 14, gap: 6 },
  morseExplain: { borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 12, marginTop: 8 },
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
