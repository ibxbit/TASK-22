import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../api/privacy', () => ({
  getConsentHistory:  vi.fn(),
  recordConsent:      vi.fn(),
  exportData:         vi.fn(),
  getDeletionRequests: vi.fn(),
  requestDeletion:    vi.fn(),
  cancelDeletion:     vi.fn(),
}));

import {
  getConsentHistory,
  recordConsent,
  exportData,
  getDeletionRequests,
  requestDeletion,
  cancelDeletion,
} from '../api/privacy';

import PrivacyPage from '../pages/PrivacyPage';

const sampleConsent = {
  _id:          'con-1',
  type:         'data_processing',
  version:      '1.0',
  consentGiven: true,
  givenAt:      '2026-01-15T10:00:00Z',
};

const sampleDeletion = {
  _id:         'del-1',
  status:      'pending',
  scope:       ['all'],
  requestedAt: '2026-01-20T09:00:00Z',
  scheduledAt: '2026-02-19T09:00:00Z',
};

function renderPrivacy() {
  return render(<PrivacyPage />);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(window, 'alert').mockImplementation(() => {});
  getConsentHistory.mockResolvedValue({ records: [] });
  getDeletionRequests.mockResolvedValue({ requests: [] });
});

// ── Tab navigation ─────────────────────────────────────────────────────────────

describe('PrivacyPage — tab navigation', () => {
  test('renders "Consent History" tab content by default', async () => {
    renderPrivacy();
    await waitFor(() =>
      expect(screen.getAllByText('Consent History').length).toBeGreaterThanOrEqual(1),
    );
    expect(screen.getByRole('button', { name: /record/i })).toBeInTheDocument();
  });

  test('clicking "Data Export" tab shows export panel', async () => {
    renderPrivacy();
    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: /data export/i }));
    });
    expect(screen.getByRole('button', { name: /generate export/i })).toBeInTheDocument();
  });

  test('clicking "Deletion Requests" tab shows deletion panel', async () => {
    renderPrivacy();
    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: /deletion requests/i }));
    });
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /request full data deletion/i })).toBeInTheDocument(),
    );
  });

  test('switching back to Consent History tab restores that panel', async () => {
    renderPrivacy();
    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: /data export/i }));
    });
    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: /consent history/i }));
    });
    expect(screen.getByRole('button', { name: /record/i })).toBeInTheDocument();
  });
});

// ── Consent History tab ────────────────────────────────────────────────────────

describe('PrivacyPage — Consent History', () => {
  test('shows "No consent records found" when list is empty', async () => {
    getConsentHistory.mockResolvedValue({ records: [] });
    renderPrivacy();
    await waitFor(() =>
      expect(screen.getByText(/no consent records found/i)).toBeInTheDocument(),
    );
  });

  test('renders consent type, version, and consentGiven for each record', async () => {
    getConsentHistory.mockResolvedValue({ records: [sampleConsent] });
    renderPrivacy();
    await waitFor(() => expect(screen.getByText('data_processing')).toBeInTheDocument());
    expect(screen.getByText('1.0')).toBeInTheDocument();
    expect(screen.getAllByText('Yes').length).toBeGreaterThan(0);
  });

  test('shows error message when getConsentHistory rejects', async () => {
    getConsentHistory.mockRejectedValue({
      response: { data: { error: 'Auth required' } },
    });
    renderPrivacy();
    await waitFor(() =>
      expect(screen.getByText('Auth required')).toBeInTheDocument(),
    );
  });
});

// ── Record Consent form ────────────────────────────────────────────────────────

describe('PrivacyPage — Record Consent form', () => {
  test('submitting the form calls recordConsent with form values', async () => {
    recordConsent.mockResolvedValue({});
    getConsentHistory.mockResolvedValue({ records: [] });
    renderPrivacy();
    await waitFor(() => screen.getByRole('button', { name: /record/i }));

    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: /record/i }));
    });

    expect(recordConsent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'data_processing', version: '1.0', consentGiven: true }),
    );
  });

  test('shows success message after consent is recorded', async () => {
    recordConsent.mockResolvedValue({});
    getConsentHistory.mockResolvedValue({ records: [] });
    renderPrivacy();

    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: /record/i }));
    });

    await waitFor(() =>
      expect(screen.getByText(/consent recorded successfully/i)).toBeInTheDocument(),
    );
  });

  test('shows error message when recordConsent rejects', async () => {
    recordConsent.mockRejectedValue({ response: { data: { error: 'Invalid type' } } });
    renderPrivacy();

    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: /record/i }));
    });

    await waitFor(() =>
      expect(screen.getByText('Invalid type')).toBeInTheDocument(),
    );
  });

  test('shows "Saving…" on the button while submitting', async () => {
    let resolve;
    recordConsent.mockReturnValue(new Promise(r => { resolve = r; }));
    renderPrivacy();

    act(() => { userEvent.click(screen.getByRole('button', { name: /record/i })); });

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /saving/i })).toBeInTheDocument(),
    );

    resolve({});
  });
});

// ── Data Export tab ────────────────────────────────────────────────────────────

