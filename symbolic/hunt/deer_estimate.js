// Deer movement estimate: low, medium or high, from reasons the person can read. It follows
// Dana's design: time of day, weather (temperature, pressure, wind, precipitation), season and
// rut, and terrain only where reliable map data exists. The moon is shown for context and has no
// weight. Every factor shows why, and every input is tagged with where it came from (live,
// saved forecast, manual, computed, historical). It is an estimate, not a guarantee, and it is
// the only projection in the app. Rule-based and offline. No model.

import { sunriseSunset } from "../landscape_math.js";

export const DISCLAIMER = "Estimate, not a guarantee.";
export const MOON_NOTE = "Shown for context. It does not change the estimate.";

export const SOURCES = ["live", "saved forecast", "manual", "computed", "historical", "not used"];

function parseDate(date) {
  const [y, m, d] = String(date).split("-").map(Number);
  return { y, m, d };
}

function dayOfYearMonthDay(m, d) {
  return m * 100 + d;
}

function minutesOf(clockUtc, offsetMinutes) {
  const [h, m] = String(clockUtc).split(":").map(Number);
  return (((h * 60 + m + offsetMinutes) % 1440) + 1440) % 1440;
}

// Moon phase from a known new moon (6 Jan 2000, 18:14 UTC). Context only.
export function moonPhase(date) {
  const { y, m, d } = parseDate(date);
  const days = (Date.UTC(y, m - 1, d, 12) - Date.UTC(2000, 0, 6, 18, 14)) / 86400000;
  const cycle = 29.530588853;
  const age = ((days % cycle) + cycle) % cycle;
  const lit = (1 - Math.cos((2 * Math.PI * age) / cycle)) / 2;
  const names = ["New moon", "Waxing crescent", "First quarter", "Waxing gibbous", "Full moon", "Waning gibbous", "Last quarter", "Waning crescent"];
  const name = names[Math.floor(((age / cycle) * 8 + 0.5) % 8)];
  return { name, lit: Math.round(lit * 100), ageDays: Math.round(age * 10) / 10 };
}

// Typical whitetail timing for the northern United States. Region and year shift it.
export const RUT_PHASES = [
  { id: "early", from: [9, 1], to: [10, 24], weight: 0, label: "Early season", why: "Deer follow steady feeding routes between bedding and food." },
  { id: "pre-rut", from: [10, 25], to: [11, 4], weight: 1, label: "Pre-rut", why: "Bucks are scraping and rubbing and start covering more ground." },
  { id: "seeking", from: [11, 5], to: [11, 12], weight: 2, label: "Seeking phase", why: "Bucks cruise for does and move in daylight more than at any other time." },
  { id: "peak", from: [11, 13], to: [11, 25], weight: 1, label: "Peak breeding", why: "Many bucks are paired with does and move less predictably, but daytime movement stays above normal." },
  { id: "post-rut", from: [11, 26], to: [12, 15], weight: 0, label: "Post-rut", why: "Deer are recovering and go back to feeding routes." },
  { id: "late", from: [12, 16], to: [1, 31], weight: 0, label: "Late season", why: "Deer conserve energy and feed in the warmest part of the day when it is cold." }
];

export function seasonPhase(date) {
  const { m, d } = parseDate(date);
  const key = dayOfYearMonthDay(m, d);
  for (const phase of RUT_PHASES) {
    const from = dayOfYearMonthDay(...phase.from);
    const to = dayOfYearMonthDay(...phase.to);
    if (from <= to ? key >= from && key <= to : key >= from || key <= to) return phase;
  }
  return { id: "off", weight: 0, label: "Off season", why: "Outside the usual fall pattern, so the season adds nothing." };
}

function level(total) {
  if (total >= 5) return "High";
  if (total >= 2) return "Medium";
  return "Low";
}

/**
 * input: {
 *   date: "YYYY-MM-DD", lat, lon, offsetMinutes, nowMinutes (local minutes since midnight),
 *   temp: { f, source }, pressure: { band: "steady|slowly|plain|quickly|very-rapidly", delta, source },
 *   wind: { mph, source }, precip: { kind: "none|light|heavy", source },
 *   pressureOnHunt: "high" | "normal" (manual),
 *   terrain: { reliable: true, feature: "saddle|bench|funnel|ridge-top|open", source }
 * }
 * Returns { level, total, factors: [{ id, label, weight, reason, source }], moon, used, of, text }.
 */
