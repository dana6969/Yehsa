// Field > Radio. Honest radio: Yehsa cannot tune AM or FM on a phone, so this screen says
// what the phone can and cannot do, then gives real help that works:
//   - an offline NOAA Weather Radio guide (frequencies, nearest transmitters, SAME codes)
//   - an offline list of the national emergency AM/FM stations by state
//   - internet radio, clearly labelled as needing signal
//   - the phone maker's own FM app, if the phone has one
//   - a plain note on RTL-SDR dongles
// No tuner is faked and no station is shown as receivable unless it is a listed fact.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Platform, Pressable, ScrollView, Text, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Action, Field, Quiet, ScreenHeader, colors, themedStyles, useDisplay } from "./ui.js";
import {
  EMERGENCY_RADIO_TIPS,
  NOAA_CHANNELS,
  NOAA_TIPS,
  bandOf,
  emergencyStations,
  formatMhz,
  guessState,
  loadNwr,
  loadPep,
  nearestWeatherRadio,
  receptionNote,
  sameCodes,
  stateCode,
  stateName
} from "./radio_data.js";
import { INTERNET_RADIO_LABEL, INTERNET_RADIO_PRIVACY, openFavorites, searchStations, toggleFavorite } from "./internet_radio.js";
import { playStream, radioPlayerAvailable, stopStream } from "./radio_player.js";
import { openPhoneFmApp } from "./fm_app.js";
import { parsePair } from "../../symbolic/phone_land.js";
import { formatDistance } from "./compass_math.js";

const FAV_KEY = "yehsa.radio.favorites.v1";

function heldPoint(position) {
  if (position?.consent !== true || position.status !== "locked" || !position.fix) return null;
  return { latitude: position.fix.latitude, longitude: position.fix.longitude };
}

function phoneName() {
  const c = Platform.OS === "android" ? Platform.constants : null;
  if (!c) return "";
  return [c.Manufacturer || c.Brand, c.Model].filter(Boolean).join(" ");
}

