import React, { useEffect, useMemo, useRef } from "react";
import { Text, View } from "react-native";
import {
  Camera,
  CircleLayer,
  FillLayer,
  LineLayer,
  MapView,
  MarkerView,
  RasterLayer,
  RasterSource,
  ShapeSource
} from "@maplibre/maplibre-react-native";
import { ConePill, MarkPin } from "./hunt_map_ui.js";

function blankStyle(color) {
  return {
    version: 8,
    sources: {},
    layers: [{ id: "background", type: "background", paint: { "background-color": color } }]
  };
}

const WORLD = {
  type: "Feature",
  properties: {},
  geometry: { type: "Polygon", coordinates: [[[-180, -85], [180, -85], [180, 85], [-180, 85], [-180, -85]]] }
};

// Lines and single points from packs, as GeoJSON. Built once per set of shapes, not per render.
export function shapesToGeoJson(shapes) {
  const lines = [];
  const points = [];
  const land = [];
  for (const shape of shapes || []) {
    const coords = (shape.points || []).map((point) => [point.longitude, point.latitude]);
    if (shape.ring && coords.length >= 4) land.push({ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [coords] } });
    if (shape.single && coords.length) points.push({ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: coords[0] } });
    else if (coords.length >= 2) lines.push({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: coords } });
  }
  return {
    lines: { type: "FeatureCollection", features: lines },
    points: { type: "FeatureCollection", features: points },
    land: { type: "FeatureCollection", features: land }
  };
}

