// Drop and wind table from numbers you enter. A point-mass solver with the standard G1 drag
// curve, worked out on the phone. Nothing here is a stored drop chart. The result is an
// estimate. Confirm at the range before hunting.

// Standard G1 drag coefficient by Mach number (the published reference projectile).
export const G1_TABLE = [
  [0.00, 0.2629], [0.05, 0.2558], [0.10, 0.2487], [0.15, 0.2413], [0.20, 0.2344], [0.25, 0.2278],
  [0.30, 0.2214], [0.35, 0.2155], [0.40, 0.2104], [0.45, 0.2061], [0.50, 0.2032], [0.55, 0.2020],
  [0.60, 0.2034], [0.70, 0.2165], [0.725, 0.2230], [0.75, 0.2313], [0.775, 0.2417], [0.80, 0.2546],
  [0.825, 0.2706], [0.85, 0.2901], [0.875, 0.3136], [0.90, 0.3415], [0.925, 0.3734], [0.95, 0.4084],
  [0.975, 0.4448], [1.0, 0.4805], [1.025, 0.5136], [1.05, 0.5427], [1.075, 0.5677], [1.10, 0.5883],
  [1.125, 0.6053], [1.15, 0.6191], [1.20, 0.6393], [1.25, 0.6518], [1.30, 0.6589], [1.35, 0.6621],
  [1.40, 0.6625], [1.45, 0.6607], [1.50, 0.6573], [1.55, 0.6528], [1.60, 0.6474], [1.65, 0.6413],
  [1.70, 0.6347], [1.75, 0.6280], [1.80, 0.6210], [1.85, 0.6141], [1.90, 0.6072], [1.95, 0.6003],
  [2.00, 0.5934], [2.05, 0.5867], [2.10, 0.5804], [2.15, 0.5743], [2.20, 0.5685], [2.25, 0.5630],
  [2.30, 0.5577], [2.35, 0.5527], [2.40, 0.5481], [2.45, 0.5438], [2.50, 0.5397], [2.60, 0.5325],
  [2.70, 0.5264], [2.80, 0.5211], [2.90, 0.5168], [3.00, 0.5133], [3.10, 0.5105], [3.20, 0.5084],
  [3.30, 0.5067], [3.40, 0.5054], [3.50, 0.5040], [3.60, 0.5030], [3.70, 0.5022], [3.80, 0.5016],
  [3.90, 0.5010], [4.00, 0.5006], [4.20, 0.4998], [4.40, 0.4995], [4.60, 0.4992], [4.80, 0.4990],
  [5.00, 0.4988]
];

export const RANGES_YD = [50, 100, 150, 200, 250, 300, 400];
export const FOOTER = "Estimate. Confirm at the range before hunting.";
export const PRESET_LABEL = "From box data, check your ammo";

const FPS_TO_MS = 0.3048;
const YD_TO_M = 0.9144;
const IN_TO_M = 0.0254;
const MPH_TO_MS = 0.44704;
const G = 9.80665;
// Frontal area per mass of the G1 reference projectile (1 lb per square inch), in m2/kg.
const G1_AREA_PER_MASS = Math.PI / (4 * 703.0696);

export function g1Cd(mach) {
  if (mach <= 0) return G1_TABLE[0][1];
  const last = G1_TABLE[G1_TABLE.length - 1];
  if (mach >= last[0]) return last[1];
  let low = 0;
  let high = G1_TABLE.length - 1;
  while (high - low > 1) {
    const mid = (low + high) >> 1;
    if (G1_TABLE[mid][0] <= mach) low = mid; else high = mid;
  }
  const [m0, c0] = G1_TABLE[low];
  const [m1, c1] = G1_TABLE[high];
  return c0 + ((mach - m0) / (m1 - m0)) * (c1 - c0);
}

