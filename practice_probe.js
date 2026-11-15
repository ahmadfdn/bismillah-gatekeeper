const fs = require("fs");
const BASE = "https://agentgames.zkverify.io";
const { cookies } = JSON.parse(fs.readFileSync("/root/agentgames/.session.json", "utf8"));
const ck = Object.entries(cookies).map(([k, v]) => k + "=" + v).join("; ");
(async () => {
  const res = await fetch(BASE + "/dashboard/practice", { headers: { "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120.0", Cookie: ck, Accept: "text/html" } });
  const txt = await res.text();
  console.log("status:", res.status, "len:", txt.length);
  fs.writeFileSync("/tmp/practice.html", txt);
  const chunks = [...txt.matchAll(/\/_next\/static\/chunks\/[^"'\s]+\.js/g)].map(m => m[0]);
  console.log("chunks:", [...new Set(chunks)].join("\n"));
  const ids = [...txt.matchAll(/[0-9a-f]{40}/g)].map(m => m[0]);
  console.log("action ids:", [...new Set(ids)].join(", "));
  // also look for dispatch-related words
  for (const w of ["dispatch", "practice", "agentId"]) {
    const i = txt.toLowerCase().indexOf(w);
    if (i >= 0) console.log(w, "->", txt.slice(Math.max(0, i - 120), i + 200).replace(/\s+/g, " "));
  }
})().catch(e => { console.error("ERR", e.message); process.exit(1); });
