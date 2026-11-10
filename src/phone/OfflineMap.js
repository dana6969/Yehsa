import React, { useEffect, useRef } from "react";
import { Text, View } from "react-native";
import { PMTiles } from "pmtiles";
import { attributionLine } from "../../symbolic/map_packs.js";
import { MemorySource } from "../../symbolic/archive_tiles.js";

function lineCollection(shapes) {
  const features = [];
  for (const shape of shapes || []) {
    const coords = (shape.points || []).map((point) => [point.longitude, point.latitude]);
    if (coords.length >= 2) features.push({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: coords } });
  }
  return { type: "FeatureCollection", features };
}

export default function OfflineMap({
  archive,
  format,
  attribution,
  demTiles,
  contours,
  shapes,
  fix,
  onFail,
  onPress
}) {
  const host = useRef(null);
  const pressRef = useRef(onPress);
  const failRef = useRef(onFail);
  pressRef.current = onPress;
  failRef.current = onFail;
  const label = attribution || "No map pack. Blank landscape. No streets are stored.";

  useEffect(() => {
    const node = host.current;
    if (!node) return undefined;
    if (!archive && !(demTiles && demTiles.length)) return undefined;
    let map;
    let alive = true;
    (async () => {
      const maplibre = await import("maplibre-gl");
      const maplibregl = maplibre.default || maplibre;
      await import("maplibre-gl/dist/maplibre-gl.css");
      if (!alive) return;
      const sourceId = "pack";
      let source;
      let layers = [];
      if (format === "pmtiles") {
        const archiveReader = new PMTiles(new MemorySource(archive));
        const header = await archiveReader.getHeader();
        const protocol = new (await import("pmtiles")).Protocol();
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
      map.addControl(new maplibregl.AttributionControl({ customAttribution: label }));
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
        if (fix) {
          map.addSource("me", {
            type: "geojson",
            data: { type: "Feature", geometry: { type: "Point", coordinates: [fix.longitude, fix.latitude] }, properties: {} }
          });
          map.addLayer({
            id: "me",
            type: "circle",
            source: "me",
            paint: { "circle-radius": 7, "circle-color": "#b7d0a4", "circle-stroke-width": 2, "circle-stroke-color": "#141a16" }
          });
        }
      });
      map.on("click", (event) => {
        pressRef.current?.({ latitude: event.lngLat.lat, longitude: event.lngLat.lng });
      });
    })().catch(() => failRef.current?.());
    return () => {
      alive = false;
      map?.remove();
    };
  }, [archive, format, label, demTiles, contours, shapes, fix]);

  return (
    <View>
      <View ref={host} accessibilityLabel="Offline map" style={{ height: 380, borderRadius: 16, overflow: "hidden", backgroundColor: "#101611" }} />
      <Text style={{ color: "#b7bfb2", marginTop: 8 }}>{label}</Text>
    </View>
  );
}

export function mapAttribution(store) {
  return attributionLine(store);
}
