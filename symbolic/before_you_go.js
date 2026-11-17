// Before you go: a pre-trip checklist. Pure logic, no platform calls.
// Each item has a state word (Ready / Check / Missing), an icon name, and a label,
// so nothing is shown by colour alone. Nothing here is uploaded or sent.

import { coverageFor } from "./area_download.js";
import { pretripFrom } from "./hunt/kit.js";

export const CHECK_ORDER = ["maps", "battery", "gps", "mesh", "knowledge", "pack", "contacts", "plan", "regs", "display"];

// Things the phone cannot check for you. You tick them yourself.
export const MANUAL_ITEMS = [
  { id: "regs", label: "Season, unit, and shooting hours", detail: "Check them with the state agency. Yehsa does not know this year's rules." },
  { id: "display", label: "Display mode for dawn and dusk", detail: "Pick Night (red or amber) so your eyes stay used to the dark." }
];

const ICONS = {
  maps: "map-outline",
  battery: "battery-half-outline",
  gps: "navigate-outline",
  mesh: "radio-outline",
  knowledge: "book-outline",
  pack: "briefcase-outline",
  contacts: "call-outline",
  plan: "chatbubble-ellipses-outline",
  regs: "document-text-outline",
  display: "moon-outline"
};

function item(id, label, state, detail) {
  return { id, label, state, icon: ICONS[id], detail };
}

export function batteryItem(battery) {
  const level = Number(battery?.level);
  if (!Number.isFinite(level) || level < 0) {
    return item("battery", "Battery", "check", "This phone did not report its battery level. Charge it fully and pack a power bank.");
  }
  const pct = Math.round(level * 100);
  const saver = battery?.lowPowerMode ? " Battery saver is on, which can slow GPS." : "";
  if (pct >= 80) return item("battery", "Battery", "ready", `${pct}% charged.${saver} A power bank is still a good idea.`);
  if (pct >= 40) return item("battery", "Battery", "check", `${pct}% charged. Charge to full before you leave.${saver}`);
  return item("battery", "Battery", "missing", `${pct}% charged. Charge before you leave; GPS and the map drain it fast.${saver}`);
}

export function gpsItem(permission) {
  const status = String(permission?.status || "unknown");
  if (status === "granted") {
    const precise = permission?.precise === false ? " Location is set to approximate; allow precise location for a useful fix." : "";
    return item("gps", "GPS permission", precise ? "check" : "ready", `Allowed.${precise} Yehsa only reads a fix when you ask.`);
  }
  if (status === "denied") return item("gps", "GPS permission", "missing", "Turned off for Yehsa. Allow location in the phone's settings to see where you are offline.");
  return item("gps", "GPS permission", "check", "Not asked yet. Tap Allow GPS. Your position stays on this phone.");
}

export function meshItem(mesh) {
  if (mesh?.ready === true) return item("mesh", "Phone-to-phone mesh", "ready", mesh.text || "Bluetooth mesh is ready.");
  if (mesh?.native === false) return item("mesh", "Phone-to-phone mesh", "check", "This build has no Bluetooth radio access (preview or web). Message friends before you lose signal.");
  return item("mesh", "Phone-to-phone mesh", "check", mesh?.text || "Bluetooth is in this build. Open People and pair with your group before you lose signal.");
}

export function knowledgeItem(knowledge) {
  const raw = knowledge?.fieldNotes;
  const notes = raw && typeof raw === "object"
    ? Object.values(raw).reduce((sum, value) => sum + (Number(value) || 0), 0)
    : Number(raw) || 0;
  const books = Number(knowledge?.importedBooks) || 0;
  const extra = books ? ` ${books} of your own ${books === 1 ? "book is" : "books are"} imported.` : "";
  if (notes > 0) return item("knowledge", "Knowledge packs", "ready", `${notes} field notes are on this phone and work offline.${extra}`);
  return item("knowledge", "Knowledge packs", "missing", "The field notes did not load. Reinstall Yehsa before you go.");
}

