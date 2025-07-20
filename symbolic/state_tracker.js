export let systemState = {}; export function updateState(key, value) { systemState[key] = value; } export function getState(key) { return systemState[key]; }
