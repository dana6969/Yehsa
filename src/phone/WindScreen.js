// The Wind sheet on the Hunt map. The phone has no wind sensor, so wind is what you enter
// or the saved forecast. The scent cone is drawn on the map and follows this sheet live.
// Field > Wind and the Wind card on the Hunt view both open this same sheet.
import React, { useState } from "react";
import { Text } from "react-native";
import { Action, Field, Quiet, themedStyles } from "./ui.js";
import { Chips } from "./hunt_ui.js";
import { setHunt } from "./hunt_state.js";
import { COMPASS_POINTS, DEER_TEXT, SPEED_CLASSES } from "../../symbolic/hunt/scent.js";
import { TEXT } from "../../symbolic/hunt/marks.js";
import { hasSavedForecastWind, isManualWind, resetWindPatch, savedForecastLine } from "../../symbolic/hunt/wind_source.js";

export default function WindSheet({ hunt, view, now = Date.now() }) {
  const [problem, setProblem] = useState("");
  const draft = hunt.wind;
  const manual = hunt.manual;
  const manualOn = isManualWind(hunt);
  const forecast = hasSavedForecastWind(hunt, now);

  function save(onDone) {
    if (!draft.fromPoint) { setProblem("Pick the direction the wind is coming from."); return; }
    const typed = manual.windMph === "" ? null : Number(manual.windMph);
    if (typed != null && (!Number.isFinite(typed) || typed < 0 || typed > 80)) { setProblem("Wind speed should be a number from 0 to 80 mph."); return; }
    setProblem("");
    setHunt("wind", (current) => ({ ...current, enteredAt: Date.now(), source: "manual" }));
    onDone?.();
  }

  function reset() {
    const patch = resetWindPatch();
    setHunt("wind", patch.wind);
    setHunt("manual", (current) => ({ ...current, windMph: patch.manualMph }));
    setProblem("");
  }

  return (
    <>
      <Quiet>The scent cone on this map follows the wind you save here. Field → Wind opens this same sheet.</Quiet>
      <Text style={styles.group}>THE WIND IS COMING FROM</Text>
      <Chips label="Wind direction" value={draft.fromPoint} onChange={(id) => setHunt("wind", (current) => ({ ...current, fromPoint: current.fromPoint === id ? "" : id }))} options={COMPASS_POINTS.map((id) => ({ id, label: id }))} />
      <Text style={styles.group}>HOW STRONG</Text>
      <Chips label="Wind strength" value={draft.speedClass} onChange={(id) => { setHunt("wind", (current) => ({ ...current, speedClass: id })); setHunt("manual", (current) => ({ ...current, windMph: "" })); }} options={SPEED_CLASSES.map((item) => ({ id: item.id, label: item.label }))} />
      <Field label="Or a speed in mph (optional)" value={manual.windMph} onChangeText={(value) => setHunt("manual", (current) => ({ ...current, windMph: value }))} placeholder="6" />
      <Action label={draft.swirling ? "It is swirling" : "It is not swirling"} tone="quiet" onPress={() => setHunt("wind", (current) => ({ ...current, swirling: !current.swirling }))} accessibilityHint="Light, swirling air spreads your scent wider." />
      <Quiet>{savedForecastLine(hunt, now)}</Quiet>
      {manualOn ? <Quiet>You entered this wind, so it is used instead of the forecast.</Quiet> : null}
      {problem ? <Quiet live>{problem}</Quiet> : null}
      <Action label="Save wind" onPress={() => save()} />
      {manualOn ? <Action label={forecast ? "Use the saved forecast" : "Clear the wind"} tone="quiet" onPress={reset} accessibilityHint="Removes the wind you entered, so the cone follows the saved forecast." /> : null}
      {view?.ok ? <Quiet live>{view.label}</Quiet> : <Quiet live>{view?.message || ""}</Quiet>}
      <Quiet>{DEER_TEXT}</Quiet>
      <Quiet>{TEXT.lengthNote}</Quiet>
      <Quiet>{TEXT.thermals}</Quiet>
    </>
  );
}

const styles = themedStyles((c) => ({
  group: { color: c.muted, fontSize: 12, fontWeight: "700", letterSpacing: 1, marginTop: 6, marginBottom: 6 }
}));
