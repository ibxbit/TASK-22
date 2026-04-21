const TaxRate = require('../models/TaxRate');

/**
 * Lookup order:
 *   1. Exact match — state + county
 *   2. State-wide fallback — county is null
 *   3. Not found — throws
 */
async function getRates(state, county) {
  const normalizedState  = state.trim().toUpperCase();
  const normalizedCounty = county ? county.trim() : null;

  if (normalizedCounty) {
    const exact = await TaxRate.findOne({
      state:  normalizedState,
      county: new RegExp(`^${normalizedCounty}$`, 'i'),
    }).lean();
    if (exact) return exact;
  }

  const fallback = await TaxRate.findOne({ state: normalizedState, county: null }).lean();
  if (fallback) return fallback;

  throw new Error(`No tax rate found for state '${state}'${county ? `, county '${county}'` : ''}`);
}

/**
 * Deterministic calculation.
 * Each component rounded independently before summing — no accumulation drift.
 */
function calculate(subtotal, rates) {
  const stateAmount  = parseFloat(((subtotal * rates.stateTax)  / 100).toFixed(2));
  const countyAmount = parseFloat(((subtotal * rates.countyTax) / 100).toFixed(2));
  const totalTax     = parseFloat((stateAmount + countyAmount).toFixed(2));
  return { stateAmount, countyAmount, totalTax };
}

module.exports = { getRates, calculate };
