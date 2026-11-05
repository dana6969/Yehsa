import crypto from "crypto";
import { ensureLocalOwner } from "./device_owner.js";
import { getMappedAction } from "./symbolic_dictionary.js";

const MAX_SYMBOL_LENGTH = 200;
const LOOPBACK_BIND = "127.0.0.1";

export function meshToken() {
  return process.env.YEHSA_MESH_TOKEN || "";
}

/**
 * True for this host's loopback only. Wildcard, LAN, and public addresses are exterior.
 */
export function isLoopbackAddress(address) {
  if (typeof address !== "string") return false;
  let host = address.trim().toLowerCase();
  if (!host) return false;
  if (host.startsWith("[") && host.endsWith("]")) host = host.slice(1, -1);
  if (host === "localhost" || host === "::1") return true;
  if (host.startsWith("::ffff:")) host = host.slice("::ffff:".length);
  const parts = host.split(".");
  if (parts.length !== 4) return false;
  if (parts.some((part) => !/^\d{1,3}$/.test(part))) return false;
  const nums = parts.map(Number);
  if (nums.some((num) => num > 255)) return false;
  return nums[0] === 127;
}

/**
 * Listeners bind to 127.0.0.1. YEHSA_BIND_HOST cannot open a public or wildcard socket.
 * A non-loopback request returns null so the caller does not listen.
 */
export function bindHost() {
  const requested = process.env.YEHSA_BIND_HOST;
  if (typeof requested === "string" && requested.trim() && !isLoopbackAddress(requested)) {
    return null;
  }
  return LOOPBACK_BIND;
}

export function tokenMatches(presented) {
  const expected = meshToken();
  if (!expected || typeof presented !== "string" || presented.length !== expected.length) {
    return false;
  }
  return crypto.timingSafeEqual(Buffer.from(presented), Buffer.from(expected));
}

export function bearerOrHeaderToken(authorizationHeader, explicitHeader) {
  const header = typeof authorizationHeader === "string" ? authorizationHeader : "";
  const bearer = /^Bearer\s+(\S+)\s*$/i.exec(header);
  if (bearer) return bearer[1];
  return typeof explicitHeader === "string" ? explicitHeader.trim() : "";
}

/**
 * Ingress into this install. The caller must already be on loopback of the device
 * that owns this install. Other phones, mesh peers, and non-loopback sockets are denied.
 * Returns { ok, status, error } or { ok, status, symbol, action }.
 */
export function admitLocalIngress({ remoteAddress, presentedToken, symbol, ownerPath } = {}) {
  const owner = ensureLocalOwner(ownerPath ? { ownerPath } : {});
  if (!owner.recognized) {
    return { ok: false, status: 403, error: "device ownership denied" };
  }
  if (!isLoopbackAddress(remoteAddress)) {
    return { ok: false, status: 403, error: "exterior denied" };
  }
  if (!meshToken()) {
    return { ok: false, status: 503, error: "YEHSA_MESH_TOKEN is not set" };
  }
  if (!tokenMatches(presentedToken)) {
    return { ok: false, status: 401, error: "unauthorized" };
  }
  const allowed = allowlistedSymbol(symbol);
  if (!allowed) {
    return { ok: false, status: 400, error: "symbol is missing or not allowlisted" };
  }
  return { ok: true, status: 200, symbol: allowed.symbol, action: allowed.action };
}

/**
 * Dictionary membership is the allowlist. Client-supplied actions are not trusted.
 * Returns { symbol, action } or null.
 */
export function allowlistedSymbol(symbol) {
  if (typeof symbol !== "string") return null;
  const trimmed = symbol.trim();
  if (!trimmed || trimmed.length > MAX_SYMBOL_LENGTH) return null;
  if (/[\u0000-\u001F\u007F]/.test(trimmed)) return null;
  const action = getMappedAction(trimmed);
  if (typeof action !== "string" || action.length === 0) return null;
  return { symbol: trimmed, action };
}
