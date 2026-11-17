import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { magneticField, declinationAt, decimalYear } from "./src/phone/wmm.js";
import { tiltHeading, chooseAxis, angleDiff, norm360, createCompassFilter, accuracyLevel, createCalibration, fitSphere, steerText, backBearing, trueFromMagnetic, magneticFromTrue, circularSpread, measuredDip, applyOffset, openCalibration, pointName } from "./src/phone/compass_math.js";

const RAD = Math.PI / 180;
// Build device-frame vectors for a phone at yaw psi (clockwise from north), pitch, roll.
function deviceVectors(psi, pitch, roll, { inclination = 66, total = 52, g = 1 } = {}) {
  const p = psi * RAD, th = pitch * RAD, ph = roll * RAD;
  // world = (East, North, Up)
  let x = [Math.cos(p), -Math.sin(p), 0];
  let y = [Math.sin(p), Math.cos(p), 0];
  let z = [0, 0, 1];
  const add = (a, b, ka, kb) => [a[0] * ka + b[0] * kb, a[1] * ka + b[1] * kb, a[2] * ka + b[2] * kb];
  const y1 = add(y, z, Math.cos(th), Math.sin(th));
  const z1 = add(z, y, Math.cos(th), -Math.sin(th));
  const x2 = add(x, z1, Math.cos(ph), -Math.sin(ph));
  const z2 = add(z1, x, Math.cos(ph), Math.sin(ph));
  const proj = (w) => [w[0] * x2[0] + w[1] * x2[1] + w[2] * x2[2], w[0] * y1[0] + w[1] * y1[1] + w[2] * y1[2], w[0] * z2[0] + w[1] * z2[1] + w[2] * z2[2]];
  const I = inclination * RAD;
  const field = [0, total * Math.cos(I), -total * Math.sin(I)]; // north, down
  return { accel: proj([0, 0, g]), mag: proj(field) };
}

test("WMM2025 matches NOAA's published test values", () => {
  const lines = fs.readFileSync(new URL("./tools/compass/WMM2025_TEST_VALUES.txt", import.meta.url), "utf8").split("\n");
  let rows = 0;
  for (const l of lines) {
    if (!l.trim() || l.startsWith("#")) continue;
    const [date, h, lat, lon, X, Y, Z, H, F, I, D] = l.trim().split(/\s+/).map(Number);
    const f = magneticField(lat, lon, { year: date, heightKm: h });
    assert.ok(Math.abs(f.declination - D) < 0.02, `declination at ${lat},${lon}`);
    assert.ok(Math.abs(f.inclination - I) < 0.02, `inclination at ${lat},${lon}`);
    assert.ok(Math.abs(f.total - F) < 2, `total at ${lat},${lon}`);
    assert.ok(Math.abs(f.x - X) < 2 && Math.abs(f.y - Y) < 2 && Math.abs(f.z - Z) < 2);
    rows += 1;
  }
  assert.ok(rows >= 12);
});

test("declination is sensible for New England and Rhode Island in late 2026", () => {
  const d = declinationAt(41.82, -71.41, new Date("2026-11-17T12:00:00Z"));
  assert.ok(d.declination < -11 && d.declination > -17, `RI declination ${d.declination}`);
  assert.equal(d.quality, "good");
  const far = declinationAt(88, 0, new Date("2026-11-17T12:00:00Z"));
  assert.notEqual(far.quality, "good");
  const old = declinationAt(41.82, -71.41, new Date("2035-01-01T12:00:00Z"));
  assert.equal(old.quality, "outside");
  assert.ok(decimalYear(new Date("2026-07-02T00:00:00Z")) > 2026.49 && decimalYear(new Date("2026-07-02T00:00:00Z")) < 2026.51);
});

test("tilt-compensated heading is recovered flat, tilted and upright", () => {
  for (const psi of [0, 37, 90, 181, 270, 333]) {
    for (const [pitch, roll] of [[0, 0], [15, 10], [-20, 25], [30, -30]]) {
      const { accel, mag } = deviceVectors(psi, pitch, roll);
      const h = tiltHeading(accel, mag, "flat");
      assert.ok(Math.abs(angleDiff(psi, h)) < 0.01, `flat psi=${psi} pitch=${pitch} roll=${roll} got ${h}`);
    }
  }
});

test("held upright, the back of the phone gives the heading", () => {
  for (const psi of [0, 45, 135, 220, 300]) {
    const { accel, mag } = deviceVectors(psi, 90, 0);
    assert.equal(chooseAxis(accel, "flat"), "upright");
    const h = tiltHeading(accel, mag, "upright");
    assert.ok(Math.abs(angleDiff(psi, h)) < 0.1, `upright psi=${psi} got ${h}`);
  }
  assert.equal(chooseAxis([0, 0, 1], "upright"), "flat");
});

