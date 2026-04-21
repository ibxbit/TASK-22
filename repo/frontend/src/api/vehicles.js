import client from './client';

export function searchVehicles(params) {
  return client.get('/vehicles/search', { params }).then(r => r.data);
}
