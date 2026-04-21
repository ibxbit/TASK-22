import client from './client';

export const getConsentHistory    = ()           => client.get('/privacy/consent').then(r => r.data);
export const exportData           = ()           => client.get('/privacy/export').then(r => r.data);
export const getDeletionRequests  = ()           => client.get('/privacy/deletion-requests').then(r => r.data);
export const requestDeletion      = (body)       => client.post('/privacy/deletion-request', body).then(r => r.data);
export const cancelDeletion       = (id)         => client.delete(`/privacy/deletion-requests/${id}`).then(r => r.data);
export const recordConsent        = (body)       => client.post('/privacy/consent', body).then(r => r.data);
