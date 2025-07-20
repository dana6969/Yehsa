import fs from 'fs';

export function writeToSymbolicMemory(entry) {
  const path = './yesha_modules/logs/symbolic_memory.json';
  let data = [];
  if (fs.existsSync(path)) {
    try {
      data = JSON.parse(fs.readFileSync(path));
    } catch (e) {}
  }
  entry.timestamp = new Date().toISOString();
  data.push(entry);
  fs.writeFileSync(path, JSON.stringify(data, null, 2));
}
