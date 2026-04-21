import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('react-router-dom', () => ({
  useLocation: vi.fn(),
  useNavigate: vi.fn(),
}));
vi.mock('../api/payments', () => ({ processPayment: vi.fn() }));
vi.mock('../api/orders',   () => ({ transitionOrder: vi.fn() }));
vi.mock('../api/finance',  () => ({ getInvoicePreview: vi.fn() }));

import { useLocation, useNavigate } from 'react-router-dom';
import { processPayment } from '../api/payments';
import { transitionOrder } from '../api/orders';
import { getInvoicePreview } from '../api/finance';
import CheckoutPage from '../pages/CheckoutPage';

const mockNavigate = vi.fn();

function renderCheckout(orders = []) {
  useLocation.mockReturnValue({ state: { orders } });
  useNavigate.mockReturnValue(mockNavigate);
  return render(<CheckoutPage />);
}

const sampleOrder = {
  _id: 'order-abc-123456',
  supplier: 'SupA',
  items: [{ vehicleId: 'v1' }],
  status: 'created',
  dealershipId: 'deal-1',
};

describe('CheckoutPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('shows empty state message when orders array is empty', () => {
    renderCheckout([]);
    expect(screen.getByText(/no orders to display/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /search vehicles/i })).toBeInTheDocument();
  });

  test('clicking Search vehicles link on empty state calls navigate("/")', async () => {
    renderCheckout([]);
    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: /search vehicles/i }));
    });
    expect(mockNavigate).toHaveBeenCalledWith('/');
  });

  test('renders order list when orders are provided', () => {
    renderCheckout([sampleOrder]);
    expect(screen.getByText(/checkout/i)).toBeInTheDocument();
    expect(screen.getByText(/order #123456/i)).toBeInTheDocument();
    expect(screen.getByText('SupA')).toBeInTheDocument();
  });

  test('shows payment method selector with cash, cashiers_check, inhouse_financing', () => {
    renderCheckout([sampleOrder]);
    const select = screen.getByRole('combobox');
    const options = Array.from(select.options).map(o => o.value);
    expect(options).toContain('cash');
    expect(options).toContain('cashiers_check');
    expect(options).toContain('inhouse_financing');
  });

  test('Pay Now button is disabled when amount is empty', () => {
    renderCheckout([sampleOrder]);
    expect(screen.getByRole('button', { name: /pay now/i })).toBeDisabled();
  });

  test('Preview Invoice button is disabled when state/county fields are empty', () => {
    renderCheckout([sampleOrder]);
    expect(screen.getByRole('button', { name: /preview invoice/i })).toBeDisabled();
  });

  test('loads invoice preview when state and county are filled and button clicked', async () => {
    getInvoicePreview.mockResolvedValue({
      preview: { subtotal: 20000, tax: { totalTaxAmount: 1650 }, total: 21650 },
    });
    renderCheckout([sampleOrder]);

    await act(async () => {
      await userEvent.type(screen.getByPlaceholderText(/state/i), 'CA');
      await userEvent.type(screen.getByPlaceholderText(/county/i), 'Los Angeles');
    });

    const previewBtn = screen.getByRole('button', { name: /preview invoice/i });
    expect(previewBtn).not.toBeDisabled();

    await act(async () => {
      await userEvent.click(previewBtn);
    });

    await waitFor(() =>
      expect(screen.getByText(/invoice preview/i)).toBeInTheDocument(),
    );
    expect(getInvoicePreview).toHaveBeenCalledWith(sampleOrder._id, 'CA', 'Los Angeles');
  });

  test('Pay Now triggers processPayment and transitionOrder, then shows success', async () => {
    processPayment.mockResolvedValue({});
    transitionOrder.mockResolvedValue({});
    renderCheckout([sampleOrder]);

    await act(async () => {
      await userEvent.type(screen.getByPlaceholderText('Amount'), '25000');
    });

    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: /pay now/i }));
    });

    await waitFor(() =>
      expect(screen.getByText(/payment recorded/i)).toBeInTheDocument(),
    );
    expect(processPayment).toHaveBeenCalledWith({
      orderId: sampleOrder._id,
      method: 'cash',
      amount: 25000,
    });
    expect(transitionOrder).toHaveBeenCalledWith(sampleOrder._id, { toState: 'reserved' });
  });
});
