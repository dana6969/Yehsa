module.exports = function symbolicReflection(logs) { return logs.map((log, index) => `Reflection ${index + 1}: ${log.reason || log}`); };
