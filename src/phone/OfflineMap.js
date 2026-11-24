import React, { useEffect, useRef } from "react";
import { Text, View } from "react-native";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { PMTiles, Protocol } from "pmtiles";
import { attributionLine } from "../../symbolic/map_packs.js";
import { MemorySource } from "../../symbolic/archive_tiles.js";
import { AboutMapLink } from "./hunt_map_ui.js";

function lineCollection(shapes) {
  const features = [];
  for (const shape of shapes || []) {
    const coords = (shape.points || []).map((point) => [point.longitude, point.latitude]);
    if (coords.length >= 2) features.push({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: coords } });
  }
  return { type: "FeatureCollection", features };
}

function coneData(overlay) {
  const ring = overlay?.polygon;
  if (!ring || ring.length < 4) return { type: "FeatureCollection", features: [] };
  return { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [ring.map((p) => [p.longitude, p.latitude])] } };
}

const GLYPHS = { stand: "\u25A0", trail: "\u2505", bedding: "\u25B2", sighting: "S" };

// A mark pin in the browser preview: the kind's shape, the name, and the state word.
// Meaning is in the words (At risk, Clear, Out of cone), never in color alone.
function markElement(mark, onPick) {
  const el = document.createElement("button");
  el.type = "button";
  const word = mark.word ? ` \u00B7 ${mark.word}` : "";
  const risky = mark.state === "risk";
  el.setAttribute("aria-label", `${mark.name}, ${mark.kind}${mark.word ? `, ${mark.word}` : ""}`);
  el.textContent = `${GLYPHS[mark.kind] || "\u25CF"} ${risky ? "! " : ""}${mark.name}${word}`;
  Object.assign(el.style, {
    font: "700 12px system-ui, sans-serif",
    color: "#f4f0e6",
    background: "#1b2420",
    border: `${risky ? 2 : 1}px solid ${risky ? "#c0643c" : "#8a948a"}`,
    outline: mark.selected ? "2px solid #e2b15a" : "none",
    borderRadius: "11px",
    padding: "2px 8px",
    whiteSpace: "nowrap",
    cursor: "pointer"
  });
  el.addEventListener("click", (event) => { event.stopPropagation(); onPick(mark.id); });
  return el;
}

function labelElement(text) {
  const el = document.createElement("div");
  el.textContent = text;
  Object.assign(el.style, {
    font: "700 12px system-ui, sans-serif",
    color: "#f4f0e6",
    background: "#1b2420",
    border: "1px solid #e2b15a",
    borderRadius: "12px",
    padding: "4px 10px",
    maxWidth: "190px",
    textAlign: "center",
    pointerEvents: "none"
  });
  return el;
}

function syncPins(map, store, overlay, onPick, onDrop) {
  store.forEach((marker) => marker.remove());
  store.length = 0;
  for (const mark of overlay?.markers || []) {
    const dragging = mark.id === overlay?.dragId;
    const marker = new maplibregl.Marker({ element: markElement(dragging ? { ...mark, name: `Drag ${mark.name}`, selected: true } : mark, dragging ? () => {} : onPick), anchor: "top", draggable: dragging })
      .setLngLat([mark.longitude, mark.latitude]);
    if (dragging) {
      marker.on("dragend", () => {
        const at = marker.getLngLat();
        onDrop(mark.id, { latitude: at.lat, longitude: at.lng });
      });
    }
    store.push(marker.addTo(map));
  }
  if (overlay?.labelAt && overlay.label) {
    store.push(new maplibregl.Marker({ element: labelElement(overlay.label) }).setLngLat([overlay.labelAt.longitude, overlay.labelAt.latitude]).addTo(map));
  }
}

const NO_TILES = [];
const NO_CONTOURS = { type: "FeatureCollection", features: [] };

