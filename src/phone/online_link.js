// The online channel on the phone. Its keys are the phone's one identity (src/phone/identity.js,
// the shared key module), the same keys Hunt party and People pairing use. This file never makes
// keys of its own. The safety number (symbolic/online/safety.js, v2) covers both public keys of both
// people, and it is the same number People, Hunt party and Online show for the same pair.
// Channel state (contacts, ratchet sessions, held messages) lives in its own sealed store, separate from the identity and from web notes.

import { createChannel, emptyOnlineState } from "../../symbolic/online/channel.js";
import { createRelayPool } from "../../symbolic/online/nostr.js";
import { explain, getOrCreateIdentity } from "./identity.js";
import { onlineVault } from "./sealed_stores.js";

let started = null;

/**
 * Returns { ok: true, channel, pool } or { ok: false, problem } where problem is the
 * friendly { title, body, canRetry, canReplace } from the key module. A failure is not cached.
 */
export function startOnline({ WebSocketImpl = globalThis.WebSocket, onChange, onStatus } = {}) {
  if (started) return started;
  const attempt = (async () => {
    const got = await getOrCreateIdentity();
    if (got.state !== "ready") return { ok: false, problem: explain(got) };
    const opened = await onlineVault.open();
    if (opened.status === "foreign") {
      return { ok: false, problem: { title: "Online messages from another phone cannot be opened here.", body: "Start fresh to use Online on this phone.", canRetry: false, canReplace: true } };
    }
    const state = opened.status === "ok" ? opened.value : emptyOnlineState();
    let channel;
    const pool = createRelayPool({ relays: state.relays, WebSocketImpl, onEvent: (event) => channel?.onEvent(event), onStatus });
    channel = createChannel({ me: got.identity, state, persist: (next) => onlineVault.save(next), pool, callbacks: { onChange } });
    return { ok: true, channel, pool };
  })();
  started = attempt.then((result) => {
    if (!result.ok) started = null;
    return result;
  }, (err) => {
    started = null;
    return { ok: false, problem: { title: "I couldn't start Online.", body: String(err?.message || "").slice(0, 80), canRetry: true, canReplace: false } };
  });
  return started;
}

export function stopOnline() {
  started?.then((result) => result.ok && result.pool.close?.());
  started = null;
}
