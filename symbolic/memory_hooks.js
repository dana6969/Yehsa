import fs from "fs";

const hooks = { learn: [], execute: [], mesh: [] };

export function on(event, fn) {
  if (!hooks[event]) hooks[event] = [];
  hooks[event].push(fn);
  return () => {
    hooks[event] = hooks[event].filter((item) => item !== fn);
  };
}

export function emit(event, payload) {
  const row = { event, payload, at: new Date().toISOString() };
  fs.appendFileSync("symbolic_memory/hook_log.jsonl", `${JSON.stringify(row)}\n`);
  for (const fn of hooks[event] || []) fn(payload);
  return row;
}
