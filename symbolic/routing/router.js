// On-device router over a decoded .yrg road graph: A* by travel time, drive or walk.
// No network. Returns the same route shape as the online parser (route_online.js), so the map,
// the turn list and the follow-along mode do not care where a route came from.
import { edgeClass, edgeFlags, edgePoints, F_NO_CAR, F_NO_FOOT, F_ONEWAY_FWD, F_ONEWAY_REV, F_ROUNDABOUT, F_LINK, CLASS_NAMES } from "./graph_format.js";
import { distanceM, projectOnSegment } from "./geo.js";
import { buildSteps } from "./steps.js";

// km/h by class: motorway trunk primary secondary tertiary unclassified residential service track path
const DRIVE_KMH = [100, 85, 70, 60, 50, 45, 35, 20, 15, 0];
const WALK_KMH = [0, 4, 4.5, 4.6, 4.8, 4.8, 5, 5, 4.5, 4];

export const PROFILES = {
  drive: { id: "drive", label: "Drive", speeds: DRIVE_KMH, maxKmh: 100, oneway: true, block: F_NO_CAR },
  walk: { id: "walk", label: "Walk", speeds: WALK_KMH, maxKmh: 5, oneway: false, block: F_NO_FOOT }
};

function usable(graph, k, profile) {
  const cls = edgeClass(graph, k);
  if (!profile.speeds[cls]) return false;
  return (edgeFlags(graph, k) & profile.block) === 0;
}

/** Can the profile drive edge k forward (from -> to) / backward? */
function canGo(graph, k, forward, profile) {
  if (!profile.oneway) return true;
  const flags = edgeFlags(graph, k);
  if (forward) return (flags & F_ONEWAY_REV) === 0;
  return (flags & F_ONEWAY_FWD) === 0;
}

function edgeSeconds(graph, k, profile, lengthM = graph.len[k]) {
  const kmh = profile.speeds[edgeClass(graph, k)];
  return lengthM / (kmh / 3.6);
}

/**
 * Nearest usable road to a point. Searches grid cells in growing rings up to maxM.
 * Returns { edge, distM, point, alongM (metres from the edge's from-node), lengthM } or null.
 */
export function snapToRoad(graph, p, profile = PROFILES.drive, maxM = 3000) {
  const { head } = graph;
  if (p.latitude < head.south - 0.05 || p.latitude > head.north + 0.05 || p.longitude < head.west - 0.05 || p.longitude > head.east + 0.05) return null;
  const cx = Math.floor((p.longitude - head.west) / head.cell);
  const cy = Math.floor((p.latitude - head.south) / head.cell);
  const cellM = head.cell * 111320 * Math.cos((p.latitude * Math.PI) / 180);
  const maxRing = Math.max(1, Math.ceil(maxM / cellM) + 1);
  let best = null;
  const seen = new Set();
  for (let ring = 0; ring <= maxRing; ring++) {
    for (let y = cy - ring; y <= cy + ring; y++) {
      for (let x = cx - ring; x <= cx + ring; x++) {
        if (Math.max(Math.abs(x - cx), Math.abs(y - cy)) !== ring) continue;
        if (x < 0 || y < 0 || x >= head.cellsW || y >= head.cellsH) continue;
        const c = y * head.cellsW + x;
        for (let n = graph.cellStart[c]; n < graph.cellStart[c + 1]; n++) {
          for (let a = graph.adjStart[n]; a < graph.adjStart[n + 1]; a++) {
            const k = graph.adj[a];
            if (seen.has(k)) continue;
            seen.add(k);
            if (!usable(graph, k, profile)) continue;
            const pts = edgePoints(graph, k);
            let along = 0;
            for (let i = 1; i < pts.length; i++) {
              const seg = distanceM(pts[i - 1], pts[i]);
              const hit = projectOnSegment(p, pts[i - 1], pts[i]);
              if (!best || hit.distM < best.distM) {
                best = { edge: k, distM: hit.distM, point: hit.point, alongRaw: along + hit.t * seg, rawLength: 0, pts };
              }
              along += seg;
            }
            if (best && best.edge === k) best.rawLength = along;
          }
        }
      }
    }
    // A hit closer than the ring we have fully searched cannot be beaten by farther rings.
    if (best && best.distM < ring * cellM) break;
  }
  if (!best || best.distM > maxM) return null;
  // Scale the along-distance to the stored edge length (shape points are simplified).
  const scale = best.rawLength > 0 ? graph.len[best.edge] / best.rawLength : 1;
  return { edge: best.edge, distM: best.distM, point: best.point, alongM: best.alongRaw * scale, lengthM: graph.len[best.edge] };
}

