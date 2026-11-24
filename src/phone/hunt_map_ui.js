// Small drawing pieces for the Hunt map: the mark pin, the cone label, the sheet frame.
// The meaning is always in words (name, At risk, Clear, Out of cone) and in a shape
// (square stand, dashed trail, triangle bedding, "S" sighting), never in color alone.
import React from "react";
import { Pressable, Text, View } from "react-native";
import { colors, themedStyles, useDisplay } from "./ui.js";

export function MarkGlyph({ kind, size = 28 }) {
  const ink = colors.ink;
  const half = size / 2;
  let inner = null;
  if (kind === "stand") inner = <View style={{ width: size * 0.42, height: size * 0.42, backgroundColor: ink }} />;
  else if (kind === "bedding") {
    inner = <View style={{ width: 0, height: 0, borderLeftWidth: size * 0.24, borderRightWidth: size * 0.24, borderBottomWidth: size * 0.42, borderLeftColor: "transparent", borderRightColor: "transparent", borderBottomColor: ink }} />;
  } else if (kind === "trail") inner = <View style={{ width: size * 0.6, height: 0, borderTopWidth: 3, borderStyle: "dashed", borderColor: ink }} />;
  else inner = <Text style={{ color: ink, fontWeight: "800", fontSize: size * 0.5, lineHeight: size * 0.6 }}>S</Text>;
  return (
    <View style={[styles.glyph, { width: size, height: size, borderRadius: half }]} importantForAccessibility="no">
      {inner}
    </View>
  );
}

export function MarkPin({ mark, onPress }) {
  const display = useDisplay();
  const risky = mark.state === "risk";
  const label = `${mark.name}${mark.word ? ` · ${mark.word}` : ""}`;
  return (
    <View style={styles.pinBox} pointerEvents="box-none">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${mark.name}, ${mark.kind}${mark.word ? `, ${mark.word}` : ""}. ${mark.fromLog ? "From Sightings." : "Opens edit."}`}
        hitSlop={8}
        onPress={onPress}
        style={styles.pin}
      >
        <View style={[styles.ringWrap, mark.selected && styles.ringOn]}>
          <MarkGlyph kind={mark.kind} />
        </View>
        <View style={[styles.pill, risky && styles.pillRisk]}>
          <Text numberOfLines={1} style={[styles.pillText, { fontSize: display.size(12) }]}>{risky ? `! ${label}` : label}</Text>
        </View>
      </Pressable>
    </View>
  );
}

export function ConePill({ text }) {
  const display = useDisplay();
  return (
    <View pointerEvents="none" style={styles.conePill} accessibilityLabel={text}>
      <Text numberOfLines={2} style={[styles.coneText, { fontSize: display.size(12) }]}>{text}</Text>
    </View>
  );
}

// The only credit under the map: a brass link that opens the About this map sheet.
export function AboutMapLink({ onPress }) {
  const display = useDisplay();
  return (
    <Pressable accessibilityRole="link" accessibilityLabel="About this map. Pack names and map credits." hitSlop={10} onPress={onPress} style={styles.aboutLink}>
      <Text style={[styles.aboutText, { fontSize: display.size(14) }]}>About this map</Text>
    </Pressable>
  );
}

export const styles = themedStyles((c) => ({
  aboutLink: { alignSelf: "flex-start", minHeight: 32, justifyContent: "center", marginTop: 4 },
  aboutText: { color: c.brassText, fontWeight: "700", textDecorationLine: "underline" },
  glyph: { backgroundColor: c.surface, borderWidth: 2, borderColor: c.ink, alignItems: "center", justifyContent: "center" },
  ringWrap: { padding: 2, borderRadius: 20, borderWidth: 2, borderColor: "transparent" },
  ringOn: { borderColor: c.brass },
  pinBox: { width: 140, height: 60, alignItems: "center" },
  pin: { alignItems: "center", gap: 2 },
  pill: { maxWidth: 140, paddingHorizontal: 8, height: 22, borderRadius: 11, backgroundColor: c.surface, borderWidth: 1, borderColor: c.lineStrong, justifyContent: "center" },
  pillRisk: { borderColor: c.clay, borderWidth: 2 },
  pillText: { color: c.ink, fontWeight: "700" },
  conePill: { maxWidth: 190, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, backgroundColor: c.surface, borderWidth: 1, borderColor: c.brass },
  coneText: { color: c.ink, fontWeight: "700", textAlign: "center" }
}));
