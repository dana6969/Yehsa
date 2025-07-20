export const symbolMemory = []; export function logSymbol(symbol) { symbolMemory.push({ symbol, timestamp: Date.now() }); }
