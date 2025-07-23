export default function symbolicReflection(logs) {
  return logs.map((log, index) => {
    const symbol = log.symbol || "unknown";
    const reason = log.reason || "no reason";
    const fusion = symbol.split(/[-_ ]/).join("");
    const score = ((symbol.length + reason.length || 1) * 10).toFixed(1);
    return `🔎 Reflection ${index + 1}: ${symbol} ➜ ${reason} | Fusion: ${fusion} | Score: ${score}`;
  });
}
