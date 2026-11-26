// Compass sensors, web and test build: no magnetometer is reachable here.
export async function compassSensorsAvailable() {
  return { magnetometer: false, accelerometer: false };
}

export function startCompassSensors() {
  return () => {};
}
