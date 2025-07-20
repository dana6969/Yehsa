import fs from "fs";
import express from "express";
import { getMappedAction } from "./symbolic_dictionary.js";
import { receiveMeshCommand } from "./mesh_listener.js";

const app = express();
app.use(express.json());

app.post("/symbol", (req, res) => {
  const start = Date.now();
  const { symbol } = req.body;
  const action = getMappedAction(symbol);

  if (action) {
    receiveMeshCommand({ symbol, action }); // fast dispatch before logging
    const logLine = `[${new Date().toISOString()}] SYMBOL: ${symbol} → ACTION: ${action} | ${Date.now() - start}ms\n`;
    fs.appendFileSync("./symbolic_memory/yehsa_server.log", logLine);
    res.send(`✅ Symbol received: ${symbol} → ${action}`);
  } else {
    res.status(400).send("❌ Unknown symbol.");
  }
});

const PORT = process.env.PORT || 3180;
app.listen(PORT, () => {
  console.log(`✅ Yehsa Server listening on port ${PORT}`);
});
