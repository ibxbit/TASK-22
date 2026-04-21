import client from './client';

export function getTaxRates(params) {
  return client.get('/finance/tax-rates', { params }).then(r => r.data);
}

export function upsertTaxRate(body) {
  return client.post('/finance/tax-rates', body).then(r => r.data);
}

export function getInvoicePreview(orderId, state, county) {
  return client.get(`/finance/invoice-preview/${orderId}`, { params: { state, county } }).then(r => r.data);
}