class Heap {
  constructor() {
    this.keys = [];
    this.vals = [];
  }
  get size() {
    return this.keys.length;
  }
  push(key, val) {
    const k = this.keys;
    const v = this.vals;
    let i = k.length;
    k.push(key);
    v.push(val);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (k[p] <= key) break;
      k[i] = k[p];
      v[i] = v[p];
      i = p;
    }
    k[i] = key;
    v[i] = val;
  }
  pop() {
    const k = this.keys;
    const v = this.vals;
    const top = v[0];
    const lastK = k.pop();
    const lastV = v.pop();
    const n = k.length;
    if (n) {
      let i = 0;
      while (true) {
        let c = 2 * i + 1;
        if (c >= n) break;
        if (c + 1 < n && k[c + 1] < k[c]) c++;
        if (k[c] >= lastK) break;
        k[i] = k[c];
        v[i] = v[c];
        i = c;
      }
      k[i] = lastK;
      v[i] = lastV;
    }
    return top;
  }
}

/**
 * Route between two points on one region's graph.
 * Returns { ok, reason?, route? } where route = { source, profile, coordinates, distanceM, durationS, steps }.
 */
export function routeOffline(graph, fromPoint, toPoint, { profile = "drive", maxSettled = 4_000_000 } = {}) {
  const prof = PROFILES[profile] || PROFILES.drive;
  const start = snapToRoad(graph, fromPoint, prof);
  if (!start) return { ok: false, reason: "No road near your position in the offline road data." };
  const end = snapToRoad(graph, toPoint, prof);
  if (!end) return { ok: false, reason: "No road near the destination in the offline road data." };
  const N = graph.N;
  const dist = new Float64Array(N).fill(Infinity);
  const prevEdge = new Int32Array(N).fill(-1);
  const done = new Uint8Array(N);
  const vmax = prof.maxKmh / 3.6;
  const target = { latitude: toPoint.latitude, longitude: toPoint.longitude };
  const h = (n) => distanceM({ latitude: graph.lat[n], longitude: graph.lon[n] }, end.point) / vmax;
  const heap = new Heap();
  const sk = start.edge;
  const sLen = graph.len[sk];
  // Leave the start edge toward either end it allows.
  const seeds = [];
  if (canGo(graph, sk, true, prof)) seeds.push([graph.to[sk], edgeSeconds(graph, sk, prof, sLen - start.alongM), -2]);
  if (canGo(graph, sk, false, prof)) seeds.push([graph.from[sk], edgeSeconds(graph, sk, prof, start.alongM), -3]);
  for (const [n, s, tag] of seeds) {
    if (s < dist[n]) {
      dist[n] = s;
      prevEdge[n] = tag;
      heap.push(s + h(n), n);
    }
  }
  // Same edge, reachable directly along it.
  let direct = Infinity;
  if (start.edge === end.edge) {
    const forward = end.alongM >= start.alongM;
    if (canGo(graph, sk, forward, prof)) direct = edgeSeconds(graph, sk, prof, Math.abs(end.alongM - start.alongM));
  }
  const ek = end.edge;
  const eLen = graph.len[ek];
  let best = direct;
  let bestEnd = direct < Infinity ? -1 : -2;
  let settled = 0;
  while (heap.size) {
    const n = heap.pop();
    if (done[n]) continue;
    done[n] = 1;
    if (++settled > maxSettled) break;
    if (dist[n] + h(n) >= best) break;
    if (n === graph.from[ek] && canGo(graph, ek, true, prof)) {
      const s = dist[n] + edgeSeconds(graph, ek, prof, end.alongM);
      if (s < best) { best = s; bestEnd = n; }
    }
    if (n === graph.to[ek] && canGo(graph, ek, false, prof)) {
      const s = dist[n] + edgeSeconds(graph, ek, prof, eLen - end.alongM);
      if (s < best) { best = s; bestEnd = n; }
    }
    for (let a = graph.adjStart[n]; a < graph.adjStart[n + 1]; a++) {
      const k = graph.adj[a];
      if (!usable(graph, k, prof)) continue;
      const forward = graph.from[k] === n;
      if (!canGo(graph, k, forward, prof)) continue;
      const m = forward ? graph.to[k] : graph.from[k];
      if (done[m]) continue;
      const s = dist[n] + edgeSeconds(graph, k, prof);
      if (s < dist[m]) {
        dist[m] = s;
        prevEdge[m] = k;
        heap.push(s + h(m), m);
      }
    }
  }
  if (best === Infinity) return { ok: false, reason: "No connected road between here and there in the offline road data." };

  // Rebuild the path as a list of (edge, forward, partial) pieces.
  const pieces = [];
  if (bestEnd === -1) {
    const forward = end.alongM >= start.alongM;
    pieces.push({ edge: sk, forward, fromM: start.alongM, toM: end.alongM });
  } else {
    const endForward = bestEnd === graph.from[ek];
    pieces.push({ edge: ek, forward: endForward, fromM: endForward ? 0 : eLen, toM: end.alongM });
    let n = bestEnd;
    while (prevEdge[n] >= 0) {
      const k = prevEdge[n];
      const forward = graph.to[k] === n && !(graph.from[k] === n && graph.to[k] === n);
      pieces.push({ edge: k, forward, fromM: forward ? 0 : graph.len[k], toM: forward ? graph.len[k] : 0 });
      n = forward ? graph.from[k] : graph.to[k];
    }
    const forward = prevEdge[n] === -2;
    pieces.push({ edge: sk, forward, fromM: start.alongM, toM: forward ? sLen : 0 });
    pieces.reverse();
  }
  return { ok: true, route: assemble(graph, pieces, prof, fromPoint, target, best) };
}

