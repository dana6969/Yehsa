import { pathToFileURL } from "url";
import path from "path";
import {
  SUN_LIMIT,
  compassLabel,
  destinationPoint,
  haversineKm,
  initialBearingDeg,
  magneticToTrue,
  reverseBearingDeg,
  sunriseSunset,
  trueToMagnetic
} from "./landscape_math.js";
import {
  appendTrackPoint,
  elevationFromLock,
  listWaypoints,
  saveWaypoint,
  trackSummary,
  tripToWaypoint
} from "./landscape_nav.js";

function parseArgs(argv) {
  const flags = {};
  const positionals = [];
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--consent") {
      flags.consent = true;
      continue;
    }
    if (token.startsWith("--")) {
      const key = token.slice(2);
      const next = argv[i + 1];
      if (next == null || next.startsWith("--")) flags[key] = true;
      else {
        flags[key] = next;
        i += 1;
      }
      continue;
    }
    positionals.push(token);
  }
  return { flags, positionals };
}

function parsePoint(value) {
  const match = /^(-?\d+(?:\.\d+)?)[,\s]+(-?\d+(?:\.\d+)?)$/.exec(String(value || "").trim());
  if (!match) return null;
  const latitude = Number(match[1]);
  const longitude = Number(match[2]);
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
  return { latitude, longitude };
}

function storeOptions(flags) {
  return {
    consent: flags.consent === true,
    ingress: "local",
    positionPath: typeof flags["position-file"] === "string" ? flags["position-file"] : undefined,
    waypointPath: typeof flags["waypoint-file"] === "string" ? flags["waypoint-file"] : undefined,
    trackPath: typeof flags["track-file"] === "string" ? flags["track-file"] : undefined,
    ownerPath: typeof flags["owner-file"] === "string" ? flags["owner-file"] : undefined
  };
}

function fail(reason) {
  console.error("ok=false");
  console.error(`reason=${reason}`);
  process.exitCode = 1;
}

function num(value, places = 6) {
  return Number(value).toFixed(places);
}

const USAGE = `Offline landscape tools. Spherical earth, radius 6371 km. No network, no city map, no street list.

  geo distance --from lat,lon --to lat,lon
  geo bearing --from lat,lon --to lat,lon
  geo reverse --bearing degrees
  geo destination --from lat,lon --bearing degrees --distance km
  geo compass --degrees degrees
  geo declination --bearing degrees --declination degrees
  geo declination --true degrees --declination degrees
  geo sun --lat degrees --lon degrees --date YYYY-MM-DD
  geo elevation --consent
  geo waypoint save <name> --at lat,lon [--alt meters] --consent
  geo waypoint list --consent
  geo goto <name> (--from lat,lon | --consent)
  geo track add --at lat,lon [--time ISO] [--alt meters] --consent
  geo track summary --consent

East declination is positive. Sunrise is approximate and ignores terrain.
Waypoints, tracks, and elevation read this phone's files only after --consent.
An exterior caller cannot use this command. Position lock stays opt-in.`;

