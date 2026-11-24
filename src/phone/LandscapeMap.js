import React, { useMemo, useRef, useState } from "react";
import { Platform, Pressable, Text, View } from "react-native";
import { haversineKm, initialBearingDeg } from "../../symbolic/landscape_math.js";
import { courseSentence } from "../../symbolic/nav_sentence.js";
import { colors } from "./ui.js";
import { visibleSegments } from "./map_segments.js";
import { ConePill, MarkPin } from "./hunt_map_ui.js";
import { coneShape } from "../../symbolic/hunt/cone_view.js";

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
  onLongPress,
  follow,
  headingDeg,
  accuracyM,
  nav,
  navTarget,
  onRecenter,
  onUserPan,
  features,
  overlay,
  onMarkPress,
  onTap,
  fill = false
}) {
  const [size, setSize] = useState({ width: 320, height: 360 });
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(18);
  const [measure, setMeasure] = useState([]);
  const [readout, setReadout] = useState("Drag to look around. Tap two points to measure.");
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
    if (current.moved) {
      setPan({ x: current.panX + dx, y: current.panY + dy });
      if (onUserPan) onUserPan();
    }
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
    // The Hunt map takes plain taps for marks, so they do not become waypoint proposals.
    if (onTap) { onTap(point); return; }
    if (held) {
      const km = haversineKm(held, point);
      const bearing = initialBearingDeg(held, point);
      setReadout(courseSentence(km, bearing, "from your GPS fix"));
    }
    const next = [...measure, point].slice(-2);
    setMeasure(next);
    if (next.length === 2) {
      const km = haversineKm(next[0], next[1]);
      const bearing = initialBearingDeg(next[0], next[1]);
      setReadout(courseSentence(km, bearing, "between the two taps"));
    } else if (onWaypoint) {
      onWaypoint(point);
      setReadout("Tap Approve in Ask to save this spot as a waypoint.");
    }
  }

  const barKm = 80 / zoom;
  const lines = [-3, -2, -1, 0, 1, 2, 3];
  const magnetic = Number(declination);
  const magTurn = Number.isFinite(magnetic) ? `${magnetic}deg` : "0deg";
  const rotation = follow === true && Number.isFinite(Number(headingDeg)) ? `${-Number(headingDeg)}deg` : "0deg";
  const accuracyPx = Number.isFinite(Number(accuracyM)) ? (Number(accuracyM) / 1000) * zoom : 0;
  const you = held ? project(held) : null;
  const cone = useMemo(
    () => coneShape(overlay?.polygon, project, size.width, size.height),
    // project depends on these values only.
    [overlay?.polygon, origin?.latitude, origin?.longitude, pan.x, pan.y, zoom, size.width, size.height]
  );
  const coneLabel = overlay?.labelAt ? project(overlay.labelAt) : null;
  const segments = useMemo(
    () => visibleSegments(features, project, size.width, size.height),
    // project depends on these values only.
    [features, origin?.latitude, origin?.longitude, pan.x, pan.y, zoom, size.width, size.height]
  );

  return (
    <View style={fill ? { flex: 1 } : null}>
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
          ...(fill ? { flex: 1, minHeight: 150 } : { height: 380 }),
          backgroundColor: colors.field,
          borderColor: colors.lineStrong,
          borderWidth: 1,
          borderRadius: 16,
          overflow: "hidden"
        }}
      >
        <View style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0, transform: [{ rotate: rotation }] }}>
        {lines.map((index) => (
          <View
            key={`h${index}`}
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: size.height / 2 + pan.y + index * 48,
              height: 1,
              backgroundColor: index === 0 ? colors.lineStrong : colors.line
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
              backgroundColor: index === 0 ? colors.lineStrong : colors.line
            }}
          />
        ))}
        <View style={{ position: "absolute", top: 12, right: 12, alignItems: "center" }}>
          <View style={{ width: 2, height: 28, backgroundColor: colors.brass }} />
          <Text style={{ color: colors.brassText, fontSize: 12 }}>N</Text>
          <View style={{ width: 2, height: 18, backgroundColor: colors.moss, transform: [{ rotate: magTurn }] }} />
        </View>
        {segments.map((segment) => (
          <MeasureLine key={segment.key} from={segment.from} to={segment.to} />
        ))}
        {(features || []).map((feature, index) => {
          if (Array.isArray(feature?.points)) return null;
          const xy = project(feature);
          if (!xy || xy.x < -8 || xy.y < -8 || xy.x > size.width + 8 || xy.y > size.height + 8) return null;
          return <Dot key={`f${index}`} x={xy.x} y={xy.y} color={colors.lineStrong} />;
        })}
        {measure.map((point, index) => {
          const xy = project(point);
          return xy ? <Dot key={`m${index}`} x={xy.x} y={xy.y} color={colors.ink} /> : null;
        })}
        {measure.length === 2 ? <MeasureLine from={project(measure[0])} to={project(measure[1])} /> : null}
        {(track || []).map((point, index) => {
          const xy = project(point);
          if (!xy) return null;
          return <Dot key={`t${index}`} x={xy.x} y={xy.y} color={colors.muted} />;
        })}
        {(waypoints || []).map((point) => {
          const xy = project(point);
          if (!xy) return null;
          return <Dot key={point.name || `${point.latitude}`} x={xy.x} y={xy.y} color={colors.brass} label={point.name} />;
        })}
        {you && accuracyPx > 2 ? (
          <View
            style={{
              position: "absolute",
              left: you.x - accuracyPx,
              top: you.y - accuracyPx,
              width: accuracyPx * 2,
              height: accuracyPx * 2,
              borderRadius: accuracyPx,
              borderWidth: 1,
              borderColor: colors.moss
            }}
          />
        ) : null}
        {cone.dots.map((dot) => (
          <View key={dot.key} pointerEvents="none" style={{ position: "absolute", left: dot.x - 2, top: dot.y - 2, width: 4, height: 4, borderRadius: 2, backgroundColor: overlay?.color || colors.brass, opacity: 0.55 }} />
        ))}
        {cone.edges.map((edge) => <EdgeLine key={edge.key} from={edge.from} to={edge.to} color={overlay?.color || colors.brass} />)}
        {you ? <Dot x={you.x} y={you.y} color={colors.moss} label="You" /> : null}
        {(overlay?.markers || []).map((mark) => {
          const xy = project(mark);
          if (!xy || xy.x < -70 || xy.y < -30 || xy.x > size.width + 70 || xy.y > size.height + 30) return null;
          return (
            <View key={mark.id} style={{ position: "absolute", left: xy.x - 70, top: xy.y - 16 }}>
              <MarkPin mark={mark} onPress={() => onMarkPress?.(mark.id)} />
            </View>
          );
        })}
        {coneLabel && overlay?.label ? (
          <View pointerEvents="none" style={{ position: "absolute", left: coneLabel.x - 95, top: coneLabel.y - 14, width: 190, alignItems: "center" }}>
            <ConePill text={overlay.label} />
          </View>
        ) : null}
        {you && Number.isFinite(Number(headingDeg)) ? (
          <View style={{ position: "absolute", left: you.x - 1, top: you.y - 18, width: 2, height: 18, backgroundColor: colors.ink, transform: [{ rotate: `${Number(headingDeg)}deg` }] }} />
        ) : null}
        {you && navTarget ? <MeasureLine from={you} to={project(navTarget)} /> : null}
        </View>
        <View style={{ position: "absolute", left: 12, bottom: 12 }}>
          <View style={{ width: 80, height: 3, backgroundColor: colors.ink }} />
          <Text style={{ color: colors.ink, fontSize: 12 }}>{barKm >= 1 ? `${barKm.toFixed(1)} km` : `${Math.round(barKm * 1000)} m`}</Text>
        </View>
      </View>
      <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Zoom in" onPress={() => setZoom((value) => Math.min(80, value * 1.4))} style={zoomStyle}>
          <Text style={{ color: colors.brassInk, fontWeight: "700" }}>+</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Zoom out" onPress={() => setZoom((value) => Math.max(4, value / 1.4))} style={zoomStyle}>
          <Text style={{ color: colors.brassInk, fontWeight: "700" }}>−</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Clear the measured line" onPress={() => { setMeasure([]); setReadout("Measurement cleared."); }} style={[zoomStyle, { backgroundColor: "transparent", borderColor: colors.lineStrong, paddingHorizontal: 12 }]}>
          <Text style={{ color: colors.ink }}>Clear line</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Recenter on me" onPress={() => { setPan({ x: 0, y: 0 }); if (onRecenter) onRecenter(); }} style={[zoomStyle, { backgroundColor: "transparent", borderColor: colors.brass, paddingHorizontal: 12 }]}>
          <Text style={{ color: colors.brassText }}>Recenter</Text>
        </Pressable>
      </View>
      {nav ? (
        <Text style={{ color: colors.brassText, marginTop: 8 }}>
          {`${nav.name || "Waypoint"} ${nav.distanceM >= 1000 ? `${(nav.distanceM / 1000).toFixed(2)} km` : `${Math.round(nav.distanceM)} m`} at ${Math.round(nav.bearingDeg)}° ${nav.label || ""}. Not a road.`}
        </Text>
      ) : null}
      <Text style={{ color: colors.muted, marginTop: 8, lineHeight: 20 }}>{readout}</Text>
      <Text style={{ color: colors.muted, marginTop: 4, fontSize: 13 }}>
        {Platform.OS === "web"
          ? "Drag to pan. Tap for a waypoint proposal. Tap a second point for distance and bearing. Long-press for coordinates."
          : "Drag to pan. Tap for a waypoint proposal. Tap a second point for distance and bearing."}
      </Text>
    </View>
  );
}

// A straight line between two canvas points. Positioned by its middle, because a rotation turns a view
// around its center.
function EdgeLine({ from, to, color }) {
  if (!from || !to) return null;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  if (!Number.isFinite(length) || length < 0.5) return null;
  return (
    <View
      pointerEvents="none"
      style={{
        position: "absolute",
        left: (from.x + to.x) / 2 - length / 2,
        top: (from.y + to.y) / 2 - 1,
        width: length,
        height: 2,
        backgroundColor: color,
        transform: [{ rotate: `${Math.atan2(dy, dx)}rad` }]
      }}
    />
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
        backgroundColor: colors.brass,
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
      {label ? <Text style={{ color: colors.ink, fontSize: 11 }}>{label}</Text> : null}
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
