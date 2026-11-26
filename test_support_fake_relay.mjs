// An in-memory Nostr relay for tests. No network. Records everything a real relay would see.
export function createFakeRelayNetwork() {
  const relays = new Map();
  function relay(url) {
    if (!relays.has(url)) relays.set(url, { url, events: [], subs: new Set(), seenByRelay: [], down: false, rejectAll: false });
    return relays.get(url);
  }
  function matches(filter, event) {
    if (filter.kinds && !filter.kinds.includes(event.kind)) return false;
    if (filter.since && event.created_at < filter.since) return false;
    if (filter["#p"]) {
      const tag = event.tags.find((t) => t[0] === "p");
      if (!tag || !filter["#p"].includes(tag[1])) return false;
    }
    return true;
  }
  class FakeSocket {
    constructor(url) {
      this.url = url;
      this.r = relay(url);
      this.subs = new Map();
      queueMicrotask(() => {
        if (this.r.down) {
          this.onerror?.();
          this.onclose?.();
          return;
        }
        this.r.subs.add(this);
        this.onopen?.();
      });
    }
    send(raw) {
      const msg = JSON.parse(raw);
      if (msg[0] === "EVENT") {
        const event = msg[1];
        this.r.seenByRelay.push(event);
        if (this.r.rejectAll) return queueMicrotask(() => this.onmessage?.({ data: JSON.stringify(["OK", event.id, false, "blocked"]) }));
        this.r.events.push(event);
        queueMicrotask(() => this.onmessage?.({ data: JSON.stringify(["OK", event.id, true, ""]) }));
        for (const socket of this.r.subs) {
          for (const [id, filters] of socket.subs) {
            if (filters.some((f) => matches(f, event))) queueMicrotask(() => socket.onmessage?.({ data: JSON.stringify(["EVENT", id, event]) }));
          }
        }
      } else if (msg[0] === "REQ") {
        const [, id, ...filters] = msg;
        this.subs.set(id, filters);
        for (const event of this.r.events) {
          if (filters.some((f) => matches(f, event))) queueMicrotask(() => this.onmessage?.({ data: JSON.stringify(["EVENT", id, event]) }));
        }
      } else if (msg[0] === "CLOSE") this.subs.delete(msg[1]);
    }
    close() {
      this.r.subs.delete(this);
      queueMicrotask(() => this.onclose?.());
    }
  }
  return { relay, FakeSocket, relays };
}

export const tick = () => new Promise((resolve) => setTimeout(resolve, 5));