// The pack-list row. It reads the list the person picked in Kit and says what is still missing.
export function packItem(kit, listId) {
  const trip = pretripFrom(kit, listId);
  if (!trip) return item("pack", "Pack list", "check", "Pick a pack list in Kit, then tick items off as you pack.");
  const packed = trip.total - trip.missing.length;
  if (trip.total === 0) return item("pack", `Pack list: ${trip.name}`, "check", "This list is empty. Add what you take in Kit.");
  if (trip.ready) return item("pack", `Pack list: ${trip.name}`, "ready", `All ${trip.total} packed.`);
  const shown = trip.missing.slice(0, 4).join(", ");
  const more = trip.missing.length > 4 ? `, and ${trip.missing.length - 4} more` : "";
  return item("pack", `Pack list: ${trip.name}`, packed === 0 ? "missing" : "check", `${packed} of ${trip.total} packed. Still to pack: ${shown}${more}.`);
}

export function contactsItem(contacts) {
  const list = (Array.isArray(contacts) ? contacts : []).filter((entry) => String(entry?.phone || "").replace(/\D/g, "").length >= 3);
  if (list.length) return item("contacts", "Emergency contacts", "ready", `${list.length} saved: ${list.map((entry) => entry.name || entry.phone).join(", ")}. Stored only on this phone.`);
  return item("contacts", "Emergency contacts", "missing", "Add at least one person to call. Stored only on this phone.");
}

export function planItem(plan, now = Date.now()) {
  const told = plan?.toldAt ? Date.parse(plan.toldAt) : NaN;
  const back = plan?.backBy ? String(plan.backBy) : "";
  if (Number.isFinite(told) && now - told < 3 * 24 * 3600 * 1000) {
    return item("plan", "Tell someone your plan", "ready", `You shared your plan${plan?.toldWho ? ` with ${plan.toldWho}` : ""}.${back ? ` Back by ${back}.` : ""} Tell them when you are back.`);
  }
  if (plan?.where || back) return item("plan", "Tell someone your plan", "check", "Your plan is written but not shared yet. Tap Share plan to send it yourself.");
  return item("plan", "Tell someone your plan", "missing", "Write where you are going, your route, and when you will be back, then share it with someone who is not going.");
}

export function tripPlanText(plan = {}) {
  const lines = [
    "My trip plan (from Yehsa):",
    plan.where ? `Going to: ${plan.where}` : null,
    plan.route ? `Route: ${plan.route}` : null,
    plan.party ? `With: ${plan.party}` : null,
    plan.backBy ? `Back by: ${plan.backBy}` : null,
    plan.vehicle ? `Vehicle / parking: ${plan.vehicle}` : null,
    plan.notes ? `Notes: ${plan.notes}` : null,
    plan.backBy ? `If you have not heard from me by ${plan.backBy}, call emergency services and give them this plan.` : "If you have not heard from me when expected, call emergency services and give them this plan."
  ];
  return lines.filter(Boolean).join("\n");
}

export function beforeYouGo(input = {}, now = Date.now()) {
  const maps = coverageFor({ areas: input.areas, packs: input.packs }, input.target || null);
  const items = [
    item("maps", "Offline maps for the trip", maps.state, maps.text),
    batteryItem(input.battery),
    gpsItem(input.gps),
    meshItem(input.mesh),
    knowledgeItem(input.knowledge),
    ...(input.kit ? [packItem(input.kit, input.kitListId)] : []),
    contactsItem(input.contacts),
    planItem(input.plan, now),
    ...MANUAL_ITEMS.map((entry) => item(entry.id, entry.label, input.ticked?.[entry.id] ? "ready" : "check", input.ticked?.[entry.id] ? `Done. ${entry.detail}` : entry.detail))
  ];
  const missing = items.filter((entry) => entry.state === "missing").length;
  const checks = items.filter((entry) => entry.state === "check").length;
  const summary = missing
    ? `${missing} ${missing === 1 ? "item needs" : "items need"} attention before you go${checks ? `, and ${checks} to check` : ""}.`
    : checks
      ? `Nothing is missing. ${checks} ${checks === 1 ? "item" : "items"} to check.`
      : "Everything on the list is ready.";
  return { items, missing, checks, summary };
}
