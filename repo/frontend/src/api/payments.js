import client from './client';

export function processPayment(body) {
  return client.post('/payments', body).then(r => r.data);
}

export function getLedger(orderId) {
  return client.get(`/payments/ledger/${orderId}`).then(r => r.data);
}

export function refundPayment(ledgerEntryId, reason = '') {
  return client.post(`/payments/${ledgerEntryId}/refund`, { reason }).then(r => r.data);
}

export function getWalletSummary() {
  return client.get('/payments/wallet').then(r => r.data);
}
