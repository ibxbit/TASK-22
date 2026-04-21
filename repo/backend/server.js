require('dotenv').config();
const validateEnv = require('./src/config/validateEnv');
validateEnv(); // blocks production startup on placeholder/insecure secrets

const app = require('./src/app');
const connectDB = require('./src/config/db');
const { startJob: startReconciliation } = require('./src/jobs/reconciliationJob');
const { startJob: startDeletion }        = require('./src/jobs/deletionJob');

const PORT = process.env.PORT || 5000;

connectDB().then(() => {
  startReconciliation();
  startDeletion();
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
  });
});
