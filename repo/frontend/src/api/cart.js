import client from './client';

export function addToCart(body) {
  return client.post('/cart/add', body).then(r => r.data);
}

export function checkout(body) {
  return client.post('/cart/checkout', body).then(r => r.data);
}
