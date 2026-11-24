// Field > Compass: a steady, tilt-compensated compass that works with no signal.
// Magnetometer plus accelerometer, low-pass filtered, with true or magnetic north from
// the offline World Magnetic Model, a figure-8 calibration and accuracy indicator,
// bearing lock with back-bearing, and sighting a saved or typed waypoint.
// Sensors run only while this screen is open. It reads no location unless a fix was
// already held with consent, or the user types a place.
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Platform, Pressable, ScrollView, Text, View, useWindowDimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Action, Field, Quiet, ScreenHeader, colors, themedStyles, useDisplay } from "./ui.js";
import { compassSensorsAvailable, startCompassSensors } from "./compass_sensors.js";
import { declinationAt } from "./wmm.js";
import {
  accuracyLevel,
  angleDiff,
  applyOffset,
  backBearing,
  createCalibration,
  createCompassFilter,
  declinationWords,
  formatDistance,
  magneticFromTrue,
  norm360,
  openCalibration,
  pointName,
  steerText,
  trueFromMagnetic
} from "./compass_math.js";
import { haversineKm, initialBearingDeg } from "../../symbolic/landscape_math.js";
import { parsePair } from "../../symbolic/phone_land.js";

const CAL_KEY = "yehsa.compass.cal.v1";
const REF_KEY = "yehsa.compass.ref.v1";
const TICK_MS = 80;

function heldPoint(position) {
  if (position?.consent !== true || position.status !== "locked" || !position.fix) return null;
  return { latitude: position.fix.latitude, longitude: position.fix.longitude };
}

const LEVEL_ICON = { high: "checkmark-circle", medium: "ellipse-outline", low: "alert-circle-outline", unreliable: "close-circle", unknown: "hourglass-outline" };

