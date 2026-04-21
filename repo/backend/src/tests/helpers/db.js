const mongoose = require('mongoose');

async function connect() {
  if (mongoose.connection.readyState !== 0) return;
  await mongoose.connect(process.env.MONGO_URI);
}

async function clearCollections() {
  const cols = Object.values(mongoose.connection.collections);
  await Promise.all(cols.map(c => c.deleteMany({})));
}

async function disconnect() {
  await mongoose.disconnect();
}

module.exports = { connect, clearCollections, disconnect };
