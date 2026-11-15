# Agent Games — Proof Gatekeeper agent for bismillah

Competition: **zkVerify Agent Games, Season 01 — Event 01 Proof Gatekeeper**
Site: https://agentgames.zkverify.io/events/proof-gatekeeper
Prize per track: 100,000 VFY (1st 50,000 ≈ $220 at $0.0044, 2nd 30,000, 3rd 20,000).
VFY is listed on KuCoin / Kraken / Gate / OKX.

## Status (2026-11-15 ~09:45 WIB)

**Endpoint is LIVE and fully verified.** What remains is Jon's registration
(account + agent registration + HMAC secret), which only he can do.

| Item | Status |
|---|---|
| Public endpoint | **LIVE** — https://gatekeeper.209-50-61-232.sslip.io/agent |
| Health check (GET /agent) | PASS — `{"ok":true,"protocolVersion":"v1"}` |
| Signed preflight | PASS through the public URL |
| Valid task end-to-end | PASS — APPROVE/VALID_CONDITION, 1.1 s roundtrip, proof verifies locally |
| Local harness (36 checks) | **36/36 PASS** — all 7 trap types + valid case + boundaries + HMAC + redelivery |
| Proof | Groth16 via snarkjs 0.7.6, official circuit, ~0.35 s on VPS |
| Registration (account) | **NOT DONE — needs Jon** (see below) |
| HMAC secret | DEV placeholder in VPS .env — **must be replaced after registration** |

## How it works

- Plain Node.js (no framework), `src/server.js` on the VPS, listening on
  `127.0.0.1:8787`; Caddy reverse-proxies it to
  `https://gatekeeper.209-50-61-232.sslip.io` (Let's Encrypt cert, auto-renewed).
- `POST /agent`: verify HMAC-SHA256 over the RAW body against
  `x-agent-games-signature` (hex or base64) BEFORE parsing; preflight
  (`agent-games.preflight.v1`) → signed `{ok:true, protocolVersion:"v1"}`;
  tasks (`agent-games.proof-gatekeeper.v1`) → deterministic decision +
  local Groth16 proof + signed response, inside the 60 s deadline.
- Decision logic (purely deterministic, no LLM in the hot path), in order:
  VK_SUBSTITUTION → PROOF_REUSED → THRESHOLD_MISMATCH →
  EXPIRED_CONDITION → RECIPIENT_MISMATCH → AMOUNT_OVERFLOW → APPROVE.
  Boundaries: balance >= minimum passes, amount <= max_transfer passes,
  current_block < expiry_block passes. Fail-closed: any uncertainty → REJECT
  (wrong approve −6, wrong reject −3).
- Proof: snarkjs `groth16.fullProve` with the official
  `gatekeeper.wasm` / `gatekeeper_final.zkey` (vkHash
  `0x6b79c6…77b0`, from `/api/circuit-info`). 13 inputs incl. private salt
  `HMAC(secret, "gatekeeper-salt:"+task_id) mod p`. PROOF_REUSED tasks carry
  no proof (documented). No Kurier key configured — proof is returned in the
  response and `proof_tx` echoes the task's own reference (sample shape on
  the event page). If proving fails, the decision is still returned without
  a proof (+12 −2 beats a timeout or wrong reject).
- Seen-set: `data/seen.json` on the VPS (proof_tx seen-set + task_id →
  response cache for idempotent redelivery). This is why the agent runs as
  one long-lived process on the VPS, not serverless.

## Deployment (VPS 209.50.61.232, /root/agentgames)

- `deploy/deploy.sh` — full redeploy from this work dir.
- `deploy/watchdog.sh` (running as `deploy-watchdog.sh` on the VPS) —
  restarts the node server and Caddy if either dies. The public URL is
  STABLE across restarts (hostname derived from the VPS IP; cert persists).
- Logs on VPS: `logs/server.log`, `logs/caddy.log`, `logs/watchdog.log`.
- `PUBLIC_URL` file on the VPS holds the current public endpoint.

### Dead ends found (do not retry)
- **trycloudflare.com quick tunnel**: Cloudflare returns HTTP 403 "Your
  request was blocked" to server-side requests — the platform could never
  reach it. Dead.
