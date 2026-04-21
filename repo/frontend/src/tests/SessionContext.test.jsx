import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SessionProvider, useSession } from '../context/SessionContext';

vi.mock('axios', () => ({
  default: {
    post: vi.fn(),
  },
}));

import axios from 'axios';

function TestConsumer() {
  const { sessionId, userId, authState, login, logout } = useSession();
  return (
    <div>
      <span data-testid="sessionId">{sessionId}</span>
      <span data-testid="userId">{userId}</span>
      <span data-testid="authed">{authState ? 'yes' : 'no'}</span>
      <span data-testid="role">{authState?.user?.role ?? ''}</span>
      <button onClick={() => login('user-123')}>Login</button>
      <button onClick={logout}>Logout</button>
    </div>
  );
}

function renderProvider() {
  return render(
    <SessionProvider>
      <TestConsumer />
    </SessionProvider>,
  );
}

describe('SessionContext', () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    sessionStorage.clear();
  });

  test('generates and persists a sessionId on first render', () => {
    renderProvider();
    const id = screen.getByTestId('sessionId').textContent;
    expect(id).toMatch(/^sess-/);
    expect(sessionStorage.getItem('sessionId')).toBe(id);
  });

  test('reuses an existing sessionId from sessionStorage', () => {
    sessionStorage.setItem('sessionId', 'sess-existing-123');
    renderProvider();
    expect(screen.getByTestId('sessionId').textContent).toBe('sess-existing-123');
  });

  test('initializes authState from existing sessionStorage token', () => {
    const user = { id: 'u1', name: 'Alice', role: 'admin' };
    sessionStorage.setItem('authToken', 'tok-abc');
    sessionStorage.setItem('authUser', JSON.stringify(user));
    renderProvider();
    expect(screen.getByTestId('authed').textContent).toBe('yes');
    expect(screen.getByTestId('role').textContent).toBe('admin');
  });

  test('login stores token and user in sessionStorage and updates authState', async () => {
    const fakeUser = { id: 'u2', name: 'Bob', role: 'manager' };
    axios.post.mockResolvedValue({ data: { token: 'tok-xyz', user: fakeUser } });

    renderProvider();
    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: 'Login' }));
    });

    expect(sessionStorage.getItem('authToken')).toBe('tok-xyz');
    expect(JSON.parse(sessionStorage.getItem('authUser'))).toEqual(fakeUser);
    expect(screen.getByTestId('authed').textContent).toBe('yes');
    expect(screen.getByTestId('role').textContent).toBe('manager');
  });

  test('login calls POST /api/auth/token with userId', async () => {
    axios.post.mockResolvedValue({ data: { token: 't', user: { id: 'u1', name: 'X', role: 'admin' } } });
    renderProvider();
    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: 'Login' }));
    });
    expect(axios.post).toHaveBeenCalledWith('/api/auth/token', { userId: 'user-123' });
  });

  test('logout clears sessionStorage and sets authState to null', async () => {
    const user = { id: 'u3', name: 'Carol', role: 'salesperson' };
    sessionStorage.setItem('authToken', 'tok-abc');
    sessionStorage.setItem('authUser', JSON.stringify(user));
    renderProvider();

    expect(screen.getByTestId('authed').textContent).toBe('yes');

    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: 'Logout' }));
    });

    expect(screen.getByTestId('authed').textContent).toBe('no');
    expect(sessionStorage.getItem('authToken')).toBeNull();
    expect(sessionStorage.getItem('authUser')).toBeNull();
  });

  test('userId is empty string when not authenticated', () => {
    renderProvider();
    expect(screen.getByTestId('userId').textContent).toBe('');
  });
});
