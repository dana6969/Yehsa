export function respond(symbol, context) {
  const ts = Math.floor(Date.now() / 1000);
  console.log(`[${ts}] [Responder] Symbol received: ${symbol}`);
  switch(symbol) {
    case "mirror":
      console.log(`[${ts}] [Responder] Mirroring context: "${context}"`);
      break;
    case "unlock":
      console.log(`[${ts}] [Responder] Unlock sequence triggered for "${context}"`);
      break;
    case "fear":
      console.log(`[${ts}] [Responder] Fear response: initiating counter-routine`);
      break;
    case "hope":
      console.log(`[${ts}] [Responder] Hope acknowledged: engaging optimism protocol`);
      break;
    case "breach":
      console.log(`[${ts}] [Responder] Breach signal detected: logging for future trace`);
      break;
    default:
      console.log(`[${ts}] [Responder] Unknown symbol: "${symbol}"`);
  }
}
