// Offline World Magnetic Model: declination, inclination and field strength at a
// place and date, from the WMM2025 coefficients. Pure math, no network, no sensors.
// Reference: WMM Technical Report (Chulliat et al.). Checked against NOAA's published
// test values in test_compass.mjs.
import { WMM_COEFFICIENTS, WMM_EPOCH, WMM_VALID_UNTIL, WMM_NAME } from "./wmm_coefficients.js";

const N_MAX = 12;
const A_KM = 6378.137; // WGS84 semi-major axis
const F_WGS84 = 1 / 298.257223563;
const E2 = F_WGS84 * (2 - F_WGS84);
const R_REF_KM = 6371.2; // geomagnetic reference radius
const RAD = Math.PI / 180;

let table = null;
function tables() {
  if (table) return table;
  const g = [];
  const h = [];
  const gd = [];
  const hd = [];
  for (let n = 0; n <= N_MAX; n += 1) {
    g.push(new Float64Array(n + 1));
    h.push(new Float64Array(n + 1));
    gd.push(new Float64Array(n + 1));
    hd.push(new Float64Array(n + 1));
  }
  for (const [n, m, gv, hv, gdv, hdv] of WMM_COEFFICIENTS) {
    g[n][m] = gv;
    h[n][m] = hv;
    gd[n][m] = gdv;
    hd[n][m] = hdv;
  }
  // Recursion below runs on Q = P * (n-m)! / (2n-1)!!, so multiply by the factor that
  // turns Q into the Schmidt semi-normalised function used by the model.
  const fact = [1];
  for (let i = 1; i <= 2 * N_MAX + 1; i += 1) fact.push(fact[i - 1] * i);
  const dfact = (k) => { let v = 1; for (let i = k; i > 1; i -= 2) v *= i; return v; };
  const schmidt = [[1]];
  for (let n = 1; n <= N_MAX; n += 1) {
    const row = new Float64Array(n + 1);
    for (let m = 0; m <= n; m += 1) {
      const norm = m === 0 ? 1 : Math.sqrt((2 * fact[n - m]) / fact[n + m]);
      row[m] = (norm * dfact(2 * n - 1)) / fact[n - m];
    }
    schmidt.push(row);
  }
  table = { g, h, gd, hd, schmidt };
  return table;
}

export function decimalYear(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  const start = Date.UTC(d.getUTCFullYear(), 0, 1);
  const end = Date.UTC(d.getUTCFullYear() + 1, 0, 1);
  return d.getUTCFullYear() + (d.getTime() - start) / (end - start);
}

// Field components in nT. Latitude and longitude in degrees (geodetic), height in km above the ellipsoid.
export function magneticField(latDeg, lonDeg, { year = decimalYear(), heightKm = 0 } = {}) {
  const { g, h, gd, hd, schmidt } = tables();
  const dt = year - WMM_EPOCH;
  const lat = Math.max(-89.999, Math.min(89.999, latDeg)) * RAD;
  const lon = lonDeg * RAD;
  // geodetic -> geocentric
  const rc = A_KM / Math.sqrt(1 - E2 * Math.sin(lat) ** 2);
  const p = (rc + heightKm) * Math.cos(lat);
  const z = (rc * (1 - E2) + heightKm) * Math.sin(lat);
  const r = Math.sqrt(p * p + z * z);
  const phi = Math.asin(z / r); // geocentric latitude
  const s = Math.sin(phi);
  const c = Math.cos(phi);

  // Associated Legendre functions of sin(phi) and their derivative with respect to phi.
  const P = [[1]];
  const dP = [[0]];
  for (let n = 1; n <= N_MAX; n += 1) {
    P.push(new Float64Array(n + 1));
    dP.push(new Float64Array(n + 1));
    for (let m = 0; m <= n; m += 1) {
      if (n === m) {
        P[n][n] = c * P[n - 1][n - 1];
        dP[n][n] = -s * P[n - 1][n - 1] + c * dP[n - 1][n - 1];
      } else if (n === 1 && m === 0) {
        P[1][0] = s;
        dP[1][0] = c;
      } else {
        const k = m > n - 2 ? 0 : ((n - 1) ** 2 - m * m) / ((2 * n - 1) * (2 * n - 3));
        const p2 = m > n - 2 ? 0 : P[n - 2][m];
        const d2 = m > n - 2 ? 0 : dP[n - 2][m];
        P[n][m] = s * P[n - 1][m] - k * p2;
        dP[n][m] = c * P[n - 1][m] + s * dP[n - 1][m] - k * d2;
      }
    }
  }
  for (let n = 1; n <= N_MAX; n += 1) {
    for (let m = 0; m <= n; m += 1) {
      P[n][m] *= schmidt[n][m];
      dP[n][m] *= schmidt[n][m];
    }
  }

  let bx = 0;
  let by = 0;
  let bz = 0;
  const ratio = R_REF_KM / r;
  let ratioPow = ratio * ratio; // (a/r)^(n+2) starting at n = 0
  for (let n = 1; n <= N_MAX; n += 1) {
    ratioPow *= ratio;
    for (let m = 0; m <= n; m += 1) {
      const gv = g[n][m] + dt * gd[n][m];
      const hv = h[n][m] + dt * hd[n][m];
      const cm = Math.cos(m * lon);
      const sm = Math.sin(m * lon);
      bx -= ratioPow * (gv * cm + hv * sm) * dP[n][m];
      by += (ratioPow * m * (gv * sm - hv * cm) * P[n][m]) / c;
      bz -= ratioPow * (n + 1) * (gv * cm + hv * sm) * P[n][m];
    }
  }
  // rotate from geocentric to geodetic
  const psi = phi - lat;
  const x = bx * Math.cos(psi) - bz * Math.sin(psi);
  const zz = bx * Math.sin(psi) + bz * Math.cos(psi);
  const hh = Math.hypot(x, by);
  return {
    x,
    y: by,
    z: zz,
    horizontal: hh,
    total: Math.hypot(hh, zz),
    declination: Math.atan2(by, x) / RAD,
    inclination: Math.atan2(zz, hh) / RAD
  };
}

// Declination for the Compass tool. East is positive. `quality` tells the screen how far to trust it.
export function declinationAt(latDeg, lonDeg, date = new Date()) {
  const year = decimalYear(date);
  const f = magneticField(latDeg, lonDeg, { year });
  const horizontalUt = f.horizontal / 1000;
  let quality = "good";
  let note = "";
  if (year < WMM_EPOCH - 0.01 || year > WMM_VALID_UNTIL) {
    quality = "outside";
    note = `${WMM_NAME} is valid ${WMM_EPOCH} to ${WMM_VALID_UNTIL}. This date is outside that range, so the angle is less reliable.`;
  } else if (horizontalUt < 6) {
    quality = "unreliable";
    note = "Near a magnetic pole a compass needle points poorly. Do not trust a magnetic compass here.";
  } else if (horizontalUt < 12) {
    quality = "poor";
    note = "Far north or south the horizontal field is weak. A magnetic compass is less accurate here.";
  }
  return {
    declination: f.declination,
    inclination: f.inclination,
    totalUt: f.total / 1000,
    horizontalUt,
    model: WMM_NAME,
    year,
    quality,
    note
  };
}
