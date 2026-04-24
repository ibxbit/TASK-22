import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../api/experiments', () => ({
  listExperiments:       vi.fn(),
  createExperiment:      vi.fn(),
  updateExperimentStatus: vi.fn(),
  rollbackExperiment:    vi.fn(),
  getExperimentResults:  vi.fn(),
}));

vi.mock('../api/synonyms', () => ({
  listSynonyms:  vi.fn(),
  upsertSynonym: vi.fn(),
  deleteSynonym: vi.fn(),
}));

import {
  listExperiments,
  createExperiment,
  updateExperimentStatus,
  rollbackExperiment,
  getExperimentResults,
} from '../api/experiments';

import { listSynonyms, upsertSynonym, deleteSynonym } from '../api/synonyms';
import AdminPage from '../pages/AdminPage';

const baseExperiment = {
  _id:               'exp-1',
  name:              'Test Exp',
  scope:             'listing_layout',
  status:            'draft',
  rollbackVariantKey: 'control',
  variants: [
    { key: 'control',   label: 'Control',   weight: 60 },
    { key: 'variant_a', label: 'Variant A', weight: 40 },
  ],
};

function renderAdmin() {
  return render(<AdminPage />);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  vi.spyOn(window, 'alert').mockImplementation(() => {});
  listExperiments.mockResolvedValue({ experiments: [] });
  listSynonyms.mockResolvedValue({ synonyms: [] });
});

// ── Tab navigation ─────────────────────────────────────────────────────────────

describe('AdminPage — tabs', () => {
  test('renders "A/B Experiments" tab active by default', async () => {
    renderAdmin();
    await waitFor(() => expect(screen.getByText('New Experiment')).toBeInTheDocument());
    expect(screen.queryByText(/add \/ update synonym/i)).not.toBeInTheDocument();
  });

  test('clicking "Synonym Management" tab switches panel', async () => {
    renderAdmin();
    await waitFor(() => screen.getByText('New Experiment'));

    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: /synonym management/i }));
    });

    await waitFor(() =>
      expect(screen.getByText(/add \/ update synonym/i)).toBeInTheDocument(),
    );
    expect(screen.queryByText('New Experiment')).not.toBeInTheDocument();
  });

  test('switching back to A/B Experiments tab restores experiments panel', async () => {
    renderAdmin();
    await waitFor(() => screen.getByText('New Experiment'));

    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: /synonym management/i }));
    });
    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: /a\/b experiments/i }));
    });

    expect(screen.getByText('New Experiment')).toBeInTheDocument();
  });
});

// ── Experiments Panel — loading / display ─────────────────────────────────────

describe('AdminPage — ExperimentsPanel display', () => {
  test('shows empty state when no experiments exist', async () => {
    listExperiments.mockResolvedValue({ experiments: [] });
    renderAdmin();
    await waitFor(() =>
      expect(screen.getByText(/no experiments yet/i)).toBeInTheDocument(),
    );
  });

  test('renders experiment name, scope, and status badge', async () => {
    listExperiments.mockResolvedValue({ experiments: [baseExperiment] });
    renderAdmin();
    await waitFor(() => expect(screen.getByText('Test Exp')).toBeInTheDocument());
    expect(screen.getByText('listing_layout')).toBeInTheDocument();
    expect(screen.getByText('draft')).toBeInTheDocument();
  });

  test('renders variant chips with weights', async () => {
    listExperiments.mockResolvedValue({ experiments: [baseExperiment] });
    renderAdmin();
    await waitFor(() => expect(screen.getByText(/control \(60%\)/i)).toBeInTheDocument());
    expect(screen.getByText(/variant a \(40%\)/i)).toBeInTheDocument();
  });

  test('shows error message when listExperiments rejects', async () => {
    listExperiments.mockRejectedValue({ response: { data: { error: 'Forbidden' } } });
    renderAdmin();
    await waitFor(() => expect(screen.getByText('Forbidden')).toBeInTheDocument());
  });
});

// ── Experiments Panel — Create form ───────────────────────────────────────────

