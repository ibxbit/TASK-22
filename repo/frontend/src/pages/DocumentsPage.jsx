import { useState, useEffect, useRef } from 'react';
import { listDocuments, uploadDocument, downloadDocument } from '../api/documents';
import { useSession } from '../context/SessionContext';

const DOC_TYPES = ['title', 'buyers_order', 'inspection_pdf'];

export default function DocumentsPage() {
  const { authState } = useSession();
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const [uploadError, setUploadError] = useState(null);
  const [docType, setDocType] = useState('title');
  const [orderId, setOrderId] = useState('');
  const fileRef = useRef(null);

  async function fetchDocs() {
    setLoading(true);
    setError(null);
    try {
      const data = await listDocuments();
      setDocs(data.documents ?? data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load documents');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (authState) fetchDocs();
  }, [authState]);

  async function handleUpload(e) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    const formData = new FormData();
    formData.append('file', file);
    formData.append('type', docType);
    if (orderId) formData.append('orderId', orderId);
    try {
      await uploadDocument(formData);
      fileRef.current.value = '';
      setOrderId('');
      fetchDocs();
    } catch (err) {
      setUploadError(err.response?.data?.error || 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  async function handleDownload(docId, filename) {
    try {
      const blob = await downloadDocument(docId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename || `document-${docId}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert('Download failed');
    }
  }

  if (!authState) {
    return (
      <div className="page">
        <h1>Documents</h1>
        <div className="auth-prompt">
          <p>Documents require authentication. Please log in using the Login button above.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <h1>Documents</h1>
      <div className="user-indicator">
        Authenticated as: <code>{authState.user.name}</code> ({authState.user.role})
      </div>
      <form className="upload-form" onSubmit={handleUpload}>
        <h2>Upload Document</h2>
        <select value={docType} onChange={e => setDocType(e.target.value)}>
          {DOC_TYPES.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
        </select>
        <input
          placeholder="Order ID (optional)"
          value={orderId}
          onChange={e => setOrderId(e.target.value)}
        />
        <input type="file" ref={fileRef} accept=".pdf,.jpg,.jpeg,.png" required />
        {uploadError && <div className="error-msg">{uploadError}</div>}
        <button className="btn btn-primary" type="submit" disabled={uploading}>
          {uploading ? 'Uploading…' : 'Upload'}
        </button>
      </form>
      <h2>Document List</h2>
      {error && <div className="error-msg">{error}</div>}
      {loading ? <div className="loading">Loading…</div> : (
        docs.length === 0
          ? <p className="empty">No documents found.</p>
          : (
            <table className="doc-table">
              <thead>
                <tr><th>Type</th><th>Order</th><th>Status</th><th>Uploaded</th><th></th></tr>
              </thead>
              <tbody>
                {docs.map(doc => (
                  <tr key={doc._id}>
                    <td>{doc.type}</td>
                    <td>{doc.orderId ?? '—'}</td>
                    <td><span className={`status-badge status-${doc.status}`}>{doc.status}</span></td>
                    <td>{new Date(doc.createdAt).toLocaleDateString()}</td>
                    <td>
                      <button className="btn btn-sm" onClick={() => handleDownload(doc._id, doc.name)}>
                        Download
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
      )}
    </div>
  );
}
