// When the native map view should be built. All app screens stay mounted and the hidden ones are
// taken out of the layout (display: none). On Android that detaches the GL map view, and the view
// that comes back has lost its sources and layers: outlines gone, black map, GPS dot only.
// The fix: the map view exists only while the Map screen is showing, and it is built fresh
// (new key) every time the screen is shown again, at the camera the user left it.

export function initialHost() {
  return { epoch: 0, shown: false };
}

// Call with each change of "is the Map screen showing". Returns the next host state.
export function nextHost(host, active) {
  if (active && !host.shown) return { epoch: host.epoch + 1, shown: true };
  if (!active && host.shown) return { epoch: host.epoch, shown: false };
  return host;
}

export function mapViewKey(host) {
  return `map-${host.epoch}`;
}

export function shouldMountMap(host, layers) {
  return Boolean(host.shown && layers?.useMap);
}

export function rememberCamera(prev, event) {
  const coords = event?.geometry?.coordinates;
  const zoom = event?.properties?.zoomLevel;
  if (!Array.isArray(coords) || !Number.isFinite(coords[0]) || !Number.isFinite(coords[1])) return prev || null;
  if (!Number.isFinite(zoom)) return prev || null;
  return { center: [coords[0], coords[1]], zoom };
}
