// Plain Node.js HTTP server for the bismillah Proof Gatekeeper agent.
// No framework: the raw body must reach the handler untouched for HMAC.
//
//   GET  /agent  -> health check { ok: true, protocolVersion: "v1" }
//   GET  /       -> same health check (root convenience)
//   POST /agent  -> task / preflight pipeline (HMAC enforced)
//   anything else -> 404
const http = require("http");
const { config } = require("./config");
const { AgentHandler } = require("./handler");
const { SeenStore } = require("./seen");

const store = new SeenStore(config.seenPath);
const handler = new AgentHandler(config, store);

function log(...args) {
  console.log(new Date().toISOString(), ...args);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  const startedAt = Date.now();

  if (req.method === "GET" && (url.pathname === "/agent" || url.pathname === "/")) {
    const r = handler.health();
    res.writeHead(r.status, { "content-type": "application/json" });
    res.end(r.body);
    log("GET", url.pathname, "->", r.status, `${Date.now() - startedAt}ms`);
    return;
  }

  if (req.method === "POST" && url.pathname === "/agent") {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", async () => {
      const rawBody = Buffer.concat(chunks);
      let result;
      try {
        result = await handler.handlePost(rawBody, req.headers["x-agent-games-signature"]);
      } catch (err) {
        log("POST /agent handler threw:", err.message);
        result = { status: 500, body: JSON.stringify({ error: "internal" }), signature: null };
      }
      const headers = { "content-type": "application/json" };
      if (result.signature) headers["x-agent-games-signature"] = result.signature;
      res.writeHead(result.status, headers);
      res.end(result.body);
      let summary = "";
      try {
        const parsed = JSON.parse(result.body);
        summary = parsed.decision ? ` ${parsed.decision}/${parsed.reason_code}` : "";
      } catch { /* non-JSON body */ }
      log("POST /agent ->", result.status, summary, `${Date.now() - startedAt}ms`);
    });
    req.on("error", (err) => {
      log("POST /agent request error:", err.message);
      try {
        res.writeHead(400, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "bad_request" }));
      } catch { /* already closed */ }
    });
    return;
  }

  res.writeHead(404, { "content-type": "application/json" });
  res.end(JSON.stringify({ error: "not_found" }));
  log(req.method, url.pathname, "-> 404");
});

server.listen(config.port, "127.0.0.1", () => {
  log(`bismillah gatekeeper listening on 127.0.0.1:${config.port}`);
  log(`circuits: ${config.circuitsDir} | seen: ${config.seenPath} (${store.size} seen)`);
  log(`hmac secret: ${config.hmacSecret ? "SET" : "NOT SET (POSTs will 500 until .env has AGENT_GAMES_HMAC_SECRET)"}`);
  log(`vk hash: ${config.gatekeeperVkHash}`);
});

process.on("SIGTERM", () => server.close(() => process.exit(0)));
process.on("SIGINT", () => server.close(() => process.exit(0)));
