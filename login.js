const fs = require("fs");
const { ethers } = require("/root/element-sdk/node_modules/ethers");
const BASE = "https://agentgames.zkverify.io";
const EXPECTED = "0x2700ae5779d5b5a549ad89149656af4394cc08ba";
const jar = {};
function storeCookies(res) {
  const raw = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
  for (const c of raw) { const pair = c.split(";")[0]; const i = pair.indexOf("="); jar[pair.slice(0, i).trim()] = pair.slice(i + 1).trim(); }
}
function cookieHeader() { return Object.entries(jar).map(([k, v]) => k + "=" + v).join("; "); }
async function req(path, opts = {}) {
  const res = await fetch(BASE + path, { ...opts, headers: { "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120.0", Accept: "application/json", ...(opts.headers || {}), ...(Object.keys(jar).length ? { Cookie: cookieHeader() } : {}) } });
  storeCookies(res);
  return res;
}
(async () => {
  const key = fs.readFileSync("/root/elysium/wallet.key", "utf8").trim();
  const wallet = new ethers.Wallet(key);
  if (wallet.address.toLowerCase() !== EXPECTED) { console.log("ADDRESS MISMATCH - abort"); process.exit(1); }
  console.log("wallet:", wallet.address);
  const csrf = await (await req("/api/auth/csrf")).json();
  console.log("csrf ok:", !!csrf.csrfToken, "cookies now:", Object.keys(jar).join(","));
  const { nonce } = await (await req("/api/auth/wallet/siwe/nonce")).json();
  console.log("nonce len:", nonce && nonce.length);
  const now = new Date();
  const exp = new Date(now.getTime() + 5 * 60 * 1000);
  const msg = "agentgames.zkverify.io wants you to sign in with your Ethereum account:\n" + wallet.address + "\n\nSign in to Agent Games with your wallet.\n\nURI: https://agentgames.zkverify.io\nVersion: 1\nChain ID: 1\nNonce: " + nonce + "\nIssued At: " + now.toISOString() + "\nExpiration Time: " + exp.toISOString();
  const sig = await wallet.signMessage(msg);
  const body = new URLSearchParams({ csrfToken: csrf.csrfToken, callbackUrl: BASE + "/register", json: "true", message: msg, signature: sig });
  const res = await req("/api/auth/callback/wallet", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", "X-Auth-Return-Redirect": "1" }, body, redirect: "manual" });
  console.log("callback status:", res.status);
  console.log("callback body:", (await res.text()).slice(0, 300));
  console.log("cookies after callback:", Object.keys(jar).join(","));
  const sess = await req("/api/auth/session");
  console.log("session status:", sess.status);
  console.log("session:", (await sess.text()).slice(0, 800));
  fs.writeFileSync("/root/agentgames/.session.json", JSON.stringify({ cookies: jar }, null, 2), { mode: 0o600 });
  console.log("session saved");
})().catch((e) => { console.error("ERR", e.message); process.exit(1); });
