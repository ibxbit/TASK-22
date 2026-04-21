import client from './client';

export function getOrder(orderId) {
  return client.get(`/orders/${orderId}`).then(r => r.data);
}

export function transitionOrder(orderId, body) {
  return client.patch(`/orders/${orderId}/transition`, body).then(r => r.data);
}