// layers: from symbolic/map_layers.js. focus: { west, south, east, north } to look at when there is no GPS fix.
export default function OfflineMap({
  layers,
  fix,
  follow,
  headingDeg,
  focus,
  focusKey,
  initialCamera,
  onCamera,
  attribution,
  onFail,
  onPress,
  onLongPress,
  overlay,
  onMarkPress,
  fill = false
}) {
  const camera = useRef(null);
  const geo = useMemo(() => shapesToGeoJson(layers?.shapes), [layers?.shapes]);
  const fixed = useRef(false);
  const land = layers?.hasLand ? layers.land : null;
  const style = useMemo(() => blankStyle(land ? land.water : "#101611"), [land?.water]);

  // Look at the right place once the map has a camera, and again when asked (Show on map).
  useEffect(() => {
    const cam = camera.current;
    if (!cam) return;
    if (focus && focusKey) {
      cam.fitBounds([focus.east, focus.north], [focus.west, focus.south], 40, 700);
    } else if (!fixed.current && !fix && !initialCamera && (focus || layers?.firstFocus)) {
      const box = focus || layers.firstFocus;
      cam.fitBounds([box.east, box.north], [box.west, box.south], 40, 0);
    }
    fixed.current = true;
  }, [focusKey, layers?.firstFocus]);

  useEffect(() => {
    if (!follow || !fix || !camera.current) return;
    camera.current.setCamera({
      centerCoordinate: [fix.longitude, fix.latitude],
      heading: Number.isFinite(headingDeg) ? headingDeg : 0,
      animationDuration: 500
    });
  }, [follow, fix?.latitude, fix?.longitude, headingDeg]);

  const center = fix ? [fix.longitude, fix.latitude] : [-69, 45];
  const start = initialCamera ? { centerCoordinate: initialCamera.center, zoomLevel: initialCamera.zoom } : { centerCoordinate: center, zoomLevel: fix ? 11 : 4 };
  const paint = layers?.paint || {};
  const coneShape = useMemo(() => {
    const ring = overlay?.polygon;
    if (!ring || ring.length < 4) return null;
    return { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [ring.map((p) => [p.longitude, p.latitude])] } };
  }, [overlay?.polygon]);
  return (
    <View style={fill ? { flex: 1 } : null}>
      <MapView
        style={fill ? { flex: 1, minHeight: 150 } : { height: 380 }}
        mapStyle={style}
        logoEnabled={false}
        attributionEnabled={false}
        compassEnabled
        onDidFailLoadingMap={() => onFail?.()}
        onRegionDidChange={(event) => onCamera?.(event)}
        onPress={(event) => {
          const coords = event?.geometry?.coordinates || event?.coordinates;
          if (!coords) return;
          onPress?.({ longitude: coords[0], latitude: coords[1] });
        }}
        onLongPress={(event) => {
          const coords = event?.geometry?.coordinates || event?.coordinates;
          if (!coords) return;
          onLongPress?.({ longitude: coords[0], latitude: coords[1] });
        }}
      >
        <Camera ref={camera} defaultSettings={start} />
        {land ? (
          <ShapeSource id="land" shape={geo.land}>
            <FillLayer id="land-fill" style={{ fillColor: land.land }} />
          </ShapeSource>
        ) : null}
        {(layers?.rasters || []).map((raster) => (
          <RasterSource
            key={`${raster.id}-${raster.template}`}
            id={`src-${raster.id}`}
            tileUrlTemplates={[raster.template]}
            tileSize={raster.tileSize || 256}
            minZoomLevel={raster.minZoom}
            maxZoomLevel={raster.maxZoom}
          >
            <RasterLayer id={`layer-${raster.id}`} sourceID={`src-${raster.id}`} style={{ rasterOpacity: 1, ...paint }} />
          </RasterSource>
        ))}
        {layers?.tint ? (
          <ShapeSource id="tint" shape={WORLD}>
            <FillLayer id="tint-fill" style={{ fillColor: layers.tint.color, fillOpacity: layers.tint.opacity }} />
          </ShapeSource>
        ) : null}
        <ShapeSource id="overlays" shape={geo.lines}>
          <LineLayer id="overlay-line" style={{ lineColor: land ? land.border : (layers?.rasters?.length ? "#8a2b14" : "#e2b15a"), lineWidth: land ? 1.2 : 2.5, lineOpacity: 0.95 }} />
        </ShapeSource>
        <ShapeSource id="overlay-points" shape={geo.points}>
          <CircleLayer id="overlay-point" style={{ circleRadius: 4, circleColor: "#9a6b1f", circleStrokeWidth: 1, circleStrokeColor: "#ffffff" }} />
        </ShapeSource>
        {coneShape ? (
          <ShapeSource id="scent-cone" shape={coneShape}>
            <FillLayer id="scent-cone-fill" style={{ fillColor: overlay.color, fillOpacity: 0.3 }} />
            <LineLayer id="scent-cone-line" style={{ lineColor: overlay.color, lineWidth: 2, lineOpacity: 0.95 }} />
          </ShapeSource>
        ) : null}
        {fix ? (
          // A ring with a clear middle, so a place name under the dot stays readable.
          <ShapeSource id="me" shape={{ type: "Feature", geometry: { type: "Point", coordinates: center }, properties: {} }}>
            <CircleLayer id="me-dot" style={{ circleRadius: 9, circleColor: "#b7d0a4", circleOpacity: 0.12, circleStrokeWidth: 3, circleStrokeColor: "#141a16" }} />
            <CircleLayer id="me-ring" style={{ circleRadius: 6, circleColor: "#b7d0a4", circleOpacity: 0, circleStrokeWidth: 2, circleStrokeColor: "#b7d0a4" }} />
            <CircleLayer id="me-center" style={{ circleRadius: 2, circleColor: "#141a16" }} />
          </ShapeSource>
        ) : null}
        {(overlay?.markers || []).map((mark) => (
          <MarkerView key={mark.id} coordinate={[mark.longitude, mark.latitude]} anchor={{ x: 0.5, y: 0.3 }} allowOverlap>
            <MarkPin mark={mark} onPress={() => onMarkPress?.(mark.id)} />
          </MarkerView>
        ))}
        {overlay?.labelAt ? (
          <MarkerView coordinate={[overlay.labelAt.longitude, overlay.labelAt.latitude]} anchor={{ x: 0.5, y: 0.5 }} allowOverlap>
            <ConePill text={overlay.label} />
          </MarkerView>
        ) : null}
      </MapView>
      <Text style={{ color: "#b7bfb2", marginTop: 8 }}>{attribution || layers?.attribution || ""}</Text>
    </View>
  );
}
