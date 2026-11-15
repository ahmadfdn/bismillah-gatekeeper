// Config for the bismillah Proof Gatekeeper agent.
// Loads a minimal .env file (KEY=VALUE lines, no external dependency).
// No secrets are committed anywhere; .env is gitignored. The real
// AGENT_GAMES_HMAC_SECRET comes from the Agent Games dashboard
// (Manage Agents -> Rotate Secret) AFTER Jon registers the account.
const fs = require("fs");
const path = require("path");

const WORK_DIR =
  process.env.AGENTGAMES_DIR || path.resolve(__dirname, "..");

function loadEnvFile(file) {
  const out = {};
  try {
    const raw = fs.readFileSync(file, "utf8");
    for (const line of raw.split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const i = t.indexOf("=");
      if (i < 0) continue;
      out[t.slice(0, i).trim()] = t.slice(i + 1).trim();
    }
  } catch {
    /* no .env file yet */
  }
  return out;
}

const envFile = loadEnvFile(path.join(WORK_DIR, ".env"));

function pick(name, fallback) {
  if (process.env[name] !== undefined && process.env[name] !== "") return process.env[name];
  if (envFile[name] !== undefined && envFile[name] !== "") return envFile[name];
  return fallback;
}

const config = {
  workDir: WORK_DIR,
  // The platform-generated HMAC secret. Empty until Jon rotates it in the
  // dashboard and we write it into .env. POSTs are refused (500) without it.
  hmacSecret: pick("AGENT_GAMES_HMAC_SECRET", ""),
  circuitsDir: pick("CIRCUITS_DIR", path.join(WORK_DIR, "circuits")),
  seenPath: pick("SEEN_STORE_PATH", path.join(WORK_DIR, "data", "seen.json")),
  port: parseInt(pick("PORT", "8787"), 10),
  // Hard platform deadline is 60 s; we budget 50 s for our own work.
  taskSoftDeadlineMs: parseInt(pick("TASK_SOFT_DEADLINE_MS", "50000"), 10),
  gatekeeperVkHash:
    pick(
      "GATEKEEPER_VK_HASH",
      "0x6b79c6012a6d8651f3e13bc4d2a20370280ab49700c90c5316d4168bfbad77b0"
    ).toLowerCase(),
};

module.exports = { config, WORK_DIR };