// Air density (kg/m3) and speed of sound (m/s) from temperature in F and altitude in feet.
export function atmosphere(tempF = 59, altitudeFt = 0) {
  const tempC = (tempF - 32) * 5 / 9;
  const kelvin = tempC + 273.15;
  const meters = altitudeFt * 0.3048;
  const pressure = 101325 * Math.pow(Math.max(0.2, 1 - 2.25577e-5 * meters), 5.25588);
  return { density: pressure / (287.05 * kelvin), sound: 331.3 * Math.sqrt(kelvin / 273.15) };
}

// Presets prefill the numbers only. They are typical published factory loads and every one is
// labelled "From box data, check your ammo". Your own box or chronograph wins.
export const PRESETS = [
  { id: "243", name: ".243 Win", group: "Deer rifles", grains: 100, bc: 0.405, fps: 2960, bullet: "100 gr soft point" },
  { id: "65cm", name: "6.5 Creedmoor", group: "Deer rifles", grains: 143, bc: 0.625, fps: 2700, bullet: "143 gr ELD-X" },
  { id: "270", name: ".270 Win", group: "Deer rifles", grains: 130, bc: 0.409, fps: 3060, bullet: "130 gr soft point" },
  { id: "7mm08", name: "7mm-08", group: "Deer rifles", grains: 139, bc: 0.486, fps: 3000, bullet: "139 gr soft point" },
  { id: "308", name: ".308 Win", group: "Deer rifles", grains: 150, bc: 0.415, fps: 2820, bullet: "150 gr soft point" },
  { id: "3006", name: ".30-06", group: "Deer rifles", grains: 150, bc: 0.415, fps: 2910, bullet: "150 gr soft point" },
  { id: "7rm", name: "7mm Rem Mag", group: "Deer rifles", grains: 150, bc: 0.496, fps: 3110, bullet: "150 gr soft point" },
  { id: "300wm", name: ".300 Win Mag", group: "Deer rifles", grains: 180, bc: 0.507, fps: 2960, bullet: "180 gr soft point" },
  { id: "350l", name: ".350 Legend", group: "Straight-wall and brush guns", grains: 150, bc: 0.221, fps: 2325, bullet: "150 gr soft point" },
  { id: "450b", name: ".450 Bushmaster", group: "Straight-wall and brush guns", grains: 250, bc: 0.19, fps: 2200, bullet: "250 gr polymer tip" },
  { id: "3030", name: ".30-30 Win", group: "Straight-wall and brush guns", grains: 160, bc: 0.33, fps: 2400, bullet: "160 gr polymer tip" },
  { id: "12ga", name: "12 ga rifled slug", group: "Slug and muzzleloader", grains: 437.5, bc: 0.1, fps: 1600, bullet: "1 oz Foster slug" },
  { id: "50ml", name: ".50 cal muzzleloader", group: "Slug and muzzleloader", grains: 250, bc: 0.25, fps: 2150, bullet: "250 gr sabot" }
];

export function presetById(id) {
  return PRESETS.find((preset) => preset.id === id) || null;
}

export function checkInputs(raw) {
  const n = (value, fallback) => (value === "" || value == null ? fallback : Number(value));
  const input = {
    grains: n(raw?.grains, NaN),
    bc: n(raw?.bc, NaN),
    fps: n(raw?.fps, NaN),
    sightIn: n(raw?.sightIn, 1.5),
    zeroYd: n(raw?.zeroYd, 100),
    windMph: n(raw?.windMph, 0),
    windClock: n(raw?.windClock, 3),
    tempF: n(raw?.tempF, 59),
    altitudeFt: n(raw?.altitudeFt, 0)
  };
  const problems = [];
  const need = (ok, text) => { if (!ok) problems.push(text); };
  need(input.grains >= 20 && input.grains <= 1200, "Bullet weight should be 20 to 1200 grains.");
  need(input.bc >= 0.03 && input.bc <= 1.2, "G1 ballistic coefficient should be between 0.03 and 1.2.");
  need(input.fps >= 500 && input.fps <= 4500, "Muzzle velocity should be 500 to 4500 fps.");
  need(input.sightIn >= 0 && input.sightIn <= 6, "Sight height should be 0 to 6 inches.");
  need(input.zeroYd >= 25 && input.zeroYd <= 500, "Zero distance should be 25 to 500 yards.");
  need(input.windMph >= 0 && input.windMph <= 60, "Wind should be 0 to 60 mph.");
  need(input.windClock >= 0 && input.windClock <= 12, "Wind direction is a clock face, 1 to 12.");
  need(input.tempF >= -50 && input.tempF <= 130, "Temperature should be -50 to 130 F.");
  need(input.altitudeFt >= -500 && input.altitudeFt <= 15000, "Altitude should be -500 to 15000 ft.");
  return { ok: problems.length === 0, problems, input };
}

