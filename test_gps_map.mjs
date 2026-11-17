import assert from "node:assert/strict";
import test from "node:test";
import {
  applyGpsSample,
  courseTo,
  grantGpsConsent,
  initialGpsMap,
  noteUserPan,
  recenterOnMe,
  startNavigation
} from "./symbolic/gps_map.js";
import { watchPlatformGps } from "./src/phone/location_provider.js";

function locationDouble() {
  const calls = [];
  return {
    calls,
    Location: {
      Accuracy: { BestForNavigation: 6, Highest: 5 },
      requestForegroundPermissionsAsync: async () => {
        calls.push("foreground");
        return { status: "granted" };
      },
      requestBackgroundPermissionsAsync: async () => {
        calls.push("background");
        return { status: "granted" };
      },
      watchPositionAsync: async () => {
        calls.push("watch");
        return { remove() { calls.push("stop"); } };
      }
    }
  };
}

test("GPS is not read without consent", async () => {
  const blocked = applyGpsSample(initialGpsMap(), { latitude: 45, longitude: -69, accuracy: 5, heading: 10 });
  assert.equal(blocked.consent, false);
  assert.equal(blocked.fix, null);
  assert.match(blocked.note, /Consent is off/);

  const fake = locationDouble();
  const stopped = await watchPlatformGps({ consent: false, onUpdate() {}, Location: fake.Location });
  assert.equal(stopped.started, false);
  assert.deepEqual(fake.calls, []);
});

test("a consented watch is foreground only until background is asked for", async () => {
  const fake = locationDouble();
  const started = await watchPlatformGps({ consent: true, onUpdate() {}, Location: fake.Location });
  assert.equal(started.started, true);
  assert.equal(started.foreground, true);
  assert.equal(started.background, false);
  assert.deepEqual(fake.calls, ["foreground", "watch"]);
  started.stop();
  assert.equal(fake.calls.includes("background"), false);

  const extra = locationDouble();
  const background = await watchPlatformGps({ consent: true, background: true, onUpdate() {}, Location: extra.Location });
  assert.equal(background.background, true);
  assert.deepEqual(extra.calls, ["foreground", "background", "watch"]);
});

test("recenter restores follow, and navigation distance counts down", () => {
  let session = grantGpsConsent(initialGpsMap());
  session = applyGpsSample(session, { latitude: 45, longitude: -69, accuracy: 8, heading: 90 });
  assert.equal(session.status, "locked");
  assert.equal(session.follow, true);
  assert.equal(session.shared, false);
  const panned = noteUserPan(session);
  assert.equal(panned.follow, false);
  const back = recenterOnMe(panned);
  assert.equal(back.follow, true);

  session = startNavigation(session, { name: "camp", latitude: 45.02, longitude: -69 });
  const first = session.nav.distanceM;
  assert.ok(first > 1000);
  session = applyGpsSample(session, { latitude: 45.01, longitude: -69, accuracy: 8, heading: 0 });
  assert.ok(session.nav.distanceM < first);
  assert.equal(session.nav.distanceM, courseTo(session.fix, session.target).distanceM);
  assert.ok(session.track.length >= 2);
});
