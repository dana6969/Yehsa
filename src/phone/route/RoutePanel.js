// Search, destination, route and Start mode for the regular Map (not the Hunt view).
// Lucky's design language: Field tokens, 48 dp targets, words not color alone, brass for the
// one main action, quiet outlines for the rest. Ask or go stays in its own row under the map.
import React, { useState } from "react";
import { FlatList, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Action, colors, themedStyles, useDisplay } from "../ui.js";
import { formatDistance, formatDuration } from "../../../symbolic/routing/geo.js";
import { ROAD_NOTE } from "./useRoute.js";
import { ROUTE_CREDIT } from "../../../symbolic/routing/route_online.js";
import { GEOCODE_CREDIT } from "../../../symbolic/routing/geocode.js";
import VoiceSearchButton from "../VoiceSearchButton.js";

export function RouteSearchBar({ r, onFocus }) {
  const display = useDisplay();
  return (
    <View style={styles.searchRow}>
      <Ionicons name="search" size={18} color={colors.muted} />
      <TextInput
        value={r.query}
        onChangeText={r.setQuery}
        onFocus={onFocus}
        onSubmitEditing={() => r.runSearch()}
        returnKeyType="search"
        placeholder="Search places, streets, addresses"
        placeholderTextColor={colors.muted}
        accessibilityLabel="Search places, streets and addresses"
        style={[styles.searchInput, { fontSize: display.size(16) }]}
      />
      {r.query ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Clear search" hitSlop={8} onPress={() => { r.setQuery(""); r.setResults(null); }} style={styles.iconBtn}>
          <Ionicons name="close" size={18} color={colors.ink} />
        </Pressable>
      ) : null}
      <VoiceSearchButton label="Search by voice" size={18} onText={r.setQuery} onDone={(spoken) => r.runSearch(spoken)} />
      <Pressable accessibilityRole="button" accessibilityLabel="Search" onPress={() => r.runSearch()} style={styles.goBtn}>
        <Text style={styles.goText}>{r.searching ? "…" : "Search"}</Text>
      </Pressable>
    </View>
  );
}

const LEAVES = "Only your search words go to Photon or Nominatim, and only the route's start and end go to routing.openstreetmap.de.";

function OnlineLine({ r }) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: r.prefs.online }}
      accessibilityLabel={`Online search and routes, ${r.prefs.online ? "on" : "off"}`}
      accessibilityHint={r.prefs.online ? `${LEAVES} Tap to turn it off and use only the bundled offline data.` : `Turns it on. ${LEAVES}`}
      onPress={() => r.savePrefs({ online: !r.prefs.online, onlineChosen: true })}
      style={styles.onlineRow}
    >
      <Ionicons name={r.prefs.online ? "cloud-done-outline" : "cloud-offline-outline"} size={16} color={r.prefs.online ? colors.moss : colors.muted} />
      <View style={{ flex: 1 }}>
        <Text style={styles.onlineText}>{r.prefs.online ? "Online search & routes: On. Tap to turn off" : "Offline only. Tap to use online search & routes"}</Text>
        {r.prefs.online ? <Text style={styles.credit}>{LEAVES}</Text> : null}
      </View>
    </Pressable>
  );
}

export function RouteResults({ r }) {
  if (!r.results) return null;
  return (
    <View style={styles.results} accessibilityLabel="Search results">
      <FlatList
        keyboardShouldPersistTaps="handled"
        data={r.results}
        keyExtractor={(item, i) => `${item.name}-${item.latitude}-${i}`}
        ListEmptyComponent={<Text style={styles.empty}>No match{r.prefs.online ? "." : " in the offline lists."}</Text>}
        renderItem={({ item }) => (
          <View style={styles.resultRow}>
            <View style={{ flex: 1 }}>
              <Text numberOfLines={1} style={styles.resultName}>{item.house ? `${item.house} ${item.name}` : item.name}</Text>
              <Text numberOfLines={1} style={styles.resultDetail}>{[item.detail, item.source === "online" ? "Online" : "Offline"].filter(Boolean).join(" · ")}</Text>
            </View>
            <Action label="Set as destination" tone="quiet" style={styles.setBtn} onPress={() => r.pickDestination(item)} />
          </View>
        )}
        ListFooterComponent={(
          <View style={{ gap: 4, paddingTop: 6 }}>
            {r.notes.map((n) => <Text key={n} style={styles.note}>{n}</Text>)}
            {r.results.some((x) => x.house && x.source === "offline") ? <Text style={styles.note}>House numbers are not stored offline, so this goes to the street.</Text> : null}
            <OnlineLine r={r} />
            <Text style={styles.credit}>{r.prefs.online ? GEOCODE_CREDIT : "Places: © OpenStreetMap contributors, ODbL."}</Text>
            <Action label="Close results" tone="quiet" style={styles.closeBtn} onPress={() => r.setResults(null)} />
          </View>
        )}
      />
    </View>
  );
}