export default function RadioScreen({ position, onBack, onOpenMorse }) {
  const display = useDisplay();
  const [typed, setTyped] = useState("");
  const [stateText, setStateText] = useState("");
  const [countyText, setCountyText] = useState("");
  const [fmResult, setFmResult] = useState("");
  const [dirName, setDirName] = useState("");
  const [dirState, setDirState] = useState("");
  const [dirBusy, setDirBusy] = useState(false);
  const [dirError, setDirError] = useState("");
  const [dirResults, setDirResults] = useState(null);
  const [favorites, setFavorites] = useState([]);
  const [playing, setPlaying] = useState(null);
  const [playError, setPlayError] = useState("");

  const here = heldPoint(position) || parsePair(typed);
  const nearby = useMemo(() => (here ? nearestWeatherRadio(here.latitude, here.longitude, { limit: 4 }) : []), [here?.latitude, here?.longitude]);
  const guessed = here ? guessState(here.latitude, here.longitude) : "";
  const state = stateCode(stateText) || guessed;
  const emergency = useMemo(() => (state ? emergencyStations(state) : []), [state]);
  const counties = useMemo(() => (state ? sameCodes(state, countyText).slice(0, 12) : []), [state, countyText]);
  const meta = useMemo(() => loadNwr(), []);

  useEffect(() => {
    AsyncStorage.getItem(FAV_KEY).then((raw) => setFavorites(openFavorites(raw))).catch(() => {});
    return () => stopStream();
  }, []);

  const saveFavorites = (next) => {
    setFavorites(next);
    AsyncStorage.setItem(FAV_KEY, JSON.stringify(next)).catch(() => {});
  };

  const tryFm = useCallback(async () => {
    const result = await openPhoneFmApp();
    setFmResult(result.ok ? "Opened this phone's own FM app. Plug in wired headphones: they are the antenna." : result.reason);
  }, []);

  const search = useCallback(async () => {
    setDirBusy(true);
    setDirError("");
    try {
      const list = await searchStations({ name: dirName, state: dirState || stateName(state) });
      setDirResults(list);
    } catch (err) {
      setDirResults(null);
      setDirError(`${String(err?.message || "I couldn't reach the radio directory.")} This part needs signal. The guides above still work.`);
    } finally {
      setDirBusy(false);
    }
  }, [dirName, dirState, state]);

  const play = async (station) => {
    setPlayError("");
    try {
      await playStream(station.url);
      setPlaying(station.id);
    } catch (err) {
      setPlaying(null);
      setPlayError(`I couldn't play ${station.name}. It needs signal and the station may be off the air.`);
    }
  };
  const stop = () => {
    stopStream();
    setPlaying(null);
  };

  const device = phoneName();
  const rows = [
    { k: "Tune AM or FM inside Yehsa", v: "No", d: "Android gives apps no access to a phone's FM chip. No phone receives AM." },
    { k: "This phone's own FM app", v: "Try it", d: "Some phones have one that works with wired headphones. Tap the button below to find out." },
    { k: "USB radio dongle (RTL-SDR)", v: "Not driven by Yehsa", d: "Works only through a separate SDR app. See the note at the bottom." },
    { k: "Internet radio", v: "Needs signal", d: "Works with mobile data or Wi-Fi only." },
    { k: "Weather and emergency guide", v: "Works offline", d: "Frequencies, transmitters, SAME codes, stations." }
  ];

  return (
    <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
      <ScreenHeader title="Radio" lead="Broadcast AM and FM." onBack={onBack} backLabel="Field" />

      <View style={styles.card}>
        <Text accessibilityRole="header" style={[styles.cardTitle, { fontSize: display.size(18) }]}>Yehsa can't tune AM or FM on this phone.</Text>
        <Text style={[styles.body, { fontSize: display.size(16) }]}>Most phones need a radio chip, and often a wired headset as the antenna. Yehsa will not pretend to tune a station that this hardware cannot hear.</Text>
        {device ? <Quiet>This phone: {device}.</Quiet> : null}
        {rows.map((r) => (
          <View key={r.k} style={styles.row} accessible accessibilityLabel={`${r.k}: ${r.v}. ${r.d}`}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowKey, { fontSize: display.size(15) }]}>{r.k}</Text>
              <Text style={[styles.rowDesc, { fontSize: display.size(13) }]}>{r.d}</Text>
            </View>
            <Text style={[styles.rowVal, { fontSize: display.size(14) }]}>{r.v}</Text>
          </View>
        ))}
      </View>

      <View style={styles.card}>
        <Text accessibilityRole="header" style={[styles.cardTitle, { fontSize: display.size(18) }]}>What you can do</Text>
        <Text style={[styles.body, { fontSize: display.size(16) }]}>Use a dedicated radio if you have one. Or open Morse to flash or whistle a signal from this phone.</Text>
        {onOpenMorse ? <Action label="Open Morse" onPress={onOpenMorse} /> : null}
        {Platform.OS === "android" ? <Action label="Try this phone's own FM app" tone="quiet" onPress={tryFm} accessibilityHint="Opens the FM app the phone maker installed, if there is one." /> : null}
        {fmResult ? <Quiet live>{fmResult}</Quiet> : null}
      </View>

      <Text style={styles.groupLabel}>NOAA WEATHER RADIO · WORKS OFFLINE</Text>
      <View style={styles.card}>
        <Text style={[styles.body, { fontSize: display.size(16) }]}>Seven channels carry the National Weather Service forecast and alerts, all day. You need a weather-band radio.</Text>
        <View style={styles.chips}>
          {NOAA_CHANNELS.map((c) => (
            <View key={c.wx} style={styles.freq} accessible accessibilityLabel={`Channel WX${c.wx}, ${c.mhz.toFixed(3)} megahertz`}>
              <Text style={[styles.freqMhz, { fontSize: display.size(16) }]}>{c.mhz.toFixed(3)}</Text>
              <Text style={[styles.freqWx, { fontSize: display.size(12) }]}>WX{c.wx}</Text>
            </View>
          ))}
        </View>
        {NOAA_TIPS.map((t) => <Quiet key={t}>{t}</Quiet>)}
      </View>

      {!heldPoint(position) ? <Field label="Where you are (latitude, longitude)" value={typed} onChangeText={setTyped} placeholder="41.82, -71.41" hint="Finds the nearest transmitters from the list on this phone. Nothing is looked up online." /> : null}
      <Field label="Or a state (name or two letters)" value={stateText} onChangeText={setStateText} placeholder="RI" />
      {nearby.length ? (
        <View style={styles.card}>
          <Text accessibilityRole="header" style={[styles.cardTitle, { fontSize: display.size(17) }]}>Nearest weather-radio transmitters</Text>
          {nearby.map((s) => (
            <View key={s.callsign} style={styles.row} accessible accessibilityLabel={`${s.site}, ${s.state}. ${formatMhz(s.mhz)}. ${formatDistance(s.km)} away.`}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowKey, { fontSize: display.size(15) }]}>{s.site}, {s.state} · {s.callsign}</Text>
                <Text style={[styles.rowDesc, { fontSize: display.size(13) }]}>{formatDistance(s.km)} straight line. {receptionNote(s.km)}{s.degraded ? " Listed as degraded or out of service." : ""}</Text>
              </View>
              <Text style={[styles.rowVal, { fontSize: display.size(15) }]}>{formatMhz(s.mhz)}</Text>
            </View>
          ))}
        </View>
      ) : null}
      {state ? (
        <View style={styles.card}>
          <Text accessibilityRole="header" style={[styles.cardTitle, { fontSize: display.size(17) }]}>SAME county codes for {stateName(state)}</Text>
          <Quiet>Enter these in a weather radio so it only alerts for your county. Codes starting 0 cover the whole county.</Quiet>
          <Field label="County name" value={countyText} onChangeText={setCountyText} placeholder="Providence" />
          {counties.map((c) => (
            <Text key={c.county} selectable style={[styles.rowDesc, { fontSize: display.size(15), color: colors.ink }]}>{c.county}: {c.codes.join(", ")} · {c.transmitters.slice(0, 3).map((t) => `${t.callsign} ${t.mhz.toFixed(3)}`).join(", ")}</Text>
          ))}
          {!counties.length ? <Quiet>No county matches. Check the spelling.</Quiet> : null}
        </View>
      ) : <Quiet>Type where you are or a state above to see the nearest transmitters and county codes.</Quiet>}

      <Text style={styles.groupLabel}>EMERGENCY AM AND FM STATIONS · WORKS OFFLINE</Text>
      <View style={styles.card}>
        {state ? (
          emergency.length ? emergency.map((s) => (
            <View key={s.callsign} style={styles.row} accessible accessibilityLabel={`${s.callsign}, ${s.freq}, ${s.city}, ${s.state}. Covers ${s.covers.join(", ")}.`}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowKey, { fontSize: display.size(15) }]}>{s.callsign} · {s.city}, {s.state}</Text>
                <Text style={[styles.rowDesc, { fontSize: display.size(13) }]}>National Public Warning System station. Covers {s.covers.join(", ")}. {bandOf(s.freq) === "AM" ? "AM carries far, especially after dark." : "FM is clearer but nearer."}</Text>
              </View>
              <Text style={[styles.rowVal, { fontSize: display.size(15) }]}>{s.freq}</Text>
            </View>
          )) : <Quiet>FEMA lists no Primary Entry Point station for {stateName(state)}. Tune any local news AM station.</Quiet>
        ) : <Quiet>Pick a place or state above to see its emergency station.</Quiet>}
        {EMERGENCY_RADIO_TIPS.map((t) => <Quiet key={t}>{t}</Quiet>)}
        <Quiet>Sources: FEMA National Public Warning System list ({loadNwrDate()}), NWS NOAA Weather Radio list ({meta.fetched}). Stations and transmitters change; a missing one is not proof of no coverage.</Quiet>
      </View>

      <Text style={styles.groupLabel}>INTERNET RADIO · NEEDS SIGNAL</Text>
      <View style={styles.card}>
        <Text style={[styles.body, { fontSize: display.size(16) }]}>{INTERNET_RADIO_LABEL} Not available offline.</Text>
        <Quiet>{INTERNET_RADIO_PRIVACY}</Quiet>
        <Field label="Station name (optional)" value={dirName} onChangeText={setDirName} placeholder="news" />
        <Field label="State (optional)" value={dirState} onChangeText={setDirState} placeholder={state ? stateName(state) : "Rhode Island"} />
        <Action label={dirBusy ? "Searching" : "Search stations (needs signal)"} onPress={search} disabled={dirBusy} />
        {dirBusy ? <ActivityIndicator color={colors.brass} /> : null}
        {dirError ? <Quiet live>{dirError}</Quiet> : null}
        {playError ? <Quiet live>{playError}</Quiet> : null}
        {!radioPlayerAvailable() ? <Quiet>Playback works in the phone app only.</Quiet> : null}
        {dirResults && !dirResults.length ? <Quiet>No stations matched. Try fewer words.</Quiet> : null}
        {(dirResults || []).map((s) => (
          <StationRow key={s.id} station={s} playing={playing === s.id} saved={favorites.some((f) => f.id === s.id)} onPlay={() => play(s)} onStop={stop} onSave={() => saveFavorites(toggleFavorite(favorites, s))} display={display} canPlay={radioPlayerAvailable()} />
        ))}
        {favorites.length ? <Text style={styles.groupLabel}>SAVED STATIONS (PLAYING STILL NEEDS SIGNAL)</Text> : null}
        {favorites.map((s) => (
          <StationRow key={`fav-${s.id}`} station={s} playing={playing === s.id} saved onPlay={() => play(s)} onStop={stop} onSave={() => saveFavorites(toggleFavorite(favorites, s))} display={display} canPlay={radioPlayerAvailable()} />
        ))}
      </View>

      <Text style={styles.groupLabel}>USB RADIO DONGLE · EXPERIMENT</Text>
      <View style={styles.card}>
        <Text style={[styles.body, { fontSize: display.size(16) }]}>An RTL-SDR USB dongle plus a USB-OTG cable can hear FM, AM (with a converter on most models) and the weather band on a phone. Yehsa does not drive one. It needs a separate SDR app, drains the battery fast, and Yehsa has not tested any dongle.</Text>
      </View>
    </ScrollView>
  );
}

