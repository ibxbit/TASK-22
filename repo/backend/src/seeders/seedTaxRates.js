require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const mongoose = require('mongoose');
const TaxRate  = require('../models/TaxRate');

const RATES = [
  // State-wide fallbacks (county: null)
  { state: 'CA', county: null,            stateTax: 7.25, countyTax: 0,    totalRate: 7.25 },
  { state: 'TX', county: null,            stateTax: 6.25, countyTax: 0,    totalRate: 6.25 },
  { state: 'FL', county: null,            stateTax: 6.00, countyTax: 0,    totalRate: 6.00 },
  { state: 'NY', county: null,            stateTax: 4.00, countyTax: 0,    totalRate: 4.00 },
  { state: 'IL', county: null,            stateTax: 6.25, countyTax: 0,    totalRate: 6.25 },
  { state: 'OH', county: null,            stateTax: 5.75, countyTax: 0,    totalRate: 5.75 },
  { state: 'GA', county: null,            stateTax: 4.00, countyTax: 0,    totalRate: 4.00 },
  { state: 'AZ', county: null,            stateTax: 5.60, countyTax: 0,    totalRate: 5.60 },

  // California — county-specific
  { state: 'CA', county: 'Los Angeles',   stateTax: 7.25, countyTax: 2.25, totalRate: 9.50 },
  { state: 'CA', county: 'San Francisco', stateTax: 7.25, countyTax: 1.25, totalRate: 8.50 },
  { state: 'CA', county: 'San Diego',     stateTax: 7.25, countyTax: 0.50, totalRate: 7.75 },
  { state: 'CA', county: 'Orange',        stateTax: 7.25, countyTax: 0.50, totalRate: 7.75 },

  // Texas — county-specific
  { state: 'TX', county: 'Harris',        stateTax: 6.25, countyTax: 2.00, totalRate: 8.25 },
  { state: 'TX', county: 'Dallas',        stateTax: 6.25, countyTax: 2.00, totalRate: 8.25 },
  { state: 'TX', county: 'Bexar',         stateTax: 6.25, countyTax: 2.00, totalRate: 8.25 },
  { state: 'TX', county: 'Travis',        stateTax: 6.25, countyTax: 2.00, totalRate: 8.25 },

  // Florida — county-specific
  { state: 'FL', county: 'Miami-Dade',    stateTax: 6.00, countyTax: 1.00, totalRate: 7.00 },
  { state: 'FL', county: 'Broward',       stateTax: 6.00, countyTax: 1.00, totalRate: 7.00 },
  { state: 'FL', county: 'Orange',        stateTax: 6.00, countyTax: 0.50, totalRate: 6.50 },

  // New York — county-specific
  { state: 'NY', county: 'New York',      stateTax: 4.00, countyTax: 4.50, totalRate: 8.50 },
  { state: 'NY', county: 'Kings',         stateTax: 4.00, countyTax: 4.50, totalRate: 8.50 },
  { state: 'NY', county: 'Erie',          stateTax: 4.00, countyTax: 4.75, totalRate: 8.75 },

  // Illinois
  { state: 'IL', county: 'Cook',          stateTax: 6.25, countyTax: 1.75, totalRate: 8.00 },

  // Ohio
  { state: 'OH', county: 'Franklin',      stateTax: 5.75, countyTax: 1.25, totalRate: 7.00 },
  { state: 'OH', county: 'Cuyahoga',      stateTax: 5.75, countyTax: 2.25, totalRate: 8.00 },
];

async function seed() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to MongoDB');

  let upserted = 0;
  for (const rate of RATES) {
    await TaxRate.findOneAndUpdate(
      { state: rate.state, county: rate.county },
      { $set: rate },
      { upsert: true }
    );
    upserted++;
  }

  console.log(`Seeded ${upserted} tax rate records`);
  await mongoose.disconnect();
}

seed().catch(err => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});
