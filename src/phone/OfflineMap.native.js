import React, { useEffect, useMemo, useRef } from "react";
import { Text, View } from "react-native";
import MapCredit from "./MapCredit.js";
import {
  Camera,
  CircleLayer,
  FillLayer,
  LineLayer,
  MapView,
  MarkerView,
  PointAnnotation,
  RasterLayer,
  RasterSource,
  ShapeSource,
  SymbolLayer
} from "@maplibre/maplibre-react-native";
import { AboutMapLink, ConePill, DragPin, MarkPin } from "./hunt_map_ui.js";
import { DestinationPin } from "./route/RoutePins.js";
import { createCameraDriver } from "../../symbolic/map_camera_driver.js";
import { TERRAIN_LAYER_ID, baseMapStyle } from "../../symbolic/map_layers.js";

const NOT_TRACK = ["!=", ["get", "c"], "track"];
const IS_TRACK = ["==", ["get", "c"], "track"];

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

function runCameraCommand(cam, cmd) {
  try {
    if (cmd.type === "fit") cam.fitBounds([cmd.box.east, cmd.box.north], [cmd.box.west, cmd.box.south], cmd.padding, cmd.duration);
    else if (cmd.type === "set") cam.setCamera(cmd.stop);
  } catch {
    // A camera move that fails leaves the map where it is.
  }
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
  onMarkDragEnd,
  onAbout,
  parcels,
  route = null,
  navOn = false,
  followCourse = false,
  recenterKey = 0,
  northKey = 0,
  onUserPan,
  fill = false
}) {
  const camera = useRef(null);
  const geo = useMemo(() => shapesToGeoJson(layers?.shapes), [layers?.shapes]);
  const land = layers?.hasLand ? layers.land : null;
  const roads = layers?.roads || null;
  const shade = layers?.hillshade || null;
  const style = useMemo(
    () => baseMapStyle({ color: land ? land.water : "#101611", glyphs: layers?.glyphs, hillshade: shade }),
    [land?.water, layers?.glyphs, shade?.template, JSON.stringify(shade?.paint || null)]
  );
  // With Terrain shading on, the land and pack pictures go under the shading layer.
  const under = shade ? TERRAIN_LAYER_ID : undefined;

  // R7 camera: every move is decided by one driver (symbolic/map_camera_driver.js) and run here
  // on the Camera ref. The Camera has no controlled props, so nothing re-applies a camera on a
  // re-render, a layer or road rebuild, or a GPS sample. See the driver for the rules.
  const driver = useRef(null);
  if (!driver.current) {
    driver.current = createCameraDriver({
      remembered: initialCamera,
      focusKey,
      routeKey: route?.fitKey,
      recenterKey,
      northKey
    });
  }
  useEffect(() => {
    const cam = camera.current;
    if (!cam) return;
    const cmds = driver.current.sync({
      fix,
      follow,
      headingDeg,
      followCourse,
      focus,
      focusKey,
      route: route ? { box: route.box, fitKey: route.fitKey } : null,
      navOn,
      recenterKey,
      northKey,
      firstFocus: layers?.firstFocus || null
    });
    for (const cmd of cmds) runCameraCommand(cam, cmd);
  });
  // The route line and destination pin (regular Map). Built once per route, not per render.
  const routeShape = useMemo(() => {
    const line = route?.line;
    if (!line || line.length < 2) return null;
    return { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: line.map((p) => [p.longitude, p.latitude]) } };
  }, [route?.line]);
  const center = fix ? [fix.longitude, fix.latitude] : [-69, 45];
  // The opening camera, fixed for the life of this view (never re-applied).
  const start = useRef(null);
  if (!start.current) {
    start.current = initialCamera
      ? { centerCoordinate: initialCamera.center, zoomLevel: initialCamera.zoom }
      : { centerCoordinate: center, zoomLevel: fix ? 13 : 4 };
  }
  const paint = layers?.paint || {};
  const coneShape = useMemo(() => {
    const ring = overlay?.polygon;
    if (!ring || ring.length < 4) return null;
    return { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [ring.map((p) => [p.longitude, p.latitude])] } };
  }, [overlay?.polygon]);
  return (
    <View
      style={fill ? { flex: 1 } : null}
      // A finger dragging or pinching on the map is the only sure sign of a user move on Android.
      onTouchStart={(event) => { if (driver.current.touchStart(event)) onUserPan?.(); }}
      onTouchMove={(event) => { if (driver.current.touchMove(event)) onUserPan?.(); }}
      onTouchEnd={() => driver.current.touchEnd()}
      onTouchCancel={() => driver.current.touchEnd()}
    >
      <MapView
        style={fill ? { flex: 1, minHeight: 150 } : { height: 380 }}
        mapStyle={style}
        logoEnabled={false}
        attributionEnabled={false}
        compassEnabled={false}
        onDidFailLoadingMap={() => onFail?.()}
        onRegionWillChange={(event) => {
          if (driver.current.regionEvent(event)) onUserPan?.();
        }}
        onRegionDidChange={(event) => {
          if (driver.current.regionEvent(event)) onUserPan?.();
          onCamera?.(event);
        }}
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
        <Camera ref={camera} defaultSettings={start.current} />
        {land ? (
          // Keyed by the shading, so turning it on or off rebuilds this layer in the right place
          // (a belowLayerID change on a live layer is not safe on Android).
          <ShapeSource key={`land-${under ? "shade" : "flat"}`} id="land" shape={geo.land}>
            <FillLayer id="land-fill" belowLayerID={under} style={{ fillColor: land.land }} />
          </ShapeSource>
        ) : null}
        {(layers?.rasters || []).map((raster) => (
          <RasterSource
            key={`${raster.id}-${raster.template}-${under ? "shade" : "flat"}`}
            id={`src-${raster.id}`}
            tileUrlTemplates={[raster.template]}
            tileSize={raster.tileSize || 256}
            minZoomLevel={raster.minZoom}
            maxZoomLevel={raster.maxZoom}
          >
            <RasterLayer id={`layer-${raster.id}`} sourceID={`src-${raster.id}`} belowLayerID={under} style={{ rasterOpacity: 1, ...paint }} />
          </RasterSource>
        ))}
        {layers?.tint ? (
          <ShapeSource id="tint" shape={WORLD}>
            <FillLayer id="tint-fill" style={{ fillColor: layers.tint.color, fillOpacity: layers.tint.opacity }} />
          </ShapeSource>
        ) : null}
        {roads ? (
          // OpenStreetMap roads from the built-in road graphs, above the terrain and below your marks.
          <ShapeSource id="roads-src" shape={roads.shape}>
            <LineLayer id="roads-casing" filter={NOT_TRACK} minZoomLevel={10} style={roads.specs.casing} />
            <LineLayer id="roads-line" filter={NOT_TRACK} style={roads.specs.line} />
            <LineLayer id="roads-track" filter={IS_TRACK} style={{ ...roads.specs.line, ...roads.specs.track }} />
            <SymbolLayer id="roads-label" minZoomLevel={roads.specs.labelMinZoom} style={roads.specs.label} />
          </ShapeSource>
        ) : null}
        {parcels?.features?.length ? (
          // Property lines: outlines only, nothing else about the land. Approximate, not a survey.
          <ShapeSource id="parcel-lines" shape={parcels}>
            <LineLayer id="parcel-line" minZoomLevel={12} style={{ lineColor: "#f2d04b", lineWidth: ["interpolate", ["linear"], ["zoom"], 13, 0.8, 17, 2.2], lineOpacity: 0.9, lineDasharray: [3, 2] }} />
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
        {routeShape ? (
          <ShapeSource id="route" shape={routeShape}>
            <LineLayer id="route-casing" style={{ lineColor: "#141a16", lineWidth: 9, lineOpacity: 0.9, lineCap: "round", lineJoin: "round" }} />
            <LineLayer id="route-line" style={{ lineColor: "#e2b15a", lineWidth: 5, lineOpacity: 1, lineCap: "round", lineJoin: "round" }} />
          </ShapeSource>
        ) : null}
        {route?.destination ? (
          <MarkerView coordinate={[route.destination.longitude, route.destination.latitude]} anchor={{ x: 0.5, y: 1 }} allowOverlap>
            <DestinationPin name={route.destination.name} />
          </MarkerView>
        ) : null}
        {fix ? (
          // A ring with a clear middle, so a place name under the dot stays readable.
          <ShapeSource id="me" shape={{ type: "Feature", geometry: { type: "Point", coordinates: center }, properties: {} }}>
            <CircleLayer id="me-dot" style={{ circleRadius: 9, circleColor: "#b7d0a4", circleOpacity: 0.12, circleStrokeWidth: 3, circleStrokeColor: "#141a16" }} />
            <CircleLayer id="me-ring" style={{ circleRadius: 6, circleColor: "#b7d0a4", circleOpacity: 0, circleStrokeWidth: 2, circleStrokeColor: "#b7d0a4" }} />
            <CircleLayer id="me-center" style={{ circleRadius: 2, circleColor: "#141a16" }} />
          </ShapeSource>
        ) : null}
        {(overlay?.markers || []).map((mark) => (mark.id === overlay?.dragId ? (
          // MarkerView cannot be dragged, so the mark being moved is a draggable PointAnnotation.
          // Press and hold, drag, and the new spot is saved on release (with Undo).
          <PointAnnotation
            key={`drag-${mark.id}`}
            id={`drag-${mark.id}`}
            coordinate={[mark.longitude, mark.latitude]}
            anchor={{ x: 0.5, y: 0.5 }}
            draggable
            onDragEnd={(payload) => {
              const coords = payload?.geometry?.coordinates;
              if (!coords) return;
              onMarkDragEnd?.(mark.id, { longitude: coords[0], latitude: coords[1] });
            }}
          >
            <DragPin mark={mark} />
          </PointAnnotation>
        ) : (
          <MarkerView key={mark.id} coordinate={[mark.longitude, mark.latitude]} anchor={{ x: 0.5, y: 0.3 }} allowOverlap>
            <MarkPin mark={mark} onPress={() => onMarkPress?.(mark.id)} />
          </MarkerView>
        )))}
        {overlay?.labelAt ? (
          <MarkerView coordinate={[overlay.labelAt.longitude, overlay.labelAt.latitude]} anchor={{ x: 0.5, y: 0.5 }} allowOverlap>
            <ConePill text={overlay.label} />
          </MarkerView>
        ) : null}
      </MapView>
      {/* One short link under the map; the full credit is in About this map, said once. */}
      {onAbout ? <AboutMapLink onPress={onAbout} /> : <MapCredit text={attribution || layers?.attribution || ""} empty={layers?.empty === true} />}
    </View>
  );
}
