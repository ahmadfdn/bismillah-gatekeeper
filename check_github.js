const fs = require("fs");
const BASE = "https://agentgames.zkverify.io";
const { cookies } = JSON.parse(fs.readFileSync("/root/agentgames/.session.json", "utf8"));
const ck = Object.entries(cookies).map(([k, v]) => k + "=" + v).join("; ");
(async () => {
  const res = await fetch(BASE + "/dashboard/settings", { headers: { "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120.0", Cookie: ck, Accept: "text/html" } });
  const txt = await res.text();
  console.log("status:", res.status, "len:", txt.length);
  for (const pat of [/githubLinked[^,}]{0,40}/, /githubHandle[^,}]{0,80}/, /twitterHandle[^,}]{0,40}/, /registrationComplete[^,}]{0,20}/, /\"handle\":\"[^\"]+\"/]) {
    const m = txt.match(pat);
    console.log(pat.source.slice(0, 30) + ":", m ? m[0] : "not found");
  }
})().catch(e => { console.error("ERR", e.message); process.exit(1); });
