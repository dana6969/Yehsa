// Pack download controller: progress, cancel, resume, and a check of the finished file.
// Pure logic. The phone passes in a file adapter, so tests run with a fake one.
//
// The file is streamed to disk by the system (no bytes pass through JavaScript), so a big
// pack can never block the screen or run the phone out of memory. That is the guard against
// the old freeze: nothing here reads, decodes, or draws the file. It only counts bytes.
//
// adapter:
//   partSize(path) -> number               bytes already on disk for the partial file (0 if none)
//   start({ url, path, resumeFrom, onBytes(received, total) }) -> { done: Promise<{ ok, status? }>, stop(): Promise<void> }
//   size(path) -> number | null
//   md5(path) -> string | null
//   move(from, to) -> void
//   remove(path) -> void

export const PROGRESS_EVERY_MS = 250;

export function partialPath(finalPath) {
  return `${finalPath}.part`;
}

export function failureText(kind) {
  switch (kind) {
    case "network":
      return "Couldn't reach the download. Check your signal and tap Resume. What was already downloaded is kept.";
    case "check":
      return "The file didn't pass the check, so it was thrown away. Tap Download to try again.";
    case "space":
      return "There isn't enough room on this phone. Nothing was kept.";
    case "http":
      return "The download isn't available right now. Try again later.";
    default:
      return "Couldn't finish this download. Tap Resume to try again.";
  }
}

export function createPackDownloader({ adapter, now = () => Date.now(), onChange = () => {} } = {}) {
  const jobs = new Map(); // id -> { handle, state, received, total, item, finalPath, stopping }

  function publish(id, patch) {
    const job = jobs.get(id);
    if (!job) return;
    Object.assign(job, patch);
    onChange(id, snapshot(id));
  }

  function snapshot(id) {
    const job = jobs.get(id);
    if (!job) return null;
    return { state: job.state, received: job.received, total: job.total, reason: job.reason || null };
  }

  async function start(item, finalPath, { discard = false } = {}) {
    const id = item.id;
    const existing = jobs.get(id);
    if (existing && existing.state === "downloading") return { started: false, reason: "busy" };
    const part = partialPath(finalPath);
    if (discard) await adapter.remove(part);
    let resumeFrom = await adapter.partSize(part);
    // A partial bigger than the file, or one with nothing in it, is not worth resuming.
    if (resumeFrom > item.bytesEstimate || resumeFrom < 0) {
      await adapter.remove(part);
      resumeFrom = 0;
    }
    const job = { state: "downloading", received: resumeFrom, total: item.bytesEstimate, item, finalPath, handle: null, reason: null, stopping: false };
    jobs.set(id, job);
    onChange(id, snapshot(id));
    let lastAt = 0;
    let lastPct = -1;
    const onBytes = (received, total) => {
      if (job.stopping) return;
      const t = now();
      const pct = job.total ? Math.floor((received / job.total) * 200) : 0; // half-percent steps
      if (t - lastAt < PROGRESS_EVERY_MS && pct === lastPct) return;
      if (t - lastAt < PROGRESS_EVERY_MS) return;
      lastAt = t;
      lastPct = pct;
      publish(id, { received, total: total && total > 0 ? Math.max(total, job.total) : job.total });
    };
    let outcome;
    try {
      job.handle = adapter.start({ url: item.url, path: part, resumeFrom, onBytes });
      outcome = await job.handle.done;
    } catch (err) {
      outcome = { ok: false, error: err };
    }
    if (job.stopping) {
      publish(id, { state: "paused", reason: null });
      return { started: true, paused: true };
    }
    if (!outcome?.ok) {
      const http = outcome?.status && outcome.status >= 400;
      // A refused range after a restart: start over from zero next time.
      if (outcome?.status === 416) await adapter.remove(part);
      publish(id, { state: "error", reason: failureText(http ? "http" : "network") });
      return { started: true, ok: false, reason: job.reason };
    }
    publish(id, { state: "verifying", received: job.total });
    const size = await adapter.size(part);
    if (size == null || size <= 0 || (item.exactBytes === true && size !== item.bytesEstimate)) {
      await adapter.remove(part);
      publish(id, { state: "error", reason: failureText("check") });
      return { started: true, ok: false, reason: job.reason };
    }
    if (item.md5) {
      const sum = await adapter.md5(part);
      if (sum && sum !== item.md5) {
        await adapter.remove(part);
        publish(id, { state: "error", reason: failureText("check") });
        return { started: true, ok: false, reason: job.reason };
      }
    }
    await adapter.move(part, finalPath);
    jobs.delete(id);
    onChange(id, null);
    return { started: true, ok: true, path: finalPath, bytes: size };
  }

  // Cancel keeps what has arrived, so Resume carries on from that byte.
  async function stop(id) {
    const job = jobs.get(id);
    if (!job || job.state !== "downloading") return false;
    job.stopping = true;
    try {
      await job.handle?.stop?.();
    } catch {
      // already finished or never started
    }
    return true;
  }

  async function discard(id, finalPath) {
    const job = jobs.get(id);
    if (job && job.state === "downloading") await stop(id);
    await adapter.remove(partialPath(finalPath || job?.finalPath));
    jobs.delete(id);
    onChange(id, null);
  }

  return { start, stop, discard, snapshot, has: (id) => jobs.has(id) };
}
