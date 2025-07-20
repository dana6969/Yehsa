module.exports = function contextualFilter(symbols, context) { return symbols.filter(sym => context.relevant.includes(sym)); };
