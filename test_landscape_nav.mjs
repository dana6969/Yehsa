import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { ask } from "./symbolic/ask.js";
import { lockPosition } from "./symbolic/position_lock.js";
import { ensureLocalOwner } from "./symbolic/device_owner.js";
import {
  EARTH_RADIUS_KM,
  compassLabel,
  destinationPoint,
  haversineKm,
  initialBearingDeg,
  magneticToTrue,
  normalizeDegrees,
  reverseBearingDeg,
  sunriseSunset,
  trueToMagnetic
} from "./symbolic/landscape_math.js";
import {
  appendTrackPoint,
  elevationFromLock,
  listWaypoints,
  readLockedPosition,
  saveWaypoint,
  trackSummary,
  tripToWaypoint
} from "./symbolic/landscape_nav.js";

const PHONE = "abcd1234ef567890";
const ROOT = path.dirname(new URL(import.meta.url).pathname);
const EQUATOR_DEGREE_KM = 111.19492664455873;
const NASHVILLE_LA_KM = 2886.444442837983;
const NASHVILLE_LA_BEARING = 274.59357410546284;

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "yehsa-geo-"));
}

function storePaths(dir) {
  return {
    ownerPath: path.join(dir, "owner.json"),
    positionPath: path.join(dir, "position.json"),
    waypointPath: path.join(dir, "waypoints.json"),
    trackPath: path.join(dir, "track.json"),
    phoneId: PHONE,
    ingress: "local"
  };
}

test("haversine and bearing match known spherical fixtures", () => {
  const equator = haversineKm({ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 1 });
  assert.ok(Math.abs(equator - EQUATOR_DEGREE_KM) < 1e-6);
  assert.ok(Math.abs(haversineKm({ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 180 }) - EARTH_RADIUS_KM * Math.PI) < 1e-6);
  const from = { latitude: 36.12, longitude: -86.67 };
  const to = { latitude: 33.94, longitude: -118.4 };
  assert.ok(Math.abs(haversineKm(from, to) - NASHVILLE_LA_KM) < 1e-6);
  assert.ok(Math.abs(initialBearingDeg(from, to) - NASHVILLE_LA_BEARING) < 1e-6);
  assert.ok(Math.abs(initialBearingDeg({ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 1 }) - 90) < 1e-8);
  assert.ok(Math.abs(initialBearingDeg({ latitude: 0, longitude: 0 }, { latitude: 1, longitude: 0 }) - 0) < 1e-8);
  assert.equal(reverseBearingDeg(90), 270);
  assert.equal(reverseBearingDeg(0), 180);
  assert.equal(normalizeDegrees(-90), 270);
  assert.equal(normalizeDegrees(360), 0);
});

test("destination, compass labels, and declination stay on the sphere", () => {
  const landed = destinationPoint({ latitude: 0, longitude: 0 }, 0, EQUATOR_DEGREE_KM);
  assert.ok(Math.abs(landed.latitude - 1) < 1e-6);
  assert.ok(Math.abs(landed.longitude) < 1e-6);
  const back = destinationPoint(landed, reverseBearingDeg(0), EQUATOR_DEGREE_KM);
  assert.ok(Math.abs(back.latitude) < 1e-6);
  assert.ok(Math.abs(back.longitude) < 1e-6);
  assert.equal(compassLabel(0).label, "N");
  assert.equal(compassLabel(45).label, "NE");
  assert.equal(compassLabel(90).label, "E");
  assert.equal(compassLabel(225).label, "SW");
  assert.equal(compassLabel(359).label, "N");
  assert.equal(magneticToTrue(90, 12), 102);
  assert.equal(magneticToTrue(350, 20), 10);
  assert.equal(trueToMagnetic(102, 12), 90);
});

