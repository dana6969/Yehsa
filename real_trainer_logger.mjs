import { runAutonomyLoop } from './yesha_modules/core/autonomy_loop.js';  
import fs from 'fs';  
const payload = { symbol: '🔁', logic: 'recursive' };  
const timestamp = new Date().toISOString();  
const session = Math.random().toString(36).slice(2, 10);  
const output = runAutonomyLoop(payload);  
fs.appendFileSync('./yesha_modules/logs/symbolic_output.log',  
  JSON.stringify({ timestamp, session, input: payload, output }, null, 2) + '\n');  
console.log('✅ Logged with timestamp:', timestamp);  

