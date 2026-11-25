// Picture guide metadata. This module does not read image bytes.
// A picture is never treated as a safe identification.
import { entryProfile } from "./understanding/profiles.js";
import { HOWTO_ACTIONS } from "./understanding/understand.js";

import { FIELD_GUIDE_ENTRIES } from "./picture_guide_field.js";
import { HUNTING_GUIDE_ENTRIES } from "./picture_guide_hunting.js";

// Round 4: the whole app may be up to 2 GB. Pictures may use up to 1.5 GB of that, leaving room for the
// app, models, maps, and books. assets/pictures/packs.json lists bytes per category for later Play Asset
// Delivery packs.
export const APP_SIZE_LIMIT_BYTES = 2 * 1024 * 1024 * 1024;
export const PICTURE_BUDGET_BYTES = 1536 * 1024 * 1024;

export const PLANT_CAUTION = "A picture is not a safe identification. Never eat or use a plant from a photo alone. Look-alikes can be toxic.";
export const MUSHROOM_CAUTION = "A picture is not a safe identification. Never eat a wild mushroom from a photo alone. Deadly look-alikes exist.";

const ALLOWED = /^(public domain|cc0|cc zero|cc by( [0-9.]+)?( [a-z]{2})?|cc by-sa( [0-9.]+)?( [a-z]{2})?)$/i;
const FORBIDDEN = /\b(nc|nd|gfdl|all rights|fair use|no restrictions)\b/i;

export const GUIDE_ENTRIES = [
  { symbol: "yarrow_achillea", title: "Yarrow", domain: "herbology", plant: true },
  { symbol: "willow_bark", title: "Willow", domain: "herbology", plant: true },
  { symbol: "plantain_plantago", title: "Plantain", domain: "herbology", plant: true },
  { symbol: "unknown_plant", title: "Unknown plant", domain: "herbology", plant: true },
  { symbol: "toxic_vs_edible", title: "Toxic look-alikes", domain: "herbology", plant: true },
  { symbol: "splint_immobilize", title: "Splint", domain: "first-aid", plant: false },
  { symbol: "tourniquet_last_resort", title: "Tourniquet", domain: "first-aid", plant: false },
  { symbol: "bleeding_pressure", title: "Pressure on bleeding", domain: "first-aid", plant: false },
  { symbol: "frostbite_warming", title: "Frostbite", domain: "first-aid", plant: false },
  { symbol: "recovery_position", title: "Recovery position", domain: "first-aid", plant: false },
  { symbol: "bowline_knot", title: "Bowline", domain: "knots", plant: false },
  { symbol: "square_knot", title: "Square knot", domain: "knots", plant: false },
  { symbol: "taut_line", title: "Taut-line hitch", domain: "knots", plant: false },
  { symbol: "truckers_hitch", title: "Trucker's hitch", domain: "knots", plant: false },
  { symbol: "clove_hitch", title: "Clove hitch", domain: "knots", plant: false },
  { symbol: "figure_eight", title: "Figure-eight", domain: "knots", plant: false },
  { symbol: "two_half_hitches", title: "Two half hitches", domain: "knots", plant: false },
  { symbol: "fire_lay", title: "Log fire lay", domain: "fire", plant: false },
  { symbol: "shelter_fire", title: "Shelter", domain: "shelter", plant: false },
  { symbol: "clean_water_before_care", title: "Boil water", domain: "water", plant: false },
  { symbol: "weather_cloud", title: "Cumulonimbus", domain: "sky", plant: false },
  { symbol: "watershed", title: "Watershed", domain: "landscape", plant: false },
  { symbol: "signaling", title: "Signaling", domain: "signaling", plant: false }
];
// One entry per camera-label note with field photos (plants, trees, mushrooms, animals, tracks and scat),
// plus foraging entries that show example photos. Notes already listed above keep their first entry.
const LISTED = new Set(GUIDE_ENTRIES.map((entry) => entry.symbol));
for (const entry of FIELD_GUIDE_ENTRIES) {
  if (!LISTED.has(entry.symbol)) {
    GUIDE_ENTRIES.push(entry);
    LISTED.add(entry.symbol);
  }
}
for (const entry of HUNTING_GUIDE_ENTRIES) {
  if (!LISTED.has(entry.symbol)) {
    GUIDE_ENTRIES.push(entry);
    LISTED.add(entry.symbol);
  }
}

export function licenseAllowed(license) {
  const text = String(license || "").trim();
  if (!text || FORBIDDEN.test(text)) return false;
  return ALLOWED.test(text);
}

export function picturesFor(manifest, symbol) {
  return (manifest?.images || []).filter((image) => image.symbol === symbol);
}

// Pictures shown under an Ask answer: up to three of the note's own photos, then one look-alike or example,
// so a chat bubble stays short. The picture guide shows all of them.
// R9: a how-to answer (field dressing, cooking, butchering) shows how it is done, not the animal's
// ID photo. Pictures of the animal stay on the ID card and in the picture guide.
const HOWTO_ROLES = new Set(["process", "technique", "tool", "diagram"]);

export function answerPictures(manifest, symbol, limit = 4) {
  const howTo = entryProfile(symbol)?.actions?.some((action) => HOWTO_ACTIONS.has(action));
  const all = picturesFor(manifest, symbol).filter((image) => !howTo || HOWTO_ROLES.has(image.role));
  const own = all.filter((image) => image.role !== "lookalike" && image.role !== "example");
  const other = all.filter((image) => image.role === "lookalike" || image.role === "example");
  const pick = own.slice(0, Math.max(1, limit - (other.length ? 1 : 0)));
  return [...pick, ...other].slice(0, limit);
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
      caution: entry.mushroom ? MUSHROOM_CAUTION : entry.plant ? PLANT_CAUTION : ""
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
      text: "The pictures are over the 1.5 GB picture budget, so they stay an optional pack and are not inside the core install."
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

// One short credit line: "Author, License". The file name and the source link are not repeated.
export function creditLine(image) {
  const author = String(image?.author || "").replace(/&amp;/g, "&").trim().replace(/[.\s]+$/, "").slice(0, 70);
  const license = String(image?.license || "").trim();
  if (!author && !license) return "Credit not recorded";
  if (!license || author.toLowerCase().includes(license.toLowerCase())) return author || license;
  if (!author) return license;
  return `${author}, ${license}`;
}

// Where a picture came from, for the credit line.
export function pictureSourceName(image) {
  const url = String(image?.sourceUrl || "");
  if (/inaturalist\.org/.test(url)) return "iNaturalist";
  if (/commons\.wikimedia\.org/.test(url)) return "Wikimedia Commons";
  return "";
}

export function imageHref(file) {
  return `/pictures/files/${file}`;
}
