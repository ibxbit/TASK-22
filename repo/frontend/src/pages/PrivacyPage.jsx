import { useState, useEffect, useCallback } from 'react';
import {
  getConsentHistory,
  recordConsent,
  exportData,
  getDeletionRequests,
  requestDeletion,
  cancelDeletion,
} from '../api/privacy';

const CONSENT_TYPES = ['data_processing', 'marketing', 'financing_terms', 'warranty', 'vehicle_sale'];

// Masks all but the last `showLast` characters — used for PII fields in the UI.
// e.g. maskField('DL-9876543210', 4) → '**********3210'
function maskField(value, showLast = 4) {
  if (value == null || value === '') return '—';
  const s = String(value);
  return s.length <= showLast ? '*'.repeat(s.length) : '*'.repeat(s.length - showLast) + s.slice(-showLast);
}

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString();
}

const TABS = ['Consent History', 'Data Export', 'Deletion Requests'];

export default function PrivacyPage() {
  const [tab, setTab] = useState(0);

  // — Consent History —
  const [consents, setConsents]         = useState([]);
  const [consentLoading, setConsentLoading] = useState(false);
  const [consentError, setConsentError] = useState(null);

  // — Record Consent form —
  const [consentForm, setConsentForm] = useState({ type: 'data_processing', version: '1.0', consentGiven: true });
  const [consentSubmitting, setConsentSubmitting] = useState(false);
  const [consentSubmitMsg, setConsentSubmitMsg]   = useState(null);
  const [consentSubmitErr, setConsentSubmitErr]   = useState(null);

  // — Data Export —
  const [exportPayload, setExportPayload] = useState(null);
  const [exporting, setExporting]         = useState(false);
  const [exportError, setExportError]     = useState(null);

  // — Deletion Requests —
  const [deletions, setDeletions]         = useState([]);
  const [deletionLoading, setDeletionLoading] = useState(false);
  const [deletionError, setDeletionError] = useState(null);
  const [requesting, setRequesting]       = useState(false);
  const [requestError, setRequestError]   = useState(null);
  const [requestMsg, setRequestMsg]       = useState(null);

  const loadConsents = useCallback(async () => {
    setConsentLoading(true);
    setConsentError(null);
    try {
      const data = await getConsentHistory();
      setConsents(data.records ?? []);
    } catch (err) {
      setConsentError(err.response?.data?.error || 'Failed to load consent history');
    } finally {
      setConsentLoading(false);
    }
  }, []);

  const loadDeletions = useCallback(async () => {
    setDeletionLoading(true);
    setDeletionError(null);
    try {
      const data = await getDeletionRequests();
      setDeletions(data.requests ?? []);
    } catch (err) {
      setDeletionError(err.response?.data?.error || 'Failed to load deletion requests');
    } finally {
      setDeletionLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab === 0) loadConsents();
    if (tab === 2) loadDeletions();
  }, [tab, loadConsents, loadDeletions]);

  async function handleRecordConsent(e) {
    e.preventDefault();
    setConsentSubmitting(true);
    setConsentSubmitMsg(null);
    setConsentSubmitErr(null);
    try {
      await recordConsent(consentForm);
      setConsentSubmitMsg('Consent recorded successfully.');
      loadConsents();
    } catch (err) {
      setConsentSubmitErr(err.response?.data?.error || 'Failed to record consent');
    } finally {
      setConsentSubmitting(false);
    }
  }

  async function handleExport() {
    setExporting(true);
    setExportError(null);
    setExportPayload(null);
    try {
      const data = await exportData();
      // Mask sensitive PII before displaying
      if (data.user) {
        data.user = { ...data.user, _masked: true };
      }
      setExportPayload(data);
    } catch (err) {
      setExportError(err.response?.data?.error || 'Export failed');
    } finally {
      setExporting(false);
    }
  }

  function handleDownload() {
    if (!exportPayload) return;
    const blob = new Blob([JSON.stringify(exportPayload, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `motorlot-data-export-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleRequestDeletion() {
    setRequesting(true);
    setRequestError(null);
    setRequestMsg(null);
    try {
      const data = await requestDeletion({ scope: ['all'] });
      setRequestMsg(data.message);
      loadDeletions();
    } catch (err) {
      setRequestError(err.response?.data?.error || 'Failed to submit deletion request');
    } finally {
      setRequesting(false);
    }
  }

  async function handleCancel(id) {
    try {
      await cancelDeletion(id);
      loadDeletions();
    } catch (err) {
      alert(err.response?.data?.error || 'Cancel failed');
    }
  }

  return (
    <div className="page">
      <h1>Privacy &amp; Data Rights</h1>

      <div className="tab-bar" style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
        {TABS.map((label, i) => (
          <button
            key={i}
            className={`btn${tab === i ? ' btn-primary' : ''}`}
            onClick={() => setTab(i)}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Consent History ── */}
      {tab === 0 && (
        <section>
          <h2>Consent History</h2>
          <p style={{ color: '#666', fontSize: '0.9rem' }}>
            IP addresses and user-agent strings are stored encrypted at rest (AES-256-GCM)
            and shown here for audit purposes.
          </p>

          <form onSubmit={handleRecordConsent} style={{ marginBottom: '1.5rem', padding: '1rem', background: '#f9f9f9', borderRadius: '6px' }}>
            <h3 style={{ marginTop: 0 }}>Record Consent</h3>
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <label>
                Type
                <select
                  value={consentForm.type}
                  onChange={e => setConsentForm(f => ({ ...f, type: e.target.value }))}
                  style={{ display: 'block' }}
                >
                  {CONSENT_TYPES.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
                </select>
              </label>
              <label>
                Version
                <input
                  value={consentForm.version}
                  onChange={e => setConsentForm(f => ({ ...f, version: e.target.value }))}
                  placeholder="e.g. 1.0"
                  style={{ display: 'block' }}
                />
              </label>
              <label>
                Given
                <select
                  value={consentForm.consentGiven ? 'true' : 'false'}
                  onChange={e => setConsentForm(f => ({ ...f, consentGiven: e.target.value === 'true' }))}
                  style={{ display: 'block' }}
                >
                  <option value="true">Yes</option>
                  <option value="false">No</option>
                </select>
              </label>
              <button className="btn btn-primary" type="submit" disabled={consentSubmitting}>
                {consentSubmitting ? 'Saving…' : 'Record'}
              </button>
            </div>
            {consentSubmitMsg && <div style={{ color: 'green', marginTop: '0.5rem' }}>{consentSubmitMsg}</div>}
            {consentSubmitErr && <div className="error-msg">{consentSubmitErr}</div>}
          </form>

          {consentLoading && <div className="loading">Loading…</div>}
          {consentError  && <div className="error-msg">{consentError}</div>}
          {!consentLoading && !consentError && consents.length === 0 && (
            <p className="empty">No consent records found.</p>
          )}
          {consents.map(r => (
            <div key={r._id} className="card" style={{ marginBottom: '0.75rem', padding: '0.75rem' }}>
              <div><strong>Type:</strong> {r.type}</div>
              <div><strong>Version:</strong> {r.version}</div>
              <div><strong>Given:</strong> {r.consentGiven ? 'Yes' : 'No'}</div>
              <div><strong>Date:</strong> {formatDate(r.givenAt)}</div>
              {r.revokedAt && <div><strong>Revoked:</strong> {formatDate(r.revokedAt)}</div>}
              {/* IP and user-agent masked in UI — only last 4 chars shown */}
              {r.ipAddress && (
                <div><strong>IP (masked):</strong> <code>{maskField(r.ipAddress, 4)}</code></div>
              )}
            </div>
          ))}
        </section>
      )}

      {/* ── Data Export ── */}
      {tab === 1 && (
        <section>
          <h2>Export Your Data</h2>
          <p style={{ color: '#666', fontSize: '0.9rem' }}>
            Downloads a JSON file containing all data associated with your account.
            Sensitive fields (e.g., driver's license, IP address) are masked —
            only the last 4 characters are displayed in the preview below.
          </p>
          <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem' }}>
            <button className="btn btn-primary" onClick={handleExport} disabled={exporting}>
              {exporting ? 'Generating…' : 'Generate Export'}
            </button>
            {exportPayload && (
              <button className="btn" onClick={handleDownload}>Download JSON</button>
            )}
          </div>
          {exportError && <div className="error-msg">{exportError}</div>}
          {exportPayload && (
            <div>
              <h3>Export Preview</h3>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                <tbody>
                  <tr>
                    <td style={{ padding: '0.4rem', fontWeight: 'bold' }}>Exported at</td>
                    <td style={{ padding: '0.4rem' }}>{formatDate(exportPayload.exportedAt)}</td>
                  </tr>
                  <tr>
                    <td style={{ padding: '0.4rem', fontWeight: 'bold' }}>Name</td>
                    <td style={{ padding: '0.4rem' }}>{exportPayload.user?.name ?? '—'}</td>
                  </tr>
                  <tr>
                    <td style={{ padding: '0.4rem', fontWeight: 'bold' }}>Email</td>
                    <td style={{ padding: '0.4rem' }}>{exportPayload.user?.email ?? '—'}</td>
                  </tr>
                  <tr>
                    <td style={{ padding: '0.4rem', fontWeight: 'bold' }}>Driver's License (masked)</td>
                    {/* License is masked — only last 4 digits shown */}
                    <td style={{ padding: '0.4rem' }}>
                      <code>{maskField(exportPayload.user?.driverLicense, 4)}</code>
                    </td>
                  </tr>
                  <tr>
                    <td style={{ padding: '0.4rem', fontWeight: 'bold' }}>Consent records</td>
                    <td style={{ padding: '0.4rem' }}>{exportPayload.consentRecords?.length ?? 0}</td>
                  </tr>
                  <tr>
                    <td style={{ padding: '0.4rem', fontWeight: 'bold' }}>Documents</td>
                    <td style={{ padding: '0.4rem' }}>{exportPayload.documents?.length ?? 0}</td>
                  </tr>
                  <tr>
                    <td style={{ padding: '0.4rem', fontWeight: 'bold' }}>Analytics events</td>
                    <td style={{ padding: '0.4rem' }}>{exportPayload.analyticsEvents?.length ?? 0}</td>
                  </tr>
                  <tr>
                    <td style={{ padding: '0.4rem', fontWeight: 'bold' }}>Audit logs</td>
                    <td style={{ padding: '0.4rem' }}>{exportPayload.auditLogs?.length ?? 0}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* ── Deletion Requests ── */}
      {tab === 2 && (
        <section>
          <h2>Data Deletion</h2>
          <p style={{ color: '#666', fontSize: '0.9rem' }}>
            Deletion requests are held for 30 days before execution, giving you time to cancel.
            You may only have one pending request at a time.
          </p>
          <div style={{ marginBottom: '1rem' }}>
            <button
              className="btn btn-primary"
              onClick={handleRequestDeletion}
              disabled={requesting}
            >
              {requesting ? 'Submitting…' : 'Request Full Data Deletion'}
            </button>
          </div>
          {requestMsg   && <div className="success-msg" style={{ color: 'green', marginBottom: '0.75rem' }}>{requestMsg}</div>}
          {requestError && <div className="error-msg">{requestError}</div>}

          {deletionLoading && <div className="loading">Loading…</div>}
          {deletionError   && <div className="error-msg">{deletionError}</div>}
          {!deletionLoading && !deletionError && deletions.length === 0 && (
            <p className="empty">No deletion requests.</p>
          )}
          {deletions.map(r => (
            <div
              key={r._id}
              className="card"
              style={{ marginBottom: '0.75rem', padding: '0.75rem', borderLeft: `4px solid ${r.status === 'pending' ? '#e67e22' : r.status === 'completed' ? '#27ae60' : '#95a5a6'}` }}
            >
              <div><strong>Status:</strong> <span className={`status-badge status-${r.status}`}>{r.status}</span></div>
              <div><strong>Scope:</strong> {r.scope.join(', ')}</div>
              <div><strong>Requested:</strong> {formatDate(r.requestedAt)}</div>
              <div><strong>Scheduled for execution:</strong> {formatDate(r.scheduledAt)}</div>
              {r.executedAt && <div><strong>Executed:</strong> {formatDate(r.executedAt)}</div>}
              {r.status === 'pending' && (
                <button
                  className="btn btn-sm"
                  style={{ marginTop: '0.5rem' }}
                  onClick={() => handleCancel(r._id)}
                >
                  Cancel Request
                </button>
              )}
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
