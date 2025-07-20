import { symbolMap } from './symbol_map.js'; export function resolveSymbol(symbol) { return symbolMap[symbol] || symbolMap['unknown']; }
