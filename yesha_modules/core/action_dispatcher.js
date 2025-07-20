export function dispatchAction(result) {
  if (result.action === "alert") console.log(`[Yehsa Alert] Level: ${result.level}`);
  else if (result.action === "reflect") console.log(`[Yehsa Reflect] Depth: ${result.depth}`);
  else if (result.action === "expand") console.log(`[Yehsa Expand] Topic: ${result.topic}`);
  else console.log(`[Yehsa Process] Symbols: ${JSON.stringify(result.symbols)}`);
}
