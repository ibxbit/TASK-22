const TTL = 10 * 60 * 1000;

const cache = new Map();

function buildKey(params) {
  const normalized = Object.keys(params)
    .sort()
    .reduce((acc, k) => {
      if (params[k] !== undefined && params[k] !== '') acc[k] = params[k];
      return acc;
    }, {});
  return JSON.stringify(normalized);
}

function get(params) {
  const key = buildKey(params);
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > TTL) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

function set(params, data) {
  cache.set(buildKey(params), { data, timestamp: Date.now() });
}

function clear() {
  cache.clear();
}

module.exports = { get, set, clear };
