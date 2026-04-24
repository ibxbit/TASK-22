import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';

vi.mock('../context/SessionContext', () => ({
  useSession: vi.fn(),
}));
vi.mock('../api/documents', () => ({
  listDocuments:    vi.fn(),
  uploadDocument:   vi.fn(),
  downloadDocument: vi.fn(),
}));

import { useSession } from '../context/SessionContext';
import { listDocuments } from '../api/documents';
import DocumentsPage from '../pages/DocumentsPage';

const authedUser = {
  token: 'tok-test',
  user: { id: 'u1', name: 'Alice Admin', role: 'admin' },
};

const sampleDocs = [
  {
    _id: 'doc-1',
    type: 'title',
    orderId: null,
    status: 'draft',
    name: 'title-doc.pdf',
    createdAt: new Date('2025-01-15').toISOString(),
  },
  {
    _id: 'doc-2',
    type: 'buyers_order',
    orderId: 'order-999',
    status: 'submitted',
    name: 'buyers.pdf',
    createdAt: new Date('2025-02-10').toISOString(),
  },
];

describe('DocumentsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('shows auth prompt when not authenticated (authState is null)', () => {
    useSession.mockReturnValue({ authState: null });
    render(<DocumentsPage />);
    expect(screen.getByText(/documents require authentication/i)).toBeInTheDocument();
    expect(screen.getByText(/please log in/i)).toBeInTheDocument();
  });

  test('shows authenticated user name and role when logged in', async () => {
    useSession.mockReturnValue({ authState: authedUser });
    listDocuments.mockResolvedValue({ documents: [] });
    render(<DocumentsPage />);
    await waitFor(() =>
      expect(screen.getByText(/alice admin/i)).toBeInTheDocument(),
    );
    expect(screen.getAllByText(/admin/i).length).toBeGreaterThan(0);
  });

  test('renders upload form when authenticated', async () => {
    useSession.mockReturnValue({ authState: authedUser });
    listDocuments.mockResolvedValue({ documents: [] });
    render(<DocumentsPage />);
    expect(screen.getByRole('button', { name: /upload/i })).toBeInTheDocument();
    expect(screen.getByText(/upload document/i)).toBeInTheDocument();
  });

  test('renders document type select with all three types', async () => {
    useSession.mockReturnValue({ authState: authedUser });
    listDocuments.mockResolvedValue({ documents: [] });
    render(<DocumentsPage />);
    const select = screen.getByRole('combobox');
    const options = Array.from(select.options).map(o => o.value);
    expect(options).toContain('title');
    expect(options).toContain('buyers_order');
    expect(options).toContain('inspection_pdf');
  });

  test('shows "No documents found" when document list is empty', async () => {
    useSession.mockReturnValue({ authState: authedUser });
    listDocuments.mockResolvedValue({ documents: [] });
    render(<DocumentsPage />);
    await waitFor(() =>
      expect(screen.getByText(/no documents found/i)).toBeInTheDocument(),
    );
  });

  test('renders document table with rows when docs are loaded', async () => {
    useSession.mockReturnValue({ authState: authedUser });
    listDocuments.mockResolvedValue({ documents: sampleDocs });
    render(<DocumentsPage />);
    await waitFor(() => {
      expect(screen.getAllByText('title').length).toBeGreaterThan(0);
      expect(screen.getByText('buyers_order')).toBeInTheDocument();
    });
    expect(screen.getAllByRole('button', { name: /download/i })).toHaveLength(2);
  });

  test('shows document status badges', async () => {
    useSession.mockReturnValue({ authState: authedUser });
    listDocuments.mockResolvedValue({ documents: sampleDocs });
    render(<DocumentsPage />);
    await waitFor(() => {
      expect(screen.getByText('draft')).toBeInTheDocument();
      expect(screen.getByText('submitted')).toBeInTheDocument();
    });
  });

  test('does not call listDocuments when not authenticated', () => {
    useSession.mockReturnValue({ authState: null });
    render(<DocumentsPage />);
    expect(listDocuments).not.toHaveBeenCalled();
  });

  test('calls listDocuments on mount when authenticated', async () => {
    useSession.mockReturnValue({ authState: authedUser });
    listDocuments.mockResolvedValue({ documents: [] });
    render(<DocumentsPage />);
    await waitFor(() => expect(listDocuments).toHaveBeenCalledOnce());
  });
});
