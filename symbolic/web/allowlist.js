// Where Look it up may read. This is the whole list. A source not here is never read or cited.
//   mode "pack":  read from the on-phone ATP pack (assets/atp/atp_sections.json). Works offline too.
//   mode "fetch": fetched by this phone, over https, through fetch_guard.js. Never through a server.
//   mode "link":  shown as a link only. Never fetched, never quoted.

import { GOV_LICENSE, WIKI_LICENSE } from "./sources.js";

export const SOURCES = [
  { id: "atp-3-50.21", name: "ATP 3-50.21, Survival", short: "ATP 3-50.21", agency: "US Army", mode: "pack", license: GOV_LICENSE.name, licenseUrl: GOV_LICENSE.url },
  { id: "atp-4-02.11", name: "ATP 4-02.11, Casualty Response, TCCC, and First Aid", short: "ATP 4-02.11", agency: "US Army", mode: "pack", license: GOV_LICENSE.name, licenseUrl: GOV_LICENSE.url },
  { id: "cdc", name: "CDC", short: "CDC", agency: "Centers for Disease Control and Prevention", mode: "fetch", hosts: ["cdc.gov"], license: GOV_LICENSE.name, licenseUrl: GOV_LICENSE.url },
  { id: "nws", name: "National Weather Service", short: "NWS", agency: "National Weather Service", mode: "fetch", hosts: ["weather.gov"], license: GOV_LICENSE.name, licenseUrl: GOV_LICENSE.url },
  { id: "usda", name: "USDA", short: "USDA", agency: "US Department of Agriculture", mode: "fetch", hosts: ["usda.gov"], license: GOV_LICENSE.name, licenseUrl: GOV_LICENSE.url },
  { id: "usfws", name: "US Fish and Wildlife Service", short: "USFWS", agency: "US Fish and Wildlife Service", mode: "fetch", hosts: ["fws.gov"], license: GOV_LICENSE.name, licenseUrl: GOV_LICENSE.url },
  { id: "nps", name: "National Park Service", short: "NPS", agency: "National Park Service", mode: "fetch", hosts: ["nps.gov"], license: GOV_LICENSE.name, licenseUrl: GOV_LICENSE.url },
  { id: "usfs", name: "US Forest Service", short: "USFS", agency: "US Forest Service", mode: "fetch", hosts: ["fs.usda.gov"], license: GOV_LICENSE.name, licenseUrl: GOV_LICENSE.url },
  { id: "wikipedia", name: "Wikipedia", short: "Wikipedia", agency: "Wikipedia contributors", mode: "fetch", hosts: ["en.wikipedia.org"], license: WIKI_LICENSE.name, licenseUrl: WIKI_LICENSE.url, attribution: "Text from Wikipedia, the free encyclopedia. Authors are listed in each page's history. Excerpted, not changed." },
  { id: "state-wildlife", name: "State wildlife agency", short: "State wildlife", agency: "Your state's wildlife agency", mode: "link", license: "Link only. Not fetched or quoted.", licenseUrl: "" }
];

export function sourceById(id) {
  return SOURCES.find((source) => source.id === id) || null;
}

/** Which allowlisted source a fetched address belongs to (most specific host wins). */
export function sourceForUrl(url) {
  let host;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
  let best = null;
  for (const source of SOURCES) {
    for (const domain of source.hosts || []) {
      if (host === domain || host.endsWith(`.${domain}`)) {
        if (!best || domain.length > best.domain.length) best = { source, domain };
      }
    }
  }
  return best ? best.source : null;
}
