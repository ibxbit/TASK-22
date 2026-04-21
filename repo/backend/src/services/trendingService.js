const TrendingKeyword = require('../models/TrendingKeyword');

const REFRESH_INTERVAL = 60 * 60 * 1000;
let trendingCache = [];
let lastRefresh = 0;

async function refresh() {
  trendingCache = await TrendingKeyword.find({})
    .sort({ count: -1 })
    .limit(20)
    .lean();
  lastRefresh = Date.now();
}

async function record(keyword) {
  if (!keyword) return;
  const kw = keyword.toLowerCase().trim();
  TrendingKeyword.findOneAndUpdate(
    { keyword: kw },
    { $inc: { count: 1 }, $set: { updatedAt: new Date() } },
    { upsert: true }
  ).catch(err => console.error('[trending] record failed:', err.message));
}

async function getTrending() {
  if (!trendingCache.length || Date.now() - lastRefresh >= REFRESH_INTERVAL) {
    await refresh();
  }
  return trendingCache;
}

setInterval(refresh, REFRESH_INTERVAL);

module.exports = { record, getTrending };