// Fly one shot. Returns samples of [rangeYd, heightIn above bore line at the muzzle, driftIn, fps, seconds].
function fly(input, angleRad, windMph, windClock, maxYd, atmo) {
  const angleOfWind = ((windClock % 12) / 12) * 2 * Math.PI;
  // Clock 12 is a headwind, 3 is from the right, 6 a tailwind, 9 from the left. Air moves the other way.
  const windSpeed = windMph * MPH_TO_MS;
  const windX = -windSpeed * Math.cos(angleOfWind);
  const windZ = -windSpeed * Math.sin(angleOfWind);
  let x = 0;
  let y = 0;
  let z = 0;
  const v0 = input.fps * FPS_TO_MS;
  let vx = v0 * Math.cos(angleRad);
  let vy = v0 * Math.sin(angleRad);
  let vz = 0;
  let t = 0;
  const dt = 0.0004;
  const k = (0.5 * atmo.density * G1_AREA_PER_MASS) / input.bc;
  const samples = [];
  const stops = [];
  for (let yd = 25; yd <= maxYd; yd += 25) stops.push(yd);
  let next = 0;
  const maxX = maxYd * YD_TO_M;
  let guard = 0;
  while (x < maxX + 1 && guard < 400000) {
    guard += 1;
    const rx = vx - windX;
    const ry = vy;
    const rz = vz - windZ;
    const speed = Math.sqrt(rx * rx + ry * ry + rz * rz);
    const drag = k * g1Cd(speed / atmo.sound) * speed;
    const ax = -drag * rx;
    const ay = -drag * ry - G;
    const az = -drag * rz;
    const px = x;
    const py = y;
    const pz = z;
    const pt = t;
    vx += ax * dt;
    vy += ay * dt;
    vz += az * dt;
    x += vx * dt;
    y += vy * dt;
    z += vz * dt;
    t += dt;
    while (next < stops.length && x >= stops[next] * YD_TO_M) {
      const target = stops[next] * YD_TO_M;
      const f = (target - px) / (x - px);
      samples.push([
        stops[next],
        (py + (y - py) * f) / IN_TO_M,
        (pz + (z - pz) * f) / IN_TO_M,
        Math.sqrt(vx * vx + vy * vy + vz * vz) / FPS_TO_MS,
        pt + (t - pt) * f
      ]);
      next += 1;
    }
    if (next >= stops.length) break;
  }
  return samples;
}

function heightAt(samples, yd) {
  const hit = samples.find((sample) => sample[0] === yd);
  return hit ? hit[1] : NaN;
}

// Launch angle that puts the bullet on the line of sight at the zero distance.
export function zeroAngle(input, atmo) {
  const sight = input.sightIn;
  let low = -0.01;
  let high = 0.05;
  const stopsYd = Math.max(25, Math.round(input.zeroYd));
  for (let i = 0; i < 40; i += 1) {
    const mid = (low + high) / 2;
    const samples = flyTo(input, mid, stopsYd, atmo);
    const h = samples ? samples[1] : NaN;
    if (!(h > sight)) low = mid; else high = mid;
  }
  return (low + high) / 2;
}

