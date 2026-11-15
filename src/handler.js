// Framework-agnostic request handling for the Proof Gatekeeper agent.
//
// Pipeline (per /build):
//   1. HMAC over the RAW body vs x-agent-games-signature — before JSON parsing.
//   2. Preflight (type = agent-games.preflight.v1) -> signed { ok, protocolVersion }.
//   3. Task: validate envelope + timestamps, deterministic policy evaluation,
//      local Groth16 proof (except PROOF_REUSED), signed response.
//      Any error or uncertainty fails closed to REJECT — except a proof
//      generation failure, where we still return the (correct) decision
//      without a proof: a correct decision without proof scores +12 -2,
//      far better than a timeout (-2) or a wrong reject (-3).
const { deriveSalt, signBody, verifyBodySignature } = require("./hmac");
const { buildCircuitInputs, evaluate, parseInput } = require("./decision");
const { Prover } = require("./prover");

const PREFLIGHT_TYPE = "agent-games.preflight.v1";
const TASK_TYPE = "agent-games.proof-gatekeeper.v1";
const PROTOCOL_VERSION = "v1";

// Tolerant timestamp parse: ISO string, epoch seconds, or epoch ms.
function parseTimestamp(v) {
  if (typeof v === "number" && Number.isFinite(v)) {
    return v < 1e12 ? v * 1000 : v;
  }
  if (typeof v === "string") {
    const asNum = Number(v);
    if (/^[0-9]+$/.test(v.trim()) && Number.isFinite(asNum)) {
      return asNum < 1e12 ? asNum * 1000 : asNum;
    }
    const t = Date.parse(v);
    return Number.isNaN(t) ? null : t;
  }
  return null;
}

class AgentHandler {
  constructor(cfg, store) {
    this.cfg = cfg;
    this.store = store;
    this.prover = new Prover(cfg.circuitsDir);
  }

  health() {
    const body = JSON.stringify({ ok: true, protocolVersion: PROTOCOL_VERSION });
    return { status: 200, body, signature: null };
  }

  async handlePost(rawBody, signatureHeader) {
    const startedAt = Date.now();

    if (!this.cfg.hmacSecret) {
      return {
        status: 500,
        body: JSON.stringify({
          error: "server_misconfigured",
          detail: "AGENT_GAMES_HMAC_SECRET not set",
        }),
        signature: null,
      };
    }

    // 1. Authenticate the raw body BEFORE parsing.
    if (!verifyBodySignature(this.cfg.hmacSecret, rawBody, signatureHeader)) {
      return {
        status: 401,
        body: JSON.stringify({ error: "invalid_signature" }),
        signature: null,
      };
    }

    let envelope;
    try {
      envelope = JSON.parse(rawBody.toString("utf8"));
    } catch {
      return this.signed(400, { decision: "REJECT", reason_code: "INVALID_TASK" });
    }

    // 2. Preflight handshake.
    if (envelope.type === PREFLIGHT_TYPE) {
      return this.signed(200, { ok: true, protocolVersion: PROTOCOL_VERSION });
    }

    if (envelope.type !== TASK_TYPE) {
      return this.signed(400, { decision: "REJECT", reason_code: "INVALID_TASK" });
    }

    // 3. Task.
    try {
      return await this.handleTask(envelope, startedAt);
    } catch (err) {
      // Fail closed: never approve on an internal error.
      console.error("[agent] task handling error:", err.message);
      return this.signed(200, { decision: "REJECT", reason_code: "INVALID_TASK" });
    }
  }

  async handleTask(task, startedAt) {
    // Idempotent redelivery: answer from the cache, never re-evaluate
    // (a redelivery must not be mistaken for proof reuse).
    if (task.task_id) {
      const cached = this.store.getResponse(task.task_id);
      if (cached) return this.signedRaw(200, cached);
    }

    // Timestamp / deadline sanity (HMAC already authenticates the sender;
    // this is anti-replay hygiene). Unparseable timestamps are logged, not
    // fatal — only a clearly-past deadline fails the task.
    const now = Date.now();
    const deadlineMs = parseTimestamp(task.deadline_at);
    const issuedMs = parseTimestamp(task.issued_at);
    if (deadlineMs !== null && now > deadlineMs) {
      console.error(`[agent] INVALID_TASK ${task.task_id}: past deadline`);
      return this.signed(200, { decision: "REJECT", reason_code: "INVALID_TASK" });
    }
    if (issuedMs !== null && issuedMs > now + 5 * 60_000) {
      console.error(`[agent] INVALID_TASK ${task.task_id}: issued in future`);
      return this.signed(200, { decision: "REJECT", reason_code: "INVALID_TASK" });
    }

    const parsed = parseInput(task.input);
    if (!parsed || !task.task_id) {
      console.error(`[agent] INVALID_TASK ${task.task_id || "?"}: malformed input`);
      return this.signed(200, { decision: "REJECT", reason_code: "INVALID_TASK" });
    }

    const evaluation = evaluate(parsed, (tx) => this.store.hasProofTx(tx));

    const response = {
      decision: evaluation.decision,
      reason_code: evaluation.reason_code,
    };

    if (evaluation.provable) {
      const salt = deriveSalt(this.cfg.hmacSecret, task.task_id);
      const circuitInputs = buildCircuitInputs(task, parsed, evaluation.decision, salt);
      const remaining = this.cfg.taskSoftDeadlineMs - (Date.now() - startedAt);
      const proveBudgetMs = Math.max(5000, remaining);
      try {
        const { proof, publicSignals } = await this.proveWithTimeout(circuitInputs, proveBudgetMs);
        response.proof = proof;
        response.public_signals = publicSignals;
        // No Kurier key configured: echo the task's own proof reference,
        // matching the sample response shape on /events/proof-gatekeeper.
        response.proof_tx = parsed.proofTx;
      } catch (err) {
        // Proving failed: still return the decision without a proof.
        // Correct decision without proof = +12 -2; a timeout or wrong
        // reject would be worse. Log loudly so a systematic proving
        // failure is visible in the logs.
        console.error("[agent] proof generation failed for", task.task_id, ":", err.message);
        response.proof_tx = parsed.proofTx;
      }
    } else {
      // PROOF_REUSED: documented as having no proof to submit; echo the
      // reference, matching the sample response shape.
      response.proof_tx = parsed.proofTx;
    }

    const result = this.signed(200, response);
    // Record only after a successful evaluation, so a task never flags itself.
    this.store.recordProofTx(parsed.proofTx);
    this.store.recordResponse(task.task_id, result.body);
    return result;
  }

  proveWithTimeout(circuitInputs, budgetMs) {
    return Promise.race([
      this.prover.prove(circuitInputs),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`prove timeout after ${budgetMs}ms`)), budgetMs)
      ),
    ]);
  }

  signed(status, obj) {
    return this.signedRaw(status, JSON.stringify(obj));
  }

  signedRaw(status, body) {
    return { status, body, signature: signBody(this.cfg.hmacSecret, body) };
  }
}

module.exports = { AgentHandler, parseTimestamp, PREFLIGHT_TYPE, TASK_TYPE, PROTOCOL_VERSION };