- **Pinggy free**: works but tunnels expire after 60 minutes + URL churn.
  Dead for a multi-day tournament.
- **localhost.run**: ssh tunnel never produced a URL from the VPS.
- **Vercel**: not used — creating an account in Jon's name is not allowed.

## What Jon still has to do (registration)

Registration recon (read-only, no account created):

1. Go to https://agentgames.zkverify.io/register — only two identities:
   **"Continue with X"** or **"Connect Wallet"** (Browser Wallet /
   WalletConnect, Ethereum wallet). No email/password/Google/GitHub login.
   Jon picks one.
2. Profile: public handle (unique, required — suggest `bismillah`),
   country, short bio; optionally GitHub + wallet address.
3. **Prize eligibility requires a connected GitHub account + a connected
   wallet address** (for VFY distribution); winners verified manually.
   **No KYC found.** Entry is free; wallet optional at signup but required
   before claiming prizes.
4. Dashboard → **Manage Agents** → register the agent endpoint:
   `https://gatekeeper.209-50-61-232.sslip.io/agent`
5. Dashboard → **Rotate Secret** → the platform shows a random 32-byte
   HMAC secret **ONCE**. Copy it (never paste it into chat or any AI tool).
6. Set it as the server secret and restart (Baron does this — give him the
   secret via a secure channel, or paste it into the VPS .env directly):
   ```bash
   ssh root@209.50.61.232
   printf 'AGENT_GAMES_HMAC_SECRET=<paste-secret-here>\n' > /root/agentgames/.env
   chmod 600 /root/agentgames/.env
   kill $(pgrep -f "node src/server[.]js")   # watchdog restarts it in ~20 s
   ```
   Then verify: the platform sends a signed preflight; the dashboard marks
   the agent active when it passes.
7. Dashboard → **Practice**: complete at least one practice task (unscored)
   before the scored rounds. Practice verifies the full loop live.

## Rounds (all WIB)

8 daily rounds, 16:00–02:00 IST = **17:30–03:30 WIB**, 8 tasks/agent/round,
cumulative. Round 1: 13 Nov, Round 2: 14 Nov (both done before we entered),
**Round 3: TODAY 15 Nov 17:30 WIB**, then 16, 17, 18, 19, 20 Nov.
6 rounds × 8 tasks = 48 tasks left; a perfect rule-checker can still win
despite missing rounds 1–2.

## Test evidence

- `node tests/harness.js` → **36 passed, 0 failed** (run 2026-11-15 ~09:26 WIB,
  re-run after the last change, still 36/36).
  Covers: health, preflight + signature, wrong/missing HMAC → 401,
  valid APPROVE + locally-verified proof (924 ms cold), all 5 provable traps
  with locally-verified proofs, PROOF_REUSED (no proof), redelivery cache,
  3 boundary valids (balance == minimum, amount == max, current ==
  expiry − 1), malformed JSON → 400, unknown type → 400, past deadline →
  REJECT/INVALID_TASK, no-secret behaviour (POST 500, GET 200).
- Public end-to-end (2026-11-15 ~09:44 WIB): preflight 200 via
  `https://gatekeeper.209-50-61-232.sslip.io/agent`; valid task
  APPROVE/VALID_CONDITION in 1.1 s with a proof that verifies locally
  (`snarkjs groth16 verify` OK). Response: `tests/final-task-resp.json`.
- One lesson logged: an early public test returned REJECT/INVALID_TASK
  because the test envelope's 120 s deadline had expired in transit — the
  server now logs the specific INVALID_TASK cause
  (past deadline / future issued / malformed input).

## Files

- `src/` — the agent (config, hmac, decision, prover, seen, handler, server).
  Own code; the protocol was studied from the public /build guide, the event
  page, and the public reference implementation (kept read-only under
  `reference/` — never copied, no keys/secrets/endpoints taken from it).
- `circuits/` — official `gatekeeper.wasm`, `gatekeeper_final.zkey`,
  `verification_key.json` (extracted from the zkey with snarkjs).
- `tests/harness.js` — local end-to-end suite (see above).
- `deploy/` — `deploy.sh` (full redeploy), `watchdog.sh` (v2, Caddy route).
- `.env.example` — blank secret template. `.env` (VPS only) holds the secret.
- `reference/` — public reference implementation source, study-only.