export function RouteCard({ r, hasFix, onTurnOnGps, onShowSteps }) {
  if (!r.destination) return null;
  const route = r.route;
  return (
    <View style={styles.card} accessibilityLabel="Route">
      <View style={styles.cardHead}>
        <View style={{ flex: 1 }}>
          <Text numberOfLines={1} style={styles.cardTitle}>{r.destination.name}</Text>
          {route ? (
            <Text style={styles.cardSub}>
              {`${formatDistance(route.distanceM)} · about ${formatDuration(route.durationS)} · ${route.source === "online" ? "Online route" : "Offline route"}`}
            </Text>
          ) : (
            <Text style={styles.cardSub}>{r.routing ? "Working out the route…" : (r.destination.detail || "")}</Text>
          )}
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Clear destination and route" hitSlop={8} onPress={r.clear} style={styles.iconBtn}>
          <Ionicons name="close" size={20} color={colors.ink} />
        </Pressable>
      </View>
      <View style={styles.chipRow}>
        {["drive", "walk"].map((p) => (
          <Pressable
            key={p}
            accessibilityRole="radio"
            accessibilityState={{ selected: r.prefs.profile === p }}
            accessibilityLabel={p === "drive" ? "Drive" : "Walk"}
            onPress={() => r.setProfile(p)}
            style={[styles.modeChip, r.prefs.profile === p && styles.modeChipOn]}
          >
            <Ionicons name={p === "drive" ? "car-outline" : "walk-outline"} size={16} color={colors.ink} />
            <Text style={styles.modeText}>{`${p === "drive" ? "Drive" : "Walk"}${r.prefs.profile === p ? " ✓" : ""}`}</Text>
          </Pressable>
        ))}
      </View>
      {r.routeError ? <Text style={styles.note}>{r.routeError}</Text> : null}
      {!hasFix ? <Action label="Turn on GPS to route" onPress={onTurnOnGps} style={styles.cardBtn} /> : null}
      {route ? (
        <View style={styles.btnRow}>
          <Action label="Start" onPress={r.start} style={[styles.cardBtn, { flex: 1 }]} accessibilityHint="Follows your position, speaks each turn, and finds a new way if you leave the route." />
          <Action label={`Steps (${route.steps.length})`} tone="quiet" onPress={onShowSteps} style={[styles.cardBtn, { flex: 1 }]} />
        </View>
      ) : null}
      <Text style={styles.warn}>{ROAD_NOTE}</Text>
      {route ? <Text style={styles.credit}>{route.source === "online" ? `${ROUTE_CREDIT.text} Fix the map: ${ROUTE_CREDIT.fixUrl}` : route.credit}</Text> : null}
    </View>
  );
}

export function StepsSheet({ route, onClose }) {
  if (!route) return null;
  return (
    <View style={styles.sheet} accessibilityViewIsModal>
      <View style={styles.sheetHead}>
        <Text accessibilityRole="header" style={styles.sheetTitle}>{`Steps · ${formatDistance(route.distanceM)} · ${formatDuration(route.durationS)}`}</Text>
        <Action label="Close" tone="quiet" style={{ marginBottom: 0 }} onPress={onClose} />
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 2 }}>
        {route.steps.map((s, i) => (
          <View key={`${i}-${s.instruction}`} style={styles.stepRow}>
            <Ionicons name={stepIcon(s)} size={20} color={colors.brass} />
            <View style={{ flex: 1 }}>
              <Text style={styles.stepText}>{s.instruction}</Text>
              {s.distanceM > 0 ? <Text style={styles.stepDist}>{`then ${formatDistance(s.distanceM)}`}</Text> : null}
            </View>
          </View>
        ))}
        <Text style={styles.warn}>{ROAD_NOTE}</Text>
      </ScrollView>
    </View>
  );
}

export function stepIcon(step) {
  const m = step?.modifier || "";
  if (step?.type === "arrive") return "flag-outline";
  if (step?.type === "roundabout") return "sync-outline";
  if (m.includes("uturn")) return "return-down-back-outline";
  if (m.includes("left")) return "arrow-back-outline";
  if (m.includes("right")) return "arrow-forward-outline";
  return "arrow-up-outline";
}