describe('AdminPage — ExperimentsPanel create', () => {
  test('Create Experiment button is disabled when total weight ≠ 100', async () => {
    renderAdmin();
    await waitFor(() => screen.getByText('New Experiment'));
    // Default form has 50+50=100, so adjust one weight to break it
    const weightInputs = screen.getAllByPlaceholderText(/weight %/i);
    await act(async () => {
      await userEvent.clear(weightInputs[0]);
      await userEvent.type(weightInputs[0], '40');
    });
    expect(screen.getByRole('button', { name: /create experiment/i })).toBeDisabled();
  });

  test('Create Experiment button is enabled when total weight = 100', async () => {
    renderAdmin();
    await waitFor(() => screen.getByText('New Experiment'));
    // Default form: 50+50=100 — button should be enabled immediately
    expect(screen.getByRole('button', { name: /create experiment/i })).not.toBeDisabled();
  });

  test('weight total indicator shows "bad" class when not 100', async () => {
    renderAdmin();
    await waitFor(() => screen.getByText('New Experiment'));
    const weightInputs = screen.getAllByPlaceholderText(/weight %/i);
    await act(async () => {
      await userEvent.clear(weightInputs[0]);
      await userEvent.type(weightInputs[0], '30');
    });
    const totalSpan = screen.getByText(/total: 80%/i);
    expect(totalSpan.className).toMatch(/bad/);
  });

  test('submitting create form calls createExperiment with form values', async () => {
    createExperiment.mockResolvedValue({ experiment: { ...baseExperiment, _id: 'new-exp' } });
    listExperiments.mockResolvedValueOnce({ experiments: [] })
                   .mockResolvedValue({ experiments: [baseExperiment] });
    renderAdmin();
    await waitFor(() => screen.getByText('New Experiment'));

    await act(async () => {
      await userEvent.clear(screen.getByPlaceholderText(/experiment name/i));
      await userEvent.type(screen.getByPlaceholderText(/experiment name/i), 'My Exp');
      await userEvent.click(screen.getByRole('button', { name: /create experiment/i }));
    });

    expect(createExperiment).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'My Exp' }),
    );
  });

  test('shows error when createExperiment rejects', async () => {
    createExperiment.mockRejectedValue({ response: { data: { error: 'Name taken' } } });
    renderAdmin();
    await waitFor(() => screen.getByText('New Experiment'));

    await act(async () => {
      await userEvent.type(screen.getByPlaceholderText(/experiment name/i), 'Taken Name');
      await userEvent.click(screen.getByRole('button', { name: /create experiment/i }));
    });

    await waitFor(() => expect(screen.getByText('Name taken')).toBeInTheDocument());
  });

  test('"+ Add Variant" button appends a new variant row', async () => {
    renderAdmin();
    await waitFor(() => screen.getByText('New Experiment'));
    const before = screen.getAllByPlaceholderText(/key \(e\.g\. control\)/i).length;

    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: /\+ add variant/i }));
    });

    expect(screen.getAllByPlaceholderText(/key \(e\.g\. control\)/i)).toHaveLength(before + 1);
  });

  test('"Remove" button appears only when there are more than 2 variants', async () => {
    renderAdmin();
    await waitFor(() => screen.getByText('New Experiment'));
    // Initially 2 variants — no Remove button
    expect(screen.queryByRole('button', { name: /remove/i })).not.toBeInTheDocument();

    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: /\+ add variant/i }));
    });

    expect(screen.getAllByRole('button', { name: /remove/i })).toHaveLength(3);
  });
});

// ── Experiments Panel — status change + rollback ───────────────────────────────

