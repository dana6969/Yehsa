// Picture guide metadata. This module does not read image bytes.
// A picture is never treated as a safe identification.

export const PICTURE_BUDGET_BYTES = 150 * 1024 * 1024;

export const PLANT_CAUTION = "A picture is not a safe identification. Never eat or use a plant from a photo alone. Look-alikes can be toxic.";

const ALLOWED = /^(public domain|cc0|cc zero|cc by( [0-9.]+)?|cc by-sa( [0-9.]+)?)$/i;
const FORBIDDEN = /\b(nc|nd|gfdl|all rights|fair use|no restrictions)\b/i;

export const GUIDE_ENTRIES = [
  { symbol: "yarrow_achillea", title: "Yarrow", domain: "herbology", plant: true },
  { symbol: "willow_bark", title: "Willow", domain: "herbology", plant: true },
  { symbol: "plantain_plantago", title: "Plantain", domain: "herbology", plant: true },
  { symbol: "unknown_plant", title: "Unknown plant", domain: "herbology", plant: true },
  { symbol: "toxic_vs_edible", title: "Plant look of a toxin", domain: "herbology", plant: true },
  { symbol: "splint_immobilize", title: "Splint", domain: "first-aid", plant: false },
  { symbol: "tourniquet_last_resort", title: "Tourniquet", domain: "first-aid", plant: false },
  { symbol: "bleeding_pressure", title: "Pressure on bleeding", domain: "first-aid", plant: false },
  { symbol: "frostbite_warming", title: "Frostbite", domain: "first-aid", plant: false },
  { symbol: "bowline_knot", title: "Bowline", domain: "knots", plant: false },
  { symbol: "fire_lay", title: "Log fire lay", domain: "fire", plant: false },
  { symbol: "shelter_fire", title: "Shelter", domain: "shelter", plant: false },
  { symbol: "weather_cloud", title: "Cumulonimbus", domain: "sky", plant: false },
  { symbol: "watershed", title: "Watershed", domain: "landscape", plant: false },
  { symbol: "signaling", title: "Signaling", domain: "signaling", plant: false }
];

export function licenseAllowed(license) {
  const text = String(license || "").trim();
  if (!text || FORBIDDEN.test(text)) return false;
  return ALLOWED.test(text);
}

export function picturesFor(manifest, symbol) {
  return (manifest?.images || []).filter((image) => image.symbol === symbol);
}

export function guideView(manifest, { query = "", domain = "" } = {}) {
  const words = String(query || "").toLowerCase().split(/\s+/).filter(Boolean);
  return GUIDE_ENTRIES.filter((entry) => {
    if (domain && entry.domain !== domain) return false;
    const hay = `${entry.title} ${entry.domain} ${entry.symbol}`.toLowerCase();
    return words.every((word) => hay.includes(word));
  }).map((entry) => {
    const images = picturesFor(manifest, entry.symbol);
    return {
      ...entry,
      images,
      placeholder: images.length === 0,
      caution: entry.plant ? PLANT_CAUTION : ""
    };
  });
}

export function pictureHealth(manifest, filesOnDisk = []) {
  const present = new Set(filesOnDisk);
  const problems = [];
  for (const image of manifest?.images || []) {
    if (!image.sourceUrl || !image.author || !image.license || !image.attribution) {
      problems.push({ id: image.id, problem: "incomplete", text: "Corpus health: an image is missing a source, author, license, or attribution." });
    }
    if (!licenseAllowed(image.license)) {
      problems.push({ id: image.id, problem: "unlicensed", text: "Corpus health: an image license is missing or not one this guide accepts." });
    }
    if (present.size && image.file && !present.has(image.file)) {
      problems.push({ id: image.id, problem: "broken", text: "Corpus health: an image file is missing from the guide." });
    }
  }
  for (const entry of guideView(manifest)) {
    if (entry.placeholder) {
      problems.push({ id: entry.symbol, problem: "missing", text: `Corpus health: ${entry.title} has no picture yet.` });
    }
  }
  return problems;
}

export function packDecision(totalBytes) {
  const bytes = Number(totalBytes) || 0;
  if (bytes > PICTURE_BUDGET_BYTES) {
    return {
      included: false,
      optionalPack: true,
      bytes,
      text: "The pictures are over 150 MB, so they stay an optional pack and are not inside the core install."
    };
  }
  return {
    included: true,
    optionalPack: false,
    bytes,
    text: "The pictures are small enough to sit with the app. They are not a separate download."
  };
}

const FRIENDLY_SOURCES = {
  herbology: "Plants",
  willow_bark: "Willow",
  plantain_plantago: "Plantain",
  yarrow_achillea: "Yarrow",
  dictionary: "Dictionary",
  survival: "Field notes",
  landscape: "Landscape",
  medical: "First aid",
  about: "About",
  capabilities: "This phone",
  learned: "Learned here",
  spiritual: "Scripture",
  calculator: "Math"
};

export function friendlySource(chip) {
  const key = String(chip || "");
  if (FRIENDLY_SOURCES[key]) return FRIENDLY_SOURCES[key];
  return key.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function imageHref(file) {
  return `/pictures/files/${file}`;
}
