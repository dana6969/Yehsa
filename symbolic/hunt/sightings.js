// A private sightings log. It lives on this phone, sealed, and never leaves it. Hunt party
// sharing leaves the log out unless you share a single pin. Each entry keeps the deer
// estimate at that moment, so "How did the estimate do?" can compare it with what you saw.
// A sit with zero deer is a real entry: without those the comparison would lie.

export const ACTIVITIES = [
  { id: "feeding", label: "Feeding" },
  { id: "traveling", label: "Traveling" },
  { id: "bedded", label: "Bedded" },
  { id: "chasing", label: "Chasing or rut" },
  { id: "other", label: "Other" }
];

export const SEX_AGE = [
  { id: "buck", label: "Buck" },
  { id: "doe", label: "Doe" },
  { id: "fawn", label: "Fawn" },
  { id: "unknown", label: "Unknown" }
];

export const SPECIES = ["Deer", "Turkey", "Bear", "Moose", "Other"];

export const PRIVACY_TEXT = "Kept on this phone only, sealed. It is never sent anywhere. Sharing with your hunt party leaves it out unless you share one pin.";

export function emptyLog() {
  return { entries: [] };
}

export function newEntry(fields, now = Date.now()) {
  const count = fields.count === "" || fields.count == null ? 1 : Number(fields.count);
  return {
    id: `s-${now.toString(36)}-${Math.abs(Math.floor(Math.random() * 1e6)).toString(36)}`,
    t: now,
    species: fields.species || "Deer",
    count: Number.isFinite(count) && count >= 0 ? Math.min(99, Math.round(count)) : 1,
    sexAge: fields.sexAge || "unknown",
    points: fields.points === "" || fields.points == null ? null : Math.max(0, Math.min(30, Math.round(Number(fields.points)) || 0)),
    activity: fields.activity || "other",
    direction: fields.direction || "",
    // Location is only here when the person tapped "add my spot" or picked it.
    spot: fields.spot && Number.isFinite(fields.spot.latitude) && Number.isFinite(fields.spot.longitude)
      ? { latitude: fields.spot.latitude, longitude: fields.spot.longitude }
      : null,
    weather: fields.weather || null,
    estimate: fields.estimate ? { level: fields.estimate.level, total: fields.estimate.total } : null,
    notes: String(fields.notes || "").slice(0, 600),
    photoUri: fields.photoUri || null
  };
}

export function addEntry(log, entry) {
  return { entries: [entry, ...(log?.entries || [])].slice(0, 2000) };
}

export function removeEntry(log, id) {
  return { entries: (log?.entries || []).filter((entry) => entry.id !== id) };
}

export function pins(log) {
  return (log?.entries || []).filter((entry) => entry.spot && entry.count > 0);
}

// The one thing that may be shared: a single pin, chosen by hand.
export function sharablePin(entry) {
  if (!entry?.spot) return null;
  return { latitude: entry.spot.latitude, longitude: entry.spot.longitude, label: `${entry.count} ${entry.species.toLowerCase()}` };
}

// Per estimate level: how many entries, how many deer, and deer per entry.
export function howDidItDo(log) {
  const levels = ["Low", "Medium", "High"];
  const rows = levels.map((name) => {
    const entries = (log?.entries || []).filter((entry) => entry.estimate?.level === name && entry.species === "Deer");
    const deer = entries.reduce((sum, entry) => sum + entry.count, 0);
    return { level: name, entries: entries.length, deer, perEntry: entries.length ? Math.round((deer / entries.length) * 10) / 10 : null };
  });
  const total = rows.reduce((sum, row) => sum + row.entries, 0);
  let text;
  if (total < 5) {
    text = `Only ${total} logged ${total === 1 ? "entry has" : "entries have"} an estimate so far. Log every sit, even with no deer, and this fills in. Five or more entries are needed for it to say anything.`;
  } else {
    const [low, medium, high] = rows;
    const line = (row) => (row.perEntry == null ? `${row.level}: no entries` : `${row.level}: ${row.perEntry} deer per entry over ${row.entries}`);
    text = `${line(low)}. ${line(medium)}. ${line(high)}.`;
    if (high.perEntry != null && low.perEntry != null) {
      text += high.perEntry > low.perEntry
        ? " So far, High sits have shown more deer than Low sits. A small log can still be luck."
        : " So far, High sits have not shown more deer than Low sits. A small log can still be luck.";
    }
  }
  return { rows, total, text };
}

export function byWeek(log) {
  const weeks = new Map();
  for (const entry of log?.entries || []) {
    const week = new Date(entry.t - (new Date(entry.t).getDay() * 86400000)).toISOString().slice(0, 10);
    const row = weeks.get(week) || { week, entries: 0, deer: 0 };
    row.entries += 1;
    row.deer += entry.count;
    weeks.set(week, row);
  }
  return [...weeks.values()].sort((a, b) => (a.week < b.week ? 1 : -1));
}
