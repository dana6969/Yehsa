import fs from "fs";
const quarantinePath = "symbolic_memory/quarantine_log.json";
export function quarantine(symbol, reason = "Unspecified") {
  const now = new Date().toISOString();
  const entry = { symbol, reason, time: now };
  const log = fs.existsSync(quarantinePath) ? JSON.parse(fs.readFileSync(quarantinePath, "utf8")) : [];
  if (log.some(e => e.symbol === symbol)) return console.log(`🛑 Already quarantined: ${symbol}`);
  log.push(entry);
  fs.writeFileSync(quarantinePath, JSON.stringify(log, null, 2));
  console.log(`⚠️ Quarantined: ${symbol} — Reason: ${reason} @ ${now}`);
}