test("sunrise approximation is offline and bounded", () => {
  const equinox = sunriseSunset(0, 0, "2026-03-20");
  assert.equal(equinox.ok, true);
  assert.equal(equinox.polar, null);
  const rise = Number(equinox.sunriseUtc.slice(0, 2)) * 60 + Number(equinox.sunriseUtc.slice(3));
  const set = Number(equinox.sunsetUtc.slice(0, 2)) * 60 + Number(equinox.sunsetUtc.slice(3));
  assert.ok(Math.abs(rise - 6 * 60) < 20, equinox.sunriseUtc);
  assert.ok(Math.abs(set - 18 * 60) < 20, equinox.sunsetUtc);
  const west = sunriseSunset(0, -90, "2026-03-20");
  const westRise = Number(west.sunriseUtc.slice(0, 2)) * 60 + Number(west.sunriseUtc.slice(3));
  assert.ok(Math.abs(westRise - 12 * 60) < 20, west.sunriseUtc);
  const polar = sunriseSunset(78, 0, "2026-06-21");
  assert.equal(polar.polar, "day");
  assert.equal(polar.sunriseUtc, null);
  assert.match(polar.note, /terrain/i);
});

test("waypoints round-trip and the track summary uses time when it is present", () => {
  const dir = tempDir();
  const paths = storePaths(dir);
  ensureLocalOwner({ ownerPath: paths.ownerPath, phoneId: PHONE });
  const saved = saveWaypoint("Camp", { latitude: 45.1, longitude: -69.2, altitude: 120 }, { ...paths, consent: true });
  assert.equal(saved.ok, true);
  assert.equal(saved.waypoint.name, "camp");
  const listed = listWaypoints({ ...paths, consent: true });
  assert.equal(listed.waypoints.length, 1);
  assert.equal(listed.waypoints[0].latitude, 45.1);
  assert.equal(listed.waypoints[0].longitude, -69.2);
  assert.equal(listed.waypoints[0].altitude, 120);
  const trip = tripToWaypoint("camp", { ...paths, consent: true, from: { latitude: 45, longitude: -69 } });
  assert.equal(trip.ok, true);
  assert.ok(trip.distanceKm > 1 && trip.distanceKm < 40);
  assert.equal(typeof trip.bearingDeg, "number");
  assert.equal(trip.waypoint.name, "camp");

  appendTrackPoint({ latitude: 0, longitude: 0, time: "2026-01-01T00:00:00Z" }, { ...paths, consent: true });
  appendTrackPoint({ latitude: 0, longitude: 1, time: "2026-01-01T01:00:00Z" }, { ...paths, consent: true });
  const summary = trackSummary({ ...paths, consent: true });
  assert.equal(summary.points, 2);
  assert.ok(Math.abs(summary.distanceKm - EQUATOR_DEGREE_KM) < 1e-6);
  assert.equal(summary.elapsedMs, 60 * 60 * 1000);
});

test("stored coordinates require consent and exterior callers are denied", async () => {
  const dir = tempDir();
  const paths = storePaths(dir);
  ensureLocalOwner({ ownerPath: paths.ownerPath, phoneId: PHONE });
  await lockPosition({
    ...paths,
    consent: true,
    ingress: "local",
    fix: { latitude: 44.7128, longitude: -69.0123, accuracy: 4, altitude: 88 }
  });

  const hidden = readLockedPosition({ ...paths, consent: false });
  assert.equal(hidden.ok, false);
  assert.equal(hidden.fix, null);
  assert.equal(JSON.stringify(hidden).includes("44.7128"), false);

  const exterior = readLockedPosition({ ...paths, consent: true, ingress: "ble" });
  assert.equal(exterior.ok, false);
  assert.equal(exterior.reason, "exterior denied");
  assert.equal(JSON.stringify(exterior).includes("44.7128"), false);

  const meshSave = saveWaypoint("camp", { latitude: 45.1, longitude: -69.2 }, { ...paths, consent: true, ingress: "mesh" });
  assert.equal(meshSave.reason, "exterior denied");
  assert.equal(fs.existsSync(paths.waypointPath), false);
  assert.equal(JSON.stringify(meshSave).includes("45.1"), false);

  const noConsent = saveWaypoint("camp", { latitude: 45.1, longitude: -69.2 }, { ...paths, consent: false });
  assert.match(noConsent.reason, /opt-in/);
  assert.equal(fs.existsSync(paths.waypointPath), false);
  assert.equal(JSON.stringify(noConsent).includes("45.1"), false);

  const height = elevationFromLock({ ...paths, consent: true });
  assert.equal(height.altitude, 88);
  assert.equal(JSON.stringify(height).includes("44.7128"), false);

  const noHeight = elevationFromLock({ ...paths, consent: false });
  assert.equal(noHeight.altitude, null);
  assert.equal(JSON.stringify(noHeight).includes("44.7128"), false);

  const missingAlt = path.join(dir, "no-alt.json");
  await lockPosition({
    ...paths,
    positionPath: missingAlt,
    consent: true,
    fix: { latitude: 45, longitude: -70, accuracy: 3 }
  });
  const degraded = elevationFromLock({ ...paths, positionPath: missingAlt, consent: true });
  assert.equal(degraded.ok, true);
  assert.equal(degraded.altitude, null);
  assert.match(degraded.reason, /no altitude/);
  assert.equal(JSON.stringify(degraded).includes("45"), false);
});

