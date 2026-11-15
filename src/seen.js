// Seen-set for proof_tx references ("The proof reference has not already
// been used for another task" — /build Security checklist; PROOF_REUSED trap).
//
// In-memory Set is authoritative for the life of the process; a JSON file
// backs it across restarts (best-effort atomic write via tmp + rename).
// Also keeps a task_id -> serialized response cache so a redelivered task is
// answered idempotently instead of being misread as proof reuse.
//
// NOTE: this is why the agent runs as one long-lived process on the VPS
// rather than serverless: the seen-set must survive across all 8 rounds.
const fs = require("fs");
const path = require("path");

function normalizeTx(tx) {
  return (tx ?? "").trim().toLowerCase();
}

class SeenStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.seenProofTx = new Set();
    this.responseByTaskId = new Map();
    this.load();
  }

  load() {
    try {
      const raw = fs.readFileSync(this.filePath, "utf8");
      const data = JSON.parse(raw);
      for (const tx of data.proofTx ?? []) this.seenProofTx.add(normalizeTx(tx));
      for (const [k, v] of Object.entries(data.responses ?? {})) {
        this.responseByTaskId.set(k, v);
      }
    } catch {
      /* missing/corrupt file -> start empty */
    }
  }

  persist() {
    try {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
      const tmp = `${this.filePath}.tmp`;
      fs.writeFileSync(
        tmp,
        JSON.stringify({
          proofTx: [...this.seenProofTx],
          responses: Object.fromEntries(this.responseByTaskId),
        })
      );
      fs.renameSync(tmp, this.filePath);
    } catch (err) {
      console.error("[seen-store] persist failed:", err.message);
    }
  }

  hasProofTx(proofTx) {
    return this.seenProofTx.has(normalizeTx(proofTx));
  }

  recordProofTx(proofTx) {
    const key = normalizeTx(proofTx);
    if (!key) return;
    if (!this.seenProofTx.has(key)) {
      this.seenProofTx.add(key);
      this.persist();
    }
  }

  getResponse(taskId) {
    return this.responseByTaskId.get(taskId) ?? null;
  }

  recordResponse(taskId, serializedResponse) {
    if (!this.responseByTaskId.has(taskId)) {
      this.responseByTaskId.set(taskId, serializedResponse);
      this.persist();
    }
  }

  get size() {
    return this.seenProofTx.size;
  }
}

module.exports = { SeenStore, normalizeTx };
