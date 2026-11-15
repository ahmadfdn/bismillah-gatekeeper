// Local Groth16 proving with snarkjs fullProve against the official
// gatekeeper artifacts. Expected ~0.3-1.3 s per proof for this circuit,
// comfortably inside the 60 s task deadline.
const path = require("path");

class Prover {
  constructor(circuitsDir) {
    this.wasmPath = path.join(circuitsDir, "gatekeeper.wasm");
    this.zkeyPath = path.join(circuitsDir, "gatekeeper_final.zkey");
    this.snarkjs = null;
  }

  async prove(circuitInputs) {
    if (!this.snarkjs) this.snarkjs = require("snarkjs");
    const { proof, publicSignals } = await this.snarkjs.groth16.fullProve(
      circuitInputs,
      this.wasmPath,
      this.zkeyPath
    );
    return { proof, publicSignals };
  }
}

module.exports = { Prover };
