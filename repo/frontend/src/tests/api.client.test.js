import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock axios before importing client so the interceptor wires up to the mock
vi.mock('axios', () => {
  const interceptors = {
    request: { use: vi.fn(fn => { interceptors.request._handler = fn; }) },
    _handler: null,
  };
  const instance = { interceptors, defaults: { headers: {} } };
  return {
    default: {
      create: vi.fn(() => instance),
    },
  };
});

describe('api/client — Authorization interceptor', () => {
  let client;
  let interceptorFn;

  beforeEach(async () => {
    sessionStorage.clear();
    vi.clearAllMocks();
    // Re-import so the module factory runs fresh
    vi.resetModules();
    const mod = await import('../api/client.js');
    client = mod.default;
    // Extract the interceptor function registered via interceptors.request.use(fn)
    interceptorFn = client.interceptors.request._handler;
  });

  afterEach(() => {
    sessionStorage.clear();
    vi.resetModules();
  });

  test('attaches Authorization Bearer header when token exists in sessionStorage', () => {
    sessionStorage.setItem('authToken', 'test-jwt-token');

    const config = { headers: {} };
    const result = interceptorFn(config);

    expect(result.headers['Authorization']).toBe('Bearer test-jwt-token');
  });

  test('does not attach Authorization header when sessionStorage is empty', () => {
    const config = { headers: {} };
    const result = interceptorFn(config);

    expect(result.headers['Authorization']).toBeUndefined();
  });

  test('interceptor is registered on the client instance', () => {
    expect(client.interceptors.request.use).toHaveBeenCalledOnce();
  });
});