describe('AdminPage — ExperimentsPanel actions', () => {
  test('clicking "→ active" calls updateExperimentStatus then refreshes list', async () => {
    listExperiments.mockResolvedValue({ experiments: [baseExperiment] });
    updateExperimentStatus.mockResolvedValue({});
    renderAdmin();
    await waitFor(() => screen.getByText('Test Exp'));

    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: /→ active/i }));
    });

    expect(updateExperimentStatus).toHaveBeenCalledWith('exp-1', { status: 'active' });
    expect(listExperiments).toHaveBeenCalledTimes(2);
  });

  test('clicking "⏪ Rollback" with confirm=true calls rollbackExperiment', async () => {
    listExperiments.mockResolvedValue({ experiments: [baseExperiment] });
    rollbackExperiment.mockResolvedValue({ rolledBack: true });
    renderAdmin();
    await waitFor(() => screen.getByText('Test Exp'));

    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: /rollback/i }));
    });

    expect(rollbackExperiment).toHaveBeenCalledWith('exp-1');
  });

  test('rollback is skipped when confirm() returns false', async () => {
    window.confirm.mockReturnValue(false);
    listExperiments.mockResolvedValue({ experiments: [baseExperiment] });
    renderAdmin();
    await waitFor(() => screen.getByText('Test Exp'));

    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: /rollback/i }));
    });

    expect(rollbackExperiment).not.toHaveBeenCalled();
  });

  test('"Rollback" button is absent for rolled_back experiments', async () => {
    listExperiments.mockResolvedValue({
      experiments: [{ ...baseExperiment, status: 'rolled_back' }],
    });
    renderAdmin();
    await waitFor(() => screen.getByText('Test Exp'));
    expect(screen.queryByRole('button', { name: /rollback/i })).not.toBeInTheDocument();
  });
});

// ── Experiments Panel — results ───────────────────────────────────────────────

describe('AdminPage — ExperimentsPanel results', () => {
  test('"Results" button fetches and displays distribution table', async () => {
    listExperiments.mockResolvedValue({ experiments: [baseExperiment] });
    getExperimentResults.mockResolvedValue({
      distribution: [
        { _id: 'control',   count: 7 },
        { _id: 'variant_a', count: 3 },
      ],
    });
    renderAdmin();
    await waitFor(() => screen.getByText('Test Exp'));

    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: /^results$/i }));
    });

    await waitFor(() =>
      expect(screen.getByText('Variant Distribution')).toBeInTheDocument(),
    );
    expect(screen.getAllByText('control').length).toBeGreaterThan(0);
    expect(screen.getByText('7')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  test('clicking "Hide Results" collapses the results panel', async () => {
    listExperiments.mockResolvedValue({ experiments: [baseExperiment] });
    getExperimentResults.mockResolvedValue({ distribution: [{ _id: 'control', count: 5 }] });
    renderAdmin();
    await waitFor(() => screen.getByText('Test Exp'));

    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: /^results$/i }));
    });
    await waitFor(() => screen.getByText('Variant Distribution'));

    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: /hide results/i }));
    });

    expect(screen.queryByText('Variant Distribution')).not.toBeInTheDocument();
  });

  test('shows "No assignments yet" when distribution is empty', async () => {
    listExperiments.mockResolvedValue({ experiments: [baseExperiment] });
    getExperimentResults.mockResolvedValue({ distribution: [] });
    renderAdmin();
    await waitFor(() => screen.getByText('Test Exp'));

    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: /^results$/i }));
    });

    await waitFor(() =>
      expect(screen.getByText(/no assignments yet/i)).toBeInTheDocument(),
    );
  });
});

// ── Synonyms Panel ─────────────────────────────────────────────────────────────

describe('AdminPage — SynonymsPanel display', () => {
  async function openSynonyms() {
    renderAdmin();
    await waitFor(() => screen.getByText('New Experiment'));
    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: /synonym management/i }));
    });
    await waitFor(() => screen.getByText(/add \/ update synonym/i));
  }

  test('shows empty state when no synonyms exist', async () => {
    listSynonyms.mockResolvedValue({ synonyms: [] });
    await openSynonyms();
    expect(screen.getByText(/no synonyms configured/i)).toBeInTheDocument();
  });

  test('renders synonym term and expansions', async () => {
    listSynonyms.mockResolvedValue({
      synonyms: [{ term: 'benz', expansions: ['Mercedes-Benz', 'Mercedes'] }],
    });
    await openSynonyms();
    await waitFor(() => expect(screen.getByText('benz')).toBeInTheDocument());
    expect(screen.getByText('Mercedes-Benz')).toBeInTheDocument();
    expect(screen.getByText('Mercedes')).toBeInTheDocument();
  });

  test('shows error message when listSynonyms rejects', async () => {
    listSynonyms.mockRejectedValue({ response: { data: { error: 'Load error' } } });
    await openSynonyms();
    await waitFor(() => expect(screen.getByText('Load error')).toBeInTheDocument());
  });
});

