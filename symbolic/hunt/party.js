// Hunt party. Members are paired contacts only, and only after the person compared the safety
// number with them and it matched. Live location is never on by default: it is a session you
// start, for the people you pick, with an end time on screen, and it stops by itself. Each
// update is sealed for one member with that member's key, so a relay cannot read it. Nothing
// is sent unless a session is running and a position is held with consent.

import { safetyNumber, sealDirect, publicCard } from "../peer_chat.js";

export const MIN_MINUTES = 15;
export const MAX_MINUTES = 12 * 60;
export const DEFAULT_MINUTES = 120;
export const UPDATE_EVERY_MS = 60 * 1000;

export const PARTY_RULES = [
  "Party members are paired contacts only, each with a safety number you have checked.",
  "Live location is off until you start a session. You pick who sees it and when it ends.",
  "It stops on its own at the end time. You can stop it any time."
];

export function emptyRoster() {
  return { members: [], session: null };
}

export function cardFromText(text) {
  try {
    const card = JSON.parse(String(text || "").trim());
    if (typeof card?.boxPublic === "string" && typeof card?.signPublic === "string" && card.boxPublic.length > 20 && card.signPublic.length > 20) {
      return { boxPublic: card.boxPublic, signPublic: card.signPublic };
    }
  } catch {
    // Not a pairing code.
  }
  return null;
}

// Add someone by their pairing code. They stay "not verified" until the number is compared.
export function addMember(roster, { name, card, me }) {
  const label = String(name || "").trim().slice(0, 40);
  if (!label) return { ok: false, reason: "Add a name so you know who this is.", roster };
  if (!card) return { ok: false, reason: "That did not look like a pairing code. Ask them to show their code on the Pair screen.", roster };
  if (!me?.boxPublic) return { ok: false, reason: "Your own key is not ready yet.", roster };
  if (card.boxPublic === me.boxPublic) return { ok: false, reason: "That is your own code.", roster };
  if (roster.members.some((member) => member.boxPublic === card.boxPublic)) return { ok: false, reason: "That person is already here.", roster };
  const member = {
    id: `m-${roster.members.length + 1}-${card.boxPublic.slice(0, 6).replace(/[^a-z0-9]/gi, "")}`,
    name: label,
    boxPublic: card.boxPublic,
    signPublic: card.signPublic,
    safety: safetyNumber(me.boxPublic, card.boxPublic),
    verified: false
  };
  return { ok: true, roster: { ...roster, members: [...roster.members, member] }, member };
}

const digits = (text) => String(text || "").replace(/\D+/g, "");

// The person reads the number on their screen and types what the other phone shows.
export function verifyMember(roster, id, typedNumber) {
  const member = roster.members.find((item) => item.id === id);
  if (!member) return { ok: false, reason: "That person is not in the party.", roster };
  if (digits(typedNumber) !== digits(member.safety) || digits(typedNumber).length < 32) {
    return { ok: false, reason: "The numbers do not match. Do not trust this contact until they do.", roster };
  }
  return { ok: true, roster: { ...roster, members: roster.members.map((item) => (item.id === id ? { ...item, verified: true } : item)) } };
}

export function removeMember(roster, id) {
  const session = roster.session && !roster.session.stopped
    ? { ...roster.session, memberIds: roster.session.memberIds.filter((item) => item !== id) }
    : roster.session;
  return { ...roster, members: roster.members.filter((item) => item.id !== id), session };
}

export function verifiedMembers(roster) {
  return roster.members.filter((member) => member.verified);
}

export function startSession(roster, { memberIds, minutes = DEFAULT_MINUTES, now = Date.now() }) {
  const allowed = new Set(verifiedMembers(roster).map((member) => member.id));
  const chosen = (memberIds || []).filter((id) => allowed.has(id));
  if (chosen.length === 0) return { ok: false, reason: "Pick at least one person whose safety number you have checked.", roster };
  const length = Math.max(MIN_MINUTES, Math.min(MAX_MINUTES, Math.round(Number(minutes) || DEFAULT_MINUTES)));
  const session = { id: `p-${now.toString(36)}`, memberIds: chosen, startedAt: now, endsAt: now + length * 60000, stopped: false, sent: 0 };
  return { ok: true, roster: { ...roster, session }, session };
}

export function stopSession(roster, reason = "stopped") {
  if (!roster.session) return roster;
  return { ...roster, session: { ...roster.session, stopped: true, stoppedBecause: reason } };
}

// Called on a timer and when the app opens. A session past its end time stops here.
export function tickSession(roster, now = Date.now()) {
  const session = roster.session;
  if (!session || session.stopped) return roster;
  if (now >= session.endsAt) return stopSession(roster, "ended");
  return roster;
}

export function isSharing(roster, now = Date.now()) {
  const session = roster.session;
  return Boolean(session && !session.stopped && now < session.endsAt);
}

export function timeLeftText(roster, now = Date.now()) {
  const session = roster.session;
  if (!session || session.stopped || now >= session.endsAt) return "";
  const minutes = Math.ceil((session.endsAt - now) / 60000);
  if (minutes < 60) return `${minutes} min left`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h} h ${m} min left`;
}

function clockText(ms) {
  return new Date(ms).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

// "Shares your spot with [names] until [time]. Stop anytime."
export function shareLine(roster, session = roster.session) {
  if (!session) return "";
  const names = session.memberIds.map((id) => roster.members.find((member) => member.id === id)?.name).filter(Boolean);
  return `Shares your spot with ${names.join(", ")} until ${clockText(session.endsAt)}. Stop anytime.`;
}

/**
 * Seal one update per member. Returns [] unless a session is running, location is held with
 * consent, and the member is still verified. The log of sightings is never part of this.
 */
export function buildUpdates(roster, me, { fix, consent, now = Date.now(), pin = null }) {
  if (!isSharing(roster, now) || consent !== true || !fix || !me) return [];
  const session = roster.session;
  return session.memberIds
    .map((id) => roster.members.find((member) => member.id === id))
    .filter((member) => member?.verified)
    .map((member) => ({
      memberId: member.id,
      envelope: sealDirect(me, publicCard(member), pin?.label ? `Pin: ${pin.label}` : "Party location", {
        includeLocation: true,
        fix: pin ? { latitude: pin.latitude, longitude: pin.longitude } : fix,
        expireAt: session.endsAt
      })
    }));
}

export function dueForUpdate(roster, now = Date.now()) {
  const session = roster.session;
  if (!isSharing(roster, now)) return false;
  return !session.lastSentAt || now - session.lastSentAt >= UPDATE_EVERY_MS;
}

export function noteSent(roster, now = Date.now()) {
  if (!roster.session) return roster;
  return { ...roster, session: { ...roster.session, lastSentAt: now, sent: (roster.session.sent || 0) + 1 } };
}
