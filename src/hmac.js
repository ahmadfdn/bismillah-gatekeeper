// HMAC signing / verification for the x-agent-games-signature header,
// plus the deterministic per-task salt for the gatekeeper circuit.
//
// Protocol (from the /build field guide): the HMAC is computed over the RAW
// request/response body and compared to the x-agent-games-signature header,
// before any JSON parsing. The guide does not pin the algorithm/encoding,
// so outbound signing is HMAC-SHA256 hex; inbound verification accepts the
// same MAC bytes as hex or base64 (optional "sha256=" prefix), compared in
// constant time. Accepting both encodings of the identical MAC is a
// representation tolerance, not a weakening: a caller must still know the
// secret.
const crypto = require("crypto");

// BN128 scalar field prime (snarkjs bn128).
const BN128_PRIME =
  21888242871839275222246405745257275088548364400416034343698204186575808495617n;

function signBody(secret, rawBody) {
  return crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
}

function macBytes(secret, rawBody) {
  return crypto.createHmac("sha256", secret).update(rawBody).digest();
}

function decodeCandidate(headerValue) {
  let v = String(headerValue).trim();
  if (v.toLowerCase().startsWith("sha256=")) v = v.slice("sha256=".length).trim();
  if (/^[0-9a-fA-F]{64}$/.test(v)) return Buffer.from(v, "hex");
  try {
    const b = Buffer.from(v, "base64");
    if (b.length === 32) return b;
  } catch {
    /* fall through */
  }
  return null;
}

function verifyBodySignature(secret, rawBody, headerValue) {
  if (!secret || !headerValue) return false;
  const candidate = decodeCandidate(headerValue);
  if (!candidate) return false;
  const expected = macBytes(secret, rawBody);
  return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
}

// Deterministic per-task salt for the circuit's private `salt` input:
// HMAC(secret, "gatekeeper-salt:" + task_id) reduced mod the BN128 prime.
// Deterministic so a redelivered task reproduces identical proof inputs;
// secret-bound so it is not predictable to third parties.
function deriveSalt(secret, taskId) {
  const digest = crypto
    .createHmac("sha256", secret || "gatekeeper-local-dev")
    .update(`gatekeeper-salt:${taskId}`)
    .digest();
  return BigInt("0x" + digest.toString("hex")) % BN128_PRIME;
}

module.exports = { BN128_PRIME, signBody, verifyBodySignature, deriveSalt };
