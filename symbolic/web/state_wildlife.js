// State wildlife agencies. Link only: Yehsa never fetches or quotes these pages. Seasons, tags and
// rules change every year and differ by state, so the answer points there instead of guessing.

export const STATE_WILDLIFE = {
  AL: ["Alabama", "Alabama Wildlife and Freshwater Fisheries", "https://www.outdooralabama.com/"],
  AK: ["Alaska", "Alaska Department of Fish and Game", "https://www.adfg.alaska.gov/"],
  AZ: ["Arizona", "Arizona Game and Fish Department", "https://www.azgfd.com/"],
  AR: ["Arkansas", "Arkansas Game and Fish Commission", "https://www.agfc.com/"],
  CA: ["California", "California Department of Fish and Wildlife", "https://wildlife.ca.gov/"],
  CO: ["Colorado", "Colorado Parks and Wildlife", "https://cpw.state.co.us/"],
  CT: ["Connecticut", "Connecticut DEEP Wildlife Division", "https://portal.ct.gov/deep/wildlife"],
  DE: ["Delaware", "Delaware Division of Fish and Wildlife", "https://dnrec.delaware.gov/fish-wildlife/"],
  DC: ["District of Columbia", "DC Department of Energy and Environment, Fish and Wildlife", "https://doee.dc.gov/service/fish-and-wildlife"],
  FL: ["Florida", "Florida Fish and Wildlife Conservation Commission", "https://myfwc.com/"],
  GA: ["Georgia", "Georgia DNR Wildlife Resources Division", "https://georgiawildlife.com/"],
  HI: ["Hawaii", "Hawaii Division of Forestry and Wildlife", "https://dlnr.hawaii.gov/dofaw/"],
  ID: ["Idaho", "Idaho Department of Fish and Game", "https://idfg.idaho.gov/"],
  IL: ["Illinois", "Illinois Department of Natural Resources", "https://dnr.illinois.gov/"],
  IN: ["Indiana", "Indiana DNR Fish and Wildlife", "https://www.in.gov/dnr/fish-and-wildlife/"],
  IA: ["Iowa", "Iowa Department of Natural Resources", "https://www.iowadnr.gov/"],
  KS: ["Kansas", "Kansas Department of Wildlife and Parks", "https://ksoutdoors.com/"],
  KY: ["Kentucky", "Kentucky Department of Fish and Wildlife Resources", "https://fw.ky.gov/"],
  LA: ["Louisiana", "Louisiana Department of Wildlife and Fisheries", "https://www.wlf.louisiana.gov/"],
  ME: ["Maine", "Maine Department of Inland Fisheries and Wildlife", "https://www.maine.gov/ifw/"],
  MD: ["Maryland", "Maryland DNR Wildlife and Heritage Service", "https://dnr.maryland.gov/wildlife/"],
  MA: ["Massachusetts", "MassWildlife", "https://www.mass.gov/orgs/division-of-fisheries-and-wildlife"],
  MI: ["Michigan", "Michigan Department of Natural Resources", "https://www.michigan.gov/dnr"],
  MN: ["Minnesota", "Minnesota Department of Natural Resources", "https://www.dnr.state.mn.us/"],
  MS: ["Mississippi", "Mississippi Department of Wildlife, Fisheries, and Parks", "https://www.mdwfp.com/"],
  MO: ["Missouri", "Missouri Department of Conservation", "https://mdc.mo.gov/"],
  MT: ["Montana", "Montana Fish, Wildlife and Parks", "https://fwp.mt.gov/"],
  NE: ["Nebraska", "Nebraska Game and Parks Commission", "https://outdoornebraska.gov/"],
  NV: ["Nevada", "Nevada Department of Wildlife", "https://www.ndow.org/"],
  NH: ["New Hampshire", "New Hampshire Fish and Game Department", "https://www.wildlife.nh.gov/"],
  NJ: ["New Jersey", "New Jersey Division of Fish and Wildlife", "https://dep.nj.gov/njfw/"],
  NM: ["New Mexico", "New Mexico Department of Game and Fish", "https://wildlife.dgf.nm.gov/"],
  NY: ["New York", "New York State DEC Fish and Wildlife", "https://dec.ny.gov/nature/animals-fish-plants"],
  NC: ["North Carolina", "North Carolina Wildlife Resources Commission", "https://www.ncwildlife.gov/"],
  ND: ["North Dakota", "North Dakota Game and Fish Department", "https://gf.nd.gov/"],
  OH: ["Ohio", "Ohio DNR Division of Wildlife", "https://ohiodnr.gov/discover-and-learn/safety-conservation/about-odnr/wildlife"],
  OK: ["Oklahoma", "Oklahoma Department of Wildlife Conservation", "https://www.wildlifedepartment.com/"],
  OR: ["Oregon", "Oregon Department of Fish and Wildlife", "https://myodfw.com/"],
  PA: ["Pennsylvania", "Pennsylvania Game Commission", "https://www.pgc.pa.gov/"],
  RI: ["Rhode Island", "Rhode Island DEM Fish and Wildlife", "https://dem.ri.gov/natural-resources-bureau/fish-wildlife"],
  SC: ["South Carolina", "South Carolina Department of Natural Resources", "https://www.dnr.sc.gov/"],
  SD: ["South Dakota", "South Dakota Game, Fish and Parks", "https://gfp.sd.gov/"],
  TN: ["Tennessee", "Tennessee Wildlife Resources Agency", "https://www.tn.gov/twra.html"],
  TX: ["Texas", "Texas Parks and Wildlife Department", "https://tpwd.texas.gov/"],
  UT: ["Utah", "Utah Division of Wildlife Resources", "https://wildlife.utah.gov/"],
  VT: ["Vermont", "Vermont Fish and Wildlife Department", "https://vtfishandwildlife.com/"],
  VA: ["Virginia", "Virginia Department of Wildlife Resources", "https://dwr.virginia.gov/"],
  WA: ["Washington", "Washington Department of Fish and Wildlife", "https://wdfw.wa.gov/"],
  WV: ["West Virginia", "West Virginia Division of Natural Resources", "https://wvdnr.gov/"],
  WI: ["Wisconsin", "Wisconsin Department of Natural Resources", "https://dnr.wisconsin.gov/"],
  WY: ["Wyoming", "Wyoming Game and Fish Department", "https://wgfd.wyo.gov/"]
};

