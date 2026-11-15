const fs = require("fs");
const BASE = "https://agentgames.zkverify.io";
const ACTION_ID = "707d5d13b222ee40259b2cb073a5454917e650836a";
const { cookies } = JSON.parse(fs.readFileSync("/root/agentgames/.session.json", "utf8"));
const { agentId } = JSON.parse(fs.readFileSync("/root/agentgames/.agent.json", "utf8"));
const ck = Object.entries(cookies).map(([k, v]) => k + "=" + v).join("; ");
(async () => {
  const args = [agentId, "proof-gatekeeper", null];
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
  console.log("status:", res.status, "elapsedMs:", Date.now() - t0);
  const txt = await res.text();
  console.log("len:", txt.length);
  console.log("body:", txt.slice(0, 3000));
})().catch((e) => { console.error("ERR", e.message); process.exit(1); });