function loadNwrDate() {
  return loadPep().fetched;
}

function StationRow({ station, playing, saved, onPlay, onStop, onSave, display, canPlay }) {
  return (
    <View style={styles.station}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowKey, { fontSize: display.size(15) }]}>{station.name}</Text>
        <Text style={[styles.rowDesc, { fontSize: display.size(13) }]}>{[station.state, station.codec, station.bitrate ? `${station.bitrate} kbps` : "", station.tags.join(", ")].filter(Boolean).join(" · ")}</Text>
      </View>
      {canPlay ? (
        <Pressable accessibilityRole="button" accessibilityLabel={playing ? `Stop ${station.name}` : `Play ${station.name}, needs signal`} onPress={playing ? onStop : onPlay} style={styles.small}>
          <Text style={styles.smallText}>{playing ? "Stop" : "Play"}</Text>
        </Pressable>
      ) : null}
      <Pressable accessibilityRole="button" accessibilityLabel={saved ? `Remove ${station.name} from saved` : `Save ${station.name}`} onPress={onSave} style={styles.small}>
        <Text style={styles.smallText}>{saved ? "Saved" : "Save"}</Text>
      </Pressable>
    </View>
  );
}

const styles = themedStyles((colors) => ({
  scroll: { paddingTop: Platform.OS === "ios" ? 52 : 22, paddingHorizontal: 20, paddingBottom: 180 },
  card: { borderWidth: 1, borderColor: colors.lineStrong, borderRadius: 16, padding: 16, gap: 10, marginBottom: 14, backgroundColor: colors.surface },
  cardTitle: { color: colors.ink, fontWeight: "700" },
  body: { color: colors.ink, lineHeight: 24 },
  row: { flexDirection: "row", gap: 10, alignItems: "flex-start", paddingVertical: 6, borderTopWidth: 1, borderTopColor: colors.line },
  rowKey: { color: colors.ink, fontWeight: "600" },
  rowDesc: { color: colors.muted, marginTop: 2, lineHeight: 18 },
  rowVal: { color: colors.brassText, fontWeight: "700", textAlign: "right", maxWidth: 130 },
  groupLabel: { color: colors.muted, fontSize: 12, fontWeight: "700", letterSpacing: 1.2, marginBottom: 8, marginTop: 12 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  freq: { minWidth: 88, borderWidth: 1, borderColor: colors.lineStrong, borderRadius: 12, paddingVertical: 8, paddingHorizontal: 10, alignItems: "center" },
  freqMhz: { color: colors.ink, fontWeight: "700", fontVariant: ["tabular-nums"] },
  freqWx: { color: colors.muted, fontWeight: "600" },
  station: { flexDirection: "row", gap: 8, alignItems: "center", paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.line },
  small: { minHeight: 44, minWidth: 56, paddingHorizontal: 10, borderWidth: 1, borderColor: colors.lineStrong, borderRadius: 999, alignItems: "center", justifyContent: "center" },
  smallText: { color: colors.ink, fontWeight: "600" }
}));
