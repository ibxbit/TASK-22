const express = require('express');
const cors    = require('cors');

const requestLogger        = require('./middleware/requestLogger');
const errorHandler         = require('./middleware/errorHandler');

const authRoutes           = require('./routes/auth');
const vehicleRoutes        = require('./routes/vehicles');
const cartRoutes           = require('./routes/cart');
const orderRoutes          = require('./routes/orders');
const paymentRoutes        = require('./routes/payments');
const reconciliationRoutes = require('./routes/reconciliation');
const documentRoutes       = require('./routes/documents');
const financeRoutes        = require('./routes/finance');
const experimentRoutes     = require('./routes/experiments');
const privacyRoutes        = require('./routes/privacy');
const analyticsRoutes      = require('./routes/analytics');
const synonymRoutes        = require('./routes/synonyms');

const app = express();

app.use(cors({ origin: process.env.CORS_ORIGIN || 'http://localhost:5173' }));
app.use(express.json({
  verify: (req, _res, buf) => { req.rawBody = buf; },
}));

// Log every request — must be before routes
app.use(requestLogger);

app.get('/health', (req, res) => {
  res.json({ status: 'ok', system: 'MotorLot DealerOps' });
});

app.use('/auth',           authRoutes);
app.use('/vehicles',       vehicleRoutes);
app.use('/cart',           cartRoutes);
app.use('/orders',         orderRoutes);
app.use('/payments',       paymentRoutes);
app.use('/reconciliation', reconciliationRoutes);
app.use('/documents',      documentRoutes);
app.use('/finance',        financeRoutes);
app.use('/experiments',    experimentRoutes);
app.use('/privacy',        privacyRoutes);
app.use('/analytics',      analyticsRoutes);
app.use('/synonyms',       synonymRoutes);

// 404 for unmatched routes
app.use((req, res) => {
  res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: `Route ${req.method} ${req.path} not found` } });
});

// Centralized error handler — must be last
app.use(errorHandler);

module.exports = app;
