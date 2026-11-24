import React, { useEffect, useMemo, useRef } from "react";
import { Text, View } from "react-native";
import MapCredit from "./MapCredit.js";
import {
  Camera,
  CircleLayer,
  FillLayer,
  LineLayer,
  MapView,
  RasterLayer,
  RasterSource,
  ShapeSource
} from "@maplibre/maplibre-react-native";

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
        {fix ? (
          <ShapeSource id="me" shape={{ type: "Feature", geometry: { type: "Point", coordinates: center }, properties: {} }}>
            <CircleLayer id="me-dot" style={{ circleRadius: 8, circleColor: "#b7d0a4", circleStrokeWidth: 3, circleStrokeColor: "#141a16" }} />
          </ShapeSource>
        ) : null}
      </MapView>
      <MapCredit text={attribution || layers?.attribution || ""} empty={layers?.empty === true} />
    </View>
  );
}
