// Internet radio playback, web and test build: no audio output here.
export function radioPlayerAvailable() {
  return false;
}

export async function playStream() {
  throw new Error("Playback needs the phone app.");
}

export function stopStream() {}
