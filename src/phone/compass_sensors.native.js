// Magnetometer and accelerometer through expo-sensors. Started only while the Compass
// screen is open and stopped when it closes; nothing is recorded or sent anywhere.
import { Accelerometer, Magnetometer } from "expo-sensors";

export async function compassSensorsAvailable() {
  const [magnetometer, accelerometer] = await Promise.all([
    Magnetometer.isAvailableAsync().catch(() => false),
    Accelerometer.isAvailableAsync().catch(() => false)
  ]);
  return { magnetometer, accelerometer };
}

// Callbacks get plain [x, y, z] arrays: accelerometer in g, magnetometer in microtesla.
export function startCompassSensors({ onAccel, onMag, intervalMs = 50 }) {
  Magnetometer.setUpdateInterval(intervalMs);
  Accelerometer.setUpdateInterval(intervalMs);
  const a = Accelerometer.addListener(({ x, y, z }) => onAccel([x, y, z]));
  const m = Magnetometer.addListener(({ x, y, z }) => onMag([x, y, z]));
  return () => {
    a.remove();
    m.remove();
  };
}
