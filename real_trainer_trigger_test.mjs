// Yehsa Real Trainer Trigger
import { runAutonomyLoop } from './yesha_modules/core/autonomy_loop.js';
import fs from 'fs';

console.log('⚙️ Launching real symbolic test...');
const payload = { symbol: '♾️', logic: 'recursive' };

const output = runAutonomyLoop(payload);
console.log('🧠 Autonomy Output:', output);

fs.appendFileSync('./yesha_modules/logs/output.log', JSON.stringify({ input: payload, output }, null, 2) + '\n');

