// Turn-by-turn steps from a chain of road pieces (offline router) and the shared step wording.
// Online (OSRM) steps are reworded with the same phrasing in route_online.js.
import { bearingDeg, distanceM, formatDistance, turnAngle } from "./geo.js";

const COMPASS = ["north", "northeast", "east", "southeast", "south", "southwest", "west", "northwest"];
export const compassWord = (deg) => COMPASS[Math.round(((deg % 360) + 360) % 360 / 45) % 8];

/** Tidy an OSM name/ref label: "I 295;US 1" -> "I-295 / US-1". */
export function tidyRoadName(name) {
  if (!name) return "";
  return String(name)
    .replace(/\b(I|US|SR|CR|ME|NH|VT|NY|PA|MA|CT|RI|MI|WI|MN|CO|MT|ID|WY) (\d+[A-Z]?)\b/g, "$1-$2")
    .replace(/\s*;\s*/g, " / ");
}

function roadKeys(name) {
  const keys = new Set();
  if (!name) return keys;
  const m = String(name).match(/^(.*?)\s*\(([^)]*)\)\s*$/);
  const base = m ? m[1] : (/^[A-Z]+[ -]?\d/.test(name) ? "" : name);
  if (base) keys.add(base.toLowerCase());
  const refs = m ? m[2] : (base ? "" : name);
  for (const part of refs.split(/[;/]/)) if (part.trim()) keys.add(part.trim().toLowerCase().replace(/-/g, " "));
  return keys;
}

export function sameRoad(a, b) {
  if ((a || "") === (b || "")) return true;
  const ka = roadKeys(a);
  for (const k of roadKeys(b)) if (ka.has(k)) return true;
  return false;
}

function roadWord(leg) {
  if (leg.name) return leg.name;
  if (leg.roadClass === "track") return "the track";
  if (leg.roadClass === "path") return "the trail";
  if (leg.link) return "the ramp";
  return "the road";
}

function bearingAlong(points, fromEnd, spanM = 30) {
  if (!points || points.length < 2) return null;
  const pts = fromEnd ? [...points].reverse() : points;
  const a = pts[0];
  let b = pts[1];
  let run = 0;
  for (let i = 1; i < pts.length; i++) {
    run += distanceM(pts[i - 1], pts[i]);
    b = pts[i];
    if (run >= spanM) break;
  }
  if (distanceM(a, b) < 1) return null;
  const deg = bearingDeg(a, b);
  return fromEnd ? (deg + 180) % 360 : deg;
}

export function modifierFor(angle) {
  const a = Math.abs(angle);
  const side = angle < 0 ? "left" : "right";
  if (a < 20) return "straight";
  if (a < 45) return `slight ${side}`;
  if (a < 120) return side;
  if (a < 165) return `sharp ${side}`;
  return "uturn";
}

/** Shared wording for a step (also used for online steps). */
export function stepText({ type, modifier, name, roadClass, exitNumber, heading }) {
  const onto = name ? ` onto ${name}` : "";
  switch (type) {
    case "depart":
      return `Head ${heading || "out"}${name ? ` on ${name}` : ""}`;
    case "arrive":
      return modifier === "left" || modifier === "right" ? `Arrive. Your destination is on the ${modifier}` : "Arrive at your destination";
    case "roundabout":
      return exitNumber ? `At the roundabout, take exit ${exitNumber}${onto}` : `At the roundabout, exit${onto || " onto the road"}`;
    case "merge":
      return `Merge${onto}`;
    case "ramp":
      return modifier && modifier !== "straight" ? `Take the ramp on the ${modifier.replace("slight ", "").replace("sharp ", "")}${name ? ` toward ${name}` : ""}` : `Take the ramp${name ? ` toward ${name}` : ""}`;
    case "fork":
      return `Keep ${modifier && modifier.includes("left") ? "left" : "right"}${onto}`;
    case "continue":
      return `Continue${onto || " straight"}`;
    default: {
      if (!modifier || modifier === "straight") return `Continue${onto || " straight"}`;
      if (modifier === "uturn") return `Make a U-turn${onto}`;
      const road = name || (roadClass === "track" ? "the track" : roadClass === "path" ? "the trail" : "");
      return `Turn ${modifier}${road ? ` onto ${road}` : ""}`;
    }
  }
}

