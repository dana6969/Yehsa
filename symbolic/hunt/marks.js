// Marks the person places on the Hunt map: stands, trails, bedding and sightings. Pure data
// helpers, no map code, so every rule here is testable on a laptop. Marks stay on this phone
// (the sealed "spots" store). Older saves used { stands, avoid }; they are read as marks.

import { destinationPoint, haversineKm, initialBearingDeg } from "../landscape_math.js";
import { bestStands, inside } from "./scent.js";

export const KINDS = [
  { id: "stand", label: "Stand", glyph: "■" },
  { id: "trail", label: "Trail", glyph: "┅" },
  { id: "bedding", label: "Bedding", glyph: "▲" },
  { id: "sighting", label: "Sighting", glyph: "S" }
];

export const MAX_MARKS = 300;
export const NAME_MAX = 40;
export const UNDO_MS = 8000;

export const STATE_WORDS = { risk: "At risk", clear: "Clear", out: "Out of cone" };

export const TEXT = {
  intro: "Tap the map or long-press to add one. Marks stay on this phone.",
  clearTitle: "Clear all marks?",
  clearBody: "This removes every stand, trail, bedding, and sighting you have marked on this phone. You can Undo for a short time after.",
  clearAll: "Clear all marks",
  allRemoved: "All marks removed.",
  noFix: "Turn on your location in Map to place the scent cone.",
  noWind: "Add the wind to see the scent cone.",
  lengthNote: "The length is illustrative, not a measured distance.",
  thermals: "Thermals: air drifts downhill in the evening and uphill after the morning sun.",
  riskNote: "At risk uses the illustrative cone length, so it is a hint, not a measurement."
};

const KIND_IDS = new Set(KINDS.map((kind) => kind.id));

export function kindInfo(kind) {
  return KINDS.find((item) => item.id === kind) || KINDS[0];
}

function validPoint(latitude, longitude) {
  return Number.isFinite(latitude) && Number.isFinite(longitude) && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180;
}

function cleanName(name, fallback) {
  const text = String(name ?? "").replace(/\s+/g, " ").trim().slice(0, NAME_MAX);
  return text || fallback;
}

let counter = 0;
function newId(now) {
  counter += 1;
  return `m-${now.toString(36)}-${counter.toString(36)}-${Math.floor(Math.random() * 1e5).toString(36)}`;
}

// Reads what is stored: the new { marks } shape, or the old { stands, avoid } lists.
export function normalizeSpots(spots, now = Date.now()) {
  if (Array.isArray(spots?.marks)) {
    const marks = spots.marks
      .filter((mark) => mark && KIND_IDS.has(mark.kind) && validPoint(mark.latitude, mark.longitude))
      .map((mark, index) => ({
        id: String(mark.id || `m-old-${index}`),
        name: cleanName(mark.name, kindInfo(mark.kind).label),
        kind: mark.kind,
        latitude: mark.latitude,
        longitude: mark.longitude,
        createdAt: Number.isFinite(mark.createdAt) ? mark.createdAt : now,
        updatedAt: Number.isFinite(mark.updatedAt) ? mark.updatedAt : (Number.isFinite(mark.createdAt) ? mark.createdAt : now)
      }));
    return { marks };
  }
  const marks = [];
  const legacy = [
    ...(Array.isArray(spots?.stands) ? spots.stands.map((item) => ({ ...item, kind: "stand" })) : []),
    ...(Array.isArray(spots?.avoid) ? spots.avoid.map((item) => ({ ...item, kind: item.kind === "bedding" ? "bedding" : "trail" })) : [])
  ];
  legacy.forEach((item, index) => {
    if (!validPoint(item.latitude, item.longitude)) return;
    marks.push({
      id: `m-old-${index}`,
      name: cleanName(item.name, kindInfo(item.kind).label),
      kind: item.kind,
      latitude: item.latitude,
      longitude: item.longitude,
      createdAt: now,
      updatedAt: now
    });
  });
  return { marks };
}

// What gets saved in the sealed store.
export function toSpots(marks) {
  return { v: 2, marks };
}

export function marksOf(spots) {
  return normalizeSpots(spots).marks;
}

// "Stand 1", "Trail 4", "Bedding 2", "Sighting", then "Sighting 2". Counts up per kind, never reuses a number
// that is still on the map.
export function nextName(marks, kind) {
  const label = kindInfo(kind).label;
  const used = new Set();
  let any = false;
  for (const mark of marks || []) {
    if (mark.kind !== kind) continue;
    any = true;
    const match = new RegExp(`^${label}(?: (\\d+))?$`).exec(mark.name || "");
    if (match) used.add(match[1] ? Number(match[1]) : 1);
  }
  if (kind === "sighting") {
    if (!any || !used.has(1)) return label;
    let n = 2;
    while (used.has(n)) n += 1;
    return `${label} ${n}`;
  }
  let n = 1;
  while (used.has(n)) n += 1;
  return `${label} ${n}`;
}

export function addMark(marks, { kind, latitude, longitude, name, now = Date.now() }) {
  if (!KIND_IDS.has(kind)) return { ok: false, reason: "Pick Stand, Trail, Bedding or Sighting.", marks };
  if (!validPoint(latitude, longitude)) return { ok: false, reason: "That spot is not on the map.", marks };
  if ((marks || []).length >= MAX_MARKS) return { ok: false, reason: `You can keep ${MAX_MARKS} marks. Remove one to add another.`, marks };
  const mark = {
    id: newId(now),
    name: cleanName(name, nextName(marks, kind)),
    kind,
    latitude,
    longitude,
    createdAt: now,
    updatedAt: now
  };
  return { ok: true, mark, marks: [...marks, mark] };
}

