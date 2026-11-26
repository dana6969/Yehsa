// Delete with Undo for saved areas. The row leaves the list at once. The files stay for a few
// seconds, so Undo brings the area back whole. After that they are removed for good.
// Pure: the timer and the file removal are passed in, so node tests drive it.

export const UNDO_MS = 8000;

export function createUndoable({ removeFiles, setTimer = setTimeout, clearTimer = clearTimeout, onChange = () => {}, ms = UNDO_MS } = {}) {
  let held = null; // { area, text, timer }

  function settle() {
    if (!held) return;
    clearTimer(held.timer);
    const { area } = held;
    held = null;
    onChange(null);
    return Promise.resolve(removeFiles(area.id)).catch(() => {});
  }

  return {
    // list: the current areas. Returns the list without the area.
    remove(list, area, label) {
      settle();
      const text = `${label || "Area"} removed.`;
      held = { area, text, timer: setTimer(() => settle(), ms) };
      onChange({ area, text });
      return list.filter((item) => item.id !== area.id);
    },
    // Returns the list with the area back in it, or the list unchanged when there is nothing to undo.
    undo(list) {
      if (!held) return list;
      clearTimer(held.timer);
      const { area } = held;
      held = null;
      onChange(null);
      return [...list.filter((item) => item.id !== area.id), area];
    },
    settle,
    pending: () => (held ? { area: held.area, text: held.text } : null)
  };
}
