module.exports = function patternDecoder(input) { const patterns = { "111": "emergency", "101": "conflict", "010": "calm", "000": "null" }; return patterns[input] || "unknown"; };
