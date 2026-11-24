// Scrollable chip rows put the chosen option first, so it is always on screen. Order of the rest is kept.
export function selectedFirst(options, value) {
  const list = Array.isArray(options) ? options : [];
  const at = list.findIndex((option) => option.id === value);
  if (at <= 0) return list;
  return [list[at], ...list.slice(0, at), ...list.slice(at + 1)];
}
