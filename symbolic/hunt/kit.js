// Kit: pack lists you can edit, and the family card. Templates are starting points. Items and
// the check marks are yours, and the last-checked date is kept per list. The family card is one
// screen that works offline and is stored sealed on the phone. Pure data, no storage here.

export const TEMPLATES = [
  {
    id: "day-hike",
    name: "Day hike (10 essentials)",
    items: ["Map and compass", "Headlamp and spare batteries", "Sun protection", "First-aid kit", "Knife or multi-tool", "Fire starter", "Emergency shelter", "Extra food", "Extra water and a way to treat it", "Extra clothes"]
  },
  {
    id: "72-hour",
    name: "72-hour bug-out",
    items: ["Water, 1 gallon per person per day", "Water filter or treatment tablets", "Food for 3 days", "Stove and fuel", "Shelter and sleeping bag", "Fire starter", "Headlamp and batteries", "First-aid kit", "Prescription medicines", "Copies of documents", "Cash in small bills", "Battery or crank radio", "Phone charger and power bank", "Whistle", "Map of the area", "Warm clothes and rain layer"]
  },
  {
    id: "vehicle",
    name: "Vehicle kit",
    items: ["Jumper cables or jump pack", "Spare tire and jack", "Tire pressure gauge", "Flashlight", "Blanket", "Water", "Snacks", "First-aid kit", "Tow strap", "Ice scraper and small shovel", "Reflective triangles", "Phone charger", "Paper map"]
  },
  {
    id: "outage",
    name: "Home power-outage kit",
    items: ["Flashlights and lanterns", "Spare batteries", "Battery or crank radio", "Power bank for phones", "Water for 3 days", "Food that needs no cooking", "Manual can opener", "First-aid kit", "Prescription medicines", "Blankets", "Cash", "Matches and candles in a safe holder", "List of emergency numbers"]
  },
  {
    id: "deer-day",
    name: "Deer hunt day",
    items: ["Hunter orange", "License and tags", "Knife", "Drag rope", "Gloves", "Headlamp", "Ammo", "Rangefinder", "Toilet paper", "Water", "Snacks", "First-aid kit", "Phone battery"]
  }
];

export function emptyKit() {
  return { lists: TEMPLATES.map((template) => ({ id: template.id, name: template.name, checkedAt: null, items: template.items.map((label, index) => ({ id: `${template.id}-${index}`, label, done: false })) })) };
}

export function normalizeKit(saved) {
  if (!saved || !Array.isArray(saved.lists)) return emptyKit();
  return saved;
}

export function listSummary(list) {
  const total = list.items.length;
  const done = list.items.filter((item) => item.done).length;
  return { total, done, text: `${done} of ${total} packed`, checkedAt: list.checkedAt };
}

function mapList(kit, listId, fn) {
  return { ...kit, lists: kit.lists.map((list) => (list.id === listId ? fn(list) : list)) };
}

export function toggleItem(kit, listId, itemId, now = Date.now()) {
  return mapList(kit, listId, (list) => ({
    ...list,
    checkedAt: now,
    items: list.items.map((item) => (item.id === itemId ? { ...item, done: !item.done } : item))
  }));
}

export function parseExpiry(text) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(text || "").trim());
  if (!match) return null;
  const t = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  const check = new Date(t);
  if (check.getUTCMonth() !== Number(match[2]) - 1) return null;
  return t;
}

// "Expires in 12 days" within 30 days, and the word "Expired" after. Null when no date is set.
export function expiryNote(item, now = Date.now()) {
  const t = parseExpiry(item?.expires);
  if (t == null) return null;
  const days = Math.ceil((t - now) / 86400000);
  if (days < 0) return { text: "Expired", soon: true };
  if (days === 0) return { text: "Expires today", soon: true };
  if (days <= 30) return { text: `Expires in ${days} day${days === 1 ? "" : "s"}`, soon: true };
  return { text: `Expires ${item.expires}`, soon: false };
}

