// Internet radio playback, web and test build: no audio output here.
export function radioPlayerAvailable() {
  return false;
}

export async function playStream() {
  throw new Error("Playback needs the phone app.");
}

export function stopStream() {}

export function pauseStream() {}

export function resumeStream() {}

export function getPlayback() {
  return null;
}

export function subscribePlayback(fn) {
  try { fn(null); } catch {}
  return () => {};
}
