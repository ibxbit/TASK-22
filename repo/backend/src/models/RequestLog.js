const mongoose = require('mongoose');

const requestLogSchema = new mongoose.Schema({
  method:     { type: String, required: true },
  path:       { type: String, required: true },
  query:      { type: mongoose.Schema.Types.Mixed, default: {} },
  userId:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  statusCode: { type: Number, required: true },
  duration:   { type: Number, required: true },
  error:      { type: String, default: null },
  ip:         { type: String, default: null },
  timestamp:  { type: Date, default: Date.now },
});

requestLogSchema.index({ timestamp: -1 });
requestLogSchema.index({ userId: 1, timestamp: -1 });
requestLogSchema.index({ statusCode: 1, path: 1 });

module.exports = mongoose.model('RequestLog', requestLogSchema);
