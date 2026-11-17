// One-tap "Download this area". Terrain and elevation only.
// Pure planning and bookkeeping: no network and no storage here.
// The phone downloads only after the person approves the size shown.
// There is no road or street layer in this plan on purpose (it needs the owner's yes).

import { DEM_ATTRIBUTION, DEM_SOURCE, lonLatToTile, regionBox, tileBounds, tilesForBox } from "./dem_tiles.js";
import { formatBytes } from "./map_packs.js";
import { haversineKm } from "./landscape_math.js";

export const AREA_LAYERS = [
  {
    id: "terrain",
    name: "Terrain and elevation",
    kind: "terrarium-png",
    urlTemplate: "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png",
    bytesPerTile: 110 * 1024,
    attribution: DEM_ATTRIBUTION,
    source: DEM_SOURCE,
    license: "Public domain / open data"
  }
];

// Road and street layers are not offered. Kept as an explicit list so a test can prove it.
export const REFUSED_LAYERS = ["roads", "streets", "osm-roads", "transport"];

export const RADIUS_CHOICES_KM = [5, 10, 25, 50];
export const AREA_TILE_CAP = 600;
export const AREA_BYTE_CAP = 160 * 1024 * 1024;

function clampZoom(z) {
  return Math.max(0, Math.min(12, Math.round(Number(z) || 0)));
}

function validBox(box) {
  if (!box) return null;
  const south = Number(box.south);
  const north = Number(box.north);
  const west = Number(box.west);
  const east = Number(box.east);
  if (![south, north, west, east].every(Number.isFinite)) return null;
  if (north <= south || east <= west) return null;
  return {
    south: Math.max(-85, south),
    north: Math.min(85, north),
    west: Math.max(-180, west),
    east: Math.min(180, east)
  };
}

export function areaBox({ box, around } = {}) {
  const direct = validBox(box);
  if (direct) return direct;
  if (!around || !Number.isFinite(Number(around.latitude)) || !Number.isFinite(Number(around.longitude))) return null;
  return validBox(regionBox({ ...around, radiusKm: Number(around.radiusKm) || 10 }));
}

// Pick zooms so the area is sharp but bounded: a wide overview zoom plus detail zooms.
export function zoomsForBox(box) {
  const widthKm = haversineKm({ latitude: box.south, longitude: box.west }, { latitude: box.south, longitude: box.east });
  const span = Math.max(1, widthKm);
  // About 6 detail tiles across the area at the top zoom.
  const top = clampZoom(Math.log2((40075 * Math.cos(((box.north + box.south) / 2) * Math.PI / 180)) / (span / 6)));
  const max = Math.min(12, Math.max(6, top));
  const min = Math.max(4, max - 4);
  const zooms = [];
  for (let z = min; z <= max; z += 1) zooms.push(z);
  return zooms;
}

export function tileKey(tile) {
  return `${tile.z}/${tile.x}/${tile.y}`;
}

export function planArea({ box, around, layers = ["terrain"], zooms, name } = {}) {
  const area = areaBox({ box, around });
  if (!area) {
    return { ok: false, reason: "Pick an area on the map or turn on GPS first. Nothing was downloaded." };
  }
  const refused = layers.filter((id) => REFUSED_LAYERS.includes(id));
  if (refused.length) {
    return { ok: false, reason: "Road and street layers are not in this build. Nothing was downloaded." };
  }
  const chosen = AREA_LAYERS.filter((layer) => layers.includes(layer.id));
  if (!chosen.length) return { ok: false, reason: "No layer was chosen. Nothing was downloaded." };
  const zoomList = (zooms && zooms.length ? zooms.map(clampZoom) : zoomsForBox(area));
  const tiles = [];
  let capped = false;
  for (const layer of chosen) {
    for (const z of zoomList) {
      for (const tile of tilesForBox(area, z)) {
        if (tiles.length >= AREA_TILE_CAP) {
          capped = true;
          break;
        }
        tiles.push({ ...tile, layer: layer.id, key: `${layer.id}:${tileKey(tile)}` });
      }
    }
  }
  const bytes = tiles.reduce((sum, tile) => sum + (AREA_LAYERS.find((layer) => layer.id === tile.layer)?.bytesPerTile || 0), 0);
  const center = { latitude: (area.north + area.south) / 2, longitude: (area.east + area.west) / 2 };
  const id = `area-${center.latitude.toFixed(3)}_${center.longitude.toFixed(3)}_${zoomList[0]}-${zoomList[zoomList.length - 1]}`;
  return {
    ok: true,
    id,
    name: name || `Area near ${center.latitude.toFixed(3)}, ${center.longitude.toFixed(3)}`,
    box: area,
    center,
    zooms: zoomList,
    layers: chosen.map((layer) => layer.id),
    tiles,
    bytes,
    capped,
    attribution: chosen.map((layer) => layer.attribution).join(" "),
    sizeText: `About ${formatBytes(bytes)} for ${tiles.length} terrain and elevation tiles, zoom ${zoomList[0]} to ${zoomList[zoomList.length - 1]}.${capped ? " The area was trimmed to keep the size sane." : ""} No roads or streets. Stored only on this phone. Nothing downloads until you tap Download.`
  };
}

