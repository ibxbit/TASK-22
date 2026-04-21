/**
 * Seeds one demo user per role with fixed, stable MongoDB ObjectIds.
 * Run once after first `docker compose up --build`:
 *
 *   docker compose exec backend node src/seeders/seedDemoUsers.js
 *
 * Prints each user's ObjectId — use it with POST /api/auth/token to get a JWT.
 * Safe to run multiple times (upserts on email).
 */
require('dotenv').config();
const mongoose = require('mongoose');
const User     = require('../models/User');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://mongo:27017/motorlot';

// Stable dealershipId so all demo users share one dealership
const DEMO_DEALERSHIP_ID = new mongoose.Types.ObjectId('aaaaaaaaaaaaaaaaaaaaaaaa');

const DEMO_USERS = [
  { _id: new mongoose.Types.ObjectId('000000000000000000000001'), name: 'Demo Admin',       email: 'admin@demo.local',       role: 'admin'       },
  { _id: new mongoose.Types.ObjectId('000000000000000000000002'), name: 'Demo Manager',     email: 'manager@demo.local',     role: 'manager'     },
  { _id: new mongoose.Types.ObjectId('000000000000000000000003'), name: 'Demo Salesperson', email: 'salesperson@demo.local', role: 'salesperson' },
  { _id: new mongoose.Types.ObjectId('000000000000000000000004'), name: 'Demo Finance',     email: 'finance@demo.local',     role: 'finance'     },
  { _id: new mongoose.Types.ObjectId('000000000000000000000005'), name: 'Demo Inspector',   email: 'inspector@demo.local',   role: 'inspector'   },
];

async function seed() {
  await mongoose.connect(MONGO_URI);

  console.log('\n── Demo Users ──────────────────────────────────────────────────');
  console.log(`  Shared dealershipId: ${DEMO_DEALERSHIP_ID}\n`);

  for (const u of DEMO_USERS) {
    await User.findOneAndUpdate(
      { email: u.email },
      { $set: { _id: u._id, name: u.name, role: u.role, dealershipId: DEMO_DEALERSHIP_ID } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    console.log(`  [${u.role.padEnd(12)}] id=${u._id}  email=${u.email}`);
  }

  console.log('\n  Get a token:');
  console.log("  curl -sX POST http://localhost:5000/api/auth/token \\");
  console.log("    -H 'Content-Type: application/json' \\");
  console.log(`    -d '{\"userId\":\"${DEMO_USERS[0]._id}\"}' | jq -r .token`);
  console.log('──────────────────────────────────────────────────────────────\n');

  await mongoose.disconnect();
}

seed().catch(err => {
  console.error(err);
  process.exit(1);
});
