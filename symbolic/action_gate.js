// Proposals only. Approve is the only path that asks the caller to apply an action.

export const ACTION_TYPES = [
  "waypoint",
  "measure",
  "position-hold",
  "position-unlock",
  "mesh-scan",
  "calculate",
  "speak",
  "field-note",
  "ask-model",
  "save-model-note",
  "save-learned"
];

export function defaultActionSettings() {
  return Object.fromEntries(ACTION_TYPES.map((type) => [type, true]));
}

function entry(proposal, status, extra = {}) {
  return {
    id: proposal.id,
    type: proposal.type,
    status,
    at: Date.now(),
    ...extra
  };
}

export function proposeAction(gate, proposal) {
  const current = gate || { settings: defaultActionSettings(), log: [], pending: null };
  const settings = { ...defaultActionSettings(), ...(current.settings || {}) };
  const id = proposal?.id || `act-${current.log.length + 1}`;
  const card = { id, type: proposal?.type, payload: proposal?.payload || {}, label: proposal?.label || proposal?.type };
  if (!ACTION_TYPES.includes(card.type) || settings[card.type] !== true) {
    return {
      gate: { ...current, settings, log: [...current.log, entry(card, "blocked")] },
      card: null
    };
  }
  const pending = { ...card, status: "pending" };
  return {
    gate: { ...current, settings, pending, log: [...current.log, entry(pending, "proposed")] },
    card: pending
  };
}

export function declineAction(gate, id) {
  const current = gate || { settings: defaultActionSettings(), log: [], pending: null };
  if (!current.pending || current.pending.id !== id) return { gate: current, applied: false };
  return {
    gate: {
      ...current,
      pending: null,
      log: [...current.log, entry(current.pending, "declined")]
    },
    applied: false
  };
}

export function approveAction(gate, id, apply) {
  const current = gate || { settings: defaultActionSettings(), log: [], pending: null };
  if (!current.pending || current.pending.id !== id) return { gate: current, applied: false, result: null };
  if (current.settings?.[current.pending.type] !== true) {
    return {
      gate: { ...current, pending: null, log: [...current.log, entry(current.pending, "blocked")] },
      applied: false,
      result: null
    };
  }
  const result = typeof apply === "function" ? apply(current.pending) : null;
  return {
    gate: {
      ...current,
      pending: null,
      log: [...current.log, entry(current.pending, "approved", { result, undo: result?.undo || null, undone: false })]
    },
    applied: true,
    result
  };
}

export function setActionEnabled(gate, type, enabled) {
  const current = gate || { settings: defaultActionSettings(), log: [], pending: null };
  if (!ACTION_TYPES.includes(type)) return current;
  return {
    ...current,
    settings: { ...defaultActionSettings(), ...current.settings, [type]: enabled === true }
  };
}

export function undoApproved(gate, id) {
  const current = gate || { settings: defaultActionSettings(), log: [], pending: null };
  let found = null;
  const log = current.log.map((item) => {
    if (item.id === id && item.status === "approved" && item.undo && item.undone !== true) {
      found = item;
      return { ...item, undone: true };
    }
    return item;
  });
  if (!found) return { gate: current, undo: null };
  return {
    gate: { ...current, log: [...log, entry(found, "undone")] },
    undo: found.undo
  };
}

export function actionIntent(text) {
  const raw = String(text || "");
  if (/\b(set|save|drop|mark)\b/i.test(raw) && /\bwaypoint\b/i.test(raw)) {
    const name = (raw.match(/\b(?:called|named)\s+([a-z0-9_-]+)/i) || [])[1] || "point";
    return { type: "waypoint", label: `Save waypoint “${name}”`, payload: { name } };
  }
  if (/\b(measure|distance|bearing)\b/i.test(raw) && /\b(from|between|two points)\b/i.test(raw)) {
    return { type: "measure", label: "Measure the two points on the map", payload: {} };
  }
  if (/\b(hold|lock)\b/i.test(raw) && /\bposition\b/i.test(raw)) {
    return { type: "position-hold", label: "Hold the place you already consented to", payload: {} };
  }
  if (/\bunlock\b/i.test(raw) && /\bposition\b/i.test(raw)) {
    return { type: "position-unlock", label: "Unlock the held place", payload: {} };
  }
  if (/\bscan\b/i.test(raw) && /\b(peer|mesh|radio)\b/i.test(raw)) {
    return { type: "mesh-scan", label: "Scan for Yehsa peers", payload: {} };
  }
  if (/\b(speak|read aloud|say it)\b/i.test(raw)) {
    return { type: "speak", label: "Speak the last answer", payload: {} };
  }
  if (/\b(save|keep)\b/i.test(raw) && /\bnote\b/i.test(raw)) {
    return { type: "field-note", label: "Save a note on this phone", payload: { text: raw.slice(0, 240) } };
  }
  return null;
}
