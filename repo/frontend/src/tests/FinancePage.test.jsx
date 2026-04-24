import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../api/finance', () => ({
  getTaxRates:   vi.fn(),
  upsertTaxRate: vi.fn(),
}));

import { getTaxRates, upsertTaxRate } from '../api/finance';
import FinancePage from '../pages/FinancePage';

const sampleRate = {
  _id:       'rate-1',
  state:     'CA',
  county:    'Los Angeles',
  stateTax:  7.25,
  countyTax: 1.0,
};

function renderFinance() {
  return render(<FinancePage />);
}

beforeEach(() => {
  vi.clearAllMocks();
  getTaxRates.mockResolvedValue({ rates: [] });
});

// ── Initial load ───────────────────────────────────────────────────────────────

describe('FinancePage — loading and display', () => {
  test('shows "No tax rates configured" when list is empty', async () => {
    getTaxRates.mockResolvedValue({ rates: [] });
    renderFinance();
    await waitFor(() =>
      expect(screen.getByText(/no tax rates configured/i)).toBeInTheDocument(),
    );
  });

  test('renders rate table with state, county, stateTax, countyTax', async () => {
    getTaxRates.mockResolvedValue({ rates: [sampleRate] });
    renderFinance();
    await waitFor(() => expect(screen.getByText('CA')).toBeInTheDocument());
    expect(screen.getByText('Los Angeles')).toBeInTheDocument();
    expect(screen.getByText('7.25%')).toBeInTheDocument();
    expect(screen.getByText('1%')).toBeInTheDocument();
  });

  test('shows "—" for null county', async () => {
    getTaxRates.mockResolvedValue({ rates: [{ ...sampleRate, county: null }] });
    renderFinance();
    await waitFor(() => screen.getByText('CA'));
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  test('shows error message when getTaxRates rejects', async () => {
    getTaxRates.mockRejectedValue({ response: { data: { error: 'Load failed' } } });
    renderFinance();
    await waitFor(() =>
      expect(screen.getByText('Load failed')).toBeInTheDocument(),
    );
  });

  test('handles rates returned as a top-level array (no .rates key)', async () => {
    getTaxRates.mockResolvedValue([sampleRate]);
    renderFinance();
    await waitFor(() => expect(screen.getByText('CA')).toBeInTheDocument());
  });
});

// ── Form — add / save ─────────────────────────────────────────────────────────

describe('FinancePage — save rate form', () => {
  test('renders the Add / Update Rate form', () => {
    renderFinance();
    expect(screen.getByPlaceholderText(/state \(2-letter\)/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/county \(optional\)/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/state tax %/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/county tax %/i)).toBeInTheDocument();
  });

  test('state input converts text to uppercase', async () => {
    renderFinance();
    const stateInput = screen.getByPlaceholderText(/state \(2-letter\)/i);
    await act(async () => {
      await userEvent.type(stateInput, 'ca');
    });
    expect(stateInput.value).toBe('CA');
  });

  test('submitting form calls upsertTaxRate with parsed values', async () => {
    upsertTaxRate.mockResolvedValue({});
    renderFinance();

    await act(async () => {
      await userEvent.type(screen.getByPlaceholderText(/state \(2-letter\)/i), 'TX');
      await userEvent.type(screen.getByPlaceholderText(/county \(optional\)/i), 'Harris');
      await userEvent.type(screen.getByPlaceholderText(/state tax %/i), '6.25');
      await userEvent.type(screen.getByPlaceholderText(/county tax %/i), '0.5');
      await userEvent.click(screen.getByRole('button', { name: /save rate/i }));
    });

    expect(upsertTaxRate).toHaveBeenCalledWith({
      state:     'TX',
      county:    'Harris',
      stateTax:  6.25,
      countyTax: 0.5,
    });
  });

  test('county is sent as null when left blank', async () => {
    upsertTaxRate.mockResolvedValue({});
    renderFinance();

    await act(async () => {
      await userEvent.type(screen.getByPlaceholderText(/state \(2-letter\)/i), 'NV');
      await userEvent.type(screen.getByPlaceholderText(/state tax %/i), '4.5');
      await userEvent.click(screen.getByRole('button', { name: /save rate/i }));
    });

    expect(upsertTaxRate).toHaveBeenCalledWith(
      expect.objectContaining({ county: null }),
    );
  });

  test('shows "Saved." success message after successful save', async () => {
    upsertTaxRate.mockResolvedValue({});
    renderFinance();

    await act(async () => {
      await userEvent.type(screen.getByPlaceholderText(/state \(2-letter\)/i), 'OR');
      await userEvent.type(screen.getByPlaceholderText(/state tax %/i), '0');
      await userEvent.click(screen.getByRole('button', { name: /save rate/i }));
    });

    await waitFor(() => expect(screen.getByText('Saved.')).toBeInTheDocument());
  });

  test('form resets to blank after successful save', async () => {
    upsertTaxRate.mockResolvedValue({});
    renderFinance();
    const stateInput = screen.getByPlaceholderText(/state \(2-letter\)/i);

    await act(async () => {
      await userEvent.type(stateInput, 'WA');
      await userEvent.type(screen.getByPlaceholderText(/state tax %/i), '6.5');
      await userEvent.click(screen.getByRole('button', { name: /save rate/i }));
    });

    await waitFor(() => expect(stateInput.value).toBe(''));
  });

  test('shows error message when upsertTaxRate rejects', async () => {
    upsertTaxRate.mockRejectedValue({ response: { data: { error: 'Rate conflict' } } });
    renderFinance();

    await act(async () => {
      await userEvent.type(screen.getByPlaceholderText(/state \(2-letter\)/i), 'FL');
      await userEvent.type(screen.getByPlaceholderText(/state tax %/i), '6');
      await userEvent.click(screen.getByRole('button', { name: /save rate/i }));
    });

    await waitFor(() =>
      expect(screen.getByText('Rate conflict')).toBeInTheDocument(),
    );
  });

  test('Save Rate button shows "Saving…" while request is in flight', async () => {
    let resolve;
    upsertTaxRate.mockReturnValue(new Promise(r => { resolve = r; }));
    renderFinance();

    await act(async () => {
      await userEvent.type(screen.getByPlaceholderText(/state \(2-letter\)/i), 'AZ');
      await userEvent.type(screen.getByPlaceholderText(/state tax %/i), '5.6');
    });

    act(() => { userEvent.click(screen.getByRole('button', { name: /save rate/i })); });

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /saving/i })).toBeInTheDocument(),
    );

    await act(async () => { resolve({}); });
  });
});