export function estimateDeer(input) {
  const factors = [];
  const add = (id, label, weight, reason, source) => factors.push({ id, label, weight, reason, source });

  // Time of day, from computed sun times.
  const sun = Number.isFinite(input.lat) && Number.isFinite(input.lon) ? sunriseSunset(input.lat, input.lon, input.date) : null;
  if (sun?.ok && !sun.polar && Number.isFinite(input.nowMinutes)) {
    const rise = minutesOf(sun.sunriseUtc, input.offsetMinutes || 0);
    const set = minutesOf(sun.sunsetUtc, input.offsetMinutes || 0);
    const now = input.nowMinutes;
    const fromRise = now - rise;
    const toSet = set - now;
    if (Math.abs(fromRise) <= 90 || Math.abs(toSet) <= 90) {
      add("time", "Time of day", 2, "First and last light, when deer usually move between bedding and food.", "computed");
    } else if ((fromRise > 90 && fromRise <= 180) || (toSet > 90 && toSet <= 180)) {
      add("time", "Time of day", 1, "Within a few hours of first or last light, so movement is still common.", "computed");
    } else if (now > rise && now < set) {
      add("time", "Time of day", -1, "Midday. Deer are mostly bedded.", "computed");
    } else {
      add("time", "Time of day", 0, "After dark. Deer move, but it is outside legal light.", "computed");
    }
  } else {
    add("time", "Time of day", 0, "Time of day or place was not available, so it is left out.", "not used");
  }

  // Temperature.
  if (Number.isFinite(input.temp?.f)) {
    const f = input.temp.f;
    let weight = 0;
    let reason = "A mild temperature. It neither pushes deer nor holds them back.";
    if (f > 80) { weight = -2; reason = "Heat keeps deer bedded through the day."; }
    else if (f > 65) { weight = -1; reason = "Warm for the season. Daytime movement slows."; }
    else if (f >= 20 && f <= 45) { weight = 1; reason = "Cool air keeps deer moving longer."; }
    else if (f < 10) { weight = -1; reason = "Very cold. Deer hold still to save energy."; }
    add("temp", "Temperature", weight, reason, input.temp.source || "manual");
  } else {
    add("temp", "Temperature", 0, "No temperature entered, so it is left out.", "not used");
  }

  // Barometric pressure trend.
  if (input.pressure?.band) {
    const band = input.pressure.band;
    const falling = Number(input.pressure.delta) < 0;
    let weight = 0;
    let reason = "Pressure is steady, so it adds nothing.";
    if (band !== "steady" && falling) {
      weight = 1;
      reason = band === "quickly" || band === "very-rapidly"
        ? "Pressure is dropping fast. Many hunters see deer feed hard ahead of a storm."
        : "Pressure is falling. Many hunters see more movement ahead of a front.";
    } else if (band !== "steady" && !falling) {
      weight = 0;
      reason = "Pressure is rising, which often follows a front. Movement is usually normal.";
    }
    add("pressure", "Pressure trend", weight, reason, input.pressure.source || "live");
  } else {
    add("pressure", "Pressure trend", 0, "No pressure trend yet, so it is left out.", "not used");
  }

  // Wind.
  if (Number.isFinite(input.wind?.mph)) {
    const mph = input.wind.mph;
    let weight = 0;
    let reason = "A moderate wind. Deer move normally.";
    if (mph > 25) { weight = -2; reason = "A strong wind. Deer bed down in cover and are hard to see."; }
    else if (mph > 15) { weight = -1; reason = "A gusty wind. Deer move less and are jumpy."; }
    else if (mph < 8) { weight = 1; reason = "Calm to light wind. Deer move freely and sound carries."; }
    add("wind", "Wind", weight, reason, input.wind.source || "manual");
  } else {
    add("wind", "Wind", 0, "No wind entered, so it is left out.", "not used");
  }

  // Precipitation.
  if (input.precip?.kind) {
    const kind = input.precip.kind;
    const weight = kind === "heavy" ? -1 : 0;
    const reason = kind === "heavy"
      ? "Heavy rain or snow. Deer sit tight until it eases."
      : kind === "light" ? "Light rain or snow barely slows deer." : "No precipitation, so it adds nothing.";
    add("precip", "Rain or snow", weight, reason, input.precip.source || "manual");
  } else {
    add("precip", "Rain or snow", 0, "No rain or snow entered, so it is left out.", "not used");
  }

  // Season and rut.
  const phase = seasonPhase(input.date);
  add("season", `Season: ${phase.label}`, phase.weight, `${phase.why} Typical timing for the northern US. Your area and year can differ.`, "historical");

  // Hunting pressure, only when the person says so.
  if (input.pressureOnHunt === "high") {
    add("pressure-hunt", "Hunting pressure", -1, "You said many hunters are out. Deer shift to thick cover in daylight.", "manual");
  }

  // Terrain, only with reliable map data.
  if (input.terrain?.reliable === true && input.terrain.feature) {
    const funnel = ["saddle", "bench", "funnel"].includes(input.terrain.feature);
    add("terrain", "Terrain", funnel ? 1 : 0, funnel
      ? `This spot sits on a ${input.terrain.feature}, which channels deer along it.`
      : "The ground here does not funnel movement.", input.terrain.source || "computed");
  } else {
    add("terrain", "Terrain", 0, "Not used. There is no reliable map data for this spot.", "not used");
  }

  const moon = moonPhase(input.date);
  const total = factors.reduce((sum, factor) => sum + factor.weight, 0);
  const used = factors.filter((factor) => factor.source !== "not used").length;
  const result = level(total);
  return {
    level: result,
    total,
    factors,
    moon: { ...moon, note: MOON_NOTE, weight: 0 },
    used,
    of: factors.length,
    disclaimer: DISCLAIMER,
    text: `${result}. ${DISCLAIMER}`
  };
}
