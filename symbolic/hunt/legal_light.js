// Legal shooting light. The common rule is half an hour before sunrise to half an hour after
// sunset, computed on the phone. A state replaces it only when we have read that state's
// current official rule: each override carries its source and season year, and is keyed by
// state, species and season. A state with no verified override gets the common rule plus a
// warning. We do not guess. Always shows the real sunrise and sunset.

import { sunriseSunset } from "../landscape_math.js";

export const COMMON_RULE = { beforeSunriseMin: 30, afterSunsetMin: 30 };
export const COMMON_LABEL = "Common rule, check your state regulations.";
export const UNVERIFIED_WARNING = "Yehsa has not verified this state's current rule. This is the common rule. Read your state's regulations before you hunt.";

// States people can pick when location is off. Centroids are only for working out the sun.
export const STATES = [
  { code: "ME", name: "Maine", lat: 45.25, lon: -69.45 },
  { code: "RI", name: "Rhode Island", lat: 41.68, lon: -71.51 },
  { code: "NH", name: "New Hampshire", lat: 43.68, lon: -71.58 },
  { code: "VT", name: "Vermont", lat: 44.05, lon: -72.71 },
  { code: "MA", name: "Massachusetts", lat: 42.26, lon: -71.8 },
  { code: "CT", name: "Connecticut", lat: 41.62, lon: -72.73 },
  { code: "NY", name: "New York", lat: 42.95, lon: -75.53 },
  { code: "PA", name: "Pennsylvania", lat: 40.88, lon: -77.8 }
];

// Verified overrides only. Order of work: Maine, then RI, NH, VT, MA, CT, NY, PA, each added
// only after the current official regulation is read and cited here.
export const OVERRIDES = [
  {
    state: "ME",
    species: "deer",
    season: "2026-27",
    beforeSunriseMin: 30,
    afterSunsetMin: 30,
    // Maine's chart is built from Bangor sunrise and sunset and used statewide.
    sunAt: { lat: 44.8012, lon: -68.7778, label: "Bangor" },
    noSunday: true,
    notes: [
      "Maine uses Bangor sunrise and sunset for the whole state.",
      "Sunday hunting is illegal in Maine.",
      "Migratory birds, coyote and raccoon have their own hours."
    ],
    source: {
      title: "Maine Dept. of Inland Fisheries and Wildlife, Legal Hunting Hours, and the 2026-27 Maine Hunting quick reference guide",
      url: "https://www1.maine.gov/ifw/hunting-trapping/hunting/laws-rules/legal-hunting-hours.html",
      read: "2026-11-17"
    }
  },
  {
    state: "ME",
    species: "migratory-birds",
    season: "2026-27",
    beforeSunriseMin: 30,
    afterSunsetMin: 0,
    sunAt: { lat: 44.8012, lon: -68.7778, label: "Bangor" },
    noSunday: false,
    notes: ["Migratory game birds: half an hour before sunrise to sunset. Check the migratory game bird time table."],
    source: {
      title: "Maine Dept. of Inland Fisheries and Wildlife, Legal Hunting Hours (exceptions)",
      url: "https://www1.maine.gov/ifw/hunting-trapping/hunting/laws-rules/legal-hunting-hours.html",
      read: "2026-11-17"
    }
  }
];

export const SPECIES = [
  { id: "deer", name: "Deer" },
  { id: "migratory-birds", name: "Ducks and geese" },
  { id: "other", name: "Other game" }
];

export function stateByCode(code) {
  return STATES.find((state) => state.code === code) || null;
}

export function overrideFor(state, species, season) {
  return OVERRIDES.find((entry) => entry.state === state && entry.species === species && (!season || entry.season === season)) || null;
}

export function seasonYearFor(date) {
  const [y, m] = String(date).split("-").map(Number);
  // A hunting season runs fall to winter, so January to June belongs to the season that began last year.
  const start = m < 7 ? y - 1 : y;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

function clock(minutesUtc, offsetMinutes) {
  const [h, m] = String(minutesUtc).split(":").map(Number);
  let total = h * 60 + m + offsetMinutes;
  total = ((total % 1440) + 1440) % 1440;
  return total;
}

export function formatClock(total) {
  const h = Math.floor(total / 60);
  const m = Math.round(total % 60);
  const suffix = h >= 12 ? "PM" : "AM";
  const hour = h % 12 || 12;
  return `${hour}:${String(m).padStart(2, "0")} ${suffix}`;
}

function weekday(date) {
  const [y, m, d] = String(date).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/**
 * Work out today's legal light.
 * place: { lat, lon } or null. state: a code from STATES or "". date: YYYY-MM-DD.
 * offsetMinutes: the phone's offset from UTC for that date (for example -300). nowMinutes: local
 * minutes since midnight now, to say open or closed.
 */
export function legalLight({ place = null, state = "", species = "deer", date, offsetMinutes = 0, nowMinutes = null }) {
  const picked = stateByCode(state);
  const where = place || (picked ? { lat: picked.lat, lon: picked.lon } : null);
  if (!where) return { ok: false, text: "Turn on your location or pick a state to work out legal light." };
  const season = seasonYearFor(date);
  const override = state ? overrideFor(state, species, season) : null;
  const rule = override || COMMON_RULE;
  const sunPlace = override?.sunAt || where;
  const sun = sunriseSunset(sunPlace.lat, sunPlace.lon, date);
  if (!sun.ok || sun.polar) return { ok: false, text: "Sunrise and sunset could not be worked out for that place and date." };
  const sunrise = clock(sun.sunriseUtc, offsetMinutes);
  const sunset = clock(sun.sunsetUtc, offsetMinutes);
  const opens = sunrise - rule.beforeSunriseMin;
  const closes = sunset + rule.afterSunsetMin;
  const sunday = weekday(date) === 0 && override?.noSunday === true;
  let status = "open";
  let next = "";
  if (sunday) {
    status = "no-hunting-today";
    next = "Sunday hunting is illegal in Maine.";
  } else if (nowMinutes != null) {
    if (nowMinutes < opens) { status = "before"; next = `Opens ${formatClock(opens)}.`; }
    else if (nowMinutes > closes) { status = "after"; next = `Closed since ${formatClock(closes)}.`; }
    else { status = "open"; next = `Open until ${formatClock(closes)}.`; }
  }
  const label = override ? `Verified rule, ${picked?.name || override.state}, ${override.season}.` : COMMON_LABEL;
  const basis = override ? `${override.beforeSunriseMin} min before sunrise to ${override.afterSunsetMin ? `${override.afterSunsetMin} min after sunset` : "sunset"}${override.sunAt ? `, using ${override.sunAt.label} sun times` : ""}.` : "30 minutes before sunrise to 30 minutes after sunset.";
  return {
    ok: true,
    verified: Boolean(override),
    state: state || null,
    species,
    season,
    rule: override ? "state" : "common",
    opens,
    closes,
    opensText: formatClock(opens),
    closesText: formatClock(closes),
    sunriseText: formatClock(sunrise),
    sunsetText: formatClock(sunset),
    status,
    next,
    label,
    basis,
    warning: override ? "" : UNVERIFIED_WARNING,
    notes: override?.notes || [],
    source: override?.source || null,
    summary: sunday ? "No hunting today" : `${formatClock(opens)} to ${formatClock(closes)}`
  };
}