// ── Edit rate ─────────────────────────────────────────────────────────────────

describe('FinancePage — edit rate', () => {
  test('clicking Edit populates the form fields', async () => {
    getTaxRates.mockResolvedValue({ rates: [sampleRate] });
    renderFinance();
    await waitFor(() => screen.getByText('CA'));

    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: /edit/i }));
    });

    expect(screen.getByPlaceholderText(/state \(2-letter\)/i).value).toBe('CA');
    expect(screen.getByPlaceholderText(/county \(optional\)/i).value).toBe('Los Angeles');
    expect(screen.getByPlaceholderText(/state tax %/i).value).toBe('7.25');
    expect(screen.getByPlaceholderText(/county tax %/i).value).toBe('1');
  });

  test('editing and saving calls upsertTaxRate with updated values', async () => {
    getTaxRates.mockResolvedValue({ rates: [sampleRate] });
    upsertTaxRate.mockResolvedValue({});
    renderFinance();
    await waitFor(() => screen.getByText('CA'));

    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: /edit/i }));
    });

    const stateTaxInput = screen.getByPlaceholderText(/state tax %/i);
    await act(async () => {
      await userEvent.clear(stateTaxInput);
      await userEvent.type(stateTaxInput, '8');
      await userEvent.click(screen.getByRole('button', { name: /save rate/i }));
    });

    expect(upsertTaxRate).toHaveBeenCalledWith(
      expect.objectContaining({ state: 'CA', stateTax: 8 }),
    );
  });
});
