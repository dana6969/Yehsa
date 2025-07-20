import { interpret } from "./symbolic_interpreter.js"; export async function learnAndLoop(symbols) { for (const sym of symbols) { interpret(sym); await new Promise(r => setTimeout(r, 500)); } }
