import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

// Mock context hooks — Layout reads cart count and auth state from these.
vi.mock('../context/CartContext',   () => ({ useCart:    vi.fn() }));
vi.mock('../context/SessionContext', () => ({ useSession: vi.fn() }));

import { useCart }    from '../context/CartContext';
import { useSession } from '../context/SessionContext';
import Layout from '../components/Layout';

const mockLogin  = vi.fn();
const mockLogout = vi.fn();

function renderLayout(sessionOverride = {}, cartOverride = {}, children = <div>Page content</div>) {
  useCart.mockReturnValue({ cart: null, ...cartOverride });
  useSession.mockReturnValue({
    authState: null,
    login:     mockLogin,
    logout:    mockLogout,
    ...sessionOverride,
  });
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Layout>{children}</Layout>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Layout — navigation', () => {
  test('renders the MotorLot DealerOps logo', () => {
    renderLayout();
    expect(screen.getByText('MotorLot DealerOps')).toBeInTheDocument();
  });

  test('renders all navigation links', () => {
    renderLayout();
    ['Search', 'Cart', 'Documents', 'Finance', 'Admin', 'Privacy'].forEach(label => {
      expect(screen.getByRole('link', { name: new RegExp(label, 'i') })).toBeInTheDocument();
    });
  });

  test('renders children inside the main element', () => {
    renderLayout({}, {}, <span data-testid="child">hello</span>);
    expect(screen.getByTestId('child')).toBeInTheDocument();
  });
});

describe('Layout — cart count badge', () => {
  test('Cart link shows plain "Cart" text when cart is empty', () => {
    renderLayout({}, { cart: null });
    expect(screen.getByRole('link', { name: /^cart$/i })).toBeInTheDocument();
  });

  test('Cart link shows item count when cart has items', () => {
    renderLayout({}, { cart: { items: [{ vehicleId: 'v1' }, { vehicleId: 'v2' }] } });
    expect(screen.getByRole('link', { name: /cart \(2\)/i })).toBeInTheDocument();
  });

  test('Cart link shows (1) for a single item', () => {
    renderLayout({}, { cart: { items: [{ vehicleId: 'v1' }] } });
    expect(screen.getByRole('link', { name: /cart \(1\)/i })).toBeInTheDocument();
  });
});

describe('Layout — unauthenticated state', () => {
  test('shows "Log in" button when not authenticated', () => {
    renderLayout({ authState: null });
    expect(screen.getByRole('button', { name: /log in/i })).toBeInTheDocument();
  });

  test('clicking "Log in" reveals the login form', async () => {
    renderLayout({ authState: null });
    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: /log in/i }));
    });
    expect(screen.getByPlaceholderText(/user id/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^login$/i })).toBeInTheDocument();
  });

  test('"Cancel" button hides the login form', async () => {
    renderLayout({ authState: null });
    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: /log in/i }));
    });
    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: /cancel/i }));
    });
    expect(screen.queryByPlaceholderText(/user id/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /log in/i })).toBeInTheDocument();
  });

  test('submitting login form calls login() with trimmed user ID', async () => {
    mockLogin.mockResolvedValue({});
    renderLayout({ authState: null });

    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: /log in/i }));
    });
    await act(async () => {
      await userEvent.type(screen.getByPlaceholderText(/user id/i), '  abc123  ');
      await userEvent.click(screen.getByRole('button', { name: /^login$/i }));
    });

    expect(mockLogin).toHaveBeenCalledWith('abc123');
  });

  test('shows login error message when login() rejects', async () => {
    mockLogin.mockRejectedValue({ response: { data: { error: 'User not found' } } });
    renderLayout({ authState: null });

    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: /log in/i }));
    });
    await act(async () => {
      await userEvent.type(screen.getByPlaceholderText(/user id/i), 'badid');
      await userEvent.click(screen.getByRole('button', { name: /^login$/i }));
    });

    await waitFor(() =>
      expect(screen.getByText('User not found')).toBeInTheDocument(),
    );
  });
});

describe('Layout — authenticated state', () => {
  const authedSession = {
    authState: { token: 'tok', user: { name: 'Alice', role: 'admin' } },
  };

  test('shows user name and role when logged in', () => {
    renderLayout(authedSession);
    expect(screen.getByText(/alice/i)).toBeInTheDocument();
    expect(screen.getAllByText(/admin/i).length).toBeGreaterThan(0);
  });

  test('shows "Log out" button when authenticated', () => {
    renderLayout(authedSession);
    expect(screen.getByRole('button', { name: /log out/i })).toBeInTheDocument();
  });

  test('clicking "Log out" calls logout()', async () => {
    renderLayout(authedSession);
    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: /log out/i }));
    });
    expect(mockLogout).toHaveBeenCalledTimes(1);
  });

  test('login form is NOT shown when already authenticated', () => {
    renderLayout(authedSession);
    expect(screen.queryByRole('button', { name: /log in/i })).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/user id/i)).not.toBeInTheDocument();
  });
});