test("ask answers a landscape question from the notes and can use supplied coordinates", () => {
  const declination = ask("What is magnetic declination?");
  assert.equal(declination.answered, true);
  assert.equal(declination.kind, "landscape");
  assert.match(declination.text, /declination/i);
  assert.match(declination.text, /magnetic/i);
  assert.match(declination.text, /true north/i);
  assert.doesNotMatch(declination.text, / \| /);
  assert.equal(declination.hits.some((hit) => hit.kind === "landscape"), true);

  const course = ask("What is the distance and bearing from 0,0 to 0,1?");
  assert.equal(course.answered, true);
  assert.match(course.text, /111\.19 km/);
  assert.match(course.text, /90° \(E\)/);
  assert.match(course.text, /not a city map/i);

  const src = fs.readFileSync(path.join(ROOT, "symbolic/symbolic_dictionary.js"), "utf8");
  assert.doesNotMatch(src, /landscape_nav|landscape_math|geo_cli/);
  const start = src.indexOf("export function getMappedAction");
  assert.match(src.slice(start, start + 80), /return symbolMap\[symbol\] \|\| null;/);
});

test("ask does not read a position lock without consent or for an exterior caller", async () => {
  const dir = tempDir();
  const paths = storePaths(dir);
  await lockPosition({
    ...paths,
    consent: true,
    ingress: "local",
    fix: { latitude: 44.7128, longitude: -69.0123, accuracy: 4 }
  });
  const refused = ask("How far from here to 0,1?", { ...paths, consent: false });
  assert.equal(refused.answered, true);
  assert.match(refused.text, /opt-in/i);
  assert.equal(refused.text.includes("44.7128"), false);

  const exterior = ask("How far from here to 0,1?", { ...paths, consent: true, ingress: "ble" });
  const exteriorText = `${exterior.text || ""}`;
  assert.equal(exteriorText.includes("44.7128"), false);
  assert.doesNotMatch(exteriorText, /6371/);

  const allowed = ask("How far from here to 0,1?", { ...paths, consent: true, ingress: "local" });
  assert.match(allowed.text, /consented position lock/);
  assert.match(allowed.text, /km/);
  assert.equal(allowed.text.includes("44.7128"), false);
});

test("geo cli prints a great-circle distance", () => {
  const cli = spawnSync(process.execPath, ["symbolic/geo_cli.js", "distance", "--from", "0,0", "--to", "0,1"], {
    cwd: ROOT,
    encoding: "utf8"
  });
  assert.equal(cli.status, 0, cli.stderr);
  const km = Number(cli.stdout.match(/distance_km=([0-9.]+)/)[1]);
  assert.ok(Math.abs(km - EQUATOR_DEGREE_KM) < 1e-4);
  assert.match(cli.stdout, /not a city map/i);
});
