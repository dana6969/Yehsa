import React, { useEffect, useRef } from "react";
import { Text, View } from "react-native";
import { PMTiles } from "pmtiles";
import { attributionLine } from "../../symbolic/map_packs.js";

class MemorySource {
  constructor(bytes) {
    this.bytes = bytes;
    this.key = `mem-${bytes.byteLength}-${bytes[0] || 0}`;
  }
  getKey() {
    return this.key;
  }
  async getBytes(offset, length) {
    const start = offset;
    const end = Math.min(this.bytes.byteLength, offset + length);
    const copy = this.bytes.slice(start, end);
    return { data: copy.buffer };
  }
}

export default function OfflineMap({ archive, format, attribution, demUrl, demBounds }) {
  const host = useRef(null);
  const label = attribution || "No map pack. Blank landscape. No streets are stored.";

  useEffect(() => {
    const node = host.current;
    if (!node || !archive || (format !== "pmtiles" && format !== "mbtiles")) return undefined;
    let map;
    let alive = true;
    (async () => {
      const maplibre = await import("maplibre-gl");
      const maplibregl = maplibre.default || maplibre;
      await import("maplibre-gl/dist/maplibre-gl.css");
      if (!alive) return;
      const sourceId = "pack";
      let source;
      let layers;
      if (format === "pmtiles") {
        const archiveReader = new PMTiles(new MemorySource(archive));
        const header = await archiveReader.getHeader();
        const protocol = new (await import("pmtiles")).Protocol();
        maplibregl.addProtocol("pmtiles", protocol.tile);
        protocol.add(archiveReader);
        const key = archiveReader.source.getKey();
        const raster = header.tileType !== 1;
        source = raster
          ? { type: "raster", url: `pmtiles://${key}`, tileSize: 256 }
          : { type: "vector", url: `pmtiles://${key}` };
        layers = raster
          ? [{ id: "pack", type: "raster", source: sourceId }]
          : [{ id: "pack", type: "line", source: sourceId, "source-layer": "", paint: { "line-color": "#e2b15a", "line-width": 1 } }];
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
      }
      if (!source) return;
      map = new maplibregl.Map({
        container: node,
        style: { version: 8, sources: { [sourceId]: source }, layers },
        attributionControl: true,
        dragRotate: true,
        pitchWithRotate: true
      });
      map.addControl(new maplibregl.AttributionControl({ customAttribution: label }));
      if (demUrl && demBounds) {
        map.on("load", () => {
          map.addSource("dem", {
            type: "image",
            url: demUrl,
            coordinates: [
              [demBounds.west, demBounds.north],
              [demBounds.east, demBounds.north],
              [demBounds.east, demBounds.south],
              [demBounds.west, demBounds.south]
            ]
          });
          map.addLayer({ id: "dem", type: "raster", source: "dem", paint: { "raster-opacity": 0.55 } });
        });
      }
    })().catch(() => {});
    return () => {
      alive = false;
      map?.remove();
    };
  }, [archive, format, demUrl, label, demBounds]);

  return (
    <View>
      <View ref={host} style={{ height: 380, borderRadius: 16, overflow: "hidden", backgroundColor: "#101611" }} />
      <Text style={{ color: "#b7bfb2", marginTop: 8 }}>{label}</Text>
      <Text style={{ color: "#8f9a8c", fontSize: 13 }}>This browser draws the pack with MapLibre. A phone install keeps the landscape canvas until a device build includes the native map.</Text>
    </View>
  );
}

export function mapAttribution(store) {
  return attributionLine(store);
}
