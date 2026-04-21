const Synonym     = require('../models/Synonym');
const Vehicle     = require('../models/Vehicle');
const searchCache = require('./searchCache');

const SYNONYM_TTL  = 10 * 60 * 1000;
const DISTINCT_TTL =  5 * 60 * 1000;

let synonymMap   = null;
let synonymTime  = 0;

const distinctCache = {};

// ── Levenshtein distance (iterative, O(m·n)) ─────────────────────────────────
function levenshtein(a, b) {
  const m = a.length;
  const n = b.length;
  // Use a single rolling row to keep memory at O(n)
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const curr = [i];
    for (let j = 1; j <= n; j++) {
      curr[j] = a[i - 1] === b[j - 1]
        ? prev[j - 1]
        : 1 + Math.min(prev[j], curr[j - 1], prev[j - 1]);
    }
    prev = curr;
  }
  return prev[n];
}

// Maximum allowed edit distance, scaled to term length
function maxDistance(term) {
  const len = term.length;
  if (len <= 3) return 0;   // too short — exact only
  if (len <= 5) return 1;
  if (len <= 9) return 2;
  return 2;                 // cap at 2 to keep precision
}

// ── Distinct value cache (per field) ─────────────────────────────────────────
async function getDistinctValues(field) {
  const entry = distinctCache[field];
  if (entry && Date.now() - entry.time < DISTINCT_TTL) return entry.values;
  const values = (await Vehicle.distinct(field)).filter(Boolean);
  distinctCache[field] = { values, time: Date.now() };
  return values;
}

// ── Synonym in-memory cache ───────────────────────────────────────────────────
async function loadSynonyms() {
  if (synonymMap && Date.now() - synonymTime < SYNONYM_TTL) return synonymMap;
  const records = await Synonym.find({}).lean();
  synonymMap = {};
  for (const r of records) {
    synonymMap[r.term.toLowerCase().trim()] = r.expansions;
  }
  synonymTime = Date.now();
  return synonymMap;
}

function clearCache() {
  synonymMap  = null;
  synonymTime = 0;
  // Also bust distinct and search caches so stale results re-fetch
  for (const k of Object.keys(distinctCache)) delete distinctCache[k];
  searchCache.clear();
}

// ── Fuzzy matching against known field values ─────────────────────────────────
async function fuzzyExpand(term, field) {
  const candidates = await getDistinctValues(field);
  const lower = term.toLowerCase();
  const limit = maxDistance(term);
  if (limit === 0) return [];

  return candidates.filter(c => {
    const dist = levenshtein(lower, c.toLowerCase());
    return dist > 0 && dist <= limit;
  });
}

// ── Public API ────────────────────────────────────────────────────────────────
/**
 * Returns [userTerm, ...synonyms, ...fuzzyMatches] with duplicates removed.
 * field — 'make' | 'model' | null.  Fuzzy matching only runs when field is provided.
 */
async function expand(term, field = null) {
  if (!term) return [];

  const map  = await loadSynonyms();
  const key  = term.toLowerCase().trim();
  const syns = map[key] || [];

  // Explicit synonym takes priority — skip fuzzy when mapping exists
  const extras = syns.length > 0
    ? syns
    : (field ? await fuzzyExpand(term, field) : []);

  // De-duplicate (case-insensitive) while preserving original user term first
  const seen  = new Set([key]);
  const terms = [term];
  for (const t of extras) {
    const lc = t.toLowerCase();
    if (!seen.has(lc)) { seen.add(lc); terms.push(t); }
  }
  return terms;
}

module.exports = { expand, clearCache };