function main(argv) {
  const command = argv[0];
  if (!command || command === "--help" || command === "-h") {
    console.log(USAGE);
    return;
  }
  let sub = null;
  let rest = argv.slice(1);
  if ((command === "waypoint" || command === "track") && rest[0] && !rest[0].startsWith("--")) {
    sub = rest[0];
    rest = rest.slice(1);
  }
  const { flags, positionals } = parseArgs(rest);
  const options = storeOptions(flags);

  if (command === "distance" || command === "bearing" || command === "course") {
    const from = parsePoint(flags.from);
    const to = parsePoint(flags.to);
    if (!from || !to) return fail("need --from lat,lon and --to lat,lon");
    const distanceKm = haversineKm(from, to);
    const bearing = initialBearingDeg(from, to);
    const back = reverseBearingDeg(bearing);
    const rose = compassLabel(bearing);
    if (command !== "bearing") console.log(`distance_km=${num(distanceKm)}`);
    if (command !== "distance") {
      console.log(`initial_bearing_deg=${num(bearing, 2)}`);
      console.log(`reverse_bearing_deg=${num(back, 2)}`);
      console.log(`cardinal=${rose.label}`);
    }
    console.log(`Great-circle ${command} on a 6371 km sphere. Not a road route and not a city map.`);
    return;
  }

  if (command === "reverse") {
    const back = reverseBearingDeg(flags.bearing);
    if (back == null) return fail("need --bearing degrees");
    console.log(`reverse_bearing_deg=${num(back, 2)}`);
    console.log(`cardinal=${compassLabel(back).label}`);
    return;
  }

  if (command === "destination") {
    const from = parsePoint(flags.from);
    const bearing = Number(flags.bearing);
    const distance = Number(flags.distance);
    const point = destinationPoint(from, bearing, distance);
    if (!point) return fail("need --from lat,lon --bearing degrees --distance km");
    console.log(`latitude=${num(point.latitude)}`);
    console.log(`longitude=${num(point.longitude)}`);
    console.log(`Destination after ${distance} km on ${bearing}°. Spherical estimate only.`);
    return;
  }

  if (command === "compass") {
    const rose = compassLabel(flags.degrees);
    if (!rose) return fail("need --degrees");
    console.log(`degrees=${num(rose.degrees, 2)}`);
    console.log(`cardinal=${rose.label}`);
    return;
  }

  if (command === "declination") {
    const declination = Number(flags.declination);
    if (!Number.isFinite(declination)) return fail("need --declination degrees, east positive");
    if (flags.true != null) {
      const magnetic = trueToMagnetic(flags.true, declination);
      if (magnetic == null) return fail("need --true degrees");
      console.log(`magnetic_bearing_deg=${num(magnetic, 2)}`);
    } else {
      const geographic = magneticToTrue(flags.bearing, declination);
      if (geographic == null) return fail("need --bearing degrees");
      console.log(`true_bearing_deg=${num(geographic, 2)}`);
    }
    console.log("Declination is the angle you supply from your map. Nothing is looked up.");
    return;
  }

  if (command === "sun") {
    const sun = sunriseSunset(flags.lat, flags.lon, flags.date);
    if (!sun.ok) return fail(sun.reason);
    console.log(`date=${sun.date}`);
    console.log(`polar=${sun.polar || "none"}`);
    if (sun.sunriseUtc) console.log(`sunrise_utc=${sun.sunriseUtc}`);
    if (sun.sunsetUtc) console.log(`sunset_utc=${sun.sunsetUtc}`);
    console.log(`daylight_hours=${num(sun.daylightHours, 2)}`);
    console.log(SUN_LIMIT);
    return;
  }

  if (command === "elevation") {
    const elevation = elevationFromLock(options);
    if (!elevation.ok) return fail(elevation.reason);
    if (elevation.altitude == null) {
      console.log("altitude_m=");
      console.log(`reason=${elevation.reason}`);
      return;
    }
    console.log(`altitude_m=${elevation.altitude}`);
    console.log("Altitude comes from the consented fix when that fix has one. The horizontal position is not printed.");
    return;
  }

  if (command === "waypoint" && sub === "save") {
    const point = parsePoint(flags.at);
    if (point && flags.alt != null) point.altitude = Number(flags.alt);
    const saved = saveWaypoint(positionals[0], point, options);
    if (!saved.ok) return fail(saved.reason);
    console.log(`waypoint=${saved.waypoint.name}`);
    console.log("Saved on this device only.");
    return;
  }

  if (command === "waypoint" && sub === "list") {
    const listed = listWaypoints(options);
    if (!listed.ok) return fail(listed.reason);
    if (listed.waypoints.length === 0) {
      console.log("waypoints=0");
      return;
    }
    for (const waypoint of listed.waypoints) {
      const alt = waypoint.altitude == null ? "" : ` altitude_m=${waypoint.altitude}`;
      console.log(`waypoint=${waypoint.name} latitude=${waypoint.latitude} longitude=${waypoint.longitude}${alt}`);
    }
    return;
  }

  if (command === "goto" || (command === "waypoint" && sub === "goto")) {
    const name = command === "goto" ? positionals[0] : positionals[0];
    const from = flags.from ? parsePoint(flags.from) : null;
    if (flags.from && !from) return fail("--from must be lat,lon");
    const trip = tripToWaypoint(name, { ...options, from });
    if (!trip.ok) return fail(trip.reason);
    console.log(`waypoint=${trip.waypoint.name}`);
    console.log(`distance_km=${num(trip.distanceKm)}`);
    console.log(`initial_bearing_deg=${num(trip.bearingDeg, 2)}`);
    console.log(`reverse_bearing_deg=${num(trip.reverseDeg, 2)}`);
    console.log(`cardinal=${trip.cardinal}`);
    console.log("Course uses a consented lock or the --from point you typed. Not a road route.");
    return;
  }

  if (command === "track" && sub === "add") {
    const point = parsePoint(flags.at);
    if (!point) return fail("need --at lat,lon");
    if (flags.alt != null) point.altitude = Number(flags.alt);
    if (typeof flags.time === "string") point.time = flags.time;
    const added = appendTrackPoint(point, options);
    if (!added.ok) return fail(added.reason);
    console.log(`points=${added.count}`);
    console.log("Appended to the local track.");
    return;
  }

  if (command === "track" && sub === "summary") {
    const summary = trackSummary(options);
    if (!summary.ok) return fail(summary.reason);
    console.log(`points=${summary.points}`);
    console.log(`distance_km=${num(summary.distanceKm)}`);
    console.log(`elapsed_ms=${summary.elapsedMs == null ? "" : summary.elapsedMs}`);
    if (summary.reason) console.log(`reason=${summary.reason}`);
    return;
  }

  fail(`unknown command ${command}`);
  console.error(USAGE);
}

const entry = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (import.meta.url === entry) main(process.argv.slice(2));
