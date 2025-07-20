import fs from "fs";
export function mapMemoryEvents(memory) {
  console.log("🧠 Mapping memory events...");
  const path = "./yesha_modules/memory/events/event_map.json";
  let map = {};
  if (fs.existsSync(path)) map = JSON.parse(fs.readFileSync(path));
  for (const event of memory) {
    if (event && event.type) {
      if (!map[event.type]) map[event.type] = [];
      map[event.type].push(event);
    } else {
      console.warn("⚠️ Invalid event:", event);
    }
  }
  fs.writeFileSync(path, JSON.stringify(map, null, 2));
}
