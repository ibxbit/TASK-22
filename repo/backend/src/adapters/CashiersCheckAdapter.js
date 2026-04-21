const PaymentAdapter = require('./PaymentAdapter');

class CashiersCheckAdapter extends PaymentAdapter {
  constructor() {
    super({ name: 'cashiers_check', enabled: true });
  }

  validate({ amount, checkNumber }) {
    if (!amount || amount <= 0) throw new Error("Cashier's check: amount must be a positive number");
    if (!checkNumber || typeof checkNumber !== 'string' || !checkNumber.trim()) {
      throw new Error("Cashier's check: checkNumber is required");
    }
  }

  async process({ amount, checkNumber }) {
    return {
      reference: checkNumber.trim(),
      amount,
      status: 'completed',
    };
  }
}

module.exports = new CashiersCheckAdapter();
