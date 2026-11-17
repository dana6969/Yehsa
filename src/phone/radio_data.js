// Offline radio reference: NOAA Weather Radio transmitters and the national emergency
// (Primary Entry Point) AM and FM stations. Reference data only: nothing here tunes a
// radio, and nothing here claims this phone can. Data comes from NWS and FEMA, see
// tools/radio/build_radio_data.py. Never imported by the knowledge path.
import { haversineKm } from "../../symbolic/landscape_math.js";

// The seven NOAA Weather Radio channels. WX numbers are what many receivers show.
export const NOAA_CHANNELS = [
  { wx: 2, mhz: 162.4 },
  { wx: 4, mhz: 162.425 },
  { wx: 5, mhz: 162.45 },
  { wx: 3, mhz: 162.475 },
  { wx: 6, mhz: 162.5 },
  { wx: 7, mhz: 162.525 },
  { wx: 1, mhz: 162.55 }
];

export const NOAA_TIPS = [
  "Any weather-band radio picks these up: a crank or battery radio marked NOAA, WX or Weather Band. A normal AM/FM radio does not.",
  "Weather radio is line of sight. Expect about 40 miles (65 km) over flat ground and much less in valleys. Go high and extend the antenna.",
  "Pick the strongest of the seven channels, or set SAME alerts to your county code so the radio only wakes for your area."
];

export const EMERGENCY_RADIO_TIPS = [
  "A crank, solar or battery radio that covers AM, FM and weather band is the dependable choice. Keep spare batteries in the pack.",
  "AM (530-1700 kHz) travels far after dark and follows the ground. FM (88-108 MHz) is clearer but nearer. Try both.",
  "Emergency Alert System stations repeat official warnings. Tune the Primary Entry Point station for your state first, then any local news station.",
  "Some phones ship their own FM app that works with wired headphones as the antenna. Yehsa cannot tune FM or AM itself. No phone receives AM."
];

// The Primary Entry Point station covers more than the state it sits in. Wikipedia's EAS
// article lists these shared areas.
export const PEP_COVERS = {
  WBZ: ["MA", "NH", "VT", "RI"],
  WABC: ["NY", "NJ"],
  WTEL: ["PA", "DE"],
  WSM: ["TN", "IN"],
  WLW: ["KY", "OH", "IN"],
  WLS: ["IL", "IN"],
  KMOX: ["IL", "MO"],
  KFYR: ["ND", "SD"],
  KOA: ["CO", "SD"]
};

let nwrCache = null;
let pepCache = null;

// Node tests hand in the parsed JSON; the phone loads the asset on first use.
export function setRadioData({ nwr, pep } = {}) {
  if (nwr) nwrCache = shapeNwr(nwr);
  if (pep) pepCache = shapePep(pep);
}

export function loadNwr() {
  if (!nwrCache) {
    // eslint-disable-next-line global-require
    nwrCache = shapeNwr(require("../../assets/radio/nwr_stations.json"));
  }
  return nwrCache;
}

function shapeNwr(raw) {
  return {
      source: raw.source,
      sourceUrl: raw.sourceUrl,
      fetched: raw.fetched,
      stations: raw.stations.map((r) => ({
        callsign: r[0],
        site: r[1],
        state: r[2],
        mhz: r[3],
        latitude: r[4],
        longitude: r[5],
        degraded: r[6] === 1,
        counties: r[7].map((c) => {
          const [county, st, same] = c.split("|");
          return { county, state: st, same: same.split("/") };
        })
      }))
  };
}

export function loadPep() {
  if (!pepCache) {
    // eslint-disable-next-line global-require
    pepCache = shapePep(require("../../assets/radio/pep_stations.json"));
  }
  return pepCache;
}

function shapePep(raw) {
  return {
    source: raw.source,
    sourceUrl: raw.sourceUrl,
    fetched: raw.fetched,
    stations: raw.stations.map(([callsign, city, state, freq]) => ({ callsign, city, state, freq }))
  };
}

export function channelFor(mhz) {
  return NOAA_CHANNELS.find((c) => Math.abs(c.mhz - mhz) < 0.0006) || null;
}

export function formatMhz(mhz) {
  return `${Number(mhz).toFixed(3)} MHz`;
}

// Nearest weather-radio transmitters to a point. Distance is straight-line; the real signal depends on terrain.
export function nearestWeatherRadio(latitude, longitude, { limit = 4, data = loadNwr() } = {}) {
  return data.stations
    .map((s) => ({ ...s, km: haversineKm({ latitude, longitude }, s), channel: channelFor(s.mhz) }))
    .sort((a, b) => a.km - b.km)
    .slice(0, limit);
}

export function receptionNote(km) {
  if (km <= 40) return "Likely in range outdoors.";
  if (km <= 65) return "Possible with a good antenna and open ground.";
  return "Probably too far. Try a higher spot or another transmitter.";
}

const STATE_NAMES = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado", CT: "Connecticut", DE: "Delaware",
  FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky",
  LA: "Louisiana", ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri",
  MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico", NY: "New York",
  NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island",
  SC: "South Carolina", SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia", WA: "Washington",
  WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming", DC: "District of Columbia", PR: "Puerto Rico", GU: "Guam", VI: "U.S. Virgin Islands"
};

export function stateCode(text) {
  const value = String(text || "").trim();
  if (!value) return "";
  const upper = value.toUpperCase();
  if (STATE_NAMES[upper]) return upper;
  const lower = value.toLowerCase();
  const hit = Object.entries(STATE_NAMES).find(([, name]) => name.toLowerCase() === lower);
  return hit ? hit[0] : "";
}

export function stateName(code) {
  return STATE_NAMES[code] || code;
}

export function weatherRadioInState(code, data = loadNwr()) {
  return data.stations.filter((s) => s.state === code);
}

// SAME county codes for a state, optionally narrowed by a county name.
export function sameCodes(code, countyText = "", data = loadNwr()) {
  const wanted = String(countyText || "").trim().toLowerCase();
  const seen = new Map();
  for (const s of data.stations) {
    for (const c of s.counties) {
      if (c.state !== code) continue;
      if (wanted && !c.county.toLowerCase().includes(wanted)) continue;
      const key = c.county;
      if (!seen.has(key)) seen.set(key, { county: c.county, state: c.state, codes: new Set(), transmitters: [] });
      const entry = seen.get(key);
      c.same.forEach((x) => entry.codes.add(x));
      entry.transmitters.push({ callsign: s.callsign, mhz: s.mhz });
    }
  }
  return [...seen.values()]
    .map((e) => ({ county: e.county, state: e.state, codes: [...e.codes].sort(), transmitters: e.transmitters }))
    .sort((a, b) => a.county.localeCompare(b.county));
}

// Emergency AM/FM stations for a state: the one in the state plus any whose coverage includes it.
export function emergencyStations(code, data = loadPep()) {
  const own = data.stations.filter((s) => s.state === code);
  const shared = data.stations.filter((s) => s.state !== code && (PEP_COVERS[s.callsign] || []).includes(code));
  return [...own, ...shared].map((s) => ({ ...s, covers: PEP_COVERS[s.callsign] || [s.state] }));
}

// FM or AM from FEMA's "1030 AM" / "97.1 FM" text.
export function bandOf(freqText) {
  return /fm/i.test(freqText) ? "FM" : "AM";
}

// Which state a point is nearest to, from the nearest weather-radio transmitter. Offline, approximate.
export function guessState(latitude, longitude, data = loadNwr()) {
  const near = nearestWeatherRadio(latitude, longitude, { limit: 1, data })[0];
  return near && near.km < 250 ? near.state : "";
}
