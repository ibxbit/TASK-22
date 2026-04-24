/**
 * VehicleCard tests — all tests import the REAL component (no mock).
 * This is the true unit-level coverage for VehicleCard, not a stub.
 */
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../api/cart', () => ({ addToCart: vi.fn() }));
vi.mock('../context/SessionContext', () => ({ useSession: vi.fn() }));
vi.mock('../context/CartContext', () => ({ useCart: vi.fn() }));

import { addToCart } from '../api/cart';
import { useSession } from '../context/SessionContext';
import { useCart } from '../context/CartContext';
import VehicleCard from '../components/VehicleCard'; // ← real component, not mocked

const mockDispatch = vi.fn();

const baseVehicle = {
  _id:     'v-abc-123',
  year:    2022,
  make:    'Toyota',
  model:   'Camry',
  price:   25000,
  mileage: 35000,
  region:  'West',
  status:  'available',
};

beforeEach(() => {
  vi.clearAllMocks();
  useSession.mockReturnValue({ sessionId: 'sess-test' });
  useCart.mockReturnValue({ dispatch: mockDispatch });
});

describe('VehicleCard — display', () => {
  test('renders year, make, model in the vehicle title', () => {
    render(<VehicleCard vehicle={baseVehicle} />);
    expect(screen.getByText(/2022 toyota camry/i)).toBeInTheDocument();
  });

  test('renders formatted price', () => {
    render(<VehicleCard vehicle={baseVehicle} />);
    expect(screen.getByText(/25,000/)).toBeInTheDocument();
  });

  test('renders formatted mileage', () => {
    render(<VehicleCard vehicle={baseVehicle} />);
    expect(screen.getByText(/35,000/)).toBeInTheDocument();
  });

  test('renders region', () => {
    render(<VehicleCard vehicle={baseVehicle} />);
    expect(screen.getByText('West')).toBeInTheDocument();
  });

  test('renders status badge', () => {
    render(<VehicleCard vehicle={baseVehicle} />);
    expect(screen.getByText('available')).toBeInTheDocument();
  });

  test('shows add-on checkboxes for available vehicles', () => {
    render(<VehicleCard vehicle={baseVehicle} />);
    expect(screen.getByLabelText(/inspection package/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/extended warranty/i)).toBeInTheDocument();
  });

  test('does NOT show add-on checkboxes for unavailable vehicles', () => {
    render(<VehicleCard vehicle={{ ...baseVehicle, status: 'sold' }} />);
    expect(screen.queryByLabelText(/inspection package/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/extended warranty/i)).not.toBeInTheDocument();
  });

  test('"Add to Cart" button is disabled for unavailable vehicle', () => {
    render(<VehicleCard vehicle={{ ...baseVehicle, status: 'pending' }} />);
    expect(screen.getByRole('button', { name: /add to cart/i })).toBeDisabled();
  });
});

describe('VehicleCard — add to cart interaction', () => {
  test('clicking "Add to Cart" calls addToCart with sessionId, vehicleId, and addOns', async () => {
    addToCart.mockResolvedValue({ cart: { items: [] } });
    render(<VehicleCard vehicle={baseVehicle} />);

    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: /add to cart/i }));
    });

    expect(addToCart).toHaveBeenCalledWith({
      sessionId: 'sess-test',
      vehicleId: 'v-abc-123',
      addOns:    [],
    });
  });

  test('checking inspection_package includes it in addOns', async () => {
    addToCart.mockResolvedValue({ cart: { items: [] } });
    render(<VehicleCard vehicle={baseVehicle} />);

    await act(async () => {
      await userEvent.click(screen.getByLabelText(/inspection package/i));
      await userEvent.click(screen.getByRole('button', { name: /add to cart/i }));
    });

    const [callArgs] = addToCart.mock.calls;
    expect(callArgs[0].addOns).toContain('inspection_package');
  });

  test('checking and unchecking an add-on removes it', async () => {
    addToCart.mockResolvedValue({ cart: { items: [] } });
    render(<VehicleCard vehicle={baseVehicle} />);

    const checkbox = screen.getByLabelText(/inspection package/i);
    await act(async () => {
      await userEvent.click(checkbox); // check
      await userEvent.click(checkbox); // uncheck
      await userEvent.click(screen.getByRole('button', { name: /add to cart/i }));
    });

    expect(addToCart.mock.calls[0][0].addOns).not.toContain('inspection_package');
  });

  test('button shows "Adding…" while request is in flight', async () => {
    let resolve;
    addToCart.mockReturnValue(new Promise(r => { resolve = r; }));
    render(<VehicleCard vehicle={baseVehicle} />);

    act(() => { userEvent.click(screen.getByRole('button', { name: /add to cart/i })); });

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /adding/i })).toBeInTheDocument(),
    );

    resolve({ cart: { items: [] } });
  });

  test('button shows "Added!" briefly after success', async () => {
    addToCart.mockResolvedValue({ cart: { items: [{ vehicleId: 'v-abc-123' }] } });
    render(<VehicleCard vehicle={baseVehicle} />);

    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: /add to cart/i }));
    });

    expect(screen.getByRole('button', { name: /added!/i })).toBeInTheDocument();
  });

  test('dispatches SET_CART with returned cart data on success', async () => {
    const fakeCart = { items: [{ vehicleId: 'v-abc-123', addOns: [] }] };
    addToCart.mockResolvedValue({ cart: fakeCart });
    render(<VehicleCard vehicle={baseVehicle} />);

    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: /add to cart/i }));
    });

    expect(mockDispatch).toHaveBeenCalledWith({ type: 'SET_CART', payload: fakeCart });
  });

  test('shows error message and resets button to idle on failure', async () => {
    addToCart.mockRejectedValue({
      response: { data: { error: 'Vehicle unavailable' } },
    });
    render(<VehicleCard vehicle={baseVehicle} />);

    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: /add to cart/i }));
    });

    await waitFor(() =>
      expect(screen.getByText('Vehicle unavailable')).toBeInTheDocument(),
    );
    expect(screen.getByRole('button', { name: /add to cart/i })).toBeInTheDocument();
  });

  test('does not call addToCart when vehicle is unavailable', async () => {
    render(<VehicleCard vehicle={{ ...baseVehicle, status: 'sold' }} />);
    const btn = screen.getByRole('button');
    expect(btn).toBeDisabled();
    expect(addToCart).not.toHaveBeenCalled();
  });
});
