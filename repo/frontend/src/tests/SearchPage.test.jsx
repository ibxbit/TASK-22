import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../api/vehicles', () => ({
  searchVehicles: vi.fn(),
}));
vi.mock('../api/analytics', () => ({
  getTrendingKeywords: vi.fn(),
}));
vi.mock('../context/SessionContext', () => ({
  useSession: vi.fn(),
}));
vi.mock('../hooks/useDebounce', () => ({
  useDebounce: vi.fn(val => val),
}));
vi.mock('../components/VehicleCard', () => ({
  default: ({ vehicle }) => <div data-testid="vehicle-card">{vehicle.make} {vehicle.model}</div>,
}));

import { searchVehicles } from '../api/vehicles';
import { getTrendingKeywords } from '../api/analytics';
import { useSession } from '../context/SessionContext';
import SearchPage from '../pages/SearchPage';

const emptyResults = { results: [], total: 0, totalPages: 1 };
const oneResult    = {
  results: [{ _id: 'v1', make: 'Toyota', model: 'Camry', price: 25000, status: 'available' }],
  total: 1,
  totalPages: 1,
};

describe('SearchPage', () => {
  beforeEach(() => {
    localStorage.clear();
    useSession.mockReturnValue({ userId: 'u1' });
    getTrendingKeywords.mockResolvedValue({ keywords: [] });
    searchVehicles.mockResolvedValue(emptyResults);
  });

  test('renders Vehicle Search heading', async () => {
    render(<SearchPage />);
    expect(screen.getByRole('heading', { name: /vehicle search/i })).toBeInTheDocument();
  });

  test('shows result count after search resolves', async () => {
    searchVehicles.mockResolvedValue(oneResult);
    render(<SearchPage />);
    await waitFor(() => expect(screen.getByText(/1 result/i)).toBeInTheDocument());
  });

  test('shows zero-results feedback with contextual hint when no results found', async () => {
    searchVehicles.mockResolvedValue(emptyResults);
    render(<SearchPage />);
    await waitFor(() => expect(screen.getByText(/0 matches found/i)).toBeInTheDocument());
    expect(screen.getByText(/no vehicles match/i)).toBeInTheDocument();
  });

  test('zero-results hint mentions price when priceMax is set', async () => {
    searchVehicles.mockResolvedValue(emptyResults);
    render(<SearchPage />);
    const maxPriceInput = screen.getByPlaceholderText('Max Price');
    await act(async () => {
      await userEvent.type(maxPriceInput, '10000');
    });
    await waitFor(() =>
      expect(screen.getByText(/raising your maximum price/i)).toBeInTheDocument(),
    );
  });

  test('zero-results hint mentions mileage when mileageMax is set', async () => {
    searchVehicles.mockResolvedValue(emptyResults);
    render(<SearchPage />);
    const mileageInput = screen.getByPlaceholderText('Max Mileage');
    await act(async () => {
      await userEvent.type(mileageInput, '5000');
    });
    await waitFor(() =>
      expect(screen.getByText(/increasing the maximum mileage/i)).toBeInTheDocument(),
    );
  });

  test('displays trending keyword chips when trending data exists', async () => {
    getTrendingKeywords.mockResolvedValue({
      keywords: [{ keyword: 'Toyota', count: 10 }, { keyword: 'Honda', count: 5 }],
    });
    render(<SearchPage />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Toyota' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Honda' })).toBeInTheDocument();
    });
  });

  test('clicking a trending chip sets the make filter', async () => {
    getTrendingKeywords.mockResolvedValue({
      keywords: [{ keyword: 'BMW', count: 3 }],
    });
    render(<SearchPage />);
    await waitFor(() => screen.getByRole('button', { name: 'BMW' }));
    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: 'BMW' }));
    });
    expect(screen.getByPlaceholderText('Make')).toHaveValue('BMW');
  });

  test('vehicle cards are rendered for each result', async () => {
    searchVehicles.mockResolvedValue(oneResult);
    render(<SearchPage />);
    await waitFor(() => expect(screen.getAllByTestId('vehicle-card')).toHaveLength(1));
    expect(screen.getByText('Toyota Camry')).toBeInTheDocument();
  });

  test('preset save and apply flow', async () => {
    render(<SearchPage />);
    const makeInput   = screen.getByPlaceholderText('Make');
    const presetInput = screen.getByPlaceholderText('Preset name…');
    const saveBtn     = screen.getByRole('button', { name: 'Save Preset' });

    await act(async () => {
      await userEvent.type(makeInput, 'Ford');
      await userEvent.type(presetInput, 'My Preset');
    });

    expect(saveBtn).not.toBeDisabled();

    await act(async () => {
      await userEvent.click(saveBtn);
    });

    // Preset chip should appear
    expect(screen.getByRole('button', { name: 'My Preset' })).toBeInTheDocument();
  });

  test('preset delete removes chip', async () => {
    render(<SearchPage />);
    const presetInput = screen.getByPlaceholderText('Preset name…');

    await act(async () => {
      await userEvent.type(presetInput, 'TempPreset');
      await userEvent.click(screen.getByRole('button', { name: 'Save Preset' }));
    });

    expect(screen.getByRole('button', { name: 'TempPreset' })).toBeInTheDocument();

    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: '×' }));
    });

    expect(screen.queryByRole('button', { name: 'TempPreset' })).not.toBeInTheDocument();
  });
});
