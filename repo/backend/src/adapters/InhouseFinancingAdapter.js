const PaymentAdapter = require('./PaymentAdapter');

class InhouseFinancingAdapter extends PaymentAdapter {
  constructor() {
    super({ name: 'inhouse_financing', enabled: true });
  }

  validate({ amount, downPayment, termMonths, annualRate }) {
    if (!amount || amount <= 0)               throw new Error('Financing: amount must be a positive number');
    if (downPayment === undefined || downPayment < 0) throw new Error('Financing: downPayment is required and must be >= 0');
    if (!termMonths || termMonths <= 0)       throw new Error('Financing: termMonths must be a positive integer');
    if (annualRate === undefined || annualRate < 0)   throw new Error('Financing: annualRate is required and must be >= 0');
    if (downPayment > amount)                 throw new Error('Financing: downPayment cannot exceed total amount');
  }

  async process({ amount, downPayment, termMonths, annualRate }) {
    const principal    = amount - downPayment;
    const monthlyRate  = annualRate / 100 / 12;
    const monthlyPayment = monthlyRate > 0
      ? (principal * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -termMonths))
      : principal / termMonths;

    return {
      reference:      `FIN-${Date.now()}`,
      amount,
      downPayment,
      principal,
      termMonths,
      annualRate,
      monthlyPayment: parseFloat(monthlyPayment.toFixed(2)),
      status:         'completed',
    };
  }
}

module.exports = new InhouseFinancingAdapter();
