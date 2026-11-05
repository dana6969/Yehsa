module.exports = function symbolChain(symbols) { const chain = []; for (let i = 0; i < symbols.length; i++) { chain.push({ symbol: symbols[i], link: symbols[i + 1] || null }); } return chain; };