export function addItem(kit, listId, label, expires = "") {
  const text = String(label || "").trim().slice(0, 80);
  if (!text) return kit;
  return mapList(kit, listId, (list) => {
    if (list.items.some((item) => item.label.toLowerCase() === text.toLowerCase())) return list;
    return { ...list, items: [...list.items, { id: `${listId}-${Date.now().toString(36)}-${list.items.length}`, label: text, done: false, ...(parseExpiry(expires) != null ? { expires: String(expires).trim() } : {}) }] };
  });
}

export function removeItem(kit, listId, itemId) {
  return mapList(kit, listId, (list) => ({ ...list, items: list.items.filter((item) => item.id !== itemId) }));
}

export function resetList(kit, listId) {
  const template = TEMPLATES.find((item) => item.id === listId);
  if (!template) return mapList(kit, listId, (list) => ({ ...list, items: list.items.map((item) => ({ ...item, done: false })) }));
  return mapList(kit, listId, (list) => ({ ...list, checkedAt: null, items: template.items.map((label, index) => ({ id: `${template.id}-${index}`, label, done: false })) }));
}

export function uncheckAll(kit, listId) {
  return mapList(kit, listId, (list) => ({ ...list, items: list.items.map((item) => ({ ...item, done: false })) }));
}

// The pre-trip check pulls from the list the person picked.
export function pretripFrom(kit, listId) {
  const list = kit?.lists?.find((item) => item.id === listId);
  if (!list) return null;
  const missing = list.items.filter((item) => !item.done).map((item) => item.label);
  return { name: list.name, total: list.items.length, missing, ready: missing.length === 0 };
}

export const FAMILY_FIELDS = [
  { id: "names", label: "Names", hint: "Everyone in the household" },
  { id: "dob", label: "Dates of birth", hint: "Name and date, one per line" },
  { id: "blood", label: "Blood types", hint: "Name and type" },
  { id: "allergies", label: "Allergies", hint: "Medicine, food, stings" },
  { id: "medications", label: "Medications", hint: "Name, dose, who takes it" },
  { id: "conditions", label: "Medical conditions", hint: "Anything a medic should know" },
  { id: "contacts", label: "Emergency contacts", hint: "Name and number" },
  { id: "outOfArea", label: "Out-of-area contact", hint: "Someone far away everyone can call" },
  { id: "meetHome", label: "Meeting point near home", hint: "Where you go if you cannot stay in" },
  { id: "meetFar", label: "Meeting point out of the neighborhood", hint: "If you cannot get home" },
  { id: "doctor", label: "Doctor", hint: "Name and phone" },
  { id: "insurance", label: "Insurance", hint: "Company, policy number" },
  { id: "pets", label: "Pets", hint: "Names, vet, medicines" }
];

export const FAMILY_PRIVACY = "Stored sealed on this phone. It stays hidden until you open it, and it is never sent anywhere unless you share it yourself.";

export function emptyFamily() {
  return { fields: {}, photos: [], lockScreen: false, updatedAt: null };
}

export function setFamilyField(card, id, value, now = Date.now()) {
  if (!FAMILY_FIELDS.some((field) => field.id === id)) return card;
  return { ...card, fields: { ...card.fields, [id]: String(value || "").slice(0, 1200) }, updatedAt: now };
}

export function familyIsEmpty(card) {
  return !card || Object.values(card.fields || {}).every((value) => !String(value || "").trim());
}

// A one-screen text version for printing or sharing as an image the person sends themselves.
export function familyCardText(card) {
  if (familyIsEmpty(card)) return "";
  return FAMILY_FIELDS.filter((field) => String(card.fields[field.id] || "").trim())
    .map((field) => `${field.label}\n${String(card.fields[field.id]).trim()}`)
    .join("\n\n");
}

// What may show on the lock screen if the person turns it on: medical items only, never contacts' numbers.
export function lockScreenSummary(card) {
  if (!card?.lockScreen) return "";
  const pick = ["blood", "allergies", "medications", "conditions"];
  return pick.filter((id) => String(card.fields[id] || "").trim()).map((id) => `${FAMILY_FIELDS.find((f) => f.id === id).label}: ${String(card.fields[id]).trim().split("\n")[0]}`).join(" · ");
}
