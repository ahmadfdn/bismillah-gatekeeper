const fs = require("fs");
const BASE = "https://agentgames.zkverify.io";
const ACTION_ID = "406c653ffdf23ce1306a90d56bab9777bd095b4999";
const { cookies } = JSON.parse(fs.readFileSync("/root/agentgames/.session.json", "utf8"));
const ck = Object.entries(cookies).map(([k, v]) => k + "=" + v).join("; ");
(async () => {
  const args = [{ name: "bismillah-gatekeeper", events: ["Proof Gatekeeper"], repoUrl: "", endpoint: "https://gatekeeper.209-50-61-232.sslip.io/agent" }];
  const res = await fetch(BASE + "/dashboard/agents", {
    method: "POST",
    headers: {
      "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120.0",
      Cookie: ck,
      "Next-Action": ACTION_ID,
      Accept: "text/x-component",
      Origin: BASE,
      Referer: BASE + "/dashboard/agents",
      "Content-Type": "text/plain;charset=UTF-8",
    },
    body: JSON.stringify(args),
  });
  console.log("status:", res.status);
  const txt = await res.text();
  console.log("len:", txt.length);
  const okM = txt.match(/"ok":true/);
  const errM = txt.match(/"error":"([^"]{0,300})"/);
  if (errM) console.log("error:", errM[1]);
  if (okM) {
    const secM = txt.match(/"secret":"([^"]+)"/);
    const idM = txt.match(/"agentId":"([^"]+)"/);
    const nameM = txt.match(/"name":"([^"]+)"/);
    console.log("ok=true, agentId present:", !!idM, "name:", nameM ? nameM[1] : "(?)");
    if (secM && secM[1]) {
      fs.writeFileSync("/root/agentgames/.env", "AGENT_GAMES_HMAC_SECRET=" + secM[1] + "\n", { mode: 0o600 });
      console.log("HMAC secret written to /root/agentgames/.env: YES (value not shown)");
    } else {
      console.log("HMAC secret in response: NO - rotation needed");
    }
    if (idM) fs.writeFileSync("/root/agentgames/.agent.json", JSON.stringify({ agentId: idM[1], name: nameM ? nameM[1] : null }, null, 2), { mode: 0o600 });
  } else {
    const redacted = txt.slice(0, 800).replace(/"secret":"[^"]*"/g, '"secret":"[R]"');
    console.log("raw head:", redacted);
  }
})().catch((e) => { console.error("ERR", e.message); process.exit(1); });