export function tileUrl(tile) {
  const layer = AREA_LAYERS.find((entry) => entry.id === tile.layer);
  if (!layer) return null;
  return layer.urlTemplate.replace("{z}", tile.z).replace("{x}", tile.x).replace("{y}", tile.y);
}

export function checkRoom(plan, { usedBytes = 0, freeBytes = null } = {}) {
  if (!plan?.ok) return { ok: false, reason: plan?.reason || "Nothing to download." };
  if (plan.bytes > AREA_BYTE_CAP) {
    return { ok: false, reason: `About ${formatBytes(plan.bytes)} is too big for one area. Pick a smaller radius. Nothing was downloaded.` };
  }
  if (usedBytes + plan.bytes > AREA_BYTE_CAP * 4) {
    return { ok: false, reason: "Offline areas already use most of the space set aside. Delete an old area first. Nothing was downloaded." };
  }
  if (Number.isFinite(freeBytes) && freeBytes < plan.bytes * 1.5) {
    return { ok: false, reason: `The phone has about ${formatBytes(freeBytes)} free, which is not enough room. Nothing was downloaded.` };
  }
  return { ok: true, reason: null };
}

// A job is plain JSON so it survives an app restart. Resume picks up the tiles not yet done.
export function startJob(plan, { approved } = {}) {
  if (!plan?.ok) return { ok: false, reason: plan?.reason || "Nothing to download." };
  if (approved !== true) return { ok: false, reason: `${plan.sizeText}` };
  return {
    ok: true,
    job: {
      id: plan.id,
      name: plan.name,
      box: plan.box,
      center: plan.center,
      zooms: plan.zooms,
      layers: plan.layers,
      attribution: plan.attribution,
      total: plan.tiles.length,
      bytesEstimate: plan.bytes,
      done: [],
      failed: [],
      receivedBytes: 0,
      status: "downloading",
      approved: true,
      startedAt: new Date().toISOString(),
      finishedAt: null
    }
  };
}

export function pendingTiles(job, plan) {
  const done = new Set(job?.done || []);
  return (plan?.tiles || []).filter((tile) => !done.has(tile.key));
}

export function markTile(job, key, { ok, bytes = 0 } = {}) {
  if (!job) return job;
  if (ok) {
    if (job.done.includes(key)) return job;
    return { ...job, done: [...job.done, key], failed: job.failed.filter((item) => item !== key), receivedBytes: job.receivedBytes + (Number(bytes) || 0) };
  }
  return job.failed.includes(key) ? job : { ...job, failed: [...job.failed, key] };
}

export function pauseJob(job) {
  return job ? { ...job, status: "paused" } : job;
}

export function resumeJob(job) {
  if (!job?.approved) return { ok: false, reason: "That download was never approved. Nothing was downloaded." };
  return { ok: true, job: { ...job, status: "downloading", failed: [] } };
}

export function finishJob(job) {
  if (!job) return job;
  const complete = job.done.length >= job.total;
  return { ...job, status: complete ? "complete" : "partial", finishedAt: new Date().toISOString() };
}

export function jobProgress(job) {
  if (!job) return { fraction: 0, text: "No download." };
  const fraction = job.total ? job.done.length / job.total : 0;
  const words = {
    downloading: "Downloading",
    paused: "Paused",
    complete: "Done",
    partial: "Partly done"
  }[job.status] || "Waiting";
  const fail = job.failed.length ? ` ${job.failed.length} tiles failed and can be retried with Resume.` : "";
  return {
    fraction,
    text: `${words}: ${job.done.length} of ${job.total} tiles, ${formatBytes(job.receivedBytes)}.${fail}`
  };
}