function cutPoints(graph, piece) {
  // Points of a piece between fromM and toM (metres along the stored edge length).
  const pts = edgePoints(graph, piece.edge);
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + distanceM(pts[i - 1], pts[i]));
  const scale = cum[cum.length - 1] > 0 ? graph.len[piece.edge] / cum[cum.length - 1] : 1;
  const at = (m) => {
    const raw = m / scale;
    for (let i = 1; i < pts.length; i++) {
      if (cum[i] >= raw) {
        const seg = cum[i] - cum[i - 1];
        const t = seg > 0 ? (raw - cum[i - 1]) / seg : 0;
        return { latitude: pts[i - 1].latitude + t * (pts[i].latitude - pts[i - 1].latitude), longitude: pts[i - 1].longitude + t * (pts[i].longitude - pts[i - 1].longitude) };
      }
    }
    return pts[pts.length - 1];
  };
  const lo = Math.min(piece.fromM, piece.toM);
  const hi = Math.max(piece.fromM, piece.toM);
  const out = [at(lo)];
  for (let i = 1; i < pts.length - 1; i++) {
    const m = cum[i] * scale;
    if (m > lo && m < hi) out.push(pts[i]);
  }
  out.push(at(hi));
  return piece.fromM <= piece.toM ? out : out.reverse();
}

function assemble(graph, pieces, prof, fromPoint, target, seconds) {
  const coordinates = [];
  const legs = [];
  let distance = 0;
  for (const piece of pieces) {
    const pts = cutPoints(graph, piece);
    const lengthM = Math.abs(piece.toM - piece.fromM);
    if (lengthM < 0.5 && legs.length) continue;
    const startIndex = Math.max(0, coordinates.length - 1);
    for (const p of pts) {
      const last = coordinates[coordinates.length - 1];
      if (!last || last.latitude !== p.latitude || last.longitude !== p.longitude) coordinates.push(p);
    }
    const cls = edgeClass(graph, piece.edge);
    legs.push({
      name: graph.names[graph.name[piece.edge]] || "",
      roadClass: CLASS_NAMES[cls],
      roundabout: (edgeFlags(graph, piece.edge) & F_ROUNDABOUT) !== 0,
      link: (edgeFlags(graph, piece.edge) & F_LINK) !== 0,
      distanceM: lengthM,
      durationS: edgeSeconds(graph, piece.edge, prof, lengthM),
      startIndex,
      points: pts
    });
    distance += lengthM;
  }
  const steps = buildSteps(legs, { profile: prof.id, destination: target });
  return {
    source: "offline",
    profile: prof.id,
    coordinates,
    distanceM: distance,
    durationS: seconds,
    steps,
    from: fromPoint,
    to: target,
    usesTracks: legs.some((leg) => leg.roadClass === "track" || leg.roadClass === "path")
  };
}
