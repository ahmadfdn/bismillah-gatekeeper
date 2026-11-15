const fs = require("fs");
const BASE = "https://agentgames.zkverify.io";
const ACTION_ID = "40e5bf48973c6dd65ed00905968c9f214cd5d6371e";
const { cookies } = JSON.parse(fs.readFileSync("/root/agentgames/.session.json", "utf8"));
const ck = Object.entries(cookies).map(([k, v]) => k + "=" + v).join("; ");
(async () => {
  // availability re-check
  const av = await fetch(BASE + "/api/handles/availability?handle=ahmadfdn", { headers: { "User-Agent": "Mozilla/5.0", Cookie: ck } });
  console.log("availability:", await av.text());
  const args = { handle: "ahmadfdn", displayName: "ahmadfdn", contactEmail: "ahmadfdn@proton.me", country: "ID", bio: "", twitter: "ahmadfdn_" };
  const form = new FormData();
  form.append("0", JSON.stringify(args));
  const res = await fetch(BASE + "/register", {
    method: "POST",
    headers: { "User-Agent": "Mozilla/5.0", Cookie: ck, "Next-Action": ACTION_ID },
    body: form,
  });
  console.log("register status:", res.status);
  const txt = await res.text();
  console.log("register raw len:", txt.length);
  console.log(txt.slice(0, 2000));
})().catch((e) => { console.error("ERR", e.message); process.exit(1); });
