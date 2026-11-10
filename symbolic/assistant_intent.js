// Deterministic reading of a spoken command. No network and no model.
// A tool is only proposed. The caller still has to approve it.

import { calculate } from "./calculator.js";

function pointIn(text) {
  const match = String(text || "").match(/(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/);
  if (!match) return null;
  const latitude = Number(match[1]);
  const longitude = Number(match[2]);
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
  return { latitude, longitude };
}

function placeWords(point) {
  if (!point) return "";
  return `${Number(point.latitude).toFixed(4)}, ${Number(point.longitude).toFixed(4)}`;
}

function lastPoint(context) {
  const list = Array.isArray(context?.waypoints) ? context.waypoints : [];
  return list.length ? list[list.length - 1] : null;
}

export function readAssistant(text, context = {}) {
  const raw = String(text || "").trim();
  if (!raw) return { kind: "talk" };

  if (/\b(search the (web|internet)|look (this |it )?up online|go online|open google|google that|download (a |the )?(city|street) map|open (another|other) apps?|control (another|other) apps?)\b/i.test(raw)) {
    return {
      kind: "cannot",
      understood: "I understood a request to leave this phone.",
      reply: "I can't do that. I have no internet, no live city or street map, and I can't open or control other apps."
    };
  }

  if (/\b(drop|set|save|mark|put)\b/i.test(raw) && /\b(waypoint|pin|point)\b/i.test(raw)) {
    const name = (raw.match(/\b(?:called|named|call it)\s+([a-z0-9_-]+)/i) || [])[1] || "point";
    const spot = pointIn(raw) || context.here || null;
    if (!spot) {
      return {
        kind: "clarify",
        understood: "I understood that you want a waypoint.",
        question: "Where should I put it? Tap the map, or give latitude and longitude."
      };
    }
    const where = context.here && spot === context.here
      ? (context.hereLabel || placeWords(spot))
      : placeWords(spot);
    return {
      kind: "action",
      type: "waypoint",
      label: `Save waypoint “${name}”`,
      payload: { name, point: { latitude: spot.latitude, longitude: spot.longitude } },
      understood: `I understood: save a waypoint named ${name} at ${where}.`
    };
  }

  if (/\b(how far|distance|bearing)\b/i.test(raw) && /\b(last point|last waypoint|that point)\b/i.test(raw)) {
    const target = lastPoint(context);
    const from = context.held || null;
    if (!target) {
      return {
        kind: "clarify",
        understood: "I understood that you want a distance.",
        question: "I don't have a last point yet. Drop one first?"
      };
    }
    if (!from) {
      return {
        kind: "clarify",
        understood: `I understood: measure to ${target.name || "the last point"}.`,
        question: "From where? Hold a place on Me first. I will not guess a city."
      };
    }
    return {
      kind: "action",
      type: "measure",
      label: `Measure to ${target.name || "the last point"}`,
      payload: { from: { latitude: from.latitude, longitude: from.longitude }, to: { latitude: target.latitude, longitude: target.longitude } },
      understood: `I understood: distance and bearing from the place you are holding to ${target.name || "the last point"}.`
    };
  }

  if (/\b(mesh scan|scan for (yehsa )?peers|start a scan)\b/i.test(raw)) {
    return {
      kind: "action",
      type: "mesh-scan",
      label: "Scan for Yehsa peers",
      payload: {},
      understood: "I understood: start a scan for Yehsa peers. I will not invent a peer."
    };
  }

  if (/\b(hold|lock)\b/i.test(raw) && /\b(position|place|location)\b/i.test(raw)) {
    return {
      kind: "action",
      type: "position-hold",
      label: "Hold the place you already consented to",
      payload: {},
      understood: "I understood: hold your place. Approve does not turn consent on."
    };
  }

  if (/\bunlock\b/i.test(raw) && /\b(position|place|location)\b/i.test(raw)) {
    return {
      kind: "action",
      type: "position-unlock",
      label: "Unlock the held place",
      payload: {},
      understood: "I understood: unlock the held place. Consent stays as you set it."
    };
  }

  if (/\b(speak|read aloud|say that|say it)\b/i.test(raw)) {
    return {
      kind: "action",
      type: "speak",
      label: "Speak the last answer",
      payload: {},
      understood: "I understood: speak the last answer on this phone."
    };
  }

  if (/\b(save|keep|log)\b/i.test(raw) && /\b(note|log)\b/i.test(raw)) {
    const body = raw.replace(/^.*\b(?:note|log)\b[:\s-]*/i, "").trim();
    if (!body || body.length < 3) {
      return {
        kind: "clarify",
        understood: "I understood that you want a note on this phone.",
        question: "What should the note say?"
      };
    }
    return {
      kind: "action",
      type: "field-note",
      label: "Save a note on this phone",
      payload: { text: body.slice(0, 240) },
      understood: "I understood: save that note on this phone. It will not be sent."
    };
  }

  if (/\b(convert|calculate)\b/i.test(raw)) {
    const math = calculate(raw);
    if (!math?.text) {
      return {
        kind: "clarify",
        understood: "I understood that you want a calculation.",
        question: "What should I convert or calculate? For example, 5 miles to km."
      };
    }
    return {
      kind: "action",
      type: "calculate",
      label: math.text,
      payload: { text: math.text },
      understood: `I understood this calculation: ${math.text}`
    };
  }

  return { kind: "talk" };
}
