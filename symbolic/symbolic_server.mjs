import fs from "fs";
import express from "express";
import { executeSymbol } from "./symbolic_action_executor.js";
import {
  allowlistedSymbol,
  bearerOrHeaderToken,
  bindHost,
  meshToken,
  tokenMatches
} from "./mesh_guard.js";

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "32kb" }));

app.post("/symbol", (req, res) => {
  if (!meshToken()) {
    return res.status(503).send("YEHSA_MESH_TOKEN is not set");
  }
  const presented = bearerOrHeaderToken(req.get("authorization"), req.get("x-yehsa-token"));
  if (!tokenMatches(presented)) {
    return res.status(401).send("unauthorized");
  }

  const allowed = allowlistedSymbol(req.body?.symbol);
  if (!allowed) {
    return res.status(400).send("symbol is missing or not allowlisted");
  }

  // Local execution only. HTTP bodies are not trusted mesh commands, and the
  // client-supplied action (if any) is ignored.
  const start = Date.now();
  executeSymbol(allowed.symbol);
  const logLine = `[${new Date().toISOString()}] LOCAL SYMBOL: ${allowed.symbol} → ACTION: ${allowed.action} | ${Date.now() - start}ms\n`;
  fs.appendFileSync("./symbolic_memory/yehsa_server.log", logLine);
  res.send(`Symbol received: ${allowed.symbol} → ${allowed.action}`);
});

const port = Number(process.env.PORT || 3180);
const host = bindHost();

if (!meshToken()) {
  console.error("YEHSA_MESH_TOKEN is not set. POST /symbol will reject every request.");
}

app.listen(port, host, () => {
  console.log(`Yehsa Server listening on ${host}:${port}`);
});
