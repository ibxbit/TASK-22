/**
 * Base adapter contract.
 * All adapters are DISABLED by default (enabled: false).
 * Each concrete adapter must explicitly opt in via { enabled: true }.
 */
class PaymentAdapter {
  constructor(config = {}) {
    this.name    = config.name    || 'unknown';
    this.enabled = config.enabled ?? false;
  }

  // Must return nothing; throw on invalid input.
  validate(payment) {
    throw new Error(`${this.name}: validate() not implemented`);
  }

  // Must resolve with { reference, amount, status, ...extras }.
  async process(payment) {
    throw new Error(`${this.name}: process() not implemented`);
  }
}

module.exports = PaymentAdapter;