describe('AdminPage — SynonymsPanel upsert / delete', () => {
  async function openSynonyms() {
    renderAdmin();
    await waitFor(() => screen.getByText('New Experiment'));
    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: /synonym management/i }));
    });
    await waitFor(() => screen.getByText(/add \/ update synonym/i));
  }

  test('submitting add form calls upsertSynonym with trimmed term and parsed expansions', async () => {
    listSynonyms.mockResolvedValue({ synonyms: [] });
    upsertSynonym.mockResolvedValue({});
    await openSynonyms();

    await act(async () => {
      await userEvent.type(screen.getByPlaceholderText(/e\.g\. benz/i), 'benz');
      await userEvent.type(screen.getByPlaceholderText(/e\.g\. mercedes/i), 'Mercedes-Benz, Mercedes');
      await userEvent.click(screen.getByRole('button', { name: /add synonym/i }));
    });

    expect(upsertSynonym).toHaveBeenCalledWith('benz', ['Mercedes-Benz', 'Mercedes']);
  });

  test('shows save error when upsertSynonym rejects', async () => {
    listSynonyms.mockResolvedValue({ synonyms: [] });
    upsertSynonym.mockRejectedValue({ response: { data: { error: 'Duplicate term' } } });
    await openSynonyms();

    await act(async () => {
      await userEvent.type(screen.getByPlaceholderText(/e\.g\. benz/i), 'benz');
      await userEvent.click(screen.getByRole('button', { name: /add synonym/i }));
    });

    await waitFor(() => expect(screen.getByText('Duplicate term')).toBeInTheDocument());
  });

  test('clicking Edit populates the form and disables term input', async () => {
    listSynonyms.mockResolvedValue({
      synonyms: [{ term: 'benz', expansions: ['Mercedes-Benz'] }],
    });
    await openSynonyms();
    await waitFor(() => screen.getByText('benz'));

    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: /edit/i }));
    });

    const termInput = screen.getByPlaceholderText(/e\.g\. benz/i);
    expect(termInput).toBeDisabled();
    expect(termInput.value).toBe('benz');
    expect(screen.getByRole('button', { name: /update/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
  });

  test('clicking Cancel clears the edit form', async () => {
    listSynonyms.mockResolvedValue({
      synonyms: [{ term: 'benz', expansions: ['Mercedes-Benz'] }],
    });
    await openSynonyms();
    await waitFor(() => screen.getByText('benz'));

    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: /edit/i }));
    });
    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: /cancel/i }));
    });

    expect(screen.queryByRole('button', { name: /cancel/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add synonym/i })).toBeInTheDocument();
  });

  test('clicking Delete with confirm=true calls deleteSynonym and refreshes', async () => {
    listSynonyms.mockResolvedValue({
      synonyms: [{ term: 'benz', expansions: [] }],
    });
    deleteSynonym.mockResolvedValue({});
    await openSynonyms();
    await waitFor(() => screen.getByText('benz'));

    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: /delete/i }));
    });

    expect(deleteSynonym).toHaveBeenCalledWith('benz');
    expect(listSynonyms).toHaveBeenCalledTimes(2);
  });

  test('clicking Delete with confirm=false skips deleteSynonym', async () => {
    window.confirm.mockReturnValue(false);
    listSynonyms.mockResolvedValue({
      synonyms: [{ term: 'benz', expansions: [] }],
    });
    await openSynonyms();
    await waitFor(() => screen.getByText('benz'));

    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: /delete/i }));
    });

    expect(deleteSynonym).not.toHaveBeenCalled();
  });

  test('"Add Synonym" button stays disabled when term input is empty', async () => {
    listSynonyms.mockResolvedValue({ synonyms: [] });
    await openSynonyms();
    expect(screen.getByRole('button', { name: /add synonym/i })).toBeDisabled();
  });
});
