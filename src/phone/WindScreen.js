// Wind and the scent cone. The phone has no wind sensor, so you enter the wind or use the saved forecast.
import React, { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { Action, Field, Quiet, ScreenHeader, themedStyles, colors } from "./ui.js";
import { Card, Chips, Line, SourceTag, screenStyles } from "./hunt_ui.js";
import { setHunt, useHunt } from "./hunt_state.js";
import { conditionsFor, windLabel } from "../../symbolic/hunt/conditions.js";
import { COMPASS_POINTS, DEER_TEXT, NO_SENSOR, SPEED_CLASSES, bestStands } from "../../symbolic/hunt/scent.js";

export function ConeDiagram({ cone }) {
  // A plain diagram: you at the center, the wind arrow, and the shaded downwind cone.
  const size = 220;
  const radius = 96;
  const wedge = [];
  const steps = 18;
  for (let i = 0; i <= steps; i += 1) {
    const bearing = cone.downwindDeg - cone.widthDeg / 2 + (cone.widthDeg * i) / steps;
    const rad = (bearing * Math.PI) / 180;
    const len = radius * (0.35 + 0.65 * (cone.lengthM / 300));
    wedge.push({ x: size / 2 + Math.sin(rad) * len, y: size / 2 - Math.cos(rad) * len, rad });
  }
  const dots = [];
  for (let r = 14; r <= radius; r += 8) {
    for (let i = 0; i <= steps; i += 3) {
      const bearing = cone.downwindDeg - cone.widthDeg / 2 + (cone.widthDeg * i) / steps;
      const rad = (bearing * Math.PI) / 180;
      const len = radius * (0.35 + 0.65 * (cone.lengthM / 300));
      if (r <= len) dots.push({ x: size / 2 + Math.sin(rad) * r, y: size / 2 - Math.cos(rad) * r });
    }
  }
  const from = ((cone.fromDeg) * Math.PI) / 180;
  return (
    <View accessibilityLabel={`Wind from ${Math.round(cone.fromDeg)} degrees. Scent cone points ${Math.round(cone.downwindDeg)} degrees, ${cone.widthDeg} degrees wide.`} style={[styles.diagram, { width: size, height: size, borderColor: colors.lineStrong }]}>
      <Text style={[styles.n, { color: colors.muted }]}>N</Text>
      {dots.map((dot, index) => <View key={index} style={[styles.dot, { left: dot.x - 3, top: dot.y - 3, backgroundColor: colors.brass }]} />)}
      <View style={[styles.you, { left: size / 2 - 7, top: size / 2 - 7, backgroundColor: colors.ink }]} />
      <Text style={[styles.arrow, { left: size / 2 + Math.sin(from) * (radius + 6) - 24, top: size / 2 - Math.cos(from) * (radius + 6) - 10, color: colors.ink }]}>wind</Text>
    </View>
  );
}

export default function WindScreen({ position, onBack }) {
  const hunt = useHunt();
  const [editing, setEditing] = useState(false);
  const [problem, setProblem] = useState("");
  const cond = conditionsFor(hunt, { position, now: Date.now(), offsetMinutes: -new Date().getTimezoneOffset() });
  const wind = cond.wind;
  const cone = cond.cone;
  const draft = hunt.wind;
  const manual = hunt.manual;
  const spots = hunt.spots || { stands: [], avoid: [] };
  const fix = position?.consent === true && position.status === "locked" ? position.fix : null;
  const stands = bestStands(spots.stands, spots.avoid, cone);

  function save() {
    if (!draft.fromPoint) { setProblem("Pick the direction the wind is coming from."); return; }
    const typed = manual.windMph === "" ? null : Number(manual.windMph);
    if (typed != null && (!Number.isFinite(typed) || typed < 0 || typed > 80)) { setProblem("Wind speed should be a number from 0 to 80 mph."); return; }
    setProblem("");
    setHunt("wind", (current) => ({ ...current, enteredAt: Date.now(), source: "manual" }));
    setEditing(false);
  }

  function addSpot(kind) {
    if (!fix) return;
    const list = kind === "stand" ? "stands" : "avoid";
    const count = spots[list].length + 1;
    const entry = { name: kind === "stand" ? `Stand ${count}` : `${kind === "bedding" ? "Bedding" : "Trail"} ${count}`, latitude: fix.latitude, longitude: fix.longitude, kind };
    setHunt("spots", (current) => ({ ...current, [list]: [...current[list], entry] }));
  }

  if (editing || !wind.ok) {
    return (
      <ScrollView contentContainerStyle={screenStyles.scroll} keyboardShouldPersistTaps="handled">
        <ScreenHeader title="Wind" lead="Scent cone on the map. Wind you enter, or from the saved forecast." onBack={onBack} backLabel="Field" />
        {!wind.ok ? <Quiet>No wind entered yet. Add a direction and speed for the scent cone.</Quiet> : null}
        <Card title="The wind is coming from">
          <Chips label="Wind direction" value={draft.fromPoint} onChange={(id) => setHunt("wind", (current) => ({ ...current, fromPoint: id }))} options={COMPASS_POINTS.map((id) => ({ id, label: id }))} />
          <Text style={styles.group}>HOW STRONG</Text>
          <Chips label="Wind strength" value={draft.speedClass} onChange={(id) => { setHunt("wind", (current) => ({ ...current, speedClass: id })); setHunt("manual", (current) => ({ ...current, windMph: "" })); }} options={SPEED_CLASSES.map((item) => ({ id: item.id, label: item.label }))} />
          <Field label="Or a speed in mph (optional)" value={manual.windMph} onChangeText={(value) => setHunt("manual", (current) => ({ ...current, windMph: value }))} placeholder="6" />
          <Action label={draft.swirling ? "It is swirling" : "It is not swirling"} tone="quiet" onPress={() => setHunt("wind", (current) => ({ ...current, swirling: !current.swirling }))} accessibilityHint="Light, swirling air spreads your scent wider." />
          {problem ? <Quiet live>{problem}</Quiet> : null}
          <Action label="Save wind" onPress={save} />
        </Card>
        <Quiet>{NO_SENSOR}</Quiet>
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={screenStyles.scroll} keyboardShouldPersistTaps="handled">
      <ScreenHeader title="Wind" lead="Scent cone on the map. Wind you enter, or from the saved forecast." onBack={onBack} backLabel="Field" />
      <Card title={windLabel(wind)}>
        <Line label="Wind comes from" value={`${wind.point}, blowing toward ${cone ? Math.round(cone.downwindDeg) : "?"}°`} />
        <SourceTag source={wind.tag || wind.source} />
        <Action label="Update" tone="quiet" onPress={() => setEditing(true)} />
      </Card>
      {cone ? (
        <Card title="Scent cone">
          <View style={{ alignItems: "center" }}><ConeDiagram cone={cone} /></View>
          <Quiet>{DEER_TEXT}</Quiet>
          <Line label="Width" value={`about ${cone.widthDeg}°`} />
          <Line label="Length" value={cone.speedClass === "calm" ? "short" : cone.speedClass === "strong" ? "long" : "medium"} />
          {cone.notes.map((note) => <Quiet key={note}>{note}</Quiet>)}
        </Card>
      ) : null}
      <Card title="Best stands for this wind">
        {stands.length === 0 ? <Quiet>Save your stands and the trails or bedding you want to keep your scent away from. Then I can list the stands where this wind works.</Quiet> : null}
        {stands.map((stand) => (
          <View key={stand.name} style={styles.stand}>
            <Text style={styles.standName}>{stand.name}: {stand.good ? "good for this wind" : "scent blows toward cover"}</Text>
            <Quiet>{stand.reason}</Quiet>
          </View>
        ))}
        <View style={styles.row}>
          <Action label="Save stand here" tone="quiet" disabled={!fix} onPress={() => addSpot("stand")} />
          <Action label="Mark trail" tone="quiet" disabled={!fix} onPress={() => addSpot("trail")} />
          <Action label="Mark bedding" tone="quiet" disabled={!fix} onPress={() => addSpot("bedding")} />
        </View>
        {!fix ? <Quiet>Turn on your location in Map to save a spot where you stand.</Quiet> : null}
      </Card>
    </ScrollView>
  );
}

const styles = themedStyles((c) => ({
  group: { color: c.muted, fontSize: 12, fontWeight: "700", letterSpacing: 1, marginTop: 6, marginBottom: 6 },
  diagram: { borderWidth: 1, borderRadius: 110, position: "relative", overflow: "hidden" },
  n: { position: "absolute", top: 4, alignSelf: "center", left: 105, fontSize: 12, fontWeight: "700" },
  dot: { position: "absolute", width: 6, height: 6, borderRadius: 3, opacity: 0.7 },
  you: { position: "absolute", width: 14, height: 14, borderRadius: 7 },
  arrow: { position: "absolute", fontSize: 12, fontWeight: "700", width: 48, textAlign: "center" },
  stand: { borderTopWidth: 1, borderTopColor: c.line, paddingTop: 6 },
  standName: { color: c.ink, fontWeight: "600", fontSize: 16 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8 }
}));
