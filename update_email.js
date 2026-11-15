const fs = require("fs");
const BASE = "https://agentgames.zkverify.io";
// updateProfile server action (from settings page chunk 39vups3hgv6pg.js)
const ACTION_ID = "4019261d99c9896052016af78b283d3160d4794adf";
const { cookies } = JSON.parse(fs.readFileSync("/root/agentgames/.session.json", "utf8"));
const ck = Object.entries(cookies).map(([k, v]) => k + "=" + v).join("; ");
(async () => {
  // args mirror the UI form (displayName, country, bio) + the new contactEmail
  const args = [{ displayName: "ahmadfdn", country: "ID", bio: "", contactEmail: "joniieahmad@gmail.com" }];
  const res = await fetch(BASE + "/dashboard/settings", {
    method: "POST",
    headers: {
      "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120.0",
      Cookie: ck,
      "Next-Action": ACTION_ID,
      Accept: "text/x-component",
      Origin: BASE,
      Referer: BASE + "/dashboard/settings",
      "Content-Type": "text/plain;charset=UTF-8",
    },
    body: JSON.stringify(args),
  });
  console.log("status:", res.status);
  const txt = await res.text();
  console.log("len:", txt.length);
  const okM = txt.match(/"ok":true/);
  const errM = txt.match(/"error":"([^"]{0,300})"/);
  const sucM = txt.match(/"success":(true|false)/);
  if (errM) console.log("error:", errM[1]);
  if (okM) console.log("ok:true present");
  if (sucM) console.log("success:", sucM[1]);
  // does the response echo a contactEmail?
  const em = txt.match(/contactEmail[^,}\"]*[\"':][^,}\"]*/g);
  if (em) console.log("contactEmail in response:", em.slice(0, 3));
  else console.log("contactEmail NOT in response");
  console.log("raw head:", txt.slice(0, 600).replace(/"secret":"[^"]*"/g, '"secret":"[R]"'));
})().catch((e) => { console.error("ERR", e.message); process.exit(1); });
