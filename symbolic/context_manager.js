import { recentContext, rememberContext } from "./runtime_store.js";

export function noteContext(input, extra = {}) {
  const text = Array.isArray(input) ? input.join(" ") : String(input ?? "");
  return rememberContext({
    text,
    ...extra,
    at: new Date().toISOString()
  });
}

export function getContext(limit = 10) {
  return recentContext(limit);
}

export function currentContext() {
  const recent = recentContext(1);
  return recent[0] || null;
}
