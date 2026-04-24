import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../api/cart', () => ({ checkout: vi.fn() }));
vi.mock('../context/CartContext',   () => ({ useCart:    vi.fn() }));
vi.mock('../context/SessionContext', () => ({ useSession: vi.fn() }));

// react-router-dom's useNavigate is used by CartPage — the MemoryRouter wrapper
// provides it; we spy on navigate through router's own state below.
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: vi.fn() };
});

import { checkout } from '../api/cart';
import { useCart }    from '../context/CartContext';
import { useSession } from '../context/SessionContext';
import { useNavigate } from 'react-router-dom';
import CartPage from '../pages/CartPage';

const mockDispatch = vi.fn();
const mockNavigate = vi.fn();

const sampleItem = {
  vehicleId:         'v-001',
  supplier:          'AcmeParts',
  warehouseLocation: 'East',
  turnaroundTime:    5,
  addOns:            ['inspection_package'],
};

function renderCart(cartOverride = {}, sessionOverride = {}) {
  useCart.mockReturnValue({ cart: null, dispatch: mockDispatch, ...cartOverride });
  useSession.mockReturnValue({ sessionId: 'sess-cart', ...sessionOverride });
  useNavigate.mockReturnValue(mockNavigate);
  return render(
    <MemoryRouter>
      <CartPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ── Empty state ───────────────────────────────────────────────────────────────

describe('CartPage — empty cart', () => {
  test('shows "Your cart is empty" when cart is null', () => {
    renderCart({ cart: null });
    expect(screen.getByText(/your cart is empty/i)).toBeInTheDocument();
  });

  test('shows "Your cart is empty" when cart.items is empty array', () => {
    renderCart({ cart: { items: [] } });
    expect(screen.getByText(/your cart is empty/i)).toBeInTheDocument();
  });

  test('does not render the checkout button when cart is empty', () => {
    renderCart({ cart: null });
    expect(screen.queryByRole('button', { name: /checkout/i })).not.toBeInTheDocument();
  });
});

// ── Items display ─────────────────────────────────────────────────────────────

describe('CartPage — cart with items', () => {
  test('renders vehicle ID for each cart item', () => {
    renderCart({ cart: { items: [sampleItem] } });
    expect(screen.getByText(/v-001/)).toBeInTheDocument();
  });

  test('renders supplier, warehouse, and turnaround for each item', () => {
    renderCart({ cart: { items: [sampleItem] } });
    expect(screen.getByText(/acmeparts/i)).toBeInTheDocument();
    expect(screen.getByText(/east/i)).toBeInTheDocument();
    expect(screen.getByText(/5d/)).toBeInTheDocument();
  });

  test('renders add-ons list when present', () => {
    renderCart({ cart: { items: [sampleItem] } });
    expect(screen.getByText(/inspection_package/)).toBeInTheDocument();
  });

  test('does not render add-ons section when addOns is empty', () => {
    renderCart({ cart: { items: [{ ...sampleItem, addOns: [] }] } });
    expect(screen.queryByText(/add-ons:/i)).not.toBeInTheDocument();
  });

  test('checkout button shows item count (singular)', () => {
    renderCart({ cart: { items: [sampleItem] } });
    expect(screen.getByRole('button', { name: /checkout \(1 item\)/i })).toBeInTheDocument();
  });

  test('checkout button shows item count (plural)', () => {
    renderCart({ cart: { items: [sampleItem, { ...sampleItem, vehicleId: 'v-002' }] } });
    expect(screen.getByRole('button', { name: /checkout \(2 items\)/i })).toBeInTheDocument();
  });
});

// ── Checkout interaction ───────────────────────────────────────────────────────

describe('CartPage — checkout flow', () => {
  test('clicking checkout calls checkout() with sessionId', async () => {
    checkout.mockResolvedValue({ orders: [] });
    renderCart({ cart: { items: [sampleItem] } });

    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: /checkout/i }));
    });

    expect(checkout).toHaveBeenCalledWith({ sessionId: 'sess-cart' });
  });

  test('successful checkout dispatches CLEAR_CART and navigates to /checkout', async () => {
    const fakeOrders = [{ _id: 'ord-1' }];
    checkout.mockResolvedValue({ orders: fakeOrders });
    renderCart({ cart: { items: [sampleItem] } });

    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: /checkout/i }));
    });

    expect(mockDispatch).toHaveBeenCalledWith({ type: 'CLEAR_CART' });
    expect(mockNavigate).toHaveBeenCalledWith('/checkout', {
      state: { orders: fakeOrders },
    });
  });

  test('button shows "Processing…" while request is in flight', async () => {
    let resolve;
    checkout.mockReturnValue(new Promise(r => { resolve = r; }));
    renderCart({ cart: { items: [sampleItem] } });

    act(() => { userEvent.click(screen.getByRole('button', { name: /checkout/i })); });

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /processing/i })).toBeInTheDocument(),
    );

    resolve({ orders: [] });
  });

  test('button is disabled while request is in flight', async () => {
    let resolve;
    checkout.mockReturnValue(new Promise(r => { resolve = r; }));
    renderCart({ cart: { items: [sampleItem] } });

    act(() => { userEvent.click(screen.getByRole('button', { name: /checkout/i })); });

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /processing/i })).toBeDisabled(),
    );

    resolve({ orders: [] });
  });

  test('shows error message when checkout() rejects', async () => {
    checkout.mockRejectedValue({ response: { data: { error: 'Session expired' } } });
    renderCart({ cart: { items: [sampleItem] } });

    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: /checkout/i }));
    });

    await waitFor(() =>
      expect(screen.getByText('Session expired')).toBeInTheDocument(),
    );
  });

  test('button returns to idle after checkout failure', async () => {
    checkout.mockRejectedValue({ response: { data: { error: 'Fail' } } });
    renderCart({ cart: { items: [sampleItem] } });

    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: /checkout/i }));
    });

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /checkout/i })).not.toBeDisabled(),
    );
  });
});
