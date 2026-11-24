// The only door out for learn-from-the-internet. Every request goes through checkUrl, and every
// response is size-capped, time-capped, and type-checked before anything reads it.
// HTTPS only. A short list of hosts. No cookies, no login, no redirect to a host that is not on the list.

// Names Yehsa honestly. The "Mozilla/5.0 (Linux; Android)" prefix is there because many state sites
// (maine.gov among them) refuse any request whose agent does not start that way.
export const USER_AGENT = "Mozilla/5.0 (Linux; Android) Yehsa/1.0 (offline survival app; user-requested lookup, no account)";

// The allowlist. Nothing else is ever fetched. See symbolic/web/allowlist.js for what each one is.
export const HOST_GROUPS = {
  wikipedia: { exact: ["en.wikipedia.org"], suffix: [] },
  weather: { exact: ["api.weather.gov"], suffix: [] },
  // CDC, NWS, USDA (USFS is fs.usda.gov), USFWS, NPS. Subdomains of these are allowed.
  page: { exact: [], suffix: ["cdc.gov", "weather.gov", "usda.gov", "fws.gov", "nps.gov"] },
  // The two Army publications are read from the on-phone ATP pack. Their address is a citation only.
  atp: { exact: ["armypubs.army.mil"], suffix: [] },
  // General look-up (Dana, Nov 24: "pull whatever I ask it"). Two keyless search pages get only the
  // cleaned question words. Result pages are any public https site, read as plain text and quoted.
  search: { exact: ["html.duckduckgo.com", "www.bing.com"], suffix: [] },
  open: { exact: [], suffix: [], publicHost: true }
};

// Never fetched on the open web: local names, private networks, and hosts that are not real sites.
const PRIVATE_HOST = /(?:^|\.)(?:localhost|local|internal|intranet|lan|home|corp|onion|arpa|test|invalid|example)$/i;

// Groups that may be cited but never fetched. State wildlife pages are link-only.
export const LINK_ONLY = new Set(["atp", "state-wildlife"]);

export const LIMITS = {
  maxBytes: 262144,
  timeoutMs: 10000,
  maxRedirects: 2,
  maxUrlChars: 400
};

const TYPES = {
  json: /^application\/(?:[a-z.+-]*\+)?json\b/i,
  html: /^text\/html\b/i,
  text: /^text\/plain\b/i,
  xml: /^(?:application|text)\/(?:rss\+)?xml\b/i
};

function hostAllowed(host, group) {
  const rule = HOST_GROUPS[group];
  if (!rule) return false;
  if (rule.exact.includes(host)) return true;
  if (rule.publicHost) return publicHost(host);
  return rule.suffix.some((domain) => host === domain || host.endsWith(`.${domain}`));
}

/** A real public site name: letters, at least one dot, a letter TLD, not local or private. */
export function publicHost(host) {
  if (!host || host.length > 253 || !host.includes(".")) return false;
  if (!/^[a-z0-9.-]+$/.test(host) || /^[.-]|[.-]$|\.\./.test(host)) return false;
  if (!/\.[a-z]{2,24}$/.test(host)) return false;
  return !PRIVATE_HOST.test(host);
}

/** Returns { ok, url, host } or { ok: false, reason }. */
export function checkUrl(text, group) {
  const raw = String(text || "").trim();
  if (raw.length === 0 || raw.length > LIMITS.maxUrlChars) return { ok: false, reason: "That address is empty or too long." };
  if (/[\u0000-\u001f\u007f\s]/.test(raw)) return { ok: false, reason: "That address has characters I will not send." };
  let url;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: "That is not a web address." };
  }
  if (url.protocol !== "https:") return { ok: false, reason: "Only https:// addresses are allowed." };
  if (url.username || url.password) return { ok: false, reason: "An address with a login in it is not allowed." };
  if (url.port && url.port !== "443") return { ok: false, reason: "Only the standard port is allowed." };
  const host = url.hostname.toLowerCase();
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(":") || host.startsWith("[")) {
    return { ok: false, reason: "Numeric addresses are not allowed." };
  }
  if (host.includes("xn--")) return { ok: false, reason: "That host name uses look-alike characters." };
  if (!hostAllowed(host, group)) return { ok: false, reason: "That site is not on the list I can fetch from." };
  url.hash = "";
  return { ok: true, url: url.toString(), host };
}

