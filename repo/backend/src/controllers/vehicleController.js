const Vehicle = require('../models/Vehicle');
const searchCache = require('../services/searchCache');
const synonymService = require('../services/synonymService');
const trendingService  = require('../services/trendingService');
const analyticsService = require('../services/analyticsService');

const VALID_SORT_KEYS = new Set(['price', 'mileage', 'registrationDate', 'year']);

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function search(req, res) {
  try {
    const {
      make, model,
      priceMin, priceMax,
      mileageMax,
      region,
      regDateFrom, regDateTo,
      sort = 'price',
      order = 'asc',
      page = '1',
      limit = '20',
    } = req.query;

    const pageNum  = Math.max(1, parseInt(page)  || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 20));
    const sortKey  = VALID_SORT_KEYS.has(sort) ? sort : 'price';
    const sortDir  = order === 'desc' ? -1 : 1;

    const cacheParams = { make, model, priceMin, priceMax, mileageMax, region,
                          regDateFrom, regDateTo, sort: sortKey, order, page: pageNum, limit: limitNum };
    const cached = searchCache.get(cacheParams);
    if (cached) return res.json(cached);

    const filter = {};

    if (make) {
      const terms = await synonymService.expand(make, 'make');
      filter.make = { $in: terms.map(t => new RegExp(escapeRegex(t), 'i')) };
    }

    if (model) {
      const terms = await synonymService.expand(model, 'model');
      filter.model = { $in: terms.map(t => new RegExp(escapeRegex(t), 'i')) };
    }

    if (priceMin !== undefined || priceMax !== undefined) {
      filter.price = {};
      if (priceMin !== undefined) filter.price.$gte = parseFloat(priceMin);
      if (priceMax !== undefined) filter.price.$lte = parseFloat(priceMax);
    }

    if (mileageMax !== undefined) {
      filter.mileage = { $lte: parseFloat(mileageMax) };
    }

    if (region) {
      filter.region = new RegExp(region, 'i');
    }

    if (regDateFrom !== undefined || regDateTo !== undefined) {
      filter.registrationDate = {};
      if (regDateFrom) filter.registrationDate.$gte = new Date(regDateFrom);
      if (regDateTo)   filter.registrationDate.$lte = new Date(regDateTo);
    }

    // _id tiebreaker guarantees stable ordering across pages
    const sortSpec = { [sortKey]: sortDir, _id: 1 };
    const skip = (pageNum - 1) * limitNum;

    const [results, total] = await Promise.all([
      Vehicle.find(filter).sort(sortSpec).skip(skip).limit(limitNum).lean(),
      Vehicle.countDocuments(filter),
    ]);

    if (make)  trendingService.record(make);
    if (model) trendingService.record(model);

    analyticsService.track({
      sessionId:    req.query.sessionId || `anon-${Date.now()}`,
      userId:       req.user?._id       || null,
      dealershipId: req.user?.dealershipId || null,
      eventType:    'search',
      category:     'search',
      properties:   { make, model, priceMin, priceMax, mileageMax, region, total, page: pageNum },
    });

    const response = {
      results,
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum),
    };

    searchCache.set(cacheParams, response);
    return res.json(response);

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

module.exports = { search };
