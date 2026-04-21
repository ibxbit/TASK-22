const PaymentAdapter = require('./PaymentAdapter');

class CashAdapter extends PaymentAdapter {
  constructor() {
    super({ name: 'cash', enabled: true });
  }

  validate({ amount }) {
    if (!amount || amount <= 0) throw new Error('Cash: amount must be a positive number');
  }

  async process({ amount }) {
    return {
      reference: `CASH-${Date.now()}`,
      amount,
      status: 'completed',
    };
  }
}

module.exports = new CashAdapter();
