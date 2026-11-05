module.exports = function feedbackLoop(response, logs) { logs.push(response); return logs.slice(-50); };
