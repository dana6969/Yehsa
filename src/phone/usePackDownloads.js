// Pack downloads for the Map packs sheet: progress, cancel, resume, and install.
// The file is downloaded by the system straight to disk. This hook only counts bytes.

import { useCallback, useEffect, useRef, useState } from "react";
import { PACK_CATALOG, beginDownload } from "../../symbolic/map_packs.js";
import { createPackDownloader, failureText } from "../../symbolic/pack_download.js";
import { downloadId, files, installDownloaded } from "./map_pack_manager";

export default function usePackDownloads({ store, setStore }) {
  const [jobs, setJobs] = useState({});
  const storeRef = useRef(store);
  storeRef.current = store;
  const live = useRef(true);
  const downloader = useRef(null);
  if (!downloader.current && files.downloadAdapter) {
    downloader.current = createPackDownloader({
      adapter: files.downloadAdapter,
      onChange: (id, snap) => {
        if (!live.current) return;
        setJobs((current) => {
          const next = { ...current };
          if (snap) next[id] = snap;
          else delete next[id];
          return next;
        });
      }
    });
  }
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);

  const pathFor = (item) => (item.kind === "mbtiles" ? files.mbtilesPath(downloadId(item)) : `${files.workDir}${item.id}.download`);

  const download = useCallback(async (catalogId) => {
    const dl = downloader.current;
    const item = PACK_CATALOG.find((entry) => entry.id === catalogId);
    if (!dl || !item) return;
    if (dl.snapshot(catalogId)?.state === "downloading") return;
    const planned = beginDownload(storeRef.current, catalogId, { approved: true });
    if (!planned.fetch) {
      setJobs((current) => ({ ...current, [catalogId]: { state: "error", received: 0, total: item.bytesEstimate, reason: planned.reason } }));
      return;
    }
    await files.prepare();
    const free = await files.freeBytes();
    if (Number.isFinite(free) && free < item.bytesEstimate * 1.2) {
      setJobs((current) => ({ ...current, [catalogId]: { state: "error", received: 0, total: item.bytesEstimate, reason: failureText("space") } }));
      return;
    }
    const result = await dl.start(item, pathFor(item));
    if (!result.ok) return; // paused or error: the job already says which
    setJobs((current) => ({ ...current, [catalogId]: { state: "verifying", received: item.bytesEstimate, total: item.bytesEstimate } }));
    try {
      const installed = await installDownloaded(item, storeRef.current, result.path);
      if (installed.ok) {
        setStore(installed.store);
        setJobs((current) => {
          const next = { ...current };
          delete next[catalogId];
          return next;
        });
      } else {
        setJobs((current) => ({ ...current, [catalogId]: { state: "error", received: 0, total: item.bytesEstimate, reason: installed.reason } }));
      }
    } catch {
      setJobs((current) => ({ ...current, [catalogId]: { state: "error", received: 0, total: item.bytesEstimate, reason: "Couldn't open the downloaded file. Tap Download to try again." } }));
    }
  }, [setStore]);

  const cancel = useCallback((catalogId) => downloader.current?.stop(catalogId), []);

  const discard = useCallback(async (catalogId) => {
    const item = PACK_CATALOG.find((entry) => entry.id === catalogId);
    if (!item) return;
    await downloader.current?.discard(catalogId, pathFor(item));
    setJobs((current) => {
      const next = { ...current };
      delete next[catalogId];
      return next;
    });
  }, []);

  return { jobs, download, cancel, discard };
}