// Height of the bullet above the bore line at exactly `yd` yards, no wind.
function flyTo(input, angle, yd, atmo) {
  const v0 = input.fps * FPS_TO_MS;
  let x = 0;
  let y = 0;
  let vx = v0 * Math.cos(angle);
  let vy = v0 * Math.sin(angle);
  const dt = 0.0004;
  const k = (0.5 * atmo.density * G1_AREA_PER_MASS) / input.bc;
  const target = yd * YD_TO_M;
  let guard = 0;
  while (x < target && guard < 400000) {
    guard += 1;
    const speed = Math.sqrt(vx * vx + vy * vy);
    const drag = k * g1Cd(speed / atmo.sound) * speed;
    const px = x;
    const py = y;
    vx += -drag * vx * dt;
    vy += (-drag * vy - G) * dt;
    x += vx * dt;
    y += vy * dt;
    if (x >= target) {
      const f = (target - px) / (x - px);
      return [yd, (py + (y - py) * f) / IN_TO_M];
    }
  }
  return null;
}

const MOA_PER_INCH_AT_100YD = 1 / 1.047;

function moa(inches, yd) {
  return (inches / (yd / 100)) * MOA_PER_INCH_AT_100YD;
}

function energy(grains, fps) {
  return (grains * fps * fps) / 450240;
}

// Max point-blank range for a 6 inch vital zone (plus or minus 3 in): the farthest range a dead-on
// hold stays in the zone, with the best zero for that.
export function maxPointBlank(input, atmo, halfZoneIn = 3) {
  let best = { yd: 0, zeroYd: 0 };
  for (let zero = 100; zero <= 350; zero += 25) {
    const trial = { ...input, zeroYd: zero };
    const angle = zeroAngle(trial, atmo);
    const samples = fly(trial, angle, 0, 3, 450, atmo);
    let reach = 0;
    let ok = true;
    for (const sample of samples) {
      if (Math.abs(sample[1] - input.sightIn) > halfZoneIn) { ok = false; }
      if (ok) reach = sample[0];
    }
    if (reach > best.yd) best = { yd: reach, zeroYd: zero };
  }
  return best;
}

export function solve(raw) {
  const checked = checkInputs(raw);
  if (!checked.ok) return { ok: false, problems: checked.problems };
  const input = checked.input;
  const atmo = atmosphere(input.tempF, input.altitudeFt);
  const angle = zeroAngle(input, atmo);
  const still = fly(input, angle, 0, 3, 400, atmo);
  const windy = fly(input, angle, input.windMph, input.windClock, 400, atmo);
  const full = fly(input, angle, 10, 3, 400, atmo);
  const rows = RANGES_YD.map((yd) => {
    const s = still.find((sample) => sample[0] === yd);
    const w = windy.find((sample) => sample[0] === yd);
    const f = full.find((sample) => sample[0] === yd);
    if (!s || !w || !f) return null;
    const drop = s[1] - input.sightIn;
    const drift = w[2];
    const tenDrift = f[2];
    return {
      yd,
      dropIn: round1(drop),
      dropMoa: round1(moa(drop, yd)),
      driftIn: round1(Math.abs(drift)),
      driftMoa: round1(moa(Math.abs(drift), yd)),
      driftSide: Math.abs(drift) < 0.05 ? "" : drift > 0 ? "right" : "left",
      tenMphIn: round1(Math.abs(tenDrift)),
      fps: Math.round(s[3]),
      energyFtLb: Math.round(energy(input.grains, s[3])),
      seconds: Math.round(s[4] * 1000) / 1000
    };
  }).filter(Boolean);
  const mpbr = maxPointBlank(input, atmo);
  return {
    ok: true,
    rows,
    muzzleEnergy: Math.round(energy(input.grains, input.fps)),
    mpbr,
    footer: FOOTER,
    note: input.windMph > 0 ? `Wind ${input.windMph} mph from ${clockWords(input.windClock)}.` : "No wind entered."
  };
}

function round1(value) {
  return Math.round(value * 10) / 10;
}

export function clockWords(clock) {
  const value = Math.round(clock) % 12 || 12;
  const words = { 12: "12 o'clock (head on)", 3: "3 o'clock (your right)", 6: "6 o'clock (behind you)", 9: "9 o'clock (your left)" };
  return words[value] || `${value} o'clock`;
}
