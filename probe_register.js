const fs = require("fs");
const BASE = "https://agentgames.zkverify.io";
// registerAction (used at initial registration). PROBE ONLY: identical to currently
// stored values, so even an upsert writes no change. Purpose: learn whether the
// action guards against re-registration on a completed account.
const ACTION_ID = "40e5bf48973c6dd65ed00905968c9f214cd5d6371e";
const { cookies } = JSON.parse(fs.readFileSync("/root/agentgames/.session.json", "utf8"));
const ck = Object.entries(cookies).map(([k, v]) => k + "=" + v).join("; ");
(async () => {
  const args = [{ handle: "ahmadfdn", displayName: "ahmadfdn", contactEmail: "ahmadfdn@proton.me", country: "ID", bio: "", twitter: "ahmadfdn_" }];
  const res = await fetch(BASE + "/register", {
    method: "POST",
    headers: {
      "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120.0",
      Cookie: ck,
      "Next-Action": ACTION_ID,
      Accept: "text/x-component",
      Origin: BASE,
      Referer: BASE + "/register",
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
  if (okM) console.log("ok:true present");
  console.log("raw head:", txt.slice(0, 600));
})().catch((e) => { console.error("ERR", e.message); process.exit(1); });