test("filter smooths noise and still follows a turn", () => {
  const filter = createCompassFilter();
  let seed = 7;
  const noise = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5);
  let last = null;
  for (let i = 0; i < 80; i += 1) {
    const { accel, mag } = deviceVectors(100, 8, -5);
    filter.pushAccel(accel.map((v) => v + noise() * 0.06));
    filter.pushMag(mag.map((v) => v + noise() * 2.5));
    last = filter.update(1000 + i * 50);
  }
  assert.ok(Math.abs(angleDiff(100, last)) < 3, `settled at ${last}`);
  for (let i = 0; i < 30; i += 1) {
    const { accel, mag } = deviceVectors(200, 8, -5);
    filter.pushAccel(accel);
    filter.pushMag(mag);
    last = filter.update(5000 + i * 50);
  }
  assert.ok(Math.abs(angleDiff(200, last)) < 6, `followed to ${last}`);
  // wrap-around
  const f2 = createCompassFilter();
  for (let i = 0; i < 60; i += 1) {
    const { accel, mag } = deviceVectors(359, 0, 0);
    f2.pushAccel(accel); f2.pushMag(mag); last = f2.update(i * 50);
  }
  assert.ok(Math.abs(angleDiff(359, last)) < 1);
});

test("true and magnetic conversions and back bearing", () => {
  assert.equal(Math.round(trueFromMagnetic(100, -14)), 86);
  assert.equal(Math.round(magneticFromTrue(86, -14)), 100);
  assert.equal(backBearing(10), 190);
  assert.equal(backBearing(300), 120);
  assert.equal(norm360(-10), 350);
  assert.equal(pointName(0), "N");
  assert.equal(pointName(350), "N");
  assert.equal(pointName(135), "SE");
  assert.deepEqual(steerText(10, 20).text, "Turn right 10°");
  assert.deepEqual(steerText(10, 350).text, "Turn left 20°");
  assert.equal(steerText(10, 12).onTarget, true);
});

test("accuracy indicator reflects field strength, dip and jitter", () => {
  const good = deviceVectors(50, 5, 5, { inclination: 66, total: 52 });
  const expected = { totalUt: 52, inclination: 66 };
  assert.equal(accuracyLevel({ ...good, jitter: 1, expected }).level, "high");
  const weak = deviceVectors(50, 5, 5, { inclination: 66, total: 20 });
  assert.ok(["low", "unreliable"].includes(accuracyLevel({ ...weak, jitter: 1, expected }).level));
  const wrongDip = deviceVectors(50, 5, 5, { inclination: 30, total: 52 });
  assert.ok(accuracyLevel({ ...wrongDip, jitter: 1, expected }).level !== "high");
  assert.equal(accuracyLevel({ ...good, jitter: 9, expected }).level, "medium");
  assert.equal(accuracyLevel({ mag: null, accel: null }).level, "unknown");
  assert.ok(Math.abs(measuredDip(good.accel, good.mag) - 66) < 0.01);
});

test("figure-8 calibration finds a hard-iron offset", () => {
  const offset = [9, -14, 6];
  const cal = createCalibration({ expectedUt: 50 });
  let seed = 3;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  // sweep orientations over the whole sphere
  for (let i = 0; i < 400; i += 1) {
    const u = rnd() * 2 - 1;
    const t = rnd() * Math.PI * 2;
    const s = Math.sqrt(1 - u * u);
    const v = [50 * s * Math.cos(t) + offset[0] + (rnd() - 0.5) * 0.8, 50 * s * Math.sin(t) + offset[1] + (rnd() - 0.5) * 0.8, 50 * u + offset[2] + (rnd() - 0.5) * 0.8];
    cal.add(v);
  }
  assert.ok(cal.progress() > 0.95);
  const done = cal.finish();
  assert.equal(done.ok, true);
  for (let i = 0; i < 3; i += 1) assert.ok(Math.abs(done.offset[i] - offset[i]) < 0.5);
  assert.ok(Math.abs(done.radius - 50) < 1);
  assert.deepEqual(applyOffset([10, 20, 30], [1, 2, 3]), [9, 18, 27]);
  assert.equal(openCalibration(JSON.stringify({ offset: [1, 2, 3], savedAt: "x" })).offset[2], 3);
  assert.equal(openCalibration("nope"), null);
});

test("calibration refuses a phone that was barely moved or is next to metal", () => {
  const still = createCalibration({ expectedUt: 50 });
  for (let i = 0; i < 100; i += 1) still.add([10 + i * 0.5, 20, 30]);
  assert.equal(still.finish().ok, false);
  const noisy = createCalibration({ expectedUt: 50 });
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 400; i += 1) {
    const u = rnd() * 2 - 1, t = rnd() * 6.283, s = Math.sqrt(1 - u * u), r = 50 + (rnd() - 0.5) * 40;
    noisy.add([r * s * Math.cos(t), r * s * Math.sin(t), r * u]);
  }
  assert.equal(noisy.finish().ok, false);
  assert.ok(fitSphere([[1, 2, 3]]) === null);
});

test("circular spread handles the wrap at north", () => {
  assert.ok(circularSpread([359, 1, 358, 2, 0, 359]) < 3);
  assert.ok(circularSpread([0, 90, 180, 270, 45, 135]) > 40);
});
