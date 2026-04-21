import { useState, useEffect } from 'react';
import {
  listExperiments,
  createExperiment,
  updateExperimentStatus,
  rollbackExperiment,
  getExperimentResults,
} from '../api/experiments';
import { listSynonyms, upsertSynonym, deleteSynonym } from '../api/synonyms';

// ── Constants ─────────────────────────────────────────────────────────────────

const SCOPES = [
  { value: 'listing_layout', label: 'Listing Layout' },
  { value: 'checkout_steps', label: 'Checkout Steps' },
];

const ACTIVATABLE_STATUSES = ['active', 'paused'];

const BLANK_EXPERIMENT = {
  name: '',
  scope: 'listing_layout',
  variants: [
    { key: 'control',   label: 'Control',   weight: 50, config: {} },
    { key: 'variant_a', label: 'Variant A', weight: 50, config: {} },
  ],
  rollbackVariantKey: 'control',
};

// ── Experiments Panel ─────────────────────────────────────────────────────────

function ExperimentsPanel() {
  const [experiments, setExperiments] = useState([]);
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState(null);
  const [creating,    setCreating]    = useState(false);
  const [form,        setForm]        = useState(BLANK_EXPERIMENT);
  const [createError, setCreateError] = useState(null);
  const [results,     setResults]     = useState({});
  const [showResults, setShowResults] = useState(null);

  async function fetchExperiments() {
    setLoading(true);
    setError(null);
    try {
      const data = await listExperiments();
      setExperiments(data.experiments ?? []);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load experiments');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchExperiments(); }, []);

  async function handleStatusChange(experimentId, status) {
    try {
      await updateExperimentStatus(experimentId, { status });
      fetchExperiments();
    } catch (err) {
      alert(err.response?.data?.error || 'Status update failed');
    }
  }

  async function handleRollback(experimentId, experimentName) {
    if (!window.confirm(`Roll back "${experimentName}"? All users will immediately receive the control variant.`)) return;
    try {
      await rollbackExperiment(experimentId);
      fetchExperiments();
    } catch (err) {
      alert(err.response?.data?.error || 'Rollback failed');
    }
  }

  async function handleViewResults(experimentId) {
    if (showResults === experimentId) {
      setShowResults(null);
      return;
    }
    try {
      const data = await getExperimentResults(experimentId);
      setResults(prev => ({ ...prev, [experimentId]: data }));
      setShowResults(experimentId);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to load results');
    }
  }

  async function handleCreate(e) {
    e.preventDefault();
    setCreating(true);
    setCreateError(null);
    try {
      await createExperiment(form);
      setForm(BLANK_EXPERIMENT);
      fetchExperiments();
    } catch (err) {
      setCreateError(err.response?.data?.error || 'Create failed');
    } finally {
      setCreating(false);
    }
  }

  function updateVariant(index, field, value) {
    setForm(prev => {
      const variants = [...prev.variants];
      variants[index] = { ...variants[index], [field]: field === 'weight' ? Number(value) : value };
      return { ...prev, variants };
    });
  }

  function addVariant() {
    setForm(prev => ({
      ...prev,
      variants: [...prev.variants, { key: '', label: '', weight: 0, config: {} }],
    }));
  }

  function removeVariant(index) {
    setForm(prev => ({
      ...prev,
      variants: prev.variants.filter((_, i) => i !== index),
    }));
  }

  const totalWeight = form.variants.reduce((s, v) => s + (Number(v.weight) || 0), 0);

  return (
    <div className="admin-panel">
      {/* ── New experiment form ── */}
      <section className="admin-section">
        <h2>New Experiment</h2>
        <form className="experiment-form" onSubmit={handleCreate}>
          <div className="form-row">
            <label>Name</label>
            <input
              placeholder="Experiment name"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              required
            />
          </div>
          <div className="form-row">
            <label>Scope</label>
            <select value={form.scope} onChange={e => setForm(f => ({ ...f, scope: e.target.value }))}>
              {SCOPES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
          <div className="form-row">
            <label>Rollback Variant Key</label>
            <select
              value={form.rollbackVariantKey}
              onChange={e => setForm(f => ({ ...f, rollbackVariantKey: e.target.value }))}
            >
              {form.variants.map(v => (
                <option key={v.key} value={v.key}>{v.key || '(empty)'}</option>
              ))}
            </select>
          </div>

          <h3>
            Variants
            <span className={`weight-total ${totalWeight === 100 ? 'ok' : 'bad'}`}>
              {' '}(total: {totalWeight}%)
            </span>
          </h3>
          {form.variants.map((v, i) => (
            <div key={i} className="variant-row">
              <input
                placeholder="Key (e.g. control)"
                value={v.key}
                onChange={e => updateVariant(i, 'key', e.target.value)}
                required
              />
              <input
                placeholder="Label"
                value={v.label}
                onChange={e => updateVariant(i, 'label', e.target.value)}
                required
              />
              <input
                type="number"
                placeholder="Weight %"
                value={v.weight}
                min="0"
                max="100"
                onChange={e => updateVariant(i, 'weight', e.target.value)}
                required
              />
              {form.variants.length > 2 && (
                <button type="button" className="btn btn-sm btn-danger" onClick={() => removeVariant(i)}>
                  Remove
                </button>
              )}
            </div>
          ))}
          <button type="button" className="btn btn-sm" onClick={addVariant}>
            + Add Variant
          </button>

          {createError && <div className="error-msg">{createError}</div>}
          <button
            className="btn btn-primary"
            type="submit"
            disabled={creating || totalWeight !== 100}
          >
            {creating ? 'Creating…' : 'Create Experiment'}
          </button>
        </form>
      </section>

      {/* ── Experiment list ── */}
      <section className="admin-section">
        <h2>Experiments</h2>
        {error && <div className="error-msg">{error}</div>}
        {loading ? (
          <div className="loading">Loading…</div>
        ) : experiments.length === 0 ? (
          <p className="empty">No experiments yet.</p>
        ) : (
          <div className="experiment-list">
            {experiments.map(exp => (
              <div key={exp._id} className={`experiment-card status-border-${exp.status}`}>
                <div className="experiment-header">
                  <span className="experiment-name">{exp.name}</span>
                  <span className="experiment-scope">{exp.scope}</span>
                  <span className={`status-badge status-${exp.status}`}>{exp.status}</span>
                </div>

                <div className="experiment-meta">
                  <span className="rollback-key">
                    Rollback variant: <strong>{exp.rollbackVariantKey}</strong>
                  </span>
                </div>

                <div className="experiment-variants">
                  {exp.variants.map(v => (
                    <span key={v.key} className="variant-chip">
                      {v.label} ({v.weight}%)
                      {v.key === exp.rollbackVariantKey && (
                        <span className="rollback-marker" title="Rollback target"> ↩</span>
                      )}
                    </span>
                  ))}
                </div>

                <div className="experiment-actions">
                  {/* Status transitions (excluding rolled_back — use dedicated button) */}
                  {ACTIVATABLE_STATUSES
                    .filter(s => s !== exp.status)
                    .map(s => (
                      <button
                        key={s}
                        className="btn btn-sm"
                        onClick={() => handleStatusChange(exp._id, s)}
                      >
                        → {s}
                      </button>
                    ))}

                  {/* Dedicated rollback button — only shown when not already rolled back */}
                  {exp.status !== 'rolled_back' && (
                    <button
                      className="btn btn-sm btn-rollback"
                      onClick={() => handleRollback(exp._id, exp.name)}
                      title={`Immediately serve "${exp.rollbackVariantKey}" to all users`}
                    >
                      ⏪ Rollback
                    </button>
                  )}

                  {/* Results toggle */}
                  <button
                    className="btn btn-sm btn-secondary"
                    onClick={() => handleViewResults(exp._id)}
                  >
                    {showResults === exp._id ? 'Hide Results' : 'Results'}
                  </button>
                </div>

                {/* Inline results panel */}
                {showResults === exp._id && results[exp._id] && (
                  <div className="results-panel">
                    <h4>Variant Distribution</h4>
                    {results[exp._id].distribution.length === 0 ? (
                      <p className="empty">No assignments yet.</p>
                    ) : (
                      <table className="results-table">
                        <thead>
                          <tr><th>Variant</th><th>Assignments</th></tr>
                        </thead>
                        <tbody>
                          {results[exp._id].distribution.map(d => (
                            <tr key={d._id}>
                              <td>
                                {d._id}
                                {d._id === exp.rollbackVariantKey && (
                                  <span className="rollback-marker" title="Rollback target"> ↩</span>
                                )}
                              </td>
                              <td>{d.count}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

// ── Synonyms Panel ────────────────────────────────────────────────────────────

function SynonymsPanel() {
  const [synonyms,    setSynonyms]    = useState([]);
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState(null);
  const [formTerm,    setFormTerm]    = useState('');
  const [formExpansions, setFormExpansions] = useState('');
  const [saving,      setSaving]      = useState(false);
  const [saveError,   setSaveError]   = useState(null);
  const [editingTerm, setEditingTerm] = useState(null);

  async function fetchSynonyms() {
    setLoading(true);
    setError(null);
    try {
      const data = await listSynonyms();
      setSynonyms(data.synonyms ?? []);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load synonyms');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchSynonyms(); }, []);

  function startEdit(syn) {
    setEditingTerm(syn.term);
    setFormTerm(syn.term);
    setFormExpansions(syn.expansions.join(', '));
    setSaveError(null);
  }

  function cancelEdit() {
    setEditingTerm(null);
    setFormTerm('');
    setFormExpansions('');
    setSaveError(null);
  }

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setSaveError(null);
    const term = formTerm.trim();
    const expansions = formExpansions
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
    try {
      await upsertSynonym(term, expansions);
      cancelEdit();
      fetchSynonyms();
    } catch (err) {
      setSaveError(err.response?.data?.error || 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(term) {
    if (!window.confirm(`Delete synonym "${term}"?`)) return;
    try {
      await deleteSynonym(term);
      fetchSynonyms();
    } catch (err) {
      alert(err.response?.data?.error || 'Delete failed');
    }
  }

  return (
    <div className="admin-panel">
      <section className="admin-section">
        <h2>Synonym Management</h2>
        <p className="section-desc">
          Synonyms expand search terms so that e.g. "benz" also matches "Mercedes-Benz".
          Fuzzy matching also runs automatically for close spellings.
        </p>

        {/* Upsert form */}
        <form className="synonym-form" onSubmit={handleSave}>
          <h3>{editingTerm ? `Editing: ${editingTerm}` : 'Add / Update Synonym'}</h3>
          <div className="form-row">
            <label>Term</label>
            <input
              placeholder="e.g. benz"
              value={formTerm}
              onChange={e => setFormTerm(e.target.value)}
              disabled={!!editingTerm}
              required
            />
          </div>
          <div className="form-row">
            <label>Expansions (comma-separated)</label>
            <input
              placeholder="e.g. Mercedes-Benz, Mercedes"
              value={formExpansions}
              onChange={e => setFormExpansions(e.target.value)}
            />
          </div>
          {saveError && <div className="error-msg">{saveError}</div>}
          <div className="form-actions">
            <button className="btn btn-primary" type="submit" disabled={saving || !formTerm.trim()}>
              {saving ? 'Saving…' : editingTerm ? 'Update' : 'Add Synonym'}
            </button>
            {editingTerm && (
              <button type="button" className="btn" onClick={cancelEdit}>
                Cancel
              </button>
            )}
          </div>
        </form>

        {/* Synonym list */}
        {error && <div className="error-msg">{error}</div>}
        {loading ? (
          <div className="loading">Loading…</div>
        ) : synonyms.length === 0 ? (
          <p className="empty">No synonyms configured.</p>
        ) : (
          <table className="synonym-table">
            <thead>
              <tr>
                <th>Term</th>
                <th>Expansions</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {synonyms.map(syn => (
                <tr key={syn.term}>
                  <td className="synonym-term">{syn.term}</td>
                  <td className="synonym-expansions">
                    {syn.expansions.length > 0
                      ? syn.expansions.map(e => (
                        <span key={e} className="expansion-chip">{e}</span>
                      ))
                      : <em className="empty-expansions">no expansions</em>
                    }
                  </td>
                  <td className="synonym-actions">
                    <button className="btn btn-sm" onClick={() => startEdit(syn)}>Edit</button>
                    <button className="btn btn-sm btn-danger" onClick={() => handleDelete(syn.term)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

// ── AdminPage (tabbed) ────────────────────────────────────────────────────────

const TABS = [
  { id: 'experiments', label: 'A/B Experiments' },
  { id: 'synonyms',    label: 'Synonym Management' },
];

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState('experiments');

  return (
    <div className="page">
      <h1>Admin</h1>

      <nav className="admin-tabs">
        {TABS.map(tab => (
          <button
            key={tab.id}
            className={`tab-btn ${activeTab === tab.id ? 'tab-active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {activeTab === 'experiments' && <ExperimentsPanel />}
      {activeTab === 'synonyms'    && <SynonymsPanel />}
    </div>
  );
}
