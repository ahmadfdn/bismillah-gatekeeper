// Local end-to-end harness for the bismillah Proof Gatekeeper agent.
// Boots the real server on a test port with a DEV secret, replays
// spec-shaped envelopes, and verifies every proof locally with
// snarkjs groth16 verify against the extracted verification key.
//
// Run:  node tests/harness.js
// Exit 0 = all checks pass; non-zero = failure (with the failing case named).
const http = require("http");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const WORK_DIR = "/home/hatch/workspace/agentgames";
const TEST_PORT = 18787;
const TEST_SECRET = "harness-dev-secret-NOT-FOR-PRODUCTION";
const SEEN_PATH = path.join(WORK_DIR, "tests", "tmp-seen.json");
const VK_PATH = path.join(WORK_DIR, "circuits", "verification_key.json");

let passed = 0;
let failed = 0;
const failures = [];

function check(name, ok, detail) {
  if (ok) {
    passed++;
    console.log(`  PASS ${name}`);
  } else {
    failed++;
    failures.push(name);
    console.log(`  FAIL ${name}${detail ? " — " + detail : ""}`);
  }
}

function sign(secret, rawBody) {
  return crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
}

function post(port, pathName, bodyObj, secret, rawOverride) {
  return new Promise((resolve, reject) => {
    const raw = rawOverride !== undefined ? rawOverride : JSON.stringify(bodyObj);
    const headers = { "content-type": "application/json", "content-length": Buffer.byteLength(raw) };
    if (secret) headers["x-agent-games-signature"] = sign(secret, raw);
    const req = http.request(
      { host: "127.0.0.1", port, path: pathName, method: "POST", headers },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () =>
          resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString("utf8") })
        );
      }
    );
    req.on("error", reject);
    req.end(raw);
  });
}

function get(port, pathName) {
  return new Promise((resolve, reject) => {
    http.get({ host: "127.0.0.1", port, path: pathName }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () =>
        resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString("utf8") })
      );
    }).on("error", reject);
  });
}

