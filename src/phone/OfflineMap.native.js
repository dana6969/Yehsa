import React from "react";
import { Text, View } from "react-native";
import {
  Camera,
  CircleLayer,
  LineLayer,
  MapView,
  PointAnnotation,
  RasterLayer,
  RasterSource,
  ShapeSource
} from "@maplibre/maplibre-react-native";

const BLANK = {
  version: 8,
  sources: {},
  layers: [{ id: "background", type: "background", paint: { "background-color": "#101611" } }]
};

function overlays(shapes) {
  const features = [];
  for (const shape of shapes || []) {
    const coords = (shape.points || []).map((point) => [point.longitude, point.latitude]);
    if (coords.length >= 2) {
      features.push({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: coords } });
    }
  }
  return { type: "FeatureCollection", features };
}

export default function OfflineMap({
  shapes,
  fix,
  follow,
  headingDeg,
  tileTemplate,
  attribution,
  onFail
}) {
  const center = fix ? [fix.longitude, fix.latitude] : [0, 0];
  return (
    <View>
      <MapView
        style={{ height: 380 }}
        mapStyle={BLANK}
        logoEnabled={false}
        attributionEnabled
        attributionPosition={{ bottom: 8, left: 8 }}
        compassEnabled
        onDidFailLoadingMap={() => onFail?.()}
      >
        <Camera
          centerCoordinate={center}
          zoomLevel={fix ? 12 : 2}
          heading={follow && Number.isFinite(headingDeg) ? headingDeg : 0}
          animationMode="easeTo"
        />
        {tileTemplate ? (
          <RasterSource id="pack" tileUrlTemplates={[tileTemplate]} tileSize={256}>
            <RasterLayer id="pack-layer" sourceID="pack" />
          </RasterSource>
        ) : null}
        <ShapeSource id="overlays" shape={overlays(shapes)}>
          <LineLayer id="overlay-line" style={{ lineColor: "#e2b15a", lineWidth: 2 }} />
        </ShapeSource>
        {fix ? (
          <ShapeSource id="me" shape={{ type: "Feature", geometry: { type: "Point", coordinates: center }, properties: {} }}>
            <CircleLayer id="me-dot" style={{ circleRadius: 7, circleColor: "#b7d0a4", circleStrokeWidth: 2, circleStrokeColor: "#141a16" }} />
          </ShapeSource>
        ) : null}
        {fix ? <PointAnnotation id="me-pin" coordinate={center} /> : null}
      </MapView>
      <Text style={{ color: "#b7bfb2", marginTop: 8 }}>{attribution || "No map pack. Blank landscape."}</Text>
    </View>
  );
}
