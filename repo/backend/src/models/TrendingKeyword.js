const mongoose = require('mongoose');

const trendingKeywordSchema = new mongoose.Schema({
  keyword:   { type: String, required: true, unique: true, lowercase: true, trim: true },
  count:     { type: Number, default: 0 },
  updatedAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('TrendingKeyword', trendingKeywordSchema);
