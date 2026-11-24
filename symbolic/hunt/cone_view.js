// What the Hunt map draws for the scent cone: the origin, the polygon, the on-map label and
// the state of every mark. Pure. The wind comes from wind_source.js, so one swap changes all of it.

import { conePolygon, scentCone } from "./scent.js";
import { TEXT, assessMarks } from "./marks.js";
import { currentWind, degreesToCompass } from "./wind_source.js";

// fix: { latitude, longitude } or null. marks: all marks. coneStandId: a stand the person chose as the origin.
export function chooseApex(fix, marks, coneStandId) {
  const stands = marks.filter((mark) => mark.kind === "stand");
  const picked = coneStandId ? stands.find((mark) => mark.id === coneStandId) : null;
  if (picked) return { latitude: picked.latitude, longitude: picked.longitude, kind: "stand", name: picked.name, id: picked.id };
  if (fix) return { latitude: fix.latitude, longitude: fix.longitude, kind: "you", name: "you", id: null };
  const first = stands[0];
  if (first) return { latitude: first.latitude, longitude: first.longitude, kind: "stand", name: first.name, id: first.id };
  return null;
}

export function coneView({ hunt, fix = null, marks = [], coneStandId = null, now = Date.now() }) {
  const wind = currentWind(hunt, now);
  const apex = chooseApex(fix, marks, coneStandId);
  if (!wind.ok) {
    return { ok: false, wind, apex, cone: null, polygon: [], label: "", message: TEXT.noWind, assessed: assessMarks(marks, null, apex) };
  }
  const cone = scentCone({ fromDeg: wind.fromDeg, mph: wind.mph, swirling: wind.swirling, source: wind.source });
  if (!apex) {
    return { ok: false, wind, apex: null, cone, polygon: [], label: "", message: TEXT.noFix, assessed: assessMarks(marks, cone, null) };
  }
  const polygon = conePolygon(apex, cone, 10);
  const label = `Scent cone · downwind ${degreesToCompass(cone.downwindDeg)} · about ${cone.widthDeg}°`;
  return { ok: true, wind, apex, cone, polygon, label, message: "", assessed: assessMarks(marks, cone, apex) };
}

// Where to hang the on-map label: the middle of the far edge of the cone.
export function labelPoint(view) {
  if (!view.ok || !view.polygon.length) return null;
  const arc = view.polygon.slice(1, -1);
  return arc[Math.floor(arc.length / 2)] || null;
}

function insideRing(ring, x, y) {
  let hit = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const a = ring[i];
    const b = ring[j];
    if ((a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) hit = !hit;
  }
  return hit;
}

// The scent cone on the canvas map: its outline plus a light dot fill, clipped to the view.
export function coneShape(polygon, project, width, height) {
  const none = { edges: [], dots: [] };
  if (!Array.isArray(polygon) || polygon.length < 4) return none;
  const ring = polygon.map(project);
  if (ring.some((point) => !point)) return none;
  const edges = [];
  for (let i = 1; i < ring.length; i += 1) edges.push({ key: `e${i}`, from: ring[i - 1], to: ring[i] });
  const xs = ring.map((point) => point.x);
  const ys = ring.map((point) => point.y);
  const left = Math.max(0, Math.min(...xs));
  const right = Math.min(width, Math.max(...xs));
  const top = Math.max(0, Math.min(...ys));
  const bottom = Math.min(height, Math.max(...ys));
  const area = Math.max(0, right - left) * Math.max(0, bottom - top);
  const step = Math.max(12, Math.sqrt(area / 400));
  const dots = [];
  for (let y = top + step / 2; y < bottom; y += step) {
    for (let x = left + step / 2; x < right; x += step) {
      if (insideRing(ring, x, y)) dots.push({ key: `d${Math.round(x)}-${Math.round(y)}`, x, y });
    }
  }
  return { edges, dots };
}
