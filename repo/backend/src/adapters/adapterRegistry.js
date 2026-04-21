const cash              = require('./CashAdapter');
const cashiersCheck     = require('./CashiersCheckAdapter');
const inhouseFinancing  = require('./InhouseFinancingAdapter');

const registry = {
  cash,
  cashiers_check:     cashiersCheck,
  inhouse_financing:  inhouseFinancing,
};

function getAdapter(method) {
  const adapter = registry[method];
  if (!adapter)         throw new Error(`Unknown payment method: '${method}'`);
  if (!adapter.enabled) throw new Error(`Payment adapter '${method}' is disabled`);
  return adapter;
}

module.exports = { getAdapter };
