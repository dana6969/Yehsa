// The box of map on screen, from a MapLibre camera event. Uses the event's visibleBounds when it
// has them ([[east, north], [west, south]]), else works it out from the center, zoom and screen size.

export function viewBoxFrom(event, { width = 400, height = 700 } = {}) {
  const coords = event?.geometry?.coordinates;
  const zoom = event?.properties?.zoomLevel;
  if (!Array.isArray(coords) || !Number.isFinite(coords[0]) || !Number.isFinite(coords[1]) || !Number.isFinite(zoom)) return null;
  const vb = event?.properties?.visibleBounds;
  if (Array.isArray(vb) && vb.length === 2 && vb.every((p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]))) {
    const [a, b] = vb;
    return { zoom, box: { west: Math.min(a[0], b[0]), east: Math.max(a[0], b[0]), south: Math.min(a[1], b[1]), north: Math.max(a[1], b[1]) } };
  }
  // 256 px tiles: degrees per screen pixel at this zoom.
  const degPerPx = 360 / (256 * 2 ** zoom);
  const halfLon = (width / 2) * degPerPx;
  const halfLat = (height / 2) * degPerPx * Math.cos((coords[1] * Math.PI) / 180);
  return { zoom, box: { west: coords[0] - halfLon, east: coords[0] + halfLon, south: coords[1] - halfLat, north: coords[1] + halfLat } };
}
