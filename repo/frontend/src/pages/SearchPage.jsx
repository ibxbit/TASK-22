import { useState, useEffect, useCallback } from 'react';
import { searchVehicles } from '../api/vehicles';
import { getTrendingKeywords } from '../api/analytics';
import { useDebounce } from '../hooks/useDebounce';
import { useSession } from '../context/SessionContext';
import VehicleCard from '../components/VehicleCard';

const INITIAL_FILTERS = {
  make: '', model: '', priceMin: '', priceMax: '',
  mileageMax: '', region: '', sort: 'price', order: 'asc',
};

function presetsKey(userId) {
  return `motorlot_search_presets_${userId || 'anon'}`;
}

function loadPresets(userId) {
  try {
    return JSON.parse(localStorage.getItem(presetsKey(userId)) || '[]');
  } catch {
    return [];
  }
}

function savePresets(userId, presets) {
  localStorage.setItem(presetsKey(userId), JSON.stringify(presets));
}

// ── Zero-results contextual feedback ─────────────────────────────────────────

function buildHints(filters) {
  const hints = [];

  if (filters.priceMax && Number(filters.priceMax) > 0) {
    hints.push('Try raising your maximum price or removing the price ceiling.');
  }
  if (filters.priceMin && Number(filters.priceMin) > 0) {
    hints.push('Try lowering your minimum price.');
  }
  if (filters.mileageMax && Number(filters.mileageMax) > 0) {
    hints.push('Try increasing the maximum mileage limit.');
  }
  if (filters.make || filters.model) {
    hints.push('Check the make/model spelling — synonyms and close matches are tried automatically.');
  }
  if (filters.region) {
    hints.push('Try a broader or different region.');
  }
  if (hints.length === 0) {
    hints.push('No vehicles match your current filters. Try clearing some filters to see more results.');
  }

  return hints;
}

function ZeroResultsFeedback({ filters }) {
  const hints = buildHints(filters);
  return (
    <div className="zero-results" role="status" aria-live="polite">
      <p className="zero-results-headline">0 matches found.</p>
      <ul className="zero-results-hints">
        {hints.map((h, i) => <li key={i}>{h}</li>)}
      </ul>
    </div>
  );
}

export default function SearchPage() {
  const { userId } = useSession();
  const [filters, setFilters] = useState(INITIAL_FILTERS);
  const [page, setPage] = useState(1);
  const [results, setResults] = useState([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [presets, setPresets] = useState(() => loadPresets(userId));
  const [presetName, setPresetName] = useState('');

  const [trending, setTrending] = useState([]);

  const debouncedFilters = useDebounce(filters, 400);

  useEffect(() => {
    getTrendingKeywords()
      .then(data => setTrending(data.keywords || []))
      .catch(() => {});
  }, []);

  const fetchResults = useCallback(async (f, p) => {
    setLoading(true);
    setError(null);
    const params = { ...f, page: p, limit: 20 };
    Object.keys(params).forEach(k => params[k] === '' && delete params[k]);
    try {
      const data = await searchVehicles(params);
      setResults(data.results);
      setTotal(data.total);
      setTotalPages(data.totalPages);
    } catch (err) {
      setError(err.response?.data?.error || 'Search failed');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setPage(1);
  }, [debouncedFilters]);

  useEffect(() => {
    fetchResults(debouncedFilters, page);
  }, [debouncedFilters, page, fetchResults]);

  function updateFilter(key, value) {
    setFilters(prev => ({ ...prev, [key]: value }));
  }

  function applyPreset(preset) {
    setFilters(preset.filters);
    setPage(1);
  }

  function saveCurrentPreset() {
    const name = presetName.trim();
    if (!name) return;
    const updated = [
      { name, filters },
      ...presets.filter(p => p.name !== name),
    ];
    setPresets(updated);
    savePresets(userId, updated);
    setPresetName('');
  }

  function deletePreset(name) {
    const updated = presets.filter(p => p.name !== name);
    setPresets(updated);
    savePresets(userId, updated);
  }

  function applyTrending(keyword) {
    setFilters(prev => ({ ...prev, make: keyword }));
    setPage(1);
  }

  return (
    <div className="page">
      <h1>Vehicle Search</h1>

      {trending.length > 0 && (
        <div className="trending-bar">
          <span className="trending-label">Trending:</span>
          {trending.map(k => (
            <button
              key={k.keyword}
              className="trending-chip"
              onClick={() => applyTrending(k.keyword)}
            >
              {k.keyword}
            </button>
          ))}
        </div>
      )}

      <div className="filter-bar">
        <input placeholder="Make" value={filters.make} onChange={e => updateFilter('make', e.target.value)} />
        <input placeholder="Model" value={filters.model} onChange={e => updateFilter('model', e.target.value)} />
        <input placeholder="Min Price" type="number" value={filters.priceMin} onChange={e => updateFilter('priceMin', e.target.value)} />
        <input placeholder="Max Price" type="number" value={filters.priceMax} onChange={e => updateFilter('priceMax', e.target.value)} />
        <input placeholder="Max Mileage" type="number" value={filters.mileageMax} onChange={e => updateFilter('mileageMax', e.target.value)} />
        <input placeholder="Region" value={filters.region} onChange={e => updateFilter('region', e.target.value)} />
        <select value={filters.sort} onChange={e => updateFilter('sort', e.target.value)}>
          <option value="price">Sort: Price</option>
          <option value="mileage">Sort: Mileage</option>
          <option value="year">Sort: Year</option>
          <option value="registrationDate">Sort: Reg Date</option>
        </select>
        <select value={filters.order} onChange={e => updateFilter('order', e.target.value)}>
          <option value="asc">Asc</option>
          <option value="desc">Desc</option>
        </select>
      </div>

      <div className="preset-bar">
        <input
          placeholder="Preset name…"
          value={presetName}
          onChange={e => setPresetName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && saveCurrentPreset()}
        />
        <button onClick={saveCurrentPreset} disabled={!presetName.trim()}>
          Save Preset
        </button>
        {presets.map(p => (
          <span key={p.name} className="preset-chip">
            <button className="preset-apply" onClick={() => applyPreset(p)}>{p.name}</button>
            <button className="preset-delete" onClick={() => deletePreset(p.name)}>×</button>
          </span>
        ))}
      </div>

      {error && <div className="error-msg">{error}</div>}
      <div className="results-info">
        {loading ? 'Loading…' : `${total} result${total !== 1 ? 's' : ''}`}
      </div>
      <div className="vehicle-grid">
        {results.map(v => <VehicleCard key={v._id} vehicle={v} />)}
        {!loading && results.length === 0 && <ZeroResultsFeedback filters={filters} />}
      </div>
      {totalPages > 1 && (
        <div className="pagination">
          <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Prev</button>
          <span>Page {page} of {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next</button>
        </div>
      )}
    </div>
  );
}
