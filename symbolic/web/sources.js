// What Yehsa may ask for, and how the answers are read. No keys, no accounts.
//   Wikipedia (en.wikipedia.org REST): a search, then the summary of the top page. CC BY-SA 4.0.
//   National Weather Service (api.weather.gov): the forecast for a coarse place. US Government work.
//   A page on cdc.gov, weather.gov, usda.gov, fws.gov or nps.gov (named by the person, or from gov_directory.js). US Government work.
// Every result carries its source address, fetch time and license. Nothing here stores anything.

import { guardedFetch, checkUrl } from "./fetch_guard.js";
import { cleanFetched, sensitiveKind } from "./sanitize.js";

export const WIKI_LICENSE = { name: "CC BY-SA 4.0", url: "https://creativecommons.org/licenses/by-sa/4.0/" };
export const GOV_LICENSE = { name: "US Government work (public domain unless the page says otherwise)", url: "https://www.usa.gov/government-works" };

const PII = [
  [/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, ""],
  [/\b(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g, ""],
  [/-?\d{1,3}\.\d{3,}\s*[,;]?\s*-?\d{1,3}\.\d{3,}/g, ""],
  [/\b\d{5}(?:-\d{4})?\b/g, ""],
  [/\b\d{1,5}\s+[A-Z][a-z]+\s+(?:St|Street|Ave|Avenue|Rd|Road|Ln|Lane|Dr|Drive|Blvd|Way|Ct|Court)\b/g, ""],
  [/\b\d{9,}\b/g, ""]
];

const LEAD = /^(?:please |hey |yehsa,? )?(?:can you |could you |would you )?(?:look up|search(?: the (?:internet|web))? for|fetch a page about|tell me about|what is|what are|what's|who is|who was|define|explain)\s+/i;

/**
 * The words that would leave the phone. Personal-looking pieces (emails, phone numbers, coordinates,
 * zip codes, street addresses, long numbers) are removed. Only this text is sent, and the card shows it.
 */
export function outboundQuery(question) {
  let text = String(question || "").replace(/[\r\n\t]+/g, " ");
  for (const [pattern, replacement] of PII) text = text.replace(pattern, replacement);
  // Keep the first sentence, and drop clauses that talk about the person ("my number is...", "I am at...").
  const sentence = text.split(/(?<=[?!.])\s+/).map((part) => part.trim()).find((part) => part.length > 0) || "";
  const clauses = sentence.split(/\s*(?:,|;|\band\b)\s*/i).filter(Boolean);
  const personal = /\b(?:i|i'm|im|i've|me|my|mine|we|our|ours|us)\b/i;
  const impersonal = clauses.filter((clause) => !personal.test(clause));
  text = (impersonal.length ? impersonal : clauses.slice(0, 1)).join(" ");
  text = text.replace(LEAD, "").replace(/[?!.]+$/g, "").replace(/\s+/g, " ").trim();
  if (text.length > 100) text = text.slice(0, 100).replace(/\s+\S*$/, "");
  return text;
}

export function queryAllowed(query) {
  if (!query || query.split(/\s+/).filter((w) => w.length > 2).length === 0) {
    return { ok: false, reason: "I need a few plain words to look up. Nothing was sent." };
  }
  return { ok: true };
}

export function wikipediaSearchUrl(query) {
  return `https://en.wikipedia.org/w/rest.php/v1/search/page?q=${encodeURIComponent(query)}&limit=3`;
}

export function wikipediaSummaryUrl(title) {
  return `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(String(title).replace(/ /g, "_"))}`;
}

export function wikipediaPageUrl(key) {
  return `https://en.wikipedia.org/wiki/${encodeURIComponent(String(key).replace(/ /g, "_"))}`;
}

export function parseSearch(json) {
  const pages = Array.isArray(json?.pages) ? json.pages : [];
  return pages
    .filter((page) => typeof page?.key === "string" && typeof page?.title === "string" && page.key.length < 200)
    .map((page) => ({ key: page.key, title: page.title.slice(0, 120) }))
    .slice(0, 3);
}

/** What the person is told before approving. */
export function describeRequest(kind, { query, place } = {}) {
  if (kind === "wikipedia") {
    return `This sends only the words "${query}" to en.wikipedia.org (a search), then fetches the short summary of the top page. Not sent: your position, your name, your chats, or anything else on this phone.`;
  }
  if (kind === "weather") {
    return `This sends a place rounded to about 1 km (${place}) to api.weather.gov, the National Weather Service. Nothing else is sent. The forecast is shown and not kept.`;
  }
  return `This fetches the page you named. Only its address is sent.`;
}

export async function lookupWikipedia({ fetchImpl, query, now = () => Date.now() }) {
  const ok = queryAllowed(query);
  if (!ok.ok) return ok;
  const search = await guardedFetch({ fetchImpl, url: wikipediaSearchUrl(query), group: "wikipedia", kind: "json" });
  if (!search.ok) return search;
  let pages;
  try {
    pages = parseSearch(JSON.parse(search.text));
  } catch {
    return { ok: false, reason: "Wikipedia sent something I could not read. Nothing was kept." };
  }
  if (pages.length === 0) return { ok: false, reason: "Wikipedia has no page for those words. Nothing was kept." };
  for (const page of pages) {
    const summary = await guardedFetch({ fetchImpl, url: wikipediaSummaryUrl(page.key), group: "wikipedia", kind: "json" });
    if (!summary.ok) continue;
    let data;
    try {
      data = JSON.parse(summary.text);
    } catch {
      continue;
    }
    if (data?.type === "disambiguation" || typeof data?.extract !== "string") continue;
    const cleaned = cleanFetched(data.extract, { html: false, maxChars: 1200 });
    if (cleaned.text.length < 40) continue;
    const title = cleanFetched(String(data.title || page.title), { maxChars: 100 }).text || page.title;
    const description = typeof data.description === "string" ? cleanFetched(data.description, { maxChars: 120 }).text : "";
    return {
      ok: true,
      candidate: {
        title,
        description,
        text: cleaned.text,
        sourceUrl: wikipediaPageUrl(page.key),
        sourceName: "Wikipedia",
        license: WIKI_LICENSE.name,
        licenseUrl: WIKI_LICENSE.url,
        attribution: "Text from Wikipedia, the free encyclopedia. Authors are listed in the page history.",
        fetchedAt: new Date(now()).toISOString(),
        query,
        origin: "wikipedia",
        injectionRemoved: cleaned.removed,
        sensitive: sensitiveKind(cleaned.text, title)
      }
    };
  }
  return { ok: false, reason: "I found pages but none with a usable summary. Nothing was kept." };
}

function titleOf(html) {
  const h1 = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html);
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  return cleanFetched((h1 || title || [null, ""])[1], { html: true, maxChars: 100 }).text.replace(/\s*[|\-–].*$/, "").trim();
}

export async function lookupGovPage({ fetchImpl, url, now = () => Date.now() }) {
  const checked = checkUrl(url, "page");
  if (!checked.ok) return { ok: false, reason: checked.reason };
  const page = await guardedFetch({ fetchImpl, url: checked.url, group: "page", kind: "html" });
  if (!page.ok) return page;
  const main = /<main\b[\s\S]*?<\/main>/i.exec(page.text)?.[0] || /<article\b[\s\S]*?<\/article>/i.exec(page.text)?.[0] || page.text;
  const cleaned = cleanFetched(main, { html: true, maxChars: 1200 });
  if (cleaned.text.length < 60) return { ok: false, reason: "That page had no readable text. Nothing was kept." };
  const title = titleOf(page.text) || new URL(page.finalUrl).hostname;
  return {
    ok: true,
    candidate: {
      title,
      description: "",
      text: cleaned.text,
      sourceUrl: page.finalUrl,
      sourceName: new URL(page.finalUrl).hostname.replace(/^www\./, ""),
      license: GOV_LICENSE.name,
      licenseUrl: GOV_LICENSE.url,
      attribution: "Text from a US government web page.",
      fetchedAt: new Date(now()).toISOString(),
      query: "",
      origin: "gov",
      injectionRemoved: cleaned.removed,
      sensitive: sensitiveKind(cleaned.text, title)
    }
  };
}

export function coarsePlace(latitude, longitude) {
  const lat = Math.round(Number(latitude) * 100) / 100;
  const lon = Math.round(Number(longitude) * 100) / 100;
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { latitude: lat, longitude: lon, label: `${lat.toFixed(2)}, ${lon.toFixed(2)}` };
}

export function parseForecast(json) {
  const periods = Array.isArray(json?.properties?.periods) ? json.properties.periods : [];
  return periods.slice(0, 4).map((p) => ({
    name: cleanFetched(String(p?.name || ""), { maxChars: 40 }).text,
    tempF: Number.isFinite(Number(p?.temperature)) ? Number(p.temperature) : null,
    wind: cleanFetched(`${p?.windDirection || ""} ${p?.windSpeed || ""}`, { maxChars: 40 }).text,
    short: cleanFetched(String(p?.shortForecast || ""), { maxChars: 80 }).text,
    detail: cleanFetched(String(p?.detailedForecast || ""), { maxChars: 300 }).text
  })).filter((p) => p.name);
}

export function forecastText(periods) {
  return periods.slice(0, 3).map((p) => `${p.name}: ${p.short}${p.tempF != null ? `, ${p.tempF} F` : ""}${p.wind ? `, wind ${p.wind}` : ""}.`).join(" ");
}

/** The forecast for a place rounded to about a kilometer. Not stored. */
export async function lookupWeather({ fetchImpl, latitude, longitude, now = () => Date.now() }) {
  const place = coarsePlace(latitude, longitude);
  if (!place) return { ok: false, reason: "I need your position first. Nothing was sent." };
  const points = await guardedFetch({ fetchImpl, url: `https://api.weather.gov/points/${place.latitude.toFixed(2)},${place.longitude.toFixed(2)}`, group: "weather", kind: "json" });
  if (!points.ok) return points;
  let forecastUrl;
  try {
    forecastUrl = JSON.parse(points.text)?.properties?.forecast;
  } catch {
    return { ok: false, reason: "The weather service sent something I could not read." };
  }
  const checked = checkUrl(forecastUrl, "weather");
  if (!checked.ok) return { ok: false, reason: "The weather service pointed somewhere I do not fetch from." };
  const forecast = await guardedFetch({ fetchImpl, url: checked.url, group: "weather", kind: "json" });
  if (!forecast.ok) return forecast;
  let periods;
  try {
    periods = parseForecast(JSON.parse(forecast.text));
  } catch {
    return { ok: false, reason: "The weather service sent something I could not read." };
  }
  if (periods.length === 0) return { ok: false, reason: "The weather service had no forecast for that place." };
  return {
    ok: true,
    periods,
    text: forecastText(periods),
    place,
    sourceUrl: "https://www.weather.gov/",
    sourceName: "National Weather Service",
    license: GOV_LICENSE.name,
    fetchedAt: new Date(now()).toISOString()
  };
}
