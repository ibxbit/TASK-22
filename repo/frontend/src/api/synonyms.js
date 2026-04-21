import client from './client';

export function listSynonyms() {
  return client.get('/synonyms').then(r => r.data);
}

export function upsertSynonym(term, expansions) {
  return client.put('/synonyms', { term, expansions }).then(r => r.data);
}

export function deleteSynonym(term) {
  return client.delete(`/synonyms/${encodeURIComponent(term)}`).then(r => r.data);
}