function waitForServer(port, tries = 40) {
  return new Promise((resolve, reject) => {
    const tick = () => {
      http.get({ host: "127.0.0.1", port, path: "/agent" }, (res) => {
        res.resume();
        if (res.statusCode === 200) resolve(true);
        else if (--tries > 0) setTimeout(tick, 250);
        else reject(new Error("server did not come up"));
      }).on("error", () => {
        if (--tries > 0) setTimeout(tick, 250);
        else reject(new Error("server did not come up"));
      });
    };
    tick();
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --- Spec-shaped task envelope (values from /events/proof-gatekeeper) ---
const VK_A = "0x" + "11".repeat(32);
const VK_B = "0x" + "22".repeat(32);
const RECIP_A = "0xde4200000000000000000000000000000000009f01";
const RECIP_B = "0xde4300000000000000000000000000000000009f01";
const TX_A = "0xa4c1" + "00".repeat(28) + "8ff1";

function taskEnvelope(taskId, overrides = {}, inputOverrides = {}) {
  const now = new Date();
  const input = {
    registered_vk: VK_A,
    proof_vk: VK_A,
    minimum: "1000",
    public_balance: "1460",
    expiry_block: 19842201,
    current_block: 19832000,
    recipient: RECIP_A,
    condition_recipient: RECIP_A,
    amount: "500",
    max_transfer: "1000",
    proof_tx: TX_A,
    ...inputOverrides,
  };
  return {
    type: "agent-games.proof-gatekeeper.v1",
    task_id: taskId,
    mode: "competition",
    issued_at: now.toISOString(),
    deadline_at: new Date(now.getTime() + 120_000).toISOString(),
    input,
    ...overrides,
  };
}

function freshTx(n) {
  return "0x" + n.toString(16).padStart(64, "0");
}

async function main() {
  console.log("== bismillah gatekeeper harness ==");
  try { fs.unlinkSync(SEEN_PATH); } catch { /* ignore */ }

  const snarkjs = require(path.join(WORK_DIR, "node_modules", "snarkjs"));
  const vk = JSON.parse(fs.readFileSync(VK_PATH, "utf8"));

  const env = {
    ...process.env,
    AGENTGAMES_DIR: WORK_DIR,
    PORT: String(TEST_PORT),
    AGENT_GAMES_HMAC_SECRET: TEST_SECRET,
    SEEN_STORE_PATH: SEEN_PATH,
  };
  const server = spawn("node", [path.join(WORK_DIR, "src", "server.js")], {
    env, stdio: ["ignore", "pipe", "pipe"],
  });
  let serverLog = "";
  server.stdout.on("data", (d) => { serverLog += d.toString(); });
  server.stderr.on("data", (d) => { serverLog += d.toString(); });

  try {
    await waitForServer(TEST_PORT);
    console.log("-- health / preflight / auth --");
    const health = await get(TEST_PORT, "/agent");
    check("GET /agent -> 200 ok:true", health.status === 200 && JSON.parse(health.body).ok === true, health.body);

    const pf = { type: "agent-games.preflight.v1" };
    const pfOk = await post(TEST_PORT, "/agent", pf, TEST_SECRET);
    const pfBody = JSON.parse(pfOk.body);
    check("preflight signed -> 200 ok:true v1", pfOk.status === 200 && pfBody.ok === true && pfBody.protocolVersion === "v1", pfOk.body);
    check(
      "preflight response signature verifies",
      pfOk.headers["x-agent-games-signature"] === sign(TEST_SECRET, pfOk.body),
      "bad sig header"
    );
    const pfBad = await post(TEST_PORT, "/agent", pf, "wrong-secret");
    check("preflight wrong secret -> 401", pfBad.status === 401, `status ${pfBad.status}`);
    const pfNone = await post(TEST_PORT, "/agent", pf, null);
    check("preflight missing signature -> 401", pfNone.status === 401, `status ${pfNone.status}`);
    const pfB64 = await post(TEST_PORT, "/agent", pf, TEST_SECRET);
    check("preflight repeat ok (idempotent)", pfB64.status === 200, `status ${pfB64.status}`);

    console.log("-- valid task + proof --");
    const t0 = Date.now();
    const valid = await post(TEST_PORT, "/agent", taskEnvelope("gk_harness_valid", {}, { proof_tx: freshTx(1) }), TEST_SECRET);
    const validMs = Date.now() - t0;
    const vb = JSON.parse(valid.body);
    check("valid task -> 200 APPROVE/VALID_CONDITION", valid.status === 200 && vb.decision === "APPROVE" && vb.reason_code === "VALID_CONDITION", valid.body);
    check("valid task carries proof + 13 public signals", !!vb.proof && Array.isArray(vb.public_signals) && vb.public_signals.length === 13, `signals: ${vb.public_signals?.length}`);
    let proofOk = false;
    try {
      proofOk = await snarkjs.groth16.verify(vk, vb.public_signals, vb.proof);
    } catch (e) { proofOk = false; }
    check("valid task proof verifies locally (snarkjs)", proofOk === true);
    check("valid task response signature verifies", valid.headers["x-agent-games-signature"] === sign(TEST_SECRET, valid.body));
    check("valid task proof_tx echoed", vb.proof_tx === freshTx(1), vb.proof_tx);
    check(`valid task end-to-end < 10s (${validMs}ms)`, validMs < 10000, `${validMs}ms`);

    console.log("-- traps (each fresh proof_tx) --");
    const traps = [
      ["VK_SUBSTITUTION", { proof_vk: VK_B }],
      ["THRESHOLD_MISMATCH", { public_balance: "999" }],
      ["EXPIRED_CONDITION", { current_block: 19842201 }],
      ["RECIPIENT_MISMATCH", { recipient: RECIP_B }],
      ["AMOUNT_OVERFLOW", { amount: "1001" }],
    ];
    for (let i = 0; i < traps.length; i++) {
      const [code, inputOv] = traps[i];
      const tx = freshTx(10 + i);
      const r = await post(TEST_PORT, "/agent", taskEnvelope(`gk_harness_${code}`, {}, { proof_tx: tx, ...inputOv }), TEST_SECRET);
      const b = JSON.parse(r.body);
      check(`${code} -> REJECT/${code}`, r.status === 200 && b.decision === "REJECT" && b.reason_code === code, r.body);
      let pok = false;
      try { pok = b.proof && b.public_signals ? await snarkjs.groth16.verify(vk, b.public_signals, b.proof) : false; } catch { pok = false; }
      check(`${code} proof verifies locally`, pok === true);
    }

    console.log("-- proof reuse + redelivery --");
    const reused = await post(
      TEST_PORT, "/agent",
      taskEnvelope("gk_harness_reuse", {}, { proof_tx: freshTx(1) }), // same proof_tx as the valid task
      TEST_SECRET
    );
    const rb = JSON.parse(reused.body);
    check("PROOF_REUSED -> REJECT/PROOF_REUSED, no proof", reused.status === 200 && rb.decision === "REJECT" && rb.reason_code === "PROOF_REUSED" && !rb.proof && !rb.public_signals, reused.body);
    check("PROOF_REUSED echoes proof_tx", rb.proof_tx === freshTx(1), rb.proof_tx);

    const redel = await post(TEST_PORT, "/agent", taskEnvelope("gk_harness_valid", {}, { proof_tx: freshTx(1) }), TEST_SECRET);
    check("redelivery of same task_id -> cached identical body", redel.status === 200 && redel.body === valid.body, "body differs (would be misread as reuse)");

    console.log("-- boundary valids --");
    const boundaries = [
      ["balance == minimum", { public_balance: "1000" }],
      ["amount == max_transfer", { amount: "1000" }],
      ["current == expiry - 1", { current_block: 19842200 }],
    ];
    for (let i = 0; i < boundaries.length; i++) {
      const [name, inputOv] = boundaries[i];
      const tx = freshTx(20 + i);
      const r = await post(TEST_PORT, "/agent", taskEnvelope(`gk_harness_edge${i}`, {}, { proof_tx: tx, ...inputOv }), TEST_SECRET);
      const b = JSON.parse(r.body);
      check(`${name} -> APPROVE`, r.status === 200 && b.decision === "APPROVE", r.body);
      let pok = false;
      try { pok = await snarkjs.groth16.verify(vk, b.public_signals, b.proof); } catch { pok = false; }
      check(`${name} proof verifies`, pok === true);
    }

    console.log("-- malformed / deadline hygiene --");
    const badJson = await post(TEST_PORT, "/agent", null, TEST_SECRET, "{not json");
    check("malformed JSON -> 400 REJECT/INVALID_TASK", badJson.status === 400, `status ${badJson.status}`);
    const wrongType = await post(TEST_PORT, "/agent", { type: "something.else" }, TEST_SECRET);
    check("unknown type -> 400", wrongType.status === 400, `status ${wrongType.status}`);
    const pastDl = await post(
      TEST_PORT, "/agent",
      taskEnvelope("gk_harness_past", { deadline_at: new Date(Date.now() - 60000).toISOString() }, { proof_tx: freshTx(99) }),
      TEST_SECRET
    );
    const pb = JSON.parse(pastDl.body);
    check("past deadline -> REJECT/INVALID_TASK", pastDl.status === 200 && pb.decision === "REJECT" && pb.reason_code === "INVALID_TASK", pastDl.body);

    console.log("-- no-secret behaviour --");
    const env2 = { ...process.env, AGENTGAMES_DIR: WORK_DIR, PORT: "18788", SEEN_STORE_PATH: path.join(WORK_DIR, "tests", "tmp-seen2.json") };
    delete env2.AGENT_GAMES_HMAC_SECRET;
    const server2 = spawn("node", [path.join(WORK_DIR, "src", "server.js")], { env: env2, stdio: ["ignore", "pipe", "pipe"] });
    try {
      await waitForServer(18788);
      const noSecret = await post(18788, "/agent", pf, TEST_SECRET);
      check("no HMAC secret -> POST 500 server_misconfigured", noSecret.status === 500, `status ${noSecret.status}`);
      const h2 = await get(18788, "/agent");
      check("no HMAC secret -> GET health still 200", h2.status === 200, `status ${h2.status}`);
    } finally {
      server2.kill("SIGTERM");
      await sleep(500);
      try { fs.unlinkSync(path.join(WORK_DIR, "tests", "tmp-seen2.json")); } catch { /* ignore */ }
    }
  } finally {
    server.kill("SIGTERM");
    await sleep(500);
    try { fs.unlinkSync(SEEN_PATH); } catch { /* ignore */ }
  }

  console.log(`\n== RESULT: ${passed} passed, ${failed} failed ==`);
  if (failed > 0) {
    console.log("Failures:", failures.join("; "));
    console.log("--- server log ---");
    console.log(serverLog.slice(-3000));
    process.exit(1);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error("HARNESS CRASH:", e);
  process.exit(2);
});
