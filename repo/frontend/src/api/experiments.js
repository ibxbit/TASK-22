import client from './client';

export function listExperiments(params = {}) {
  return client.get('/experiments', { params }).then(r => r.data);
}

export function createExperiment(body) {
  return client.post('/experiments', body).then(r => r.data);
}

export function getExperiment(id) {
  return client.get(`/experiments/${id}`).then(r => r.data);
}

export function updateExperimentStatus(experimentId, body) {
  return client.patch(`/experiments/${experimentId}/status`, body).then(r => r.data);
}

export function rollbackExperiment(experimentId) {
  return client.post(`/experiments/${experimentId}/rollback`).then(r => r.data);
}

export function assignExperiment(body) {
  return client.post('/experiments/assign', body).then(r => r.data);
}

export function getExperimentResults(id) {
  return client.get(`/experiments/${id}/results`).then(r => r.data);
}
