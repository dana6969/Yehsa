// Pack downloads: progress, cancel, resume, verify, update, and the catalog itself.
// The file adapter is fake, so the same logic that runs on the phone runs here.
import test from "node:test";
import assert from "node:assert/strict";
import { createPackDownloader, failureText, partialPath } from "./symbolic/pack_download.js";
import { PACK_CATALOG, emptyPackStore, packCards, formatBytes, addPack, beginDownload, storageLine, progressText } from "./symbolic/map_packs.js";
import { PACK_MANIFEST } from "./symbolic/pack_manifest.js";

const ITEM = { id: "test-pack", url: "https://example.org/test-pack.mbtiles", bytesEstimate: 1000, md5: "abc", exactBytes: true };

function fakeFiles() {
  const disk = new Map(); // path -> size
  const calls = [];
  let script = null;
  const adapter = {
    partSize: (p) => disk.get(p) || 0,
    size: (p) => (disk.has(p) ? disk.get(p) : null),
    md5: () => script?.md5 || "abc",
    move: (from, to) => { disk.set(to, disk.get(from)); disk.delete(from); calls.push(["move", from, to]); },
    remove: (p) => { disk.delete(p); calls.push(["remove", p]); },
    start({ url, path, resumeFrom, onBytes }) {
      calls.push(["start", url, resumeFrom]);
      let stopped = false;
      let release;
      const gate = new Promise((resolve) => { release = resolve; });
      const done = (async () => {
        const steps = script.steps;
        let received = resumeFrom;
        for (const step of steps) {
          if (step === "wait") { await gate; if (stopped) return { ok: false }; continue; }
          if (stopped) return { ok: false };
          received = Math.min(1000, received + step);
          disk.set(path, received);
          onBytes(received, 1000);
        }
        if (script.status) return { ok: false, status: script.status };
        if (script.fail) return { ok: false };
        return { ok: true };
      })();
      return { done, stop: async () => { stopped = true; release(); } };
    }
  };
  return { adapter, disk, calls, play: (s) => { script = s; } };
}

const clock = () => { let t = 0; return () => (t += 1000); };

test("a download reports progress, verifies the file, then moves it into place", async () => {
  const f = fakeFiles();
  f.play({ steps: [250, 250, 500] });
  const seen = [];
  const dl = createPackDownloader({ adapter: f.adapter, now: clock(), onChange: (id, snap) => seen.push(snap && { ...snap }) });
  const result = await dl.start(ITEM, "/p/test-pack.mbtiles");
  assert.equal(result.ok, true);
  assert.equal(f.disk.get("/p/test-pack.mbtiles"), 1000);
  assert.equal(f.disk.has(partialPath("/p/test-pack.mbtiles")), false);
  const received = seen.filter(Boolean).map((s) => s.received);
  assert.deepEqual([...received].sort((a, b) => a - b), received, "progress only moves forward");
  assert.ok(seen.some((s) => s?.state === "verifying"));
  assert.equal(seen.at(-1), null, "the job is cleared when it is installed");
});

test("cancel keeps the part, and resume carries on from that byte", async () => {
  const f = fakeFiles();
  f.play({ steps: [400, "wait", 100] });
  const dl = createPackDownloader({ adapter: f.adapter, now: clock() });
  const running = dl.start(ITEM, "/p/t.mbtiles");
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(await dl.stop(ITEM.id), true);
  const first = await running;
  assert.equal(first.paused, true);
  assert.equal(dl.snapshot(ITEM.id).state, "paused");
  assert.equal(f.disk.get(partialPath("/p/t.mbtiles")), 400, "what arrived is kept");
  f.play({ steps: [600] });
  const second = await dl.start(ITEM, "/p/t.mbtiles");
  assert.equal(second.ok, true);
  const starts = f.calls.filter((c) => c[0] === "start");
  assert.equal(starts[1][2], 400, "the second request starts at byte 400");
});

