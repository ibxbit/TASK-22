import client from './client';

export function getTrendingKeywords() {
  return client.get('/analytics/trending').then(r => r.data);
}
