function parse(text) {
  const lowered = text.trim().toLowerCase();
  if (lowered.includes('help')) return { intent: 'assist', timestamp: new Date().toISOString() };
  if (lowered.includes('remember')) return { intent: 'store_memory', timestamp: new Date().toISOString() };
  return { intent: 'unknown', timestamp: new Date().toISOString() };
}
module.exports = { parse };