function withTimeout(promise, ms, abort) {
  let timer;
  const clock = new Promise((_, reject) => {
    timer = setTimeout(() => {
      abort?.();
      reject(new Error("timeout"));
    }, ms);
  });
  return Promise.race([promise, clock]).finally(() => clearTimeout(timer));
}

async function readCapped(response, maxBytes) {
  const length = Number(response.headers?.get?.("content-length"));
  if (Number.isFinite(length) && length > maxBytes) throw new Error("too-big");
  const reader = response.body?.getReader?.();
  if (reader) {
    const chunks = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > maxBytes) {
        try {
          await reader.cancel();
        } catch {
          // Ignore.
        }
        throw new Error("too-big");
      }
      chunks.push(value);
    }
    const all = new Uint8Array(total);
    let at = 0;
    for (const chunk of chunks) {
      all.set(chunk, at);
      at += chunk.length;
    }
    return new TextDecoder("utf-8").decode(all);
  }
  const text = await response.text();
  if (text.length > maxBytes) throw new Error("too-big");
  return text;
}

/**
 * Fetch one allowed URL. kind is "json" | "html". Returns { ok, text, finalUrl } or { ok: false, reason }.
 * Nothing is read from a response whose host is off the list, whose type is wrong, or that is too big.
 */
export async function guardedFetch({ fetchImpl, url, group, kind = "json", limits = {} }) {
  const cap = { ...LIMITS, ...limits };
  if (LINK_ONLY.has(group)) return { ok: false, reason: "That source is a link only. Yehsa does not fetch it." };
  if (typeof fetchImpl !== "function") return { ok: false, reason: "No network is available here." };
  let current = checkUrl(url, group);
  if (!current.ok) return { ok: false, reason: current.reason };
  try {
    for (let hop = 0; hop <= cap.maxRedirects; hop += 1) {
      const controller = typeof AbortController === "function" ? new AbortController() : null;
      const response = await withTimeout(
        fetchImpl(current.url, {
          method: "GET",
          redirect: "manual",
          credentials: "omit",
          cache: "no-store",
          signal: controller?.signal,
          headers: { Accept: kind === "json" ? "application/json" : kind === "xml" ? "application/rss+xml, text/xml" : "text/html", "User-Agent": USER_AGENT }
        }),
        cap.timeoutMs,
        () => controller?.abort()
      );
      if (response.status >= 300 && response.status < 400) {
        const next = checkUrl(new URL(response.headers?.get?.("location") || "", current.url).toString(), group);
        if (!next.ok) return { ok: false, reason: "The page tried to send me somewhere I do not fetch from. Nothing was kept." };
        current = next;
        continue;
      }
      if (response.type === "opaqueredirect") return { ok: false, reason: "The page redirected and I could not follow it safely. Nothing was kept." };
      if (!response.ok) return { ok: false, reason: `The site answered ${response.status}. Nothing was kept.` };
      const landed = response.url ? checkUrl(response.url, group) : current;
      if (!landed.ok) return { ok: false, reason: "The page ended up somewhere I do not fetch from. Nothing was kept." };
      const type = String(response.headers?.get?.("content-type") || "");
      if (!TYPES[kind].test(type) && !(kind === "html" && TYPES.text.test(type))) {
        return { ok: false, reason: "That is not the kind of page I read. Nothing was kept." };
      }
      const text = await withTimeout(readCapped(response, cap.maxBytes), cap.timeoutMs, () => controller?.abort());
      return { ok: true, text, finalUrl: landed.url };
    }
    return { ok: false, reason: "Too many redirects. Nothing was kept." };
  } catch (err) {
    if (err?.message === "too-big") return { ok: false, reason: "That page is bigger than I will read. Nothing was kept." };
    if (err?.message === "timeout") return { ok: false, reason: "The site took too long. Nothing was kept." };
    return { ok: false, reason: "I couldn't reach the site. Nothing was kept." };
  }
}
