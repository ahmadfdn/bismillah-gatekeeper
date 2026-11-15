const fs = require("fs");
const BASE = "https://agentgames.zkverify.io";
const ACTION_ID = "707d5d13b222ee40259b2cb073a5454917e650836a";
const { cookies } = JSON.parse(fs.readFileSync("/root/agentgames/.session.json", "utf8"));
const { agentId } = JSON.parse(fs.readFileSync("/root/agentgames/.agent.json", "utf8"));
const ck = Object.entries(cookies).map(([k, v]) => k + "=" + v).join("; ");
(async () => {
  let sessionId = null;
  const N = parseInt(process.argv[2] || "5", 10);
  for (let i = 0; i < N; i++) {
    const args = [agentId, "proof-gatekeeper", sessionId];
    const t0 = Date.now();
    const res = await fetch(BASE + "/dashboard/practice", {
      method: "POST",
      headers: {
        "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120.0",
        Cookie: ck,
        "Next-Action": ACTION_ID,
        Accept: "text/x-component",
        Origin: BASE,
        Referer: BASE + "/dashboard/practice",
        "Content-Type": "text/plain;charset=UTF-8",
      },
      body: JSON.stringify(args),
    });
    const txt = await res.text();
    const m = txt.match(/1:\{[^}]*\}/);
    let summary = "unparsed";
    try {
      // find the result object: the chunk starting with 1:{...} may be truncated; parse the full JSON-ish payload
      const idx = txt.indexOf('{"ok":true');
      const end = txt.indexOf("}\n", idx);
      const obj = JSON.parse(txt.slice(idx, end + 1));
      summary = `task=${obj.taskId} trap=${obj.trapType} expected=${obj.expectedDecision} agent=${obj.agentDecision} correct=${obj.correct} proof=${obj.proofStatus} reason=${obj.reasonCode} latency=${obj.latency}ms`;
      if (obj.sessionId) sessionId = obj.sessionId;
      // extract expiry/current from the request echo
      const req = JSON.parse(obj.request);
      summary += ` expiry=${req.input.expiry_block} current=${req.input.current_block}`;
    } catch (e) { summary = "parse fail: " + e.message + " | head: " + txt.slice(0, 300); }
    console.log(`[${i + 1}/${N}] ${res.status} ${Date.now() - t0}ms ${summary}`);
  }
})().catch((e) => { console.error("ERR", e.message); process.exit(1); });
