// Holds the imported-books store and its finished token index for the Ask path.
// The Books screen (or app boot) registers them; askField reads them only when
// every approved note, safety rule and learned note has already missed.

let store = null;
let index = null;
const listeners = new Set();

export function registerImported(nextStore, nextIndex = null) {
  store = nextStore || null;
  index = nextIndex && nextIndex.size === (nextStore?.notes?.length || 0) ? nextIndex : null;
  for (const fn of listeners) {
    try {
      fn(store);
    } catch {
      // A listener error does not change the store.
    }
  }
}

export function currentImported() {
  return store;
}

export function currentImportIndex() {
  return index;
}

export function onImportedChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
