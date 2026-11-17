// Sends one approved request. The key is a header only and is never passed to the log.

import { planModelSend, redactSecrets, renderOutbound } from "../../symbolic/model_link.js";

function joinUrl(base, path) {
  return `${String(base || "").replace(/\/+$/, "")}${path}`;
}

function hostOf(url) {
  try {
    return new URL(url).host;
  } catch {
    return "endpoint";
  }
}

export function requestParts(provider, outbound, apiKey) {
  const content = renderOutbound(outbound);
  if (provider.style === "ollama") {
    return {
      url: joinUrl(provider.baseUrl, "/api/chat"),
      headers: { "content-type": "application/json" },
      body: { model: provider.model, stream: false, messages: [{ role: "user", content }] }
    };
  }
  const headers = { "content-type": "application/json" };
  if (apiKey) headers.authorization = `Bearer ${apiKey}`;
  return {
    url: joinUrl(provider.baseUrl, "/chat/completions"),
    headers,
    body: { model: provider.model, messages: [{ role: "user", content }] }
  };
}

function readContent(payload, style) {
  if (style === "ollama") return payload?.message?.content || "";
  return payload?.choices?.[0]?.message?.content || "";
}

export async function sendToModel({ provider, apiKey, outbound, approved, fetchImpl, timeoutMs = 20000, log = () => {} }) {
  const plan = planModelSend({ provider, approved, hasKey: provider?.needsKey === false || Boolean(apiKey) });
  if (!plan.send) {
    log({ event: "skipped", reason: plan.reason });
    return { ok: false, text: null, reason: plan.reason };
  }
  const fetchFn = fetchImpl;
  if (typeof fetchFn !== "function") {
    return { ok: false, text: null, reason: "No network path is available. Nothing was sent." };
  }
  const parts = requestParts(provider, outbound, apiKey);
  const secrets = [apiKey];
  log({ event: "send", provider: provider.name, host: hostOf(parts.url) });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchFn(parts.url, {
      method: "POST",
      headers: parts.headers,
      body: JSON.stringify(parts.body),
      signal: controller.signal
    });
    if (response.status === 401 || response.status === 403) {
      return { ok: false, text: null, reason: "The endpoint refused the key. The key was not shown and nothing else was sent." };
    }
    if (!response.ok) {
      return { ok: false, text: null, reason: "The endpoint did not answer. Nothing else was sent." };
    }
    const payload = await response.json();
    const text = String(readContent(payload, provider.style) || "").trim();
    if (!text) return { ok: false, text: null, reason: "The model returned no text." };
    return { ok: true, text: redactSecrets(text, secrets), reason: null };
  } catch (err) {
    if (err?.name === "AbortError") {
      return { ok: false, text: null, reason: "The model did not answer in time. Nothing else was sent." };
    }
    return { ok: false, text: null, reason: "No network, or the endpoint could not be reached. Nothing else was sent." };
  } finally {
    clearTimeout(timer);
  }
}
