import React, { useRef, useState } from "react";
import { Platform, Pressable, Text, View } from "react-native";
import { haversineKm, initialBearingDeg } from "../../symbolic/landscape_math.js";
import { courseSentence } from "../../symbolic/nav_sentence.js";

const KM_PER_DEG = 111.19;

export function canvasPoint(origin, point) {
  const lat = Number(point?.latitude);
  const lon = Number(point?.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const north = (lat - origin.latitude) * KM_PER_DEG;
  const scale = Math.cos((origin.latitude * Math.PI) / 180) || 1;
  const east = (lon - origin.longitude) * KM_PER_DEG * scale;
  return { east, north };
}

export function pointFromCanvas(origin, eastKm, northKm) {
  const scale = Math.cos((origin.latitude * Math.PI) / 180) || 1;
  return {
    latitude: origin.latitude + northKm / KM_PER_DEG,
    longitude: origin.longitude + eastKm / (KM_PER_DEG * scale)
  };
}

export default function LandscapeMap({
  origin,
  held,
  waypoints,
  track,
  declination,
  onWaypoint,
  onLongPress
}) {
  const [size, setSize] = useState({ width: 320, height: 360 });
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(18);
  const [measure, setMeasure] = useState([]);
  const [readout, setReadout] = useState("Blank landscape canvas. No streets, no cities, and no elevation tiles are installed.");
  const drag = useRef(null);

  function project(point) {
    const km = canvasPoint(origin, point);
    if (!km) return null;
    return {
      x: size.width / 2 + pan.x + km.east * zoom,
      y: size.height / 2 + pan.y - km.north * zoom
    };
  }

  function unproject(x, y) {
    const east = (x - size.width / 2 - pan.x) / zoom;
    const north = (size.height / 2 + pan.y - y) / zoom;
    return pointFromCanvas(origin, east, north);
  }

  function onGrant(event) {
    const touch = event.nativeEvent;
    drag.current = { x: touch.locationX, y: touch.locationY, panX: pan.x, panY: pan.y, moved: false, at: Date.now() };
  }

  function onMove(event) {
    const current = drag.current;
    if (!current) return;
    const touch = event.nativeEvent;
    const dx = touch.locationX - current.x;
    const dy = touch.locationY - current.y;
    if (Math.hypot(dx, dy) > 8) current.moved = true;
    if (current.moved) setPan({ x: current.panX + dx, y: current.panY + dy });
  }

  function onRelease(event) {
    const current = drag.current;
    drag.current = null;
    if (!current) return;
    const touch = event.nativeEvent;
    const point = unproject(touch.locationX, touch.locationY);
    const heldMs = Date.now() - current.at;
    if (!current.moved && heldMs > 450) {
      setReadout(`Long press ${point.latitude.toFixed(5)}, ${point.longitude.toFixed(5)}. This is the canvas point, not a city.`);
      if (onLongPress) onLongPress(point);
      return;
    }
    if (current.moved) return;
    const next = [...measure, point].slice(-2);
    setMeasure(next);
    if (next.length === 2) {
      const km = haversineKm(next[0], next[1]);
      const bearing = initialBearingDeg(next[0], next[1]);
      setReadout(courseSentence(km, bearing, "between the two taps"));
    } else if (onWaypoint) {
      onWaypoint(point);
      setReadout("Tap proposes a waypoint. It is not saved until you approve it in Chat.");
    }
  }

  const barKm = 80 / zoom;
  const lines = [-3, -2, -1, 0, 1, 2, 3];
  const magnetic = Number(declination);
  const magTurn = Number.isFinite(magnetic) ? `${magnetic}deg` : "0deg";

  return (
    <View>
      <View
        accessibilityLabel="Landscape canvas"
        onLayout={(event) => {
          const { width, height } = event.nativeEvent.layout;
          if (width > 0 && height > 0) setSize({ width, height });
        }}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={onGrant}
        onResponderMove={onMove}
        onResponderRelease={onRelease}
        style={{
          height: 380,
          backgroundColor: "#101611",
          borderColor: "#3d4c43",
          borderWidth: 1,
          borderRadius: 16,
          overflow: "hidden"
        }}
      >
        {lines.map((index) => (
          <View
            key={`h${index}`}
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: size.height / 2 + pan.y + index * 48,
              height: 1,
              backgroundColor: index === 0 ? "#3d4c43" : "#243029"
            }}
          />
        ))}
        {lines.map((index) => (
          <View
            key={`v${index}`}
            style={{
              position: "absolute",
              top: 0,
              bottom: 0,
              left: size.width / 2 + pan.x + index * 48,
              width: 1,
              backgroundColor: index === 0 ? "#3d4c43" : "#243029"
            }}
          />
        ))}
        <View style={{ position: "absolute", top: 12, right: 12, alignItems: "center" }}>
          <View style={{ width: 2, height: 28, backgroundColor: "#e2b15a" }} />
          <Text style={{ color: "#e2b15a", fontSize: 12 }}>N</Text>
          <View style={{ width: 2, height: 18, backgroundColor: "#b7d0a4", transform: [{ rotate: magTurn }] }} />
        </View>
        {measure.map((point, index) => {
          const xy = project(point);
          return xy ? <Dot key={`m${index}`} x={xy.x} y={xy.y} color="#f4f0e6" /> : null;
        })}
        {measure.length === 2 ? <MeasureLine from={project(measure[0])} to={project(measure[1])} /> : null}
        {(track || []).map((point, index) => {
          const xy = project(point);
          if (!xy) return null;
          return <Dot key={`t${index}`} x={xy.x} y={xy.y} color="#8f9a8c" />;
        })}
        {(waypoints || []).map((point) => {
          const xy = project(point);
          if (!xy) return null;
          return <Dot key={point.name || `${point.latitude}`} x={xy.x} y={xy.y} color="#e2b15a" label={point.name} />;
        })}
        {held ? <Dot x={project(held)?.x} y={project(held)?.y} color="#b7d0a4" label="You" /> : null}
        <View style={{ position: "absolute", left: 12, bottom: 12 }}>
          <View style={{ width: 80, height: 3, backgroundColor: "#f4f0e6" }} />
          <Text style={{ color: "#f4f0e6", fontSize: 12 }}>{barKm >= 1 ? `${barKm.toFixed(1)} km` : `${Math.round(barKm * 1000)} m`}</Text>
        </View>
      </View>
      <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Zoom in" onPress={() => setZoom((value) => Math.min(80, value * 1.4))} style={zoomStyle}>
          <Text style={{ color: "#1c241e", fontWeight: "700" }}>+</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Zoom out" onPress={() => setZoom((value) => Math.max(4, value / 1.4))} style={zoomStyle}>
          <Text style={{ color: "#1c241e", fontWeight: "700" }}>−</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Clear the measured line" onPress={() => { setMeasure([]); setReadout("Measured line cleared. The canvas is still blank landscape, not a city map."); }} style={[zoomStyle, { backgroundColor: "transparent", borderColor: "#3d4c43", paddingHorizontal: 12 }]}>
          <Text style={{ color: "#f4f0e6" }}>Clear line</Text>
        </Pressable>
      </View>
      <Text style={{ color: "#b7bfb2", marginTop: 8, lineHeight: 20 }}>{readout}</Text>
      <Text style={{ color: "#8f9a8c", marginTop: 4, fontSize: 13 }}>
        {Platform.OS === "web"
          ? "Drag to pan. Tap for a waypoint proposal. Tap a second point for distance and bearing. Long-press for coordinates."
          : "Drag to pan. Tap for a waypoint proposal. Tap a second point for distance and bearing."}
      </Text>
    </View>
  );
}

function MeasureLine({ from, to }) {
  if (!from || !to) return null;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  const angle = `${Math.atan2(dy, dx)}rad`;
  return (
    <View
      style={{
        position: "absolute",
        left: from.x,
        top: from.y,
        width: length,
        height: 2,
        backgroundColor: "#e2b15a",
        transform: [{ rotate: angle }]
      }}
    />
  );
}

function Dot({ x, y, color, label }) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return (
    <View style={{ position: "absolute", left: x - 6, top: y - 6 }}>
      <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: color }} />
      {label ? <Text style={{ color: "#f4f0e6", fontSize: 11 }}>{label}</Text> : null}
    </View>
  );
}

const zoomStyle = {
  minWidth: 48,
  minHeight: 48,
  borderRadius: 12,
  backgroundColor: "#e2b15a",
  alignItems: "center",
  justifyContent: "center"
};
