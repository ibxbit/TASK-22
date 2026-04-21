import client from './client';

export function listDocuments(params) {
  return client.get('/documents', { params }).then(r => r.data);
}

export function uploadDocument(formData) {
  return client.post('/documents/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then(r => r.data);
}

export function downloadDocument(docId) {
  return client.get(`/documents/${docId}/download`, { responseType: 'blob' }).then(r => r.data);
}