// Topics where the state agency is the right place to check (rules, seasons, local wildlife).
const WILDLIFE_WORDS = /\b(deer|elk|moose|bear|bears|turkey|duck|goose|geese|hunt|hunting|hunter|season|tag|tags|license|permit|trap|trapping|fish|fishing|antler|antlers|buck|doe|fawn|rut|scat|droppings|tracks?|cwd|chronic wasting|wildlife|game|coyote|bobcat|wolf|wolves|boar|hog|squirrel|rabbit|grouse|pheasant)\b/i;

export function stateFromText(text) {
  const raw = String(text || "");
  for (const [code, [name]] of Object.entries(STATE_WILDLIFE)) {
    if (new RegExp(`\\b${name}\\b`, "i").test(raw)) return code;
  }
  return null;
}

/** The link-only citation for a wildlife question, or null. state is a two-letter code. */
export function stateWildlifeLink(question, homeState = null) {
  if (!WILDLIFE_WORDS.test(String(question || ""))) return null;
  const code = stateFromText(question) || (homeState && STATE_WILDLIFE[String(homeState).toUpperCase()] ? String(homeState).toUpperCase() : null);
  if (!code) return null;
  const [stateName, agency, url] = STATE_WILDLIFE[code];
  return { sourceId: "state-wildlife", sourceName: agency, state: stateName, url, linkOnly: true, license: "Link only. Not fetched or quoted." };
}
