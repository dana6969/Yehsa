// The phone side of the one weather service (symbolic/weather_service.js).
// - refreshWeather: fetch NWS (Open-Meteo as the fallback) for the held GPS fix, and save the result
//   as the shared record (`hunt.saved`). The Weather card, the Hunt cards, the cone and Ask all read it.
// - answerWeatherQuestion: Ask. Tries to update first (async, with a timeout), then answers from the
//   record. Offline it answers from the saved copy and the barometer, and says how old that is.
// Only runs when the person asks. Nothing here is on the getMappedAction hot path.

import { getHunt, loadHunt, setHunt } from "./hunt_state.js";
import { answerWeather, fetchWeather, weatherIntent, weatherRecord } from "../../symbolic/weather_service.js";

export { weatherIntent };

function heldFix(position) {
  return position?.consent === true && position.status === "locked" && position.fix ? position.fix : null;
}

export function currentRecord({ offline = false } = {}) {
  const hunt = getHunt();
  const hasSensor = (hunt.baro?.readings?.length || 0) > 0;
  return weatherRecord(hunt, { now: Date.now(), hasSensor, offline });
}

export async function refreshWeather({ position, fetchImpl } = {}) {
  await loadHunt();
  const fix = heldFix(position);
  const saved = getHunt().saved;
  const lat = fix ? fix.latitude : saved?.lat;
  const lon = fix ? fix.longitude : saved?.lon;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return { ok: false, reason: "no-location", note: "I need your location to look up the weather. Turn on location in Map, then ask again." };
  }
  const got = await fetchWeather({ lat, lon, fetchImpl: fetchImpl || globalThis.fetch, timeoutMs: 6000 });
  if (!got.ok) {
    return { ok: false, reason: "offline", note: "I could not reach a weather service right now (no signal, or it did not answer)." };
  }
  setHunt("saved", got.snapshot);
  return { ok: true, snapshot: got.snapshot, source: got.source };
}

export async function answerWeatherQuestion(text, { position } = {}) {
  await loadHunt();
  const refreshed = await refreshWeather({ position });
  const record = currentRecord({ offline: !refreshed.ok });
  return answerWeather(text, record, { now: Date.now(), fetched: refreshed.ok, fetchNote: refreshed.ok ? "" : refreshed.note });
}
