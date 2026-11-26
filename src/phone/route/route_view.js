// What the map draws for a route: the line, the destination pin, and the box to frame once.
import { boundsOf } from "../../../symbolic/routing/geo.js";

let fitCounter = 0;

export function thinLine(points, maxPoints) {
  if (!maxPoints || points.length <= maxPoints) return points;
  const step = (points.length - 1) / (maxPoints - 1);
  const out = [];
  for (let i = 0; i < maxPoints; i++) out.push(points[Math.round(i * step)]);
  return out;
}

export function routeMapView(route, destination, { maxPoints = 0 } = {}) {
  if (!route && !destination) return null;
  const line = route ? thinLine(route.coordinates, maxPoints) : null;
  const box = route ? boundsOf(route.coordinates) : destination ? { south: destination.latitude - 0.01, north: destination.latitude + 0.01, west: destination.longitude - 0.01, east: destination.longitude + 0.01 } : null;
  fitCounter += 1;
  return { line, destination, box, fitKey: fitCounter };
}
