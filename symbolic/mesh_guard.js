import crypto from "crypto";
import { getMappedAction } from "./symbolic_dictionary.js";

const MAX_SYMBOL_LENGTH = 200;

export function meshToken() {
  return process.env.YEHSA_MESH_TOKEN || "";
}

/**
 * Default bind is loopback. Set YEHSA_BIND_HOST to opt into any other address.
 */
export function bindHost() {
  const requested = process.env.YEHSA_BIND_HOST;
  if (typeof requested === "string" && requested.trim()) return requested.trim();
  return "127.0.0.1";
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