export default function CompassScreen({ position, waypoints = [], onBack, onOpenBearing, children }) {
  const display = useDisplay();
  const { width } = useWindowDimensions();
  const dial = Math.max(240, Math.min(width - 48, 360));
  const [avail, setAvail] = useState(null);
  const [view, setView] = useState({ heading: null, level: { level: "unknown", label: "Waiting for sensors", reasons: [], advice: "" }, strength: null, axis: "flat" });
  const [north, setNorth] = useState("true");
  const [typed, setTyped] = useState("");
  const [lock, setLock] = useState(null); // locked bearing in the current north reference
  const [targetName, setTargetName] = useState("");
  const [targetText, setTargetText] = useState("");
  const [cal, setCal] = useState(null);
  const [calRun, setCalRun] = useState(null); // { progress, message }
  const [calMessage, setCalMessage] = useState("");
  const filter = useRef(createCompassFilter()).current;
  const calRef = useRef(null);
  const calOffset = useRef(null);
  const expectedRef = useRef(null);

  const here = heldPoint(position) || parsePair(typed);
  const decl = useMemo(() => (here ? declinationAt(here.latitude, here.longitude, new Date()) : null), [here?.latitude, here?.longitude]);
  expectedRef.current = decl ? { totalUt: decl.totalUt, inclination: decl.inclination } : null;
  const useTrue = north === "true" && decl != null && decl.quality !== "unreliable";

  useEffect(() => {
    AsyncStorage.getItem(CAL_KEY).then((raw) => {
      const saved = openCalibration(raw);
      if (saved) { setCal(saved); calOffset.current = saved.offset; }
    }).catch(() => {});
    AsyncStorage.getItem(REF_KEY).then((raw) => { if (raw === "magnetic" || raw === "true") setNorth(raw); }).catch(() => {});
  }, []);

  useEffect(() => {
    let stop = () => {};
    let timer = null;
    let alive = true;
    compassSensorsAvailable().then((a) => {
      if (!alive) return;
      setAvail(a);
      if (!a.magnetometer || !a.accelerometer) return;
      stop = startCompassSensors({
        onAccel: (v) => filter.pushAccel(v),
        onMag: (raw) => {
          const v = applyOffset(raw, calOffset.current);
          filter.pushMag(v);
          if (calRef.current) calRef.current.add(raw);
        }
      });
      timer = setInterval(() => {
        const heading = filter.update(Date.now());
        const s = filter.state();
        if (heading == null) return;
        const level = accuracyLevel({ mag: s.mag, accel: s.accel, jitter: s.jitter, expected: expectedRef.current });
        const strength = Math.hypot(s.mag[0], s.mag[1], s.mag[2]);
        setView({ heading, level, strength, axis: s.axis });
        if (calRef.current) setCalRun({ progress: calRef.current.progress() });
      }, TICK_MS);
    });
    return () => {
      alive = false;
      stop();
      if (timer) clearInterval(timer);
    };
  }, [filter]);

  const chooseNorth = (value) => {
    setNorth(value);
    setLock(null);
    AsyncStorage.setItem(REF_KEY, value).catch(() => {});
  };

  // Heading in the chosen reference.
  const magneticHeading = view.heading;
  const steady = view.level.level !== "unreliable";
  const shown = magneticHeading == null || !steady ? null : useTrue ? trueFromMagnetic(magneticHeading, decl.declination) : magneticHeading;

  const startCal = () => {
    calRef.current = createCalibration({ expectedUt: expectedRef.current?.totalUt || null });
    setCalRun({ progress: 0 });
    setCalMessage("");
  };
  const finishCal = () => {
    const done = calRef.current?.finish();
    if (!done) return;
    if (!done.ok) { setCalMessage(done.reason); return; }
    calRef.current = null;
    setCalRun(null);
    const saved = { offset: done.offset, offsetUt: done.offsetUt, relative: done.relative, savedAt: new Date().toISOString() };
    calOffset.current = done.offset;
    setCal(saved);
    filter.reset();
    AsyncStorage.setItem(CAL_KEY, JSON.stringify(saved)).catch(() => {});
    setCalMessage(`Calibrated. Residual error ${(done.relative * 100).toFixed(1)}%. Field strength measured ${done.radius.toFixed(0)} µT.`);
  };
  const cancelCal = () => { calRef.current = null; setCalRun(null); };
  const clearCal = () => {
    calOffset.current = null;
    setCal(null);
    filter.reset();
    AsyncStorage.removeItem(CAL_KEY).catch(() => {});
    setCalMessage("Calibration cleared. The phone's own calibration is used.");
  };

  // Waypoint sighting.
  const typedTarget = parsePair(targetText);
  const named = waypoints.find((w) => w.name === targetName);
  const target = named ? { name: named.name, latitude: named.latitude, longitude: named.longitude } : typedTarget ? { name: "Target", ...typedTarget } : null;
  let sight = null;
  if (target && here) {
    const km = haversineKm(here, target);
    const trueB = initialBearingDeg(here, target);
    const reference = useTrue ? trueB : decl ? magneticFromTrue(trueB, decl.declination) : null;
    sight = { km, trueB, magB: decl ? magneticFromTrue(trueB, decl.declination) : null, reference };
  }
  const sightSteer = sight && shown != null && sight.reference != null ? steerText(shown, sight.reference) : null;
  const lockSteer = lock != null && shown != null ? steerText(shown, lock) : null;

  const unit = useTrue ? "true" : "magnetic";
  const pillText = { high: "Accuracy good", medium: "Accuracy fair", low: "Accuracy low · calibrate", unreliable: "Accuracy low · calibrate", unknown: "Waiting for sensor" }[view.level.level];
  const noSensor = avail && (!avail.magnetometer || !avail.accelerometer);

  return (
    <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
      <ScreenHeader title="Compass" lead="Steady heading from the phone's sensors. Works with no signal." onBack={onBack} backLabel="Field" />

      {noSensor ? (
        <Quiet live>This phone has no compass sensor. You can still get a bearing between two points.</Quiet>
      ) : (
        <>
          <View style={styles.topRow}>
            <View style={styles.pill} accessible accessibilityLabel={pillText}>
              <Text style={[styles.pillText, { fontSize: display.size(13) }]}>{pillText}</Text>
            </View>
            <Text style={[styles.northLabel, { fontSize: display.size(14) }]}>{useTrue ? "True north" : "Magnetic north"}</Text>
          </View>
          {view.level.level === "low" || view.level.level === "unreliable" ? (
            <Quiet live>The reading is off. Move your phone in a figure-eight until the accuracy pill says good.</Quiet>
          ) : null}
          <View accessibilityRole="summary" accessibilityLabel={shown == null ? "Compass waiting for sensors" : `Heading ${Math.round(shown)} degrees ${pointName(shown)}, ${unit} north`} style={styles.readout}>
            <Text style={[styles.bigHeading, { fontSize: display.size(64) }]}>{shown == null ? "—" : `${String(Math.round(shown) % 360).padStart(3, "0")}°`}</Text>
            <Text style={[styles.pointText, { fontSize: display.size(22) }]}>{shown == null ? (magneticHeading == null ? "Move the phone to start" : "Not steady yet") : `${pointName(shown)} · ${useTrue ? "True north" : "Magnetic north"}`}</Text>
          </View>

          <Dial size={dial} heading={shown} lock={lock} target={sight?.reference ?? null} onTarget={sightSteer?.onTarget} />

          <Pressable accessibilityRole="button" accessibilityLabel={useTrue ? "Use magnetic north" : "Use true north"} onPress={() => chooseNorth(useTrue ? "magnetic" : "true")} style={styles.toggle}>
            <Text style={styles.toggleText}>{useTrue ? "Use magnetic north" : "Use true north"}</Text>
          </Pressable>
          {onOpenBearing ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Bearing between two points" onPress={onOpenBearing} style={styles.toggle}>
              <Text style={styles.toggleText}>Bearing between two points</Text>
            </Pressable>
          ) : null}

          {north === "true" && !decl ? (
            <Quiet>True north needs where you are. Hold a position in Map, or type latitude, longitude below. Until then this shows magnetic north.</Quiet>
          ) : null}
          {decl ? (
            <Quiet live>
              Offline {decl.model} model. Magnetic {magneticHeading == null ? "—" : `${String(Math.round(magneticHeading) % 360).padStart(3, "0")}°`} · declination {declinationWords(decl.declination).replace(" east", " E").replace(" west", " W")}. {decl.note}
            </Quiet>
          ) : null}
          {!heldPoint(position) ? <Field label="Where you are (latitude, longitude)" value={typed} onChangeText={setTyped} placeholder="41.82, -71.41" hint="Used only for declination and distance. Nothing is looked up online." /> : null}

          <View style={styles.accuracy} accessible accessibilityLabel={`Accuracy ${view.level.label}. ${view.level.reasons.join(" ")}`}>
            <Ionicons name={LEVEL_ICON[view.level.level] || "help-circle-outline"} size={22} color={view.level.level === "high" || view.level.level === "medium" ? colors.moss : colors.clay} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.accTitle, { fontSize: display.size(16) }]}>Accuracy: {view.level.label}</Text>
              {view.level.reasons.map((r) => <Text key={r} style={[styles.accText, { fontSize: display.size(13) }]}>{r}</Text>)}
              {view.level.advice ? <Text style={[styles.accText, { fontSize: display.size(13) }]}>{view.level.advice}</Text> : null}
              <Text style={[styles.accText, { fontSize: display.size(13) }]}>
                {view.axis === "upright" ? "Held upright: aiming with the back of the phone." : "Held flat: aiming with the top edge."}
                {view.strength != null ? ` Field ${view.strength.toFixed(0)} µT.` : ""}
              </Text>
            </View>
          </View>

          {calRun ? (
            <View style={styles.calBox}>
              <Text style={[styles.accTitle, { fontSize: display.size(16) }]}>Calibrating: draw a figure 8 in the air</Text>
              <Quiet>Hold the phone and sweep it in a big sideways figure 8 several times, tilting it each way. Keep away from metal and electronics.</Quiet>
              <View style={styles.barTrack} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round((calRun.progress || 0) * 100) }}>
                <View style={[styles.barFill, { width: `${Math.round((calRun.progress || 0) * 100)}%` }]} />
              </View>
              <Text style={styles.accText}>{Math.round((calRun.progress || 0) * 100)}% swept</Text>
              <Action label="Finish calibration" onPress={finishCal} disabled={(calRun.progress || 0) < 0.95} />
              <Action label="Cancel" tone="quiet" onPress={cancelCal} />
              {calMessage ? <Quiet live>{calMessage}</Quiet> : null}
            </View>
          ) : (
            <View>
              <Action label="Calibrate (figure 8)" tone="quiet" onPress={startCal} accessibilityHint="Draw a figure 8 in the air to improve the compass." />
              {calMessage ? <Quiet live>{calMessage}</Quiet> : null}
              <Quiet>{cal ? `Last calibration ${cal.savedAt ? cal.savedAt.slice(0, 10) : ""}. Offset ${cal.offsetUt.toFixed(1)} µT.` : "Not calibrated by Yehsa yet. Android keeps its own calibration; a figure 8 still helps near cars, bags and phone cases with magnets."}</Quiet>
              {cal ? <Action label="Clear calibration" tone="quiet" onPress={clearCal} /> : null}
            </View>
          )}

          <Text style={styles.groupLabel}>BEARING LOCK</Text>
          {lock == null ? (
            <Action label="Lock this bearing" onPress={() => shown != null && setLock(Math.round(shown))} disabled={shown == null} accessibilityHint="Remember where you are facing, then walk it." />
          ) : (
            <View>
              <Text style={[styles.lockText, { fontSize: display.size(22) }]}>Locked {lock}° {pointName(lock)} ({unit})</Text>
              <Text style={[styles.pointText, { fontSize: display.size(18) }]}>{lockSteer ? lockSteer.text : ""}</Text>
              <Quiet>Back bearing {Math.round(backBearing(lock))}° {pointName(backBearing(lock))}. Turn to that to return the way you came.</Quiet>
              <Action label="Clear lock" tone="quiet" onPress={() => setLock(null)} />
            </View>
          )}

          <Text style={styles.groupLabel}>SIGHT A WAYPOINT</Text>
          {waypoints.length ? (
            <View style={styles.chips}>
              {waypoints.map((w) => (
                <Pressable key={w.name} accessibilityRole="button" accessibilityState={{ selected: targetName === w.name }} onPress={() => { setTargetName(targetName === w.name ? "" : w.name); setTargetText(""); }} style={[styles.chip, targetName === w.name && styles.chipOn]}>
                  <Text style={[styles.chipText, targetName === w.name && styles.chipTextOn]}>{w.name}</Text>
                </Pressable>
              ))}
            </View>
          ) : <Quiet>Saved waypoints show here as buttons. Or type a place below.</Quiet>}
          <Field label="Target (latitude, longitude)" value={targetText} onChangeText={(t) => { setTargetText(t); setTargetName(""); }} placeholder="41.90, -71.30" />
          {sight ? (
            <View>
              <Text style={[styles.lockText, { fontSize: display.size(20) }]}>{target.name}: {formatDistance(sight.km)} at {Math.round(sight.reference ?? sight.trueB)}° {pointName(sight.reference ?? sight.trueB)} ({sight.reference == null ? "true" : unit})</Text>
              <Quiet live>True {Math.round(sight.trueB)}°{sight.magB != null ? `, magnetic ${Math.round(sight.magB)}°` : ""}. {sightSteer ? sightSteer.text + "." : ""} Straight-line, not a road route.</Quiet>
            </View>
          ) : target && !here ? <Quiet>Hold a position or type where you are above to get distance and bearing.</Quiet> : null}
        </>
      )}
      {noSensor ? children : null}
    </ScrollView>
  );
}

