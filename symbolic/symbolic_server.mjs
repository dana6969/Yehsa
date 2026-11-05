import fs from "fs";
import express from "express";
import { executeSymbol } from "./symbolic_action_executor.js";
import {
  admitLocalIngress,
  bearerOrHeaderToken,
  bindHost,
  meshToken
} from "./mesh_guard.js";

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", false);
app.use(express.json({ limit: "32kb" }));

app.post("/symbol", (req, res) => {
  const decision = admitLocalIngress({
    remoteAddress: req.socket?.remoteAddress,
    presentedToken: bearerOrHeaderToken(req.get("authorization"), req.get("x-yehsa-token")),
    symbol: req.body?.symbol
  });
  if (!decision.ok) {
    return res.status(decision.status).send(decision.error);
  }

  // Local owner on loopback only. HTTP bodies are not trusted mesh commands,
  // and a client-supplied action is ignored.
  const start = Date.now();
  executeSymbol(decision.symbol);
  const logLine = `[${new Date().toISOString()}] LOCAL SYMBOL: ${decision.symbol} → ACTION: ${decision.action} | ${Date.now() - start}ms\n`;
  fs.appendFileSync("./symbolic_memory/yehsa_server.log", logLine);
  res.send(`Symbol received: ${decision.symbol} → ${decision.action}`);
});

const port = Number(process.env.PORT || 3180);
const host = bindHost();

if (!host) {
  console.error("Exterior bind denied. Yehsa does not listen. Bind stays 127.0.0.1.");
} else {
  if (!meshToken()) {
    console.error("YEHSA_MESH_TOKEN is not set. POST /symbol will reject every request.");
  }
  app.listen(port, host, () => {
    console.log(`Yehsa Server listening on ${host}:${port} (this device, exterior denied)`);
  });
}