/** What to say before a step: "In 800 feet, turn left onto Main Street". */
export function spokenStep(step, distanceToM, opts) {
  const text = step.instruction.charAt(0).toLowerCase() + step.instruction.slice(1);
  if (!Number.isFinite(distanceToM) || distanceToM < 40) return step.instruction.replace(/\(([A-Z]+ ?\d+[A-Z]?)\)/g, "$1");
  return `In ${formatDistance(distanceToM, opts)}, ${text}`.replace(/\bft\b/, "feet").replace(/\bmi\b/, "miles").replace(/\bkm\b/, "kilometers").replace(/\bm\b/, "meters");
}

/**
 * legs: [{ name, roadClass, link, roundabout, distanceM, durationS, startIndex, points }]
 * Returns steps: [{ type, modifier, name, instruction, distanceM, durationS, index, location }]
 */
export function buildSteps(legs, { destination } = {}) {
  const steps = [];
  if (!legs.length) return steps;
  const first = legs[0];
  const h0 = bearingAlong(first.points, false);
  let current = {
    type: "depart",
    modifier: null,
    name: first.name,
    roadClass: first.roadClass,
    heading: h0 == null ? "" : compassWord(h0),
    distanceM: 0,
    durationS: 0,
    index: first.startIndex,
    location: first.points[0]
  };
  let inRoundabout = false;
  let prev = first;
  const push = () => {
    current.name = tidyRoadName(current.name);
    current.instruction = stepText(current);
    steps.push(current);
  };
  current.distanceM += first.distanceM;
  current.durationS += first.durationS;
  if (first.roundabout) inRoundabout = true;
  for (let i = 1; i < legs.length; i++) {
    const leg = legs[i];
    if (inRoundabout && leg.roundabout) {
      current.distanceM += leg.distanceM;
      current.durationS += leg.durationS;
      prev = leg;
      continue;
    }
    const a = bearingAlong(prev.points, true);
    const b = bearingAlong(leg.points, false);
    const angle = a == null || b == null ? 0 : turnAngle(a, b);
    const sameName = sameRoad(leg.name, prev.name) && (leg.name || leg.roadClass === prev.roadClass);
    let type = null;
    if (leg.roundabout && !prev.roundabout) {
      type = "roundabout";
      inRoundabout = true;
    } else if (inRoundabout && !leg.roundabout) {
      // Leaving the roundabout: the roundabout step names the road you exit onto.
      inRoundabout = false;
      if (current.type === "roundabout") {
        current.name = leg.name;
        current.roadClass = leg.roadClass;
        current.distanceM += leg.distanceM;
        current.durationS += leg.durationS;
        prev = leg;
        continue;
      }
    }
    if (!type) {
      if (leg.link && !prev.link) type = "ramp";
      else if (prev.link && !leg.link && (leg.roadClass === "motorway" || leg.roadClass === "trunk")) type = "merge";
      else if (sameName && Math.abs(angle) < 45) type = null;
      else if (Math.abs(angle) < 20 && leg.distanceM < 15 && i + 1 < legs.length) type = null;
      else if (Math.abs(angle) < 20) type = sameName ? null : "continue";
      else type = "turn";
    }
    if (!type) {
      current.distanceM += leg.distanceM;
      current.durationS += leg.durationS;
      prev = leg;
      continue;
    }
    push();
    current = {
      type,
      modifier: modifierFor(angle),
      name: leg.link ? (legs.slice(i).find((l) => !l.link)?.name || "") : leg.name,
      roadClass: leg.roadClass,
      distanceM: leg.distanceM,
      durationS: leg.durationS,
      index: leg.startIndex,
      location: leg.points[0]
    };
    prev = leg;
  }
  push();
  const last = legs[legs.length - 1];
  const end = last.points[last.points.length - 1];
  let side = null;
  if (destination && distanceM(end, destination) > 15) {
    const a = bearingAlong(last.points, true);
    if (a != null) {
      const t = turnAngle(a, bearingDeg(end, destination));
      side = t < 0 ? "left" : "right";
    }
  }
  const arrive = { type: "arrive", modifier: side, name: "", distanceM: 0, durationS: 0, index: last.startIndex + last.points.length - 1, location: end };
  arrive.instruction = stepText(arrive);
  steps.push(arrive);
  return steps;
}