export default function OfflineMap({
  layers,
  attribution,
  fix,
  onFail,
  onPress,
  onLongPress,
  overlay,
  onMarkPress,
  onMarkDragEnd,
  onAbout,
  fill = false
}) {
  const archive = layers?.archivePack?.archive;
  const format = layers?.archivePack?.format;
  const shapes = layers?.shapes;
  const demTiles = NO_TILES;
  const contours = NO_CONTOURS;
  const host = useRef(null);
  const pressRef = useRef(onPress);
  const failRef = useRef(onFail);
  const longRef = useRef(onLongPress);
  const markRef = useRef(onMarkPress);
  const dropRef = useRef(onMarkDragEnd);
  dropRef.current = onMarkDragEnd;
  const overlayRef = useRef(overlay);
  const mapRef = useRef(null);
  const pinsRef = useRef([]);
  longRef.current = onLongPress;
  markRef.current = onMarkPress;
  overlayRef.current = overlay;
  pressRef.current = onPress;
  failRef.current = onFail;
  const label = attribution || "No map pack. Blank landscape. No streets are stored.";

  useEffect(() => {
    const node = host.current?.nodeType === 1 ? host.current : host.current?._nativeNode || host.current;
    if (!node || node.nodeType !== 1) return undefined;
    if (!archive && !(demTiles && demTiles.length)) return undefined;
    let map;
    let alive = true;
    (async () => {
      if (!alive) return;
      const sourceId = "pack";
      let source;
      let layers = [];
      if (format === "pmtiles") {
        const archiveReader = new PMTiles(new MemorySource(archive));
        const header = await archiveReader.getHeader();
        const protocol = new Protocol();
        try { maplibregl.addProtocol("pmtiles", protocol.tile); } catch { /* already registered */ }
        protocol.add(archiveReader);
        const key = archiveReader.source.getKey();
        const raster = header.tileType !== 1;
        source = raster
          ? { type: "raster", url: `pmtiles://${key}`, tileSize: 256 }
          : { type: "vector", url: `pmtiles://${key}` };
        layers = raster
          ? [{ id: "pack", type: "raster", source: sourceId }]
          : [];
        if (!raster) {
          try {
            const meta = await archiveReader.getMetadata();
            const names = meta?.vector_layers?.map((layer) => layer.id).filter(Boolean) || [];
            layers = names.map((name) => ({
              id: `pack-${name}`,
              type: "line",
              source: sourceId,
              "source-layer": name,
              paint: { "line-color": "#d7c4a3", "line-width": 1 }
            }));
          } catch {
            layers = [];
          }
        }
        map = new maplibregl.Map({
          container: node,
          style: {
            version: 8,
            sources: { [sourceId]: source },
            layers: [{ id: "background", type: "background", paint: { "background-color": "#101611" } }, ...layers]
          },
          bounds: [[header.minLon, header.minLat], [header.maxLon, header.maxLat]],
          attributionControl: false
        });
      }
      if (!map) {
        const center = fix ? [fix.longitude, fix.latitude] : [-69.2, 45.1];
        map = new maplibregl.Map({
          container: node,
          style: {
            version: 8,
            sources: {},
            layers: [{ id: "background", type: "background", paint: { "background-color": "#101611" } }]
          },
          center,
          zoom: 8,
          attributionControl: false
        });
      }
      map.addControl(new maplibregl.AttributionControl({ compact: true, customAttribution: label }));
      map.on("load", () => {
        (demTiles || []).forEach((tile, index) => {
          if (!tile.url || !tile.bounds) return;
          const id = `dem-${index}`;
          map.addSource(id, {
            type: "image",
            url: tile.url,
            coordinates: [
              [tile.bounds.west, tile.bounds.north],
              [tile.bounds.east, tile.bounds.north],
              [tile.bounds.east, tile.bounds.south],
              [tile.bounds.west, tile.bounds.south]
            ]
          });
          map.addLayer({ id, type: "raster", source: id, paint: { "raster-opacity": 0.72 } });
        });
        map.addSource("contours", { type: "geojson", data: contours || { type: "FeatureCollection", features: [] } });
        map.addLayer({ id: "contours", type: "line", source: "contours", paint: { "line-color": "#e6d7b8", "line-width": 1 } });
        map.addSource("overlays", { type: "geojson", data: lineCollection(shapes) });
        map.addLayer({ id: "overlays", type: "line", source: "overlays", paint: { "line-color": "#e2b15a", "line-width": 2 } });
        map.addSource("cone", { type: "geojson", data: coneData(overlayRef.current) });
        map.addLayer({ id: "cone-fill", type: "fill", source: "cone", paint: { "fill-color": overlayRef.current?.color || "#e2b15a", "fill-opacity": 0.3 } });
        map.addLayer({ id: "cone-line", type: "line", source: "cone", paint: { "line-color": overlayRef.current?.color || "#e2b15a", "line-width": 2 } });
        syncPins(map, pinsRef.current, overlayRef.current, (id) => markRef.current?.(id), (id, point) => dropRef.current?.(id, point));
        if (fix) {
          map.addSource("me", {
            type: "geojson",
            data: { type: "Feature", geometry: { type: "Point", coordinates: [fix.longitude, fix.latitude] }, properties: {} }
          });
          map.addLayer({
            id: "me",
            type: "circle",
            source: "me",
            paint: { "circle-radius": 8, "circle-color": "#b7d0a4", "circle-opacity": 0.12, "circle-stroke-width": 3, "circle-stroke-color": "#b7d0a4" }
          });
        }
      });
      map.on("click", (event) => {
        pressRef.current?.({ latitude: event.lngLat.lat, longitude: event.lngLat.lng });
      });
      // Right-click stands in for long-press in the browser preview.
      map.on("contextmenu", (event) => {
        longRef.current?.({ latitude: event.lngLat.lat, longitude: event.lngLat.lng });
      });
      mapRef.current = map;
    })().catch((err) => {
      console.error("offline map", err);
      failRef.current?.();
    });
    return () => {
      alive = false;
      mapRef.current = null;
      pinsRef.current.forEach((marker) => marker.remove());
      pinsRef.current = [];
      map?.remove();
    };
  }, [archive, format, label, demTiles, contours, shapes, fix]);

  // The cone and the marks follow the wind and the list without rebuilding the map.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded?.()) return;
    map.getSource("cone")?.setData(coneData(overlay));
    syncPins(map, pinsRef.current, overlay, (id) => markRef.current?.(id), (id, point) => dropRef.current?.(id, point));
  }, [overlay]);

  return (
    <View style={fill ? { flex: 1 } : null}>
      <View ref={host} accessibilityLabel="Offline map" style={{ ...(fill ? { flex: 1, minHeight: 150 } : { height: 380 }), borderRadius: 16, overflow: "hidden", backgroundColor: "#101611" }} />
      {onAbout ? <AboutMapLink onPress={onAbout} /> : <Text style={{ color: "#b7bfb2", marginTop: 8 }}>{label}</Text>}
    </View>
  );
}

export function mapAttribution(store) {
  return attributionLine(store);
}
