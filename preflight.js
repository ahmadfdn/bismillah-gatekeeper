const fs = require("fs");
const BASE = "https://agentgames.zkverify.io";
const ACTION_ID = "4004a8c359b186f7c18dcf3670b6660e389580c550";
const { cookies } = JSON.parse(fs.readFileSync("/root/agentgames/.session.json", "utf8"));
const { agentId } = JSON.parse(fs.readFileSync("/root/agentgames/.agent.json", "utf8"));
const ck = Object.entries(cookies).map(([k, v]) => k + "=" + v).join("; ");
(async () => {
  const args = [agentId];
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
  console.log("body:", txt.slice(0, 1200));
})().catch((e) => { console.error("ERR", e.message); process.exit(1); });
