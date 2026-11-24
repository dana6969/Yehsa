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
import { boxKey, followStop, isUserGesture, recenterStop, seedAppliedKey, shouldFitFocus, shouldFitRoute } from "../../symbolic/map_camera.js";

// glyphs: the loopback URL for the road-name font, when the road layer is on.
function blankStyle(color, glyphs) {
  const style = {
    version: 8,
    sources: {},
    layers: [{ id: "background", type: "background", paint: { "background-color": color } }]
  };
  if (glyphs) style.glyphs = glyphs;
  return style;
}

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
  const fixed = useRef(false);
  const land = layers?.hasLand ? layers.land : null;
  const roads = layers?.roads || null;
  const style = useMemo(() => blankStyle(land ? land.water : "#101611", layers?.glyphs), [land?.water, layers?.glyphs]);

  // Camera rules (symbolic/map_camera.js): a fit runs once per request key, never on a re-render.
  // Before R6 this effect also ran whenever layers.firstFocus became a new object, which happens
  // every time roads reload after a pan or zoom, so the map snapped back to the Hunt / Show box.
  const firstKey = boxKey(layers?.firstFocus);
  const appliedFocus = useRef(seedAppliedKey(focusKey, Boolean(initialCamera)));
  const zoomNow = useRef(initialCamera?.zoom ?? null);
  useEffect(() => {
    const cam = camera.current;
    if (!cam) return;
    if (shouldFitFocus({ focus, focusKey, lastKey: appliedFocus.current })) {
      appliedFocus.current = focusKey;
      cam.fitBounds([focus.east, focus.north], [focus.west, focus.south], 40, 700);
    } else if (!fixed.current && !fix && !initialCamera && (focus || layers?.firstFocus)) {
      const box = focus || layers.firstFocus;
      cam.fitBounds([box.east, box.north], [box.west, box.south], 40, 0);
    }
    fixed.current = true;
  }, [focusKey, firstKey]);

  // Follow moves the center only (and the heading when following a route's course). It never
  // sets a zoom, so the user's zoom is kept. Follow is dropped by any pan or pinch (onUserPan).
  useEffect(() => {
    if (!follow || !fix || !camera.current) return;
    const stop = followStop(fix, { headingDeg, course: followCourse });
    if (stop) camera.current.setCamera(stop);
  }, [follow, fix?.latitude, fix?.longitude, followCourse ? headingDeg : null]);

  // Recenter tap: one move to you at your zoom (steps in only from a whole-state view).
  useEffect(() => {
    if (!recenterKey || !fix || !camera.current) return;
    const stop = recenterStop(fix, { zoom: zoomNow.current });
    if (stop) camera.current.setCamera(stop);
  }, [recenterKey]);

  // North up.
  useEffect(() => {
    if (!northKey || !camera.current) return;
    camera.current.setCamera({ heading: 0, animationDuration: 300 });
  }, [northKey]);

  // The route line and destination pin (regular Map). Built once per route, not per render.
  const routeShape = useMemo(() => {
    const line = route?.line;
    if (!line || line.length < 2) return null;
    return { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: line.map((p) => [p.longitude, p.latitude]) } };
  }, [route?.line]);
  // Frame a new route once. Not while Start is on (a reroute must not zoom out), and not again
  // when the map view is rebuilt on returning to the tab.
  const appliedRoute = useRef(seedAppliedKey(route?.fitKey, Boolean(initialCamera)));
  useEffect(() => {
    const cam = camera.current;
    if (!cam || !shouldFitRoute({ box: route?.box, fitKey: route?.fitKey, lastKey: appliedRoute.current, navOn })) return;
    appliedRoute.current = route.fitKey;
    cam.fitBounds([route.box.east, route.box.north], [route.box.west, route.box.south], 60, 700);
  }, [route?.fitKey]);
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
        compassEnabled={false}
        onDidFailLoadingMap={() => onFail?.()}
        onRegionWillChange={(event) => {
          if (isUserGesture(event)) onUserPan?.();
        }}
        onRegionDidChange={(event) => {
          const z = event?.properties?.zoomLevel;
          if (Number.isFinite(z)) zoomNow.current = z;
          if (isUserGesture(event)) onUserPan?.();
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
