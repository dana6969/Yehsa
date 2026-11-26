// Weather: an offline barometer trend from the phone's pressure sensor, plus the last saved
// NWS alerts and forecast. Yehsa does not promise live weather without signal.
import React, { useEffect, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { Action, Field, Quiet, ScreenHeader, themedStyles } from "./ui.js";
import { Card, Chips, Line, SourceTag, screenStyles } from "./hunt_ui.js";
import { setHunt, useHunt } from "./hunt_state.js";
import { hasBarometer, readPressureOnce } from "./barometer_sensor.js";
import { addReading, elevationNote, markElevationChange, LOG_EVERY_MS, trendOf, seriesFor } from "../../symbolic/hunt/baro.js";
import { describeSaved } from "../../symbolic/hunt/nws.js";
import { weatherRecord } from "../../symbolic/weather_service.js";
import { refreshWeather } from "./weather_ask.js";

export function useBarometerLogger(enabled, position) {
  const hunt = useHunt();
  const [sensor, setSensor] = useState(null);
  const [failed, setFailed] = useState(false);
  const [tries, setTries] = useState(0);
  useEffect(() => {
    hasBarometer().then(setSensor);
  }, []);
  useEffect(() => {
    if (!enabled || sensor !== true) return undefined;
    let live = true;
    const sample = async () => {
      const hpa = await readPressureOnce();
      if (!live) return;
      if (hpa == null) { setFailed(true); return; }
      setFailed(false);
      const alt = position?.consent === true && position.status === "locked" ? position.fix?.altitude ?? null : null;
      setHunt("baro", (log) => addReading(log, { t: Date.now(), hpa, altitudeM: alt }));
    };
    sample();
    const timer = setInterval(sample, LOG_EVERY_MS);
    return () => { live = false; clearInterval(timer); };
  }, [enabled, sensor, position?.status, tries]);
  return { sensor, hunt, failed, retry: () => { setFailed(false); setTries((n) => n + 1); } };
}

export default function WeatherScreen({ position, onBack }) {
  const { sensor, hunt, failed, retry } = useBarometerLogger(true, position);
  const [note, setNote] = useState("");
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const now = Date.now();
  const trend = trendOf(hunt.baro, now, { hasSensor: sensor !== false });
  const saved = describeSaved(hunt.saved, now);
  const record = weatherRecord(hunt, { now, hasSensor: sensor !== false });
  const fix = position?.consent === true && position.status === "locked" ? position.fix : null;
  const series = seriesFor(hunt.baro, now, 24);

  async function download() {
    setBusy(true);
    setNote("Asking the weather service. This needs signal.");
    const got = await refreshWeather({ position });
    if (got.ok) {
      const snap = got.snapshot;
      const name = snap.sourceName || "the weather service";
      setNote(snap.alerts?.length ? `Updated from ${name}. ${snap.alerts.length} active alert${snap.alerts.length === 1 ? "" : "s"}.` : `Updated from ${name}.${snap.source === "open-meteo" ? " The backup service has no alerts." : " No active alerts for your area."}`);
    } else {
      setNote(`${got.note} The last saved copy stays as it was.`);
    }
    setBusy(false);
  }

  return (
    <ScrollView contentContainerStyle={screenStyles.scroll} keyboardShouldPersistTaps="handled">
      <ScreenHeader title="Weather" lead="One weather copy, shared with Ask, Hunt and the scent cone." onBack={onBack} backLabel="Field" />
      <Card title="Pressure">
        {sensor === false ? (
          <Quiet>This phone has no barometer. You can still save a weather note.</Quiet>
        ) : failed ? (
          <>
            <Text accessibilityLiveRegion="polite" style={styles.big}>I couldn't read the pressure sensor.</Text>
            <Action label="Try again" onPress={retry} />
          </>
        ) : !trend.latest ? (
          <Text accessibilityLiveRegion="polite" style={styles.age}>Reading the sensor…</Text>
        ) : (
          <>
            <Text accessibilityLabel={`${Math.round(trend.latest)} millibars`} style={styles.huge}>{`${Math.round(trend.latest)} mb`}</Text>
            <Text accessibilityLiveRegion="polite" style={styles.big}>{trend.label}</Text>
            <Quiet live>{trend.text}</Quiet>
            {trend.delta != null ? <Line label={`Change over ${trend.hours} h`} value={`${trend.delta > 0 ? "+" : ""}${trend.delta.toFixed(1)} mb`} /> : null}
            <Quiet>{`Trend since ${new Date(now - (trend.hours || 3) * 3600000).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}. This is the sensor on this phone.`}</Quiet>
            <SourceTag source={trend.source} />
            <Quiet>{series.length} readings in the last 24 h. Yehsa takes one every 15 minutes while it is open, and 48 hours are kept.</Quiet>
            <Action label="I changed elevation" tone="quiet" onPress={() => setHunt("baro", (log) => markElevationChange(log, Date.now()))} accessibilityHint="Restarts the trend, because a climb changes pressure." />
            <Quiet>{elevationNote()}</Quiet>
          </>
        )}
      </Card>
      <Card title="Saved forecast and alerts">
        {saved.has ? (
          <>
            <Text style={styles.age}>{record.freshness}{hunt.saved?.place ? ` · ${hunt.saved.place}` : ""}</Text>
            <SourceTag source={record.sourceName || "saved forecast"} />
            {record.current ? <Line label="Now" value={`${Math.round(record.current.tempF)}°F${record.current.summary ? `, ${record.current.summary.toLowerCase()}` : ""}, wind ${record.current.windFrom || "?"} ${record.current.windMph ?? "?"} mph`} /> : null}
            {saved.forecast ? (
              <Line label={saved.forecast.stale ? "Last saved hour" : "This hour"} value={`${saved.forecast.tempF}°F, wind ${saved.forecast.windFrom} ${saved.forecast.windMph ?? "?"} mph${saved.forecast.rainChance != null ? `, rain ${saved.forecast.rainChance}%` : ""}`} />
            ) : (
              <Quiet>The saved forecast hours have passed. Save a new one when you have signal.</Quiet>
            )}
            {record.wind.source === "manual" ? (
              <View style={styles.alert}>
                <Text style={styles.age}>{record.wind.tag}: {record.wind.point} {Math.round(record.wind.mph)} mph</Text>
                <Quiet>{record.windAgree === true ? `The saved forecast also says ${record.forecastWind.point} ${Math.round(record.forecastWind.mph)} mph, so they agree.` : record.windAgree === false ? `The saved forecast says ${record.forecastWind.point} ${Math.round(record.forecastWind.mph)} mph. The cone and Hunt cards use the wind you entered.` : "There is no saved forecast wind to compare."}</Quiet>
                <Action label="Use the saved forecast" tone="quiet" onPress={() => setHunt("wind", (current) => ({ ...current, fromPoint: "", enteredAt: null }))} accessibilityHint="Clears the wind you entered." />
              </View>
            ) : null}
            {saved.alerts.length === 0 ? <Quiet>{hunt.saved?.source === "open-meteo" ? "The backup service has no alerts. Check weather.gov for warnings." : "No active alerts in the saved copy."}</Quiet> : null}
            {saved.alerts.map((alert) => (
              <View key={alert.id + alert.event} style={[styles.alert, alert.expired && styles.expired]}>
                <Text style={styles.alertTitle}>{alert.event}{alert.expired ? " (expired)" : ""}</Text>
                <Quiet>{alert.headline}</Quiet>
                {alert.expires ? <Quiet>{alert.expired ? "Ended" : "Until"} {new Date(alert.expires).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" })}</Quiet> : null}
              </View>
            ))}
          </>
        ) : (
          <Quiet>{saved.note}</Quiet>
        )}
        <Action label={busy ? "Updating" : saved.has ? "Update the saved copy" : "Save forecast and alerts"} tone="quiet" disabled={busy} onPress={download} accessibilityHint="Needs signal. It sends your approximate area to the National Weather Service, or Open-Meteo if that fails." />
        {note ? <Quiet live>{note}</Quiet> : null}
        <Quiet>This sends your approximate position (about 100 m) to the National Weather Service, or to Open-Meteo if that does not answer, only when you tap Update or ask Yehsa about the weather. Nothing else leaves the phone.</Quiet>
      </Card>
      <Card title="Weather notes">
        {(hunt.wxNotes || []).length === 0 ? <Quiet>No notes yet.</Quiet> : (hunt.wxNotes || []).map((entry) => (
          <View key={entry.t} style={styles.alert}>
            <Text style={styles.age}>{entry.text}</Text>
            <Quiet>{new Date(entry.t).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" })}</Quiet>
            <Action label="Remove this note" tone="quiet" onPress={() => setHunt("wxNotes", (list) => (list || []).filter((item) => item.t !== entry.t))} />
          </View>
        ))}
        <Field label="Weather note" value={draft} onChangeText={setDraft} placeholder="For example: frost warning on the radio" />
        <Action label="Add a weather note" disabled={!draft.trim()} onPress={() => { setHunt("wxNotes", (list) => [{ t: Date.now(), text: draft.trim().slice(0, 240) }, ...(list || [])].slice(0, 20)); setDraft(""); }} />
      </Card>
    </ScrollView>
  );
}

const styles = themedStyles((c) => ({
  huge: { color: c.ink, fontSize: 40, fontWeight: "700" },
  big: { color: c.ink, fontSize: 26, fontWeight: "700" },
  age: { color: c.ink, fontWeight: "600" },
  alert: { borderTopWidth: 1, borderTopColor: c.line, paddingTop: 8, gap: 2 },
  expired: { opacity: 0.5 },
  alertTitle: { color: c.ink, fontWeight: "700", fontSize: 16 }
}));