// A rotating compass card. North on the card follows the real north; the fixed notch at the
// top is the direction you are facing. Letters and numbers, not colour, tell the directions.
function Dial({ size, heading, lock, target, onTarget }) {
  const display = useDisplay();
  const rot = heading == null ? 0 : -heading;
  const ticks = [];
  for (let a = 0; a < 360; a += 10) {
    const major = a % 30 === 0;
    ticks.push(
      <View key={a} pointerEvents="none" style={[styles.spoke, { width: size, height: size, transform: [{ rotate: `${a}deg` }] }]}>
        <View style={{ width: major ? 3 : 1.5, height: major ? 16 : 9, backgroundColor: a % 90 === 0 ? colors.brass : colors.lineStrong, marginTop: 4 }} />
        {major ? (
          <Text style={[styles.dialLabel, { color: a % 90 === 0 ? colors.brassText : colors.ink, fontSize: display.size(a % 90 === 0 ? 22 : 13), fontWeight: a % 90 === 0 ? "800" : "600" }]}>
            {a % 90 === 0 ? ["N", "E", "S", "W"][a / 90] : String(a)}
          </Text>
        ) : null}
      </View>
    );
  }
  const marker = (deg, color, key, label) => (
    <View key={key} pointerEvents="none" style={[styles.spoke, { width: size, height: size, transform: [{ rotate: `${deg}deg` }] }]} accessibilityLabel={label}>
      <View style={{ width: 0, height: 0, borderLeftWidth: 9, borderRightWidth: 9, borderTopWidth: 16, borderLeftColor: "transparent", borderRightColor: "transparent", borderTopColor: color, marginTop: -2 }} />
    </View>
  );
  return (
    <View style={{ alignSelf: "center", width: size, height: size, marginVertical: 14 }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={{ position: "absolute", width: size, height: size, borderRadius: size / 2, borderWidth: 2, borderColor: colors.lineStrong, backgroundColor: colors.field, transform: [{ rotate: `${rot}deg` }] }}>
        {ticks}
        {lock != null ? marker(lock, colors.moss, "lock", "locked bearing") : null}
        {target != null ? marker(target, onTarget ? colors.moss : colors.clay, "target", "waypoint") : null}
      </View>
      {/* fixed facing notch */}
      <View pointerEvents="none" style={{ position: "absolute", top: -8, alignSelf: "center", width: 0, height: 0, borderLeftWidth: 11, borderRightWidth: 11, borderTopWidth: 20, borderLeftColor: "transparent", borderRightColor: "transparent", borderTopColor: colors.brass }} />
      <View pointerEvents="none" style={{ position: "absolute", top: size / 2 - 5, left: size / 2 - 5, width: 10, height: 10, borderRadius: 5, backgroundColor: colors.brass }} />
    </View>
  );
}

const styles = themedStyles((colors) => ({
  scroll: { paddingTop: Platform.OS === "ios" ? 52 : 22, paddingHorizontal: 20, paddingBottom: 180 },
  readout: { alignItems: "center", marginTop: 4 },
  bigHeading: { color: colors.ink, fontWeight: "800", fontVariant: ["tabular-nums"], letterSpacing: -1 },
  pointText: { color: colors.ink, fontWeight: "600", textAlign: "center" },
  spoke: { position: "absolute", top: 0, left: 0, alignItems: "center" },
  dialLabel: { marginTop: 2 },
  topRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
  pill: { borderWidth: 1, borderColor: colors.lineStrong, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  pillText: { color: colors.ink, fontWeight: "600" },
  northLabel: { color: colors.muted },
  toggle: { minHeight: 52, borderWidth: 1, borderColor: colors.lineStrong, borderRadius: 14, alignItems: "center", justifyContent: "center", marginBottom: 10 },
  toggleText: { color: colors.ink, fontWeight: "700", fontSize: 16 },
  segment: { flexDirection: "row", borderWidth: 1, borderColor: colors.lineStrong, borderRadius: 999, overflow: "hidden", marginVertical: 8 },
  segmentItem: { flex: 1, minHeight: 48, alignItems: "center", justifyContent: "center" },
  segmentOn: { backgroundColor: colors.brass },
  segmentText: { color: colors.ink, fontWeight: "600", fontSize: 15 },
  segmentTextOn: { color: colors.brassInk },
  accuracy: { flexDirection: "row", gap: 10, borderWidth: 1, borderColor: colors.line, borderRadius: 12, padding: 12, marginVertical: 10, backgroundColor: colors.surface },
  accTitle: { color: colors.ink, fontWeight: "700" },
  accText: { color: colors.muted, marginTop: 2 },
  calBox: { borderWidth: 1, borderColor: colors.brass, borderRadius: 12, padding: 12, gap: 8, marginVertical: 8 },
  barTrack: { height: 14, borderRadius: 7, borderWidth: 1, borderColor: colors.lineStrong, overflow: "hidden" },
  barFill: { height: 14, backgroundColor: colors.brass },
  groupLabel: { color: colors.muted, fontSize: 12, fontWeight: "700", letterSpacing: 1.2, marginBottom: 8, marginTop: 16 },
  lockText: { color: colors.ink, fontWeight: "700", marginVertical: 4 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 8 },
  chip: { minHeight: 44, paddingHorizontal: 14, justifyContent: "center", borderWidth: 1, borderColor: colors.lineStrong, borderRadius: 999 },
  chipOn: { backgroundColor: colors.brass },
  chipText: { color: colors.ink, fontWeight: "600" },
  chipTextOn: { color: colors.brassInk }
}));
