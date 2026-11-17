// Saved offline areas ("Download this area"): the list, drawing them, and delete with Undo.
// Lives in the Map screen, not in the sheet, so closing the sheet never stops the work.

import { useCallback, useEffect, useRef, useState } from "react";
import { loadAreas, removeArea, saveAreas, sweepAreas } from "./area_store";
import { publishAreas } from "./tile_server";
import { renderArea } from "./area_render";
import { createUndoable } from "../../symbolic/area_undo.js";


export default function useAreas() {
  const [areas, setAreas] = useState([]);
  const [ready, setReady] = useState(false);
  const [drawing, setDrawing] = useState(null); // { id, done, total }
  const [pending, setPending] = useState(null); // { area, text } while Undo is open
  const ref = useRef([]);
  const undoable = useRef(null);
  if (!undoable.current) {
    undoable.current = createUndoable({ removeFiles: (id) => removeArea(id), onChange: (value) => setPendingSafe(value) });
  }
  function setPendingSafe(value) {
    if (live.current) setPending(value);
  }
  const live = useRef(true);
  const busy = useRef(false);
  const abort = useRef(null);

  const commit = useCallback(async (list) => {
    ref.current = list;
    if (live.current) setAreas(list);
    await saveAreas(list).catch(() => {});
  }, []);

  useEffect(() => {
    live.current = true;
    loadAreas().then(async (list) => {
      if (!live.current) return;
      // A job that was running when the app closed is paused, not "downloading" forever.
      const fixed = list.map((area) => (area.status === "downloading" || area.status === "rendering" ? { ...area, status: area.done?.length >= area.total ? "complete" : "partial" } : area));
      await sweepAreas(fixed.map((area) => area.id));
      ref.current = fixed;
      setAreas(fixed);
      setReady(true);
    }).catch(() => setReady(true));
    return () => {
      live.current = false;
      abort.current?.abort();
      undoable.current.settle();
    };
  }, []);

  useEffect(() => {
    publishAreas(areas);
  }, [areas]);

  // Draw any finished area that has no drawn copy yet. This also covers areas downloaded
  // before the drawn copy existed.
  useEffect(() => {
    if (!ready || busy.current) return;
    const todo = areas.find((area) => area.done?.length && !area.rendered && !area.renderFailed && area.status !== "downloading");
    if (!todo) return;
    busy.current = true;
    const controller = new AbortController();
    abort.current = controller;
    setDrawing({ id: todo.id, done: 0, total: todo.done.length });
    renderArea(todo, {
      signal: controller.signal,
      onProgress: (p) => live.current && setDrawing({ id: todo.id, done: p.done, total: p.total })
    }).then(async (result) => {
      if (controller.signal.aborted || !live.current) return;
      const next = ref.current.map((area) => (area.id === todo.id
        ? { ...area, rendered: result.drawn > 0, renderFailed: result.drawn === 0, renderBytes: result.renderBytes, status: area.done.length >= area.total ? "complete" : "partial" }
        : area));
      await commit(next);
    }).catch(() => {
      // Left undrawn: it tries again the next time the Map opens.
    }).finally(() => {
      busy.current = false;
      if (live.current) setDrawing(null);
    });
  }, [ready, areas, commit]);

  // The row goes at once. The files stay for a few seconds so Undo can bring it back.
  const remove = useCallback(async (area, label) => {
    await commit(undoable.current.remove(ref.current, area, label));
  }, [commit]);

  const undo = useCallback(async () => {
    await commit(undoable.current.undo(ref.current));
  }, [commit]);

  return { areas, ready, drawing, pending, commit, remove, undo, listRef: ref };
}