export function NavBanner({ r, onRecenter }) {
  const f = r.nav?.follow;
  const route = r.route;
  if (!r.nav?.on || !route) return null;
  const step = f?.nextStep || route.steps[1] || route.steps[0];
  return (
    <View style={styles.banner} accessibilityLiveRegion="polite">
      <View style={styles.bannerTop}>
        <Ionicons name={stepIcon(step)} size={30} color={colors.brassInk} />
        <View style={{ flex: 1 }}>
          <Text style={styles.bannerDist}>{f ? formatDistance(f.toNextM) : formatDistance(route.steps[0]?.distanceM)}</Text>
          <Text numberOfLines={2} style={styles.bannerText}>{f?.arrived ? "You have arrived" : step?.instruction}</Text>
        </View>
      </View>
      <View style={styles.bannerBottom}>
        <Text style={styles.bannerSub}>
          {f ? `${formatDistance(f.remainingM)} · ${formatDuration(f.remainingS)} left${f.offRoute ? " · Off route, finding a new way" : ""}` : "Waiting for GPS…"}
        </Text>
        <Pressable accessibilityRole="button" accessibilityLabel={r.prefs.voice ? "Voice on. Tap to mute turns." : "Voice off. Tap to speak turns."} onPress={() => r.savePrefs({ voice: !r.prefs.voice })} style={styles.bannerBtn}>
          <Ionicons name={r.prefs.voice ? "volume-high-outline" : "volume-mute-outline"} size={18} color={colors.ink} />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Recenter on me" onPress={onRecenter} style={styles.bannerBtn}>
          <Ionicons name="locate-outline" size={18} color={colors.ink} />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="End route" onPress={r.stop} style={[styles.bannerBtn, styles.bannerEnd]}>
          <Text style={styles.bannerEndText}>End</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = themedStyles((c) => ({
  searchRow: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 48, paddingLeft: 12, paddingRight: 4, marginBottom: 8, borderRadius: 999, borderWidth: 1, borderColor: c.lineStrong, backgroundColor: c.surface },
  searchInput: { flex: 1, color: c.ink, paddingVertical: 8 },
  iconBtn: { minWidth: 40, minHeight: 40, alignItems: "center", justifyContent: "center" },
  goBtn: { minHeight: 40, paddingHorizontal: 14, borderRadius: 999, backgroundColor: c.brass, alignItems: "center", justifyContent: "center" },
  goText: { color: c.brassInk, fontWeight: "700", fontSize: 15 },
  results: { position: "absolute", left: 0, right: 0, top: 0, maxHeight: "85%", backgroundColor: c.bg, borderWidth: 1, borderColor: c.lineStrong, borderRadius: 16, padding: 10, zIndex: 8, elevation: 8 },
  resultRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: c.line },
  resultName: { color: c.ink, fontSize: 16, fontWeight: "600" },
  resultDetail: { color: c.muted, fontSize: 13 },
  setBtn: { marginBottom: 0, minHeight: 40, paddingVertical: 6, paddingHorizontal: 10 },
  closeBtn: { marginBottom: 0, marginTop: 4 },
  empty: { color: c.muted, fontSize: 15, padding: 8 },
  note: { color: c.muted, fontSize: 13, lineHeight: 18 },
  warn: { color: c.clay, fontSize: 12, lineHeight: 17, marginTop: 6 },
  credit: { color: c.muted, fontSize: 11, lineHeight: 15 },
  onlineRow: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 40 },
  onlineText: { color: c.ink, fontSize: 13, fontWeight: "600", flex: 1 },
  card: { marginTop: 8, padding: 12, borderRadius: 16, borderWidth: 1, borderColor: c.lineStrong, backgroundColor: c.surface, gap: 6 },
  cardHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  cardTitle: { color: c.ink, fontSize: 17, fontWeight: "700" },
  cardSub: { color: c.muted, fontSize: 14 },
  chipRow: { flexDirection: "row", gap: 8 },
  modeChip: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 40, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: c.lineStrong },
  modeChipOn: { borderColor: c.brass, borderWidth: 2 },
  modeText: { color: c.ink, fontSize: 14, fontWeight: "600" },
  btnRow: { flexDirection: "row", gap: 8 },
  cardBtn: { marginBottom: 0 },
  sheet: { position: "absolute", left: 0, right: 0, bottom: 0, maxHeight: "80%", backgroundColor: c.bg, borderTopLeftRadius: 20, borderTopRightRadius: 20, borderTopWidth: 1, borderColor: c.lineStrong, zIndex: 10, elevation: 10 },
  sheetHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 18, paddingTop: 12, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: c.line, gap: 8 },
  sheetTitle: { color: c.ink, fontSize: 17, fontWeight: "600", flex: 1 },
  stepRow: { flexDirection: "row", gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: c.line },
  stepText: { color: c.ink, fontSize: 16, lineHeight: 22 },
  stepDist: { color: c.muted, fontSize: 13 },
  banner: { position: "absolute", left: 0, right: 0, top: 0, borderRadius: 16, overflow: "hidden", zIndex: 7, elevation: 7, borderWidth: 1, borderColor: c.lineStrong },
  bannerTop: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12, backgroundColor: c.brass },
  bannerDist: { color: c.brassInk, fontSize: 24, fontWeight: "800" },
  bannerText: { color: c.brassInk, fontSize: 17, fontWeight: "700" },
  bannerBottom: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: c.surface },
  bannerSub: { color: c.ink, fontSize: 14, flex: 1 },
  bannerBtn: { minWidth: 44, minHeight: 40, alignItems: "center", justifyContent: "center", borderRadius: 999, borderWidth: 1, borderColor: c.lineStrong },
  bannerEnd: { paddingHorizontal: 14, borderColor: c.clay },
  bannerEndText: { color: c.clay, fontWeight: "700" }
}));