test("a file that fails the check is thrown away, never installed", async () => {
  const f = fakeFiles();
  f.play({ steps: [1000], md5: "wrong" });
  const dl = createPackDownloader({ adapter: f.adapter, now: clock() });
  const result = await dl.start(ITEM, "/p/t.mbtiles");
  assert.equal(result.ok, false);
  assert.equal(dl.snapshot(ITEM.id).state, "error");
  assert.equal(dl.snapshot(ITEM.id).reason, failureText("check"));
  assert.equal(f.disk.has("/p/t.mbtiles"), false);
  assert.equal(f.disk.has(partialPath("/p/t.mbtiles")), false);
});

test("a short file fails the size check", async () => {
  const f = fakeFiles();
  f.play({ steps: [300] });
  const dl = createPackDownloader({ adapter: f.adapter, now: clock() });
  const result = await dl.start(ITEM, "/p/t.mbtiles");
  assert.equal(result.ok, false);
  assert.equal(f.disk.has("/p/t.mbtiles"), false);
});

test("a dropped signal says so and offers Resume, a missing file says try later", async () => {
  const f = fakeFiles();
  f.play({ steps: [200], fail: true });
  const dl = createPackDownloader({ adapter: f.adapter, now: clock() });
  await dl.start(ITEM, "/p/t.mbtiles");
  assert.match(dl.snapshot(ITEM.id).reason, /signal|Resume/);
  assert.equal(f.disk.get(partialPath("/p/t.mbtiles")), 200);
  f.play({ steps: [], status: 404 });
  await dl.start(ITEM, "/p/t.mbtiles");
  assert.match(dl.snapshot(ITEM.id).reason, /isn't available/);
});

test("a second tap while a download runs does nothing, and discard clears the part", async () => {
  const f = fakeFiles();
  f.play({ steps: [100, "wait"] });
  const dl = createPackDownloader({ adapter: f.adapter, now: clock() });
  const running = dl.start(ITEM, "/p/t.mbtiles");
  await new Promise((r) => setTimeout(r, 5));
  const again = await dl.start(ITEM, "/p/t.mbtiles");
  assert.equal(again.started, false);
  await dl.discard(ITEM.id, "/p/t.mbtiles");
  await running;
  assert.equal(f.disk.has(partialPath("/p/t.mbtiles")), false);
  assert.equal(dl.snapshot(ITEM.id), null);
});

test("a part bigger than the pack is dropped instead of resumed", async () => {
  const f = fakeFiles();
  f.disk.set(partialPath("/p/t.mbtiles"), 5000);
  f.play({ steps: [1000] });
  const dl = createPackDownloader({ adapter: f.adapter, now: clock() });
  const result = await dl.start(ITEM, "/p/t.mbtiles");
  assert.equal(result.ok, true);
  assert.equal(f.calls.find((c) => c[0] === "start")[2], 0);
});

test("progress text gives percent and megabytes", () => {
  const text = progressText({ state: "downloading", received: 20 * 1024 * 1024, total: 40 * 1024 * 1024 });
  assert.match(text, /50%/);
  assert.match(text, /20 MB/);
  assert.match(text, /40 MB/);
});

test("Update: a newer build shows on the card and replaces the pack, not a second copy", () => {
  const item = PACK_CATALOG.find((entry) => entry.kind === "mbtiles");
  if (!item) return; // manifest not generated yet
  const installed = {
    ok: true, id: `pack-${item.id}`, catalogId: item.id, name: item.name, kind: "mbtiles", format: "mbtiles",
    file: `${item.id}.mbtiles`, bytes: item.bytesEstimate, built: "2020-01-01", license: item.license,
    attribution: item.attribution, source: item.source, bounds: item.bounds, minZoom: item.minZoom, maxZoom: item.maxZoom, lines: []
  };
  const store = addPack(emptyPackStore(), installed).store;
  const card = packCards(store).find((c) => c.catalogId === item.id);
  assert.equal(card.state, "Ready");
  assert.equal(card.canUpdate, true);
  assert.equal(card.updateAvailable, true);
  assert.equal(packCards(store).filter((c) => c.catalogId === item.id).length, 1, "never listed twice");
  const fresh = addPack(store, { ...installed, built: item.built });
  assert.equal(fresh.store.packs.length, 1);
  assert.equal(packCards(fresh.store).find((c) => c.catalogId === item.id).updateAvailable, false);
});

test("every card shown can be downloaded, or it is not shown", () => {
  const cards = packCards(emptyPackStore(), {}, { native: true });
  assert.ok(cards.length > 0);
  for (const card of cards) {
    assert.equal(card.canDownload, true, `${card.name} is shown, so it must download`);
    const item = PACK_CATALOG.find((entry) => entry.id === card.catalogId);
    assert.equal(item.downloadable, true);
    assert.match(item.url, /^https:\/\//);
    assert.ok(item.bytesEstimate > 0);
    assert.ok(item.license, `${card.name} shows its license`);
    assert.match(card.about, /\S/);
    const begin = beginDownload(emptyPackStore(), item.id, { approved: true });
    assert.equal(begin.fetch, true, `${card.name} starts`);
  }
  // On the web preview tile packs can't be stored, so those cards are not shown there.
  const web = packCards(emptyPackStore(), {}, { native: false });
  assert.ok(web.every((card) => PACK_CATALOG.find((e) => e.id === card.catalogId).kind !== "mbtiles"));
});

test("Rhode Island has a card, it sits right after Maine, and it downloads from the release", () => {
  const ri = PACK_CATALOG.find((entry) => entry.id === "ri");
  if (!PACK_MANIFEST.packs.length) return;
  assert.ok(ri, "Rhode Island is in the catalog");
  assert.match(ri.url, /^https:\/\/github\.com\/dana6969\/Yehsa\/releases\/download\/map-packs-[0-9-]+\/ri\.mbtiles$/);
  const order = PACK_MANIFEST.packs.map((p) => p.id);
  const lastMaine = Math.max(...order.map((id, i) => (id.startsWith("me-") ? i : -1)));
  assert.ok(order.indexOf("ri") > lastMaine, "Rhode Island after the Maine tiles");
  assert.ok(order.indexOf("ri") < order.indexOf("nh"), "Rhode Island before NH");
  assert.equal(order.slice(0, 4).every((id) => id.startsWith("me-")), true, "Maine first");
});

test("the manifest lists every New England state and no road or parcel layer", () => {
  if (!PACK_MANIFEST.packs.length) return;
  const ids = new Set(PACK_MANIFEST.packs.map((p) => p.id));
  for (const need of ["me-southern", "me-western-mountains", "me-downeast", "me-north-woods", "ri", "nh", "vt", "ma", "ct", "ny", "pa"]) {
    assert.ok(ids.has(need), `${need} is in the manifest`);
  }
  const text = JSON.stringify(PACK_MANIFEST.packs).toLowerCase().replace(/openstreetmap/g, "");
  assert.doesNotMatch(text, /parcel|owner|street|\broads?\b/);
  for (const pack of PACK_MANIFEST.packs) {
    assert.match(pack.license, /ODbL|public domain|Public domain/i);
    assert.match(pack.md5, /^[0-9a-f]{32}$/);
    assert.ok(pack.bytes > 1000 && pack.built);
  }
});

test("storage is counted in one place, packs and areas together, with no zero next to areas", () => {
  const store = { ...emptyPackStore(), usedBytes: 40 * 1024 * 1024 };
  assert.match(storageLine(store, 10 * 1024 * 1024), /50 MB/);
  assert.doesNotMatch(storageLine(emptyPackStore(), 0), /\b0 B\b/);
  assert.equal(formatBytes(1536), "2 KB");
});