export function updateMark(marks, id, patch, now = Date.now()) {
  const index = marks.findIndex((mark) => mark.id === id);
  if (index < 0) return { ok: false, reason: "That mark is gone.", marks };
  const current = marks[index];
  const kind = patch.kind == null ? current.kind : patch.kind;
  if (!KIND_IDS.has(kind)) return { ok: false, reason: "Pick Stand, Trail, Bedding or Sighting.", marks };
  const latitude = patch.latitude == null ? current.latitude : patch.latitude;
  const longitude = patch.longitude == null ? current.longitude : patch.longitude;
  if (!validPoint(latitude, longitude)) return { ok: false, reason: "That spot is not on the map.", marks };
  // A name left at the old kind's default follows a kind change ("Stand 1" -> "Bedding 1" style).
  let name = current.name;
  if (patch.name != null) name = cleanName(patch.name, nextName(marks.filter((mark) => mark.id !== id), kind));
  else if (kind !== current.kind && new RegExp(`^${kindInfo(current.kind).label}(?: \\d+)?$`).test(current.name)) name = nextName(marks.filter((mark) => mark.id !== id), kind);
  const next = { ...current, name, kind, latitude, longitude, updatedAt: now };
  const out = marks.slice();
  out[index] = next;
  return { ok: true, mark: next, marks: out };
}

export function removeMark(marks, id) {
  const index = marks.findIndex((mark) => mark.id === id);
  if (index < 0) return { ok: false, marks, removed: null, index: -1 };
  return { ok: true, marks: marks.filter((mark) => mark.id !== id), removed: marks[index], index };
}

export function restoreMark(marks, removed, index) {
  if (!removed || marks.some((mark) => mark.id === removed.id)) return marks;
  const out = marks.slice();
  out.splice(Math.max(0, Math.min(index, out.length)), 0, removed);
  return out;
}

export function clearMarks(marks) {
  return { marks: [], removed: marks.slice() };
}

export function restoreAll(current, removed) {
  const seen = new Set(current.map((mark) => mark.id));
  return [...removed.filter((mark) => !seen.has(mark.id)), ...current];
}

// Sightings logged in Field > Sightings that have a point show as read-only sighting marks.
export function sightingMarks(sightings) {
  const entries = Array.isArray(sightings?.entries) ? sightings.entries : [];
  return entries
    .filter((entry) => entry?.spot && validPoint(entry.spot.latitude, entry.spot.longitude))
    .map((entry) => ({
      id: `log:${entry.id}`,
      name: "Sighting",
      kind: "sighting",
      latitude: entry.spot.latitude,
      longitude: entry.spot.longitude,
      createdAt: entry.t,
      updatedAt: entry.t,
      fromLog: true
    }));
}

const WORDS8 = ["north", "northeast", "east", "southeast", "south", "southwest", "west", "northwest"];

export function wordsDirection(from, to) {
  const bearing = initialBearingDeg(from, to);
  return WORDS8[Math.round(bearing / 45) % 8];
}

export function distanceText(from, to) {
  const m = haversineKm(from, to) * 1000;
  if (m < 10) return "right here";
  if (m < 1000) return `${Math.round(m / 10) * 10} m`;
  return `${(m / 1000).toFixed(1)} km`;
}

// Where a mark sits compared with the cone origin: "west of you, 120 m".
export function whereText(apex, mark) {
  if (!apex) return "";
  const who = apex.kind === "you" ? "you" : apex.name;
  const km = haversineKm(apex, mark);
  if (km * 1000 < 10) return `at ${who}`;
  return `${wordsDirection(apex, mark)} of ${who}, ${distanceText(apex, mark)}`;
}

// Words for each mark: At risk, Clear or Out of cone. Never color alone.
// apex: { latitude, longitude, kind: "you"|"stand", name, id } or null. cone: from scentCone().
export function assessMarks(marks, cone, apex) {
  const avoid = marks.filter((mark) => mark.kind === "trail" || mark.kind === "bedding");
  return marks.map((mark) => {
    if (!cone?.ok) return { mark, state: null, word: "", reason: "" };
    if (mark.kind === "stand") {
      // Judge each stand on its own, so two stands that share a name never share an answer.
      const own = bestStands([mark], avoid, cone)[0];
      if (own.good) {
        return { mark, state: "clear", word: STATE_WORDS.clear, reason: avoid.length ? own.reason : "No trails or bedding marked yet." };
      }
      return { mark, state: "risk", word: STATE_WORDS.risk, reason: own.reason };
    }
    if (!apex) return { mark, state: null, word: "", reason: "" };
    const hit = inside(apex, mark, cone) && haversineKm(apex, mark) > 0.001;
    return hit
      ? { mark, state: "risk", word: STATE_WORDS.risk, reason: "In the scent cone." }
      : { mark, state: "out", word: STATE_WORDS.out, reason: "Outside the scent cone." };
  });
}

// A tight box around one mark, for "Show on map".
export function boxAround(point, meters = 400) {
  const north = destinationPoint(point, 0, meters / 1000);
  const south = destinationPoint(point, 180, meters / 1000);
  const east = destinationPoint(point, 90, meters / 1000);
  const west = destinationPoint(point, 270, meters / 1000);
  return { north: north.latitude, south: south.latitude, east: east.longitude, west: west.longitude };
}
