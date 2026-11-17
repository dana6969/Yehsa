// Weather: an offline barometer trend from the phone's pressure sensor, plus the last saved
// NWS alerts and forecast. Yehsa does not promise live weather without signal.
import React, { useEffect, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { Action, Field, Quiet, ScreenHeader, themedStyles } from "./ui.js";
import { Card, Chips, Line, SourceTag, screenStyles } from "./hunt_ui.js";
import { setHunt, useHunt } from "./hunt_state.js";
import { hasBarometer, readPressureOnce } from "./barometer_sensor.js";
import { addReading, elevationNote, markElevationChange, LOG_EVERY_MS, trendOf, seriesFor } from "../../symbolic/hunt/baro.js";
import { NWS_HEADERS, alertsUrl, describeSaved, makeSaved, parseAlerts, parseHourly, pointsUrl } from "../../symbolic/hunt/nws.js";

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
  const fix = position?.consent === true && position.status === "locked" ? position.fix : null;
  const series = seriesFor(hunt.baro, now, 24);

  async function download() {
    if (!fix) {
      setNote("Turn on your location in Map first, or this cannot pick your area.");
      return;
    }
    setBusy(true);
    setNote("Asking the National Weather Service. This needs signal.");
    try {
      const point = await (await fetch(pointsUrl(fix.latitude, fix.longitude), { headers: NWS_HEADERS })).json();
      const alerts = parseAlerts(await (await fetch(alertsUrl(fix.latitude, fix.longitude), { headers: NWS_HEADERS })).json());
      const hourlyUrl = point?.properties?.forecastHourly;
      const hourly = hourlyUrl ? parseHourly(await (await fetch(hourlyUrl, { headers: NWS_HEADERS })).json()) : [];
      const place = point?.properties?.relativeLocation?.properties;
      setHunt("saved", makeSaved({ alerts, hourly, savedAt: Date.now(), place: place ? `${place.city}, ${place.state}` : null }));
      setNote(alerts.length ? `Saved ${alerts.length} alert${alerts.length === 1 ? "" : "s"} and the forecast.` : "Saved the forecast. No active alerts for your area.");
    } catch {
      setNote("Could not reach the National Weather Service. The last saved copy stays as it was.");
    }
    setBusy(false);
  }

  return (
    <ScrollView contentContainerStyle={screenStyles.scroll} keyboardShouldPersistTaps="handled">
      <ScreenHeader title="Weather" lead="Pressure on this phone, not a live forecast." onBack={onBack} backLabel="Field" />
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
            <Text style={styles.age}>{saved.age}{hunt.saved?.place ? ` for ${hunt.saved.place}` : ""}</Text>
            <SourceTag source="saved forecast" />
            {saved.forecast ? (
              <Line label={saved.forecast.stale ? "Last saved hour" : "This hour"} value={`${saved.forecast.tempF}°F, wind ${saved.forecast.windFrom} ${saved.forecast.windMph ?? "?"} mph${saved.forecast.rainChance != null ? `, rain ${saved.forecast.rainChance}%` : ""}`} />
            ) : (
              <Quiet>The saved forecast hours have passed. Save a new one when you have signal.</Quiet>
            )}
            {saved.alerts.length === 0 ? <Quiet>No alerts saved. Add a note if a warning reaches you another way.</Quiet> : null}
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
        <Action label={busy ? "Saving" : saved.has ? "Update the saved copy" : "Save forecast and alerts"} tone="quiet" disabled={busy} onPress={download} accessibilityHint="Needs signal. It sends your approximate area to weather.gov, once." />
        {note ? <Quiet live>{note}</Quiet> : null}
        <Quiet>This sends your position to the National Weather Service only when you tap it. Nothing else leaves the phone.</Quiet>
      </Card>
      <Card title="Weather notes">
        {(hunt.wxNotes || []).length === 0 ? <Quiet>No alerts saved. Add a note if a warning reaches you another way.</Quiet> : (hunt.wxNotes || []).map((entry) => (
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
