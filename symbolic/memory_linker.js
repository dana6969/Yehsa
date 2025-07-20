module.exports = function memoryLinker(memoryLog, newData) { if (!Array.isArray(memoryLog)) memoryLog = []; memoryLog.push({ timestamp: Date.now(), data: newData }); return memoryLog.slice(-50); };
