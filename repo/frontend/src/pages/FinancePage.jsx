import { useState, useEffect } from 'react';
import { getTaxRates, upsertTaxRate } from '../api/finance';

const BLANK_RATE = { state: '', county: '', stateTax: '', countyTax: '' };

export default function FinancePage() {
  const [rates, setRates] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [form, setForm] = useState(BLANK_RATE);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  async function fetchRates() {
    setLoading(true);
    setError(null);
    try {
      const data = await getTaxRates();
      setRates(data.rates ?? data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load tax rates');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchRates(); }, []);

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setSaveError(null);
    setSaveSuccess(false);
    try {
      await upsertTaxRate({
        state:     form.state,
        county:    form.county || null,
        stateTax:  parseFloat(form.stateTax),
        countyTax: parseFloat(form.countyTax) || 0,
      });
      setSaveSuccess(true);
      setForm(BLANK_RATE);
      fetchRates();
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch (err) {
      setSaveError(err.response?.data?.error || 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  function editRate(rate) {
    setForm({
      state:     rate.state,
      county:    rate.county ?? '',
      stateTax:  String(rate.stateTax),
      countyTax: String(rate.countyTax ?? 0),
    });
  }

  return (
    <div className="page">
      <h1>Finance — Tax Rates</h1>
      <form className="tax-form" onSubmit={handleSave}>
        <h2>Add / Update Rate</h2>
        <input
          placeholder="State (2-letter)"
          maxLength={2}
          value={form.state}
          onChange={e => setForm(f => ({ ...f, state: e.target.value.toUpperCase() }))}
          required
        />
        <input
          placeholder="County (optional)"
          value={form.county}
          onChange={e => setForm(f => ({ ...f, county: e.target.value }))}
        />
        <input
          type="number" placeholder="State Tax %" step="0.01" min="0" max="20"
          value={form.stateTax}
          onChange={e => setForm(f => ({ ...f, stateTax: e.target.value }))}
          required
        />
        <input
          type="number" placeholder="County Tax %" step="0.01" min="0" max="10"
          value={form.countyTax}
          onChange={e => setForm(f => ({ ...f, countyTax: e.target.value }))}
        />
        {saveError && <div className="error-msg">{saveError}</div>}
        {saveSuccess && <div className="success-msg">Saved.</div>}
        <button className="btn btn-primary" type="submit" disabled={saving}>
          {saving ? 'Saving…' : 'Save Rate'}
        </button>
      </form>
      <h2>Current Rates</h2>
      {error && <div className="error-msg">{error}</div>}
      {loading ? <div className="loading">Loading…</div> : (
        rates.length === 0
          ? <p className="empty">No tax rates configured.</p>
          : (
            <table className="tax-table">
              <thead>
                <tr><th>State</th><th>County</th><th>State Tax</th><th>County Tax</th><th></th></tr>
              </thead>
              <tbody>
                {rates.map(r => (
                  <tr key={r._id}>
                    <td>{r.state}</td>
                    <td>{r.county ?? '—'}</td>
                    <td>{r.stateTax}%</td>
                    <td>{r.countyTax ?? 0}%</td>
                    <td><button className="btn btn-sm" onClick={() => editRate(r)}>Edit</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
      )}
    </div>
  );
}
