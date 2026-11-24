// Sightings: a private log on this phone. Compare it with the deer estimate.
import React, { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { Action, Field, Quiet, ScreenHeader, themedStyles } from "./ui.js";
import { Card, Chips, Line, SourceTag, screenStyles } from "./hunt_ui.js";
import { setHunt, useHunt } from "./hunt_state.js";
import { conditionsFor } from "../../symbolic/hunt/conditions.js";
import { ACTIVITIES, PRIVACY_TEXT, SEX_AGE, SPECIES, addEntry, howDidItDo, newEntry, removeEntry } from "../../symbolic/hunt/sightings.js";
import { compassToDegrees } from "../../symbolic/hunt/nws.js";

const DIRECTIONS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"].map((id) => ({ id, label: id }));

function when(t) {
  return new Date(t).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

// prefill: { markId, spot, t, name } from a sighting mark on the Hunt map. The form opens with
// that spot added and that time, so nothing has to be typed twice.
export default function SightingsScreen({ position, onBack, prefill = null }) {
  const hunt = useHunt();
  const [from, setFrom] = useState(prefill);
  const [view, setView] = useState(prefill ? "new" : "list");
  const [form, setForm] = useState({ species: "Deer", count: "1", sexAge: "unknown", points: "", activity: "feeding", direction: "", notes: "", addSpot: Boolean(prefill?.spot) });
  const [undo, setUndo] = useState(null);
  const set = (patch) => setForm((current) => ({ ...current, ...patch }));
  const entries = hunt.sightings.entries;
  const fix = position?.consent === true && position.status === "locked" ? position.fix : null;
  const cond = conditionsFor(hunt, { position, now: Date.now(), offsetMinutes: -new Date().getTimezoneOffset() });
  const summary = howDidItDo(hunt.sightings);

  function save() {
    const weather = {
      tempF: cond.temp?.f ?? null,
      tempSource: cond.temp?.source || null,
      wind: cond.wind?.ok ? { from: cond.wind.point, mph: Math.round(cond.wind.mph), source: cond.wind.source } : null,
      precip: cond.precip?.kind || null,
      pressure: cond.pressure ? { band: cond.pressure.band, delta: cond.pressure.delta, source: "live" } : null
    };
    const markSpot = from?.spot || null;
    const spot = form.addSpot ? (markSpot || (fix ? { latitude: fix.latitude, longitude: fix.longitude } : null)) : null;
    const entry = newEntry({
      ...form,
      spot,
      markId: from?.markId || null,
      weather,
      estimate: cond.estimate ? { level: cond.estimate.level, total: cond.estimate.total } : null
    }, Number.isFinite(from?.t) ? from.t : Date.now());
    setFrom(null);
    setHunt("sightings", (log) => addEntry(log, entry));
    setView("list");
    setForm({ species: "Deer", count: "1", sexAge: "unknown", points: "", activity: "feeding", direction: "", notes: "", addSpot: false });
  }

  function remove(entry) {
    setHunt("sightings", (log) => removeEntry(log, entry.id));
    setUndo(entry);
  }

  if (view === "new") {
    return (
      <ScrollView contentContainerStyle={screenStyles.scroll} keyboardShouldPersistTaps="handled">
        <ScreenHeader title="Log a sighting" lead="Zero deer is a real entry. Log every sit so the comparison stays fair." onBack={() => { setFrom(null); setView("list"); }} backLabel="Sightings" />
        <Card title="What you saw">
          <Chips label="Species" value={form.species} onChange={(id) => set({ species: id })} options={SPECIES.map((name) => ({ id: name, label: name }))} />
          <Field label="How many (0 if you saw none)" value={form.count} onChangeText={(value) => set({ count: value })} placeholder="1" />
          <Chips label="Sex and age" value={form.sexAge} onChange={(id) => set({ sexAge: id })} options={SEX_AGE} />
          {form.sexAge === "buck" ? <Field label="Antler points (optional)" value={form.points} onChangeText={(value) => set({ points: value })} placeholder="8" /> : null}
          <Chips label="Activity" value={form.activity} onChange={(id) => set({ activity: id })} options={ACTIVITIES} />
          <Text style={styles.group}>DIRECTION OF TRAVEL</Text>
          <Chips label="Direction of travel" value={form.direction} onChange={(id) => set({ direction: form.direction === id ? "" : id })} options={DIRECTIONS} />
          <Field label="Notes" value={form.notes} onChangeText={(value) => set({ notes: value })} placeholder="Anything worth remembering" multiline />
        </Card>
        <Card title="Filled in for you">
          <Line label="Time" value={when(Number.isFinite(from?.t) ? from.t : Date.now())} />
          {from ? <SourceTag source={`${from.name || "sighting mark"} on the Hunt map`} /> : null}
          <Line label="Temperature" value={cond.temp ? `${cond.temp.f}°F` : "Not known"} />
          {cond.temp ? <SourceTag source={cond.temp.source} /> : null}
          <Line label="Wind" value={cond.wind?.ok ? `${cond.wind.point} ${Math.round(cond.wind.mph)} mph` : "Not known"} />
          {cond.wind?.ok ? <SourceTag source={cond.wind.source} /> : null}
          <Line label="Pressure trend" value={cond.pressure ? `${cond.trend.label}` : "Not known"} />
          <Line label="Deer estimate now" value={cond.estimate ? cond.estimate.level : "Not enough to estimate"} />
        </Card>
        <Card title="Place">
          <Quiet>The place is left out unless you add it.</Quiet>
          {from?.spot ? (
            <>
              <Line label="Marked spot" value={`${from.spot.latitude.toFixed(5)}, ${from.spot.longitude.toFixed(5)}`} />
              <Action label={form.addSpot ? "Marked spot is added" : "Add the marked spot"} tone={form.addSpot ? "brass" : "quiet"} onPress={() => set({ addSpot: !form.addSpot })} accessibilityHint="The spot you marked on the Hunt map. It stays on this phone." />
            </>
          ) : (
            <>
              <Action label={form.addSpot ? "My spot is added" : "Add my spot"} tone={form.addSpot ? "brass" : "quiet"} disabled={!fix} onPress={() => set({ addSpot: !form.addSpot })} accessibilityHint="Uses your held position, if you turned it on in Map." />
              {!fix ? <Quiet>Turn on your location in Map to add your spot.</Quiet> : null}
            </>
          )}
        </Card>
        <Action label="Save sighting" onPress={save} />
        <Quiet>{PRIVACY_TEXT}</Quiet>
      </ScrollView>
    );
  }

  if (view === "compare") {
    return (
      <ScrollView contentContainerStyle={screenStyles.scroll}>
        <ScreenHeader title="How did the estimate do?" lead="Sightings per estimate level." onBack={() => setView("list")} backLabel="Sightings" />
        <Card>
          {summary.rows.map((row) => <Line key={row.level} label={row.level} value={row.entries ? `${row.perEntry} deer per entry, ${row.entries} entries` : "No entries"} />)}
          <Quiet>{summary.text}</Quiet>
        </Card>
        <Quiet>An estimate is not a guarantee. This only compares it with what you logged.</Quiet>
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={screenStyles.scroll}>
      <ScreenHeader title="Sightings" lead="A private log on this phone. You can compare it with the deer estimate." onBack={onBack} backLabel="Field" />
      <Action label="Log a sighting" onPress={() => setView("new")} />
      {entries.length > 0 ? <Action label="How did the estimate do?" tone="quiet" onPress={() => setView("compare")} /> : null}
      {undo ? (
        <View style={styles.toast}>
          <Text style={styles.toastText}>Sighting removed.</Text>
          <Action label="Undo" tone="quiet" onPress={() => { setHunt("sightings", (log) => addEntry(log, undo)); setUndo(null); }} />
        </View>
      ) : null}
      {entries.length === 0 ? <Quiet>No sightings logged yet.</Quiet> : null}
      {entries.map((entry) => (
        <Card key={entry.id} title={`${entry.count} ${entry.species.toLowerCase()}${entry.count === 1 ? "" : "s"}${entry.sexAge !== "unknown" ? `, ${entry.sexAge}` : ""}`}>
          <Line label="When" value={when(entry.t)} />
          <Line label="Doing" value={ACTIVITIES.find((item) => item.id === entry.activity)?.label || "Other"} />
          <Line label="Estimate then" value={entry.estimate ? entry.estimate.level : "Not enough to estimate"} />
          {entry.spot ? <Line label="Place" value={`${entry.spot.latitude.toFixed(4)}, ${entry.spot.longitude.toFixed(4)}`} /> : null}
          {entry.notes ? <Quiet>{entry.notes}</Quiet> : null}
          <Action label="Remove" tone="clay" onPress={() => remove(entry)} />
        </Card>
      ))}
      <Quiet>{PRIVACY_TEXT}</Quiet>
    </ScrollView>
  );
}

const styles = themedStyles((c) => ({
  group: { color: c.muted, fontSize: 12, fontWeight: "700", letterSpacing: 1, marginTop: 6, marginBottom: 6 },
  toast: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderWidth: 1, borderColor: c.lineStrong, borderRadius: 14, padding: 10 },
  toastText: { color: c.ink, fontSize: 16 }
}));