describe('PrivacyPage — Data Export', () => {
  async function openExport() {
    renderPrivacy();
    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: /data export/i }));
    });
  }

  test('"Generate Export" button calls exportData()', async () => {
    exportData.mockResolvedValue({ exportedAt: '2026-01-01T00:00:00Z', consentRecords: [] });
    await openExport();

    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: /generate export/i }));
    });

    expect(exportData).toHaveBeenCalledTimes(1);
  });

  test('shows export preview table after successful export', async () => {
    exportData.mockResolvedValue({
      exportedAt:     '2026-01-01T00:00:00Z',
      consentRecords: [{}],
      documents:      [],
      analyticsEvents: [],
      auditLogs:      [],
      user:           { name: 'Alice', email: 'a@b.com', driverLicense: 'DL-9999' },
    });
    await openExport();

    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: /generate export/i }));
    });

    await waitFor(() => expect(screen.getByText('Export Preview')).toBeInTheDocument());
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument(); // consent record count
  });

  test('driver license is masked in export preview', async () => {
    exportData.mockResolvedValue({
      exportedAt:     '2026-01-01T00:00:00Z',
      consentRecords: [],
      documents:      [],
      analyticsEvents: [],
      auditLogs:      [],
      user:           { driverLicense: 'DL-9876543210' },
    });
    await openExport();

    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: /generate export/i }));
    });

    await waitFor(() => screen.getByText('Export Preview'));
    // Only last 4 chars visible — "3210" is the tail; full string should NOT appear
    expect(screen.queryByText('DL-9876543210')).not.toBeInTheDocument();
    expect(screen.getByText(/3210/)).toBeInTheDocument();
  });

  test('shows "Download JSON" button after export is generated', async () => {
    exportData.mockResolvedValue({
      exportedAt: '2026-01-01T00:00:00Z',
      consentRecords: [], documents: [], analyticsEvents: [], auditLogs: [],
    });
    await openExport();

    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: /generate export/i }));
    });

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /download json/i })).toBeInTheDocument(),
    );
  });

  test('shows error when exportData rejects', async () => {
    exportData.mockRejectedValue({ response: { data: { error: 'Export error' } } });
    await openExport();

    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: /generate export/i }));
    });

    await waitFor(() =>
      expect(screen.getByText('Export error')).toBeInTheDocument(),
    );
  });
});

// ── Deletion Requests tab ──────────────────────────────────────────────────────

describe('PrivacyPage — Deletion Requests', () => {
  async function openDeletions() {
    renderPrivacy();
    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: /deletion requests/i }));
    });
    await waitFor(() =>
      screen.getByRole('button', { name: /request full data deletion/i }),
    );
  }

  test('shows "No deletion requests" when list is empty', async () => {
    getDeletionRequests.mockResolvedValue({ requests: [] });
    await openDeletions();
    expect(screen.getByText(/no deletion requests/i)).toBeInTheDocument();
  });

  test('renders deletion request with status, scope, and cancel button', async () => {
    getDeletionRequests.mockResolvedValue({ requests: [sampleDeletion] });
    await openDeletions();
    await waitFor(() => expect(screen.getByText('pending')).toBeInTheDocument());
    expect(screen.getByText('all')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /cancel request/i })).toBeInTheDocument();
  });

  test('"Cancel Request" is hidden for non-pending requests', async () => {
    getDeletionRequests.mockResolvedValue({
      requests: [{ ...sampleDeletion, status: 'completed' }],
    });
    await openDeletions();
    await waitFor(() => screen.getByText('completed'));
    expect(screen.queryByRole('button', { name: /cancel request/i })).not.toBeInTheDocument();
  });

  test('clicking "Request Full Data Deletion" calls requestDeletion', async () => {
    requestDeletion.mockResolvedValue({ message: 'Request submitted' });
    getDeletionRequests.mockResolvedValue({ requests: [] });
    await openDeletions();

    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: /request full data deletion/i }));
    });

    expect(requestDeletion).toHaveBeenCalledWith({ scope: ['all'] });
  });

  test('shows success message after deletion request is submitted', async () => {
    requestDeletion.mockResolvedValue({ message: 'Deletion scheduled' });
    getDeletionRequests.mockResolvedValue({ requests: [] });
    await openDeletions();

    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: /request full data deletion/i }));
    });

    await waitFor(() =>
      expect(screen.getByText('Deletion scheduled')).toBeInTheDocument(),
    );
  });

  test('shows error when requestDeletion rejects', async () => {
    requestDeletion.mockRejectedValue({
      response: { data: { error: 'Already pending' } },
    });
    getDeletionRequests.mockResolvedValue({ requests: [] });
    await openDeletions();

    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: /request full data deletion/i }));
    });

    await waitFor(() =>
      expect(screen.getByText('Already pending')).toBeInTheDocument(),
    );
  });

  test('clicking "Cancel Request" calls cancelDeletion and refreshes list', async () => {
    getDeletionRequests.mockResolvedValue({ requests: [sampleDeletion] });
    cancelDeletion.mockResolvedValue({});
    await openDeletions();
    await waitFor(() => screen.getByRole('button', { name: /cancel request/i }));

    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: /cancel request/i }));
    });

    expect(cancelDeletion).toHaveBeenCalledWith('del-1');
    expect(getDeletionRequests).toHaveBeenCalledTimes(2);
  });

  test('shows error when getDeletionRequests rejects', async () => {
    getDeletionRequests.mockRejectedValue({
      response: { data: { error: 'Not authorised' } },
    });
    await openDeletions();
    await waitFor(() =>
      expect(screen.getByText('Not authorised')).toBeInTheDocument(),
    );
  });
});