function boxContains(box, point) {
  return point.latitude >= box.south && point.latitude <= box.north && point.longitude >= box.west && point.longitude <= box.east;
}

// Does any saved area (or imported pack with bounds) cover the point or the trip box?
export function coverageFor({ areas = [], packs = [] } = {}, target) {
  const boxes = [
    ...areas.filter((area) => area && area.done?.length && area.box).map((area) => ({ name: area.name, box: area.box, complete: area.status === "complete" })),
    ...packs.filter((pack) => pack?.bounds).map((pack) => ({ name: pack.name, box: pack.bounds, complete: true }))
  ];
  if (!target) {
    return boxes.length
      ? { state: "check", text: `${boxes.length} offline map ${boxes.length === 1 ? "area is" : "areas are"} saved. Turn on GPS or pick the trip area to check it is covered.` }
      : { state: "missing", text: "No offline map area is saved. Download the trip area while you have signal." };
  }
  const points = target.box
    ? [
      { latitude: target.box.south, longitude: target.box.west },
      { latitude: target.box.north, longitude: target.box.east },
      { latitude: (target.box.south + target.box.north) / 2, longitude: (target.box.west + target.box.east) / 2 }
    ]
    : [target];
  const covering = boxes.filter((entry) => points.every((point) => boxContains(entry.box, point)));
  if (covering.length) {
    const partial = covering.every((entry) => !entry.complete);
    return {
      state: partial ? "check" : "ready",
      text: partial ? `${covering[0].name} covers it, but its download is not finished. Tap Resume.` : `Covered by ${covering[0].name}.`
    };
  }
  const touching = boxes.filter((entry) => points.some((point) => boxContains(entry.box, point)));
  if (touching.length) return { state: "check", text: `Only part of the trip is inside ${touching[0].name}. Download the rest.` };
  return { state: "missing", text: "The trip area is not in any offline map on this phone. Download it while you have signal." };
}

export function visibleBox(center, zoom, widthPx = 360, heightPx = 640) {
  if (!center) return null;
  const z = Math.max(1, Math.min(16, Number(zoom) || 10));
  const degPerPx = 360 / (256 * 2 ** z);
  const dLon = (widthPx / 2) * degPerPx;
  const dLat = (heightPx / 2) * degPerPx * Math.cos(center.latitude * Math.PI / 180);
  return validBox({ south: center.latitude - dLat, north: center.latitude + dLat, west: center.longitude - dLon, east: center.longitude + dLon });
}

export { lonLatToTile, tileBounds };

// Runs (or resumes) a job. fetchImpl and saveTile are injected so this has no platform code.
// Tiles already in job.done are skipped, so Resume after a dropped signal costs nothing extra.
export async function runJob({ plan, job, fetchImpl, saveTile, onProgress, signal, concurrency = 3 } = {}) {
  if (!job?.approved) return { job, reason: "That download was never approved. Nothing was downloaded." };
  let current = { ...job, status: "downloading" };
  const queue = pendingTiles(current, plan);
  let stopped = false;
  async function worker() {
    while (queue.length) {
      if (signal?.aborted) {
        stopped = true;
        return;
      }
      const tile = queue.shift();
      try {
        const response = await fetchImpl(tileUrl(tile), signal ? { signal } : undefined);
        if (!response?.ok) throw new Error("status");
        const bytes = new Uint8Array(await response.arrayBuffer());
        if (bytes.length < 8) throw new Error("empty");
        await saveTile(current.id, tile.key, bytes);
        current = markTile(current, tile.key, { ok: true, bytes: bytes.length });
      } catch (err) {
        if (err?.name === "AbortError" || signal?.aborted) {
          stopped = true;
          return;
        }
        current = markTile(current, tile.key, { ok: false });
      }
      if (onProgress) onProgress(current);
    }
  }
  const workers = [];
  for (let i = 0; i < Math.max(1, Math.min(6, concurrency)); i += 1) workers.push(worker());
  await Promise.all(workers);
  current = stopped ? pauseJob(current) : finishJob(current);
  return { job: current, reason: null };
}
