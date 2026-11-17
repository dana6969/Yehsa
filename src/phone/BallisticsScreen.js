// Ballistics: drop and wind from numbers you enter. A field calculator, not a firing solution.
import React, { useMemo, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { Action, Field, Quiet, ScreenHeader, themedStyles, useDisplay } from "./ui.js";
import { Card, Chips, Line, screenStyles } from "./hunt_ui.js";
import { setHunt, useHunt } from "./hunt_state.js";
import { FOOTER, PRESETS, PRESET_LABEL, clockWords, presetById, solve } from "../../symbolic/hunt/ballistics.js";

const CLOCKS = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((n) => ({ id: String(n), label: String(n) }));

export default function BallisticsScreen({ onBack }) {
  const hunt = useHunt();
  const form = hunt.ballistics;
  const [editing, setEditing] = useState(false);
  const display = useDisplay();
  const set = (patch) => setHunt("ballistics", (current) => ({ ...current, ...patch }));
  const result = useMemo(() => solve(form), [JSON.stringify(form)]);
  const preset = presetById(form.preset);
  const groups = [...new Set(PRESETS.map((item) => item.group))];

  function pick(id) {
    const chosen = presetById(id);
    if (!chosen) return;
    set({ preset: id, grains: String(chosen.grains), bc: String(chosen.bc), fps: String(chosen.fps) });
  }

  return (
    <ScrollView contentContainerStyle={screenStyles.scroll} keyboardShouldPersistTaps="handled">
      <ScreenHeader title="Ballistics" lead="Drop and wind from numbers you enter. This is a field calculator, not a firing solution." onBack={onBack} backLabel="Field" />
      {editing || !result.ok ? (
        <Card title="Your numbers">
          {groups.map((group) => (
            <View key={group}>
              <Text style={styles.group}>{group.toUpperCase()}</Text>
              <Chips label={group} value={form.preset} onChange={pick} options={PRESETS.filter((item) => item.group === group).map((item) => ({ id: item.id, label: item.name }))} />
            </View>
          ))}
          {preset && String(preset.grains) === String(form.grains) && String(preset.bc) === String(form.bc) && String(preset.fps) === String(form.fps) ? (
            <Quiet>{preset.name}: {preset.bullet}. {PRESET_LABEL}.</Quiet>
            ) : null}
          {preset && String(preset.grains) === String(form.grains) && String(preset.bc) === String(form.bc) && String(preset.fps) === String(form.fps) ? (
            <Quiet>{`Source: ${preset.source.maker} ${preset.source.product}, read ${preset.source.read}.${preset.source.note ? ` ${preset.source.note}` : ""}${preset.source.level === "bc-listing" ? " The ballistic coefficient is the maker\u2019s listed figure." : ""}`}</Quiet>
          ) : <Quiet>Custom numbers.</Quiet>}
          <Field label="Bullet weight (grains)" value={form.grains} onChangeText={(value) => set({ grains: value, preset: "" })} placeholder="150" />
          <Field label="G1 ballistic coefficient" value={form.bc} onChangeText={(value) => set({ bc: value, preset: "" })} placeholder="0.294" />
          <Field label="Muzzle velocity (fps)" value={form.fps} onChangeText={(value) => set({ fps: value, preset: "" })} placeholder="2820" />
          <Field label="Sight height (inches)" value={form.sightIn} onChangeText={(value) => set({ sightIn: value })} placeholder="1.5" />
          <Field label="Zero distance (yards)" value={form.zeroYd} onChangeText={(value) => set({ zeroYd: value })} placeholder="100" />
          <Field label="Wind speed (mph)" value={form.windMph} onChangeText={(value) => set({ windMph: value })} placeholder="10" />
          <Text style={styles.group}>WIND FROM (CLOCK FACE, 12 IS HEAD ON)</Text>
          <Chips label="Wind direction" value={String(form.windClock)} onChange={(id) => set({ windClock: id })} options={CLOCKS} />
          <Field label="Temperature (F, optional)" value={form.tempF} onChangeText={(value) => set({ tempF: value })} placeholder="59" />
          <Field label="Altitude (feet, optional)" value={form.altitudeFt} onChangeText={(value) => set({ altitudeFt: value })} placeholder="0" />
          {!result.ok ? result.problems.map((problem) => <Quiet key={problem} live>{problem}</Quiet>) : null}
          {result.ok ? <Action label="Show the table" onPress={() => setEditing(false)} /> : null}
        </Card>
      ) : (
        <>
          <Card title={`${preset?.name || "Custom load"}, zeroed at ${form.zeroYd} yd`}>
            <Line label="Bullet" value={`${form.grains} gr, G1 BC ${form.bc}`} />
            <Line label="Muzzle" value={`${form.fps} fps, ${result.muzzleEnergy} ft-lb`} />
            <Line label="Wind" value={result.note} />
            {preset ? <Quiet>{PRESET_LABEL}.</Quiet> : null}
          </Card>
          <Card title="Drop, drift and energy">
            <View style={styles.headRow}>
              {["Yd", "Drop in", "MOA", "Drift in", "10 mph", "ft-lb"].map((label) => <Text key={label} style={[styles.cell, styles.head, { fontSize: display.size(12) }]}>{label}</Text>)}
            </View>
            {result.rows.map((row) => (
              <View key={row.yd} style={styles.row} accessibilityLabel={`${row.yd} yards, drop ${row.dropIn} inches, ${row.dropMoa} MOA, drift ${row.driftIn} inches ${row.driftSide}, 10 mph wind ${row.tenMphIn} inches, ${row.energyFtLb} foot pounds`}>
                <Text style={[styles.cell, { fontSize: display.size(14) }]}>{row.yd}</Text>
                <Text style={[styles.cell, { fontSize: display.size(14) }]}>{row.dropIn > 0 ? `+${row.dropIn}` : row.dropIn}</Text>
                <Text style={[styles.cell, { fontSize: display.size(14) }]}>{row.dropMoa > 0 ? `+${row.dropMoa}` : row.dropMoa}</Text>
                <Text style={[styles.cell, { fontSize: display.size(14) }]}>{row.driftIn}{row.driftSide ? ` ${row.driftSide[0].toUpperCase()}` : ""}</Text>
                <Text style={[styles.cell, { fontSize: display.size(14) }]}>{row.tenMphIn}</Text>
                <Text style={[styles.cell, { fontSize: display.size(14) }]}>{row.energyFtLb}</Text>
              </View>
            ))}
            <Quiet>Drop is from your line of sight; minus means low. Drift: L is left, R is right, for the wind you entered. The 10 mph column is full value from the side.</Quiet>
          </Card>
          <Card title="Max point-blank range">
            <Text style={styles.big}>{result.mpbr.yd} yd</Text>
            <Quiet>Aim dead center on a 6 inch vital zone out to {result.mpbr.yd} yd, when zeroed at {result.mpbr.zeroYd} yd. Your zero is {form.zeroYd} yd.</Quiet>
          </Card>
          <Action label="Edit the inputs" tone="quiet" onPress={() => setEditing(true)} />
        </>
      )}
      <Quiet>{FOOTER}</Quiet>
    </ScrollView>
  );
}

const styles = themedStyles((c) => ({
  group: { color: c.muted, fontSize: 12, fontWeight: "700", letterSpacing: 1, marginTop: 6, marginBottom: 6 },
  headRow: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: c.lineStrong, paddingBottom: 4 },
  row: { flexDirection: "row", paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: c.line },
  cell: { flex: 1, color: c.ink, textAlign: "right", fontVariant: ["tabular-nums"] },
  head: { color: c.muted, fontWeight: "700" },
  big: { color: c.ink, fontSize: 28, fontWeight: "700" }
}));
