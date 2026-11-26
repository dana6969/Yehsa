// The side rail on the Map and the Hunt map (R6): big buttons down the right edge for layers,
// recenter / follow, lock position, north up, wind (Hunt), marks (Hunt), and full screen.
// Lucky's design language: Field tokens, 52 dp targets, an icon AND a word on every button
// (never color alone), brass only for the state that is on.
import React, { useState } from "react";
import { Pressable, ScrollView, Switch, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, hit, themedStyles, useDisplay } from "./ui.js";

function RailButton({ icon, word, label, hint, on, onPress, rotate = 0 }) {
  const display = useDisplay();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label || word}
      accessibilityHint={hint}
      accessibilityState={on == null ? undefined : { selected: Boolean(on) }}
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => [styles.btn, on && styles.btnOn, pressed && styles.btnPressed]}
    >
      <View style={rotate ? { transform: [{ rotate: `${rotate}deg` }] } : null}>
        <Ionicons name={icon} size={22} color={on ? colors.brassInk : colors.ink} />
      </View>
      <Text numberOfLines={1} style={[styles.word, on && styles.wordOn, { fontSize: display.size(10) }]}>{word}</Text>
    </Pressable>
  );
}

function ToggleRow({ row }) {
  const display = useDisplay();
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={row.label}
      accessibilityHint={row.hint}
      accessibilityState={{ checked: Boolean(row.on), disabled: row.available === false }}
      disabled={row.available === false}
      onPress={row.onToggle}
      style={[styles.row, row.available === false && styles.rowOff]}
    >
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowLabel, { fontSize: display.size(15) }]}>{row.label}</Text>
        <Text style={[styles.rowState, { fontSize: display.size(12) }]}>{row.available === false ? (row.why || "Not on this phone") : row.on ? "On" : "Off"}</Text>
      </View>
      <Switch pointerEvents="none" importantForAccessibility="no" accessibilityElementsHidden value={Boolean(row.on)} trackColor={{ true: colors.brass, false: colors.line }} thumbColor={colors.ink} />
    </Pressable>
  );
}

// loc: { state: recenterState(...), onPress }. layerRows: [{ id, label, on, onToggle, available, why, hint }].
export default function MapRail({
  top = 10,
  full,
  onFull,
  loc,
  canPin,
  pinned,
  onPin,
  heading = 0,
  onNorth,
  hunt,
  onWind,
  onMarks,
  marksCount = 0,
  layerRows = [],
  onMoreLayers,
  onSos
}) {
  const [panel, setPanel] = useState(false);
  const locState = loc?.state || { id: "off", label: "Location off" };
  const locIcon = locState.id === "following" ? "navigate" : locState.id === "off" ? "locate-outline" : "locate";
  return (
    <>
      {full && onSos ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="SOS emergency"
          accessibilityHint="Opens the emergency screen. Nothing is called or sent until you confirm."
          onPress={onSos}
          style={({ pressed }) => [styles.sos, { top }, pressed && styles.btnPressed]}
        >
          <Text style={styles.sosText}>SOS</Text>
        </Pressable>
      ) : null}
      <View style={[styles.rail, { top }]} pointerEvents="box-none">
        <ScrollView contentContainerStyle={styles.railInner} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <RailButton icon="layers-outline" word="Layers" label="Map layers" hint="Roads, property lines, terrain, location, and packs." on={panel} onPress={() => setPanel((value) => !value)} />
          <RailButton icon={locIcon} word={locState.label} label={locState.label} hint={locState.hint} on={locState.id === "following"} onPress={loc?.onPress} />
          {canPin || pinned ? (
            <RailButton icon={pinned ? "lock-closed" : "lock-open-outline"} word={pinned ? "Locked" : "Lock"} label={pinned ? "Unlock position" : "Lock position here"} hint={pinned ? "GPS moves your dot again." : "Holds your current fix as your place. GPS stops moving it until you unlock."} on={pinned} onPress={onPin} />
          ) : null}
          <RailButton icon="compass-outline" word="North" label="North up" hint="Turns the map so north is up." rotate={-heading} onPress={onNorth} />
          {hunt ? <RailButton icon="flag-outline" word="Wind" label="Wind and scent cone" hint="Set the wind. The scent cone on this map follows it." onPress={onWind} /> : null}
          {hunt ? <RailButton icon="pin-outline" word={marksCount ? `Marks ${marksCount}` : "Marks"} label="Marks" hint="Your stands, trails, bedding and sightings." onPress={onMarks} /> : null}
          <RailButton icon={full ? "contract-outline" : "expand-outline"} word={full ? "Exit" : "Full"} label={full ? "Exit full screen" : "Full screen map"} hint={full ? "Shows the tabs again." : "Hides the tabs. SOS stays on the screen."} onPress={() => onFull?.(!full)} />
        </ScrollView>
      </View>
      {panel ? (
        <View style={[styles.panel, { top }]} accessibilityViewIsModal>
          <View style={styles.panelHead}>
            <Text accessibilityRole="header" style={styles.panelTitle}>Map layers</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Close map layers" hitSlop={8} onPress={() => setPanel(false)} style={styles.close}>
              <Ionicons name="close" size={22} color={colors.ink} />
            </Pressable>
          </View>
          <ScrollView style={{ maxHeight: 340 }} keyboardShouldPersistTaps="handled">
            {layerRows.map((row) => <ToggleRow key={row.id} row={row} />)}
            {onMoreLayers ? (
              <Pressable accessibilityRole="button" onPress={() => { setPanel(false); onMoreLayers(); }} style={styles.more}>
                <Text style={styles.moreText}>Packs, styles and downloads</Text>
              </Pressable>
            ) : null}
          </ScrollView>
        </View>
      ) : null}
    </>
  );
}

const styles = themedStyles((c) => ({
  rail: { position: "absolute", right: 8, bottom: 40, width: 64, zIndex: 6, elevation: 6 },
  railInner: { gap: 8, alignItems: "center", paddingBottom: 4 },
  btn: { width: 60, minHeight: Math.max(hit.min, 56), borderRadius: 14, backgroundColor: c.surface, borderWidth: 1, borderColor: c.lineStrong, alignItems: "center", justifyContent: "center", paddingVertical: 4, gap: 2 },
  btnOn: { backgroundColor: c.brass, borderColor: c.brass },
  btnPressed: { opacity: 0.8 },
  word: { color: c.ink, fontWeight: "700", maxWidth: 58, textAlign: "center" },
  wordOn: { color: c.brassInk },
  panel: { position: "absolute", right: 78, width: 250, zIndex: 7, elevation: 7, backgroundColor: c.bg, borderWidth: 1, borderColor: c.lineStrong, borderRadius: 16, padding: 10 },
  panelHead: { flexDirection: "row", alignItems: "center", marginBottom: 4 },
  panelTitle: { flex: 1, color: c.ink, fontSize: 17, fontWeight: "800" },
  close: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  row: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: hit.min + 4, paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: c.line },
  rowOff: { opacity: 0.55 },
  rowLabel: { color: c.ink, fontWeight: "700" },
  rowState: { color: c.muted },
  more: { minHeight: hit.min, justifyContent: "center", marginTop: 6 },
  moreText: { color: c.brassText, fontWeight: "700", textDecorationLine: "underline", fontSize: 15 },
  sos: { position: "absolute", left: 8, width: 56, height: 56, borderRadius: 28, backgroundColor: c.sos, alignItems: "center", justifyContent: "center", zIndex: 9, elevation: 9, borderWidth: 2, borderColor: c.sosInk },
  sosText: { color: c.sosInk, fontWeight: "900", fontSize: 15 }
}));
